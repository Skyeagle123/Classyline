import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, symlinkSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {ROOT, GATE, manifest, sha256, reconstruct, prepare, verifyInputs} from './prepare.mjs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {TARGET} = require('../size-release/create-gate.cjs');
const cli = join(ROOT, 'node_modules/wrangler/wrangler-dist/cli.js');
const original = readFileSync(cli + '.classyline-original');
const secure = readFileSync(cli);

test('exact fixed CLI reconstructs reproducibly and prepare is idempotent', () => {
  assert.equal(sha256(reconstruct(original)), manifest.prepared_cli_sha256);
  assert.equal(sha256(secure), manifest.prepared_cli_sha256);
  assert.equal(prepare().prepared_cli_sha256, manifest.prepared_cli_sha256);
  assert.equal(prepare().prepared_cli_sha256, manifest.prepared_cli_sha256);
});
test('all 112 vulnerable bundled implementations are removed, not renamed', () => {
  const s = secure.toString();
  assert(!s.includes('undici@7.29.1'));
  assert.equal((s.match(/module\.exports = __classylineUndici\.load\(/g) || []).length, 112);
  assert(!s.includes('class EventSourceStream'));
  assert.equal(GATE, '../../../ops/size-release/create-gate.cjs');
});
test('all 210 external package files and guard libraries are pinned', () => {
  assert.equal(Object.keys(manifest.undici_files).length, 210);
  verifyInputs();
  assert.equal(require(join(ROOT, 'node_modules/undici/package.json')).version, '7.30.1');
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json')));
  const copies = Object.entries(lock.packages).filter(([p]) => p.endsWith('/undici'));
  assert.equal(copies.length, 1); assert.equal(copies[0][1].version, '7.30.1');
});
test('original bytes, boundary receipts and missing modules fail closed', () => {
  assert.throws(() => reconstruct(Buffer.concat([original, Buffer.from('\n')])));
  const changed = structuredClone(manifest); changed.bundled_modules[0].sha256 = '0'.repeat(64);
  assert.throws(() => reconstruct(original, changed));
  const missing = structuredClone(manifest); delete missing.undici_files['index.js'];
  assert.throws(() => reconstruct(original, missing));
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'size-fixed-inputs-'));
  mkdirSync(join(root, 'node_modules/wrangler/wrangler-dist'), {recursive: true});
  cpSync(join(ROOT, 'node_modules/undici'), join(root, 'node_modules/undici'), {recursive: true});
  writeFileSync(join(root, 'package.json'), readFileSync(join(ROOT, 'package.json')));
  writeFileSync(join(root, 'node_modules/wrangler/package.json'), readFileSync(join(ROOT, 'node_modules/wrangler/package.json')));
  mkdirSync(join(root, 'node_modules/miniflare/dist/src'), {recursive: true});
  writeFileSync(join(root, 'node_modules/miniflare/package.json'), readFileSync(join(ROOT, 'node_modules/miniflare/package.json')));
  writeFileSync(join(root, 'node_modules/miniflare/dist/src/index.js'), '// resolution fixture only\n');
  for (const file of Object.keys(manifest.guard_files)) {
    mkdirSync(dirname(join(root, file)), {recursive: true});
    writeFileSync(join(root, file), readFileSync(join(ROOT, file)));
  }
  writeFileSync(join(root, 'node_modules/wrangler/wrangler-dist/cli.js'), original);
  return root;
}
for (const mutation of ['package bytes', 'extra package file', 'missing package file', 'symlink', 'wrong pin', 'guard bytes', 'CLI bytes', 'backup bytes'])
  test('prepare rejects ' + mutation + ' before changing CLI', () => {
    const root = fixture(), file = join(root, 'node_modules/wrangler/wrangler-dist/cli.js');
    try {
      const index = join(root, 'node_modules/undici/index.js');
      if (mutation === 'package bytes') writeFileSync(index, readFileSync(index) + '\n');
      if (mutation === 'extra package file') writeFileSync(join(root, 'node_modules/undici/extra'), 'unexpected');
      if (mutation === 'missing package file') rmSync(index);
      if (mutation === 'symlink') {rmSync(index); symlinkSync(join(ROOT, 'node_modules/undici/index.js'), index);}
      if (mutation === 'wrong pin') {const p = JSON.parse(readFileSync(join(root, 'package.json'))); p.devDependencies.undici = '7.29.1'; writeFileSync(join(root, 'package.json'), JSON.stringify(p));}
      if (mutation === 'guard bytes') writeFileSync(join(root, 'ops/size-release/create-gate.cjs'), 'changed');
      if (mutation === 'CLI bytes') writeFileSync(file, 'changed');
      if (mutation === 'backup bytes') writeFileSync(file + '.classyline-original', 'changed');
      const before = readFileSync(file);
      assert.throws(() => prepare(root)); assert.deepEqual(readFileSync(file), before);
    } finally {rmSync(root, {recursive: true, force: true});}
  });

