import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, renameSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {patched as addCreateLedger, ORIGINAL_SHA256} from '../size-release/patch-wrangler.mjs';
import runtime from './runtime.cjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const GATE = '../../../ops/size-release/create-gate.cjs';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url)));

export function undiciBlocks(text) {
  const starts = [...text.matchAll(/^\/\/ .*$/gm)], blocks = [];
  for (let i = 0; i < starts.length; i++) {
    const header = starts[i][0];
    if (!header.includes('/undici@7.29.1/node_modules/undici/')) continue;
    const start = starts[i].index, end = starts[i + 1]?.index ?? text.length;
    const body = text.slice(start, end);
    const wrapper = body.match(/^var (\w+) = __commonJS\(\{/m)?.[1];
    assert(wrapper && body.endsWith('});\n\n'), 'Unreviewed bundled module boundary');
    blocks.push({start, end, wrapper, path: header.split('/node_modules/undici/')[1], sha256: sha256(body)});
  }
  return blocks;
}

export function reconstruct(original, receipt = manifest) {
  assert.equal(sha256(original), ORIGINAL_SHA256, 'Original Wrangler changed');
  assert.equal(receipt.wrangler_version, '4.150.0');
  assert.equal(receipt.undici_version, '7.30.1');
  assert.equal(receipt.original_cli_sha256, ORIGINAL_SHA256);
  // Reuse the unchanged reviewed exclusive pre-send ledger insertion. Relative
  // resolution is fixed to the app root; output bytes do not depend on its path.
  let text = addCreateLedger(original, GATE);
  const blocks = undiciBlocks(text);
  assert.equal(blocks.length, 112, 'Incomplete bundled Undici replacement');
  assert.deepEqual(blocks.map(({path, wrapper, sha256}) => ({path, wrapper, sha256})), receipt.bundled_modules);
  for (const block of blocks.reverse()) {
    assert(receipt.undici_files[block.path], 'Replacement module missing from pinned Undici');
    assert(!block.path.includes('..') && /^[\w./-]+$/.test(block.path));
    const replacement = `// ClassyLine fixed Undici 7.30.1: ${block.path}\n` +
      `var ${block.wrapper} = __commonJS({\n` +
      `  "classyline-fixed-undici/${block.path}"(exports, module) {\n` +
      `    module.exports = __classylineUndici.load(__filename, ${JSON.stringify(block.path)});\n` +
      `  }\n});\n\n`;
    text = text.slice(0, block.start) + replacement + text.slice(block.end);
  }
  assert(!text.includes('undici@7.29.1'), 'Vulnerable bundled Undici remains');
  assert.equal((text.match(/module\.exports = __classylineUndici\.load\(/g) || []).length, 112);
  assert(text.startsWith("'use strict';\n"));
  text = text.replace("'use strict';\n", "'use strict';\nconst __classylineUndici = require(\"../../../ops/size-toolchain/runtime.cjs\");\n__classylineUndici.verifyExecution(__filename);\n");
  return text;
}

export function verifyInputs(root = ROOT) {
  return runtime.verifyInstallation(root).cli;
}

export function prepare(root = ROOT) {
  const cli = verifyInputs(root), backup = cli + '.classyline-original';
  const current = readFileSync(cli), currentHash = sha256(current);
  const isPrepared = currentHash === manifest.prepared_cli_sha256;
  assert(isPrepared || currentHash === ORIGINAL_SHA256, 'Unreviewed CLI bytes; no write permitted');
  const original = existsSync(backup) ? readFileSync(backup) : current;
  assert.equal(sha256(original), ORIGINAL_SHA256, 'Missing or altered original CLI');
  const expected = reconstruct(original);
  assert.equal(sha256(expected), manifest.prepared_cli_sha256, 'Patch reconstruction changed');
  if (!isPrepared) {
    if (!existsSync(backup)) writeFileSync(backup, original, {flag: 'wx', mode: 0o600});
    const temp = cli + '.classyline-preparing';
    writeFileSync(temp, expected, {flag: 'wx', mode: 0o600});
    renameSync(temp, cli);
  }
  assert.equal(sha256(readFileSync(cli)), manifest.prepared_cli_sha256);
  return {wrangler: '4.150.0', undici: '7.30.1', bundled_modules_removed: 112,
    original_cli_sha256: ORIGINAL_SHA256, prepared_cli_sha256: manifest.prepared_cli_sha256,
    max_create_transport_dispatches: 1};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(prepare()));