// The actual prepared CLI is compiled in memory. No CLI entry point is run.
// Only this test's dispatcher can reach a synthetic loopback server.
const compiled = new Module(cli); compiled.filename = cli;
compiled.paths = Module._nodeModulePaths(dirname(cli));
compiled._compile(secure.toString() + '\ninit_cfetch();exports.__fixed={u:import_undici,perform:performApiFetchBase};', cli);
const {u, perform} = compiled.exports.__fixed;
test('the real Wrangler transport loads the exact fixed external fetch implementation', () => {
  assert.equal(u.fetch, require(join(ROOT, 'node_modules/undici')).fetch);
});
for (const scenario of ['success', 'UNKNOWN_ERROR', 'lost-response', 'timeout', 'cancel', '421', 'redirect', 'malformed'])
  test('fixed actual transport permits one dispatch only: ' + scenario, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'size-fixed-transport-')); let requests = 0;
    const cancel = new AbortController();
    const server = createServer((req, res) => {
      requests++; req.resume();
      if (scenario === 'cancel') queueMicrotask(() => cancel.abort());
      if (scenario === 'lost-response') {req.on('end', () => req.socket.destroy()); return;}
      if (scenario === 'timeout' || scenario === 'cancel') return;
      res.writeHead(scenario === '421' ? 421 : scenario === 'redirect' ? 307 : 200,
        scenario === 'redirect' ? {Location: 'https://api.cloudflare.com/client/v4' + TARGET} : {'Content-Type': 'application/json'});
      res.end(scenario === 'UNKNOWN_ERROR' ? '{"success":false,"errors":[{"code":8000000,"message":"UNKNOWN_ERROR"}]}' : scenario === 'malformed' ? 'bad' : '{"success":true,"result":{"id":"synthetic"}}');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const native = new u.Agent({connections: 1, pipelining: 0}), before = u.getGlobalDispatcher();
    u.setGlobalDispatcher({dispatch(o, h) {return native.dispatch({...o, origin: `http://127.0.0.1:${server.address().port}`}, h);}});
    const oldJournal = process.env.CLASSYLINE_CREATE_JOURNAL;
    process.env.CLASSYLINE_CREATE_JOURNAL = join(dir, 'create.json');
    try {
      const signal = scenario === 'timeout' ? AbortSignal.timeout(100) : scenario === 'cancel' ? cancel.signal : undefined;
      const call = () => perform({}, TARGET, {method: 'POST', body: 'synthetic'}, 'test', {debug() {}, debugWithSanitization() {}}, undefined, signal, {apiToken: 'SYNTHETIC_NOT_A_CREDENTIAL'});
      try {const response = await call(); await response.text();} catch {}
      assert.equal(requests, 1);
      await assert.rejects(call()); await assert.rejects(call());
      assert.equal(requests, 1, 'Second and third create dispatches must never reach transport');
    } finally {
      if (oldJournal === undefined) delete process.env.CLASSYLINE_CREATE_JOURNAL;
      else process.env.CLASSYLINE_CREATE_JOURNAL = oldJournal;
      u.setGlobalDispatcher(before); server.closeAllConnections();
      await new Promise(r => server.close(r)); await native.destroy();
      rmSync(dir, {recursive: true, force: true});
    }
  });
test('mutation control: fixed Undici without the gate still replays HTTP 421', async () => {
  let requests = 0;
  const server = createServer((req, res) => {requests++; req.resume(); res.writeHead(requests === 1 ? 421 : 200); res.end('synthetic');});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const agent = new u.Agent({connections: 1, pipelining: 0});
  try {const response = await u.fetch(`http://127.0.0.1:${server.address().port}/create`, {method: 'POST', body: 'synthetic', dispatcher: agent}); await response.text(); assert.equal(requests, 2);}
  finally {server.closeAllConnections(); await new Promise(r => server.close(r)); await agent.destroy();}
});
