import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {ROOT, manifest, prepare} from './prepare.mjs';
import runtime from './runtime.cjs';
const require = createRequire(import.meta.url);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'size-runtime-binding-'));
  cpSync(join(ROOT, 'node_modules/undici'), join(root, 'node_modules/undici'), {recursive: true});
  for (const file of ['package.json', 'node_modules/wrangler/package.json', 'node_modules/miniflare/package.json',
    'ops/size-toolchain/manifest.json', ...Object.keys(manifest.guard_files)]) {
    mkdirSync(dirname(join(root, file)), {recursive: true}); cpSync(join(ROOT, file), join(root, file));
  }
  mkdirSync(join(root, 'node_modules/miniflare/dist/src'), {recursive: true});
  writeFileSync(join(root, 'node_modules/miniflare/dist/src/index.js'), '// resolution only\n');
  const cli = join(root, 'node_modules/wrangler/wrangler-dist/cli.js');
  mkdirSync(dirname(cli), {recursive: true});
  cpSync(join(ROOT, 'node_modules/wrangler/wrangler-dist/cli.js.classyline-original'), cli);
  prepare(root);
  const guard = require(join(root, 'ops/size-toolchain/runtime.cjs'));
  return {root, cli, guard, close() {rmSync(root, {recursive: true, force: true});}};
}
test('actual runtime loads only the verified absolute Undici package', () => {
  const f = fixture();
  try {
    const loaded = f.guard.load(f.cli, 'index.js');
    assert.equal(loaded.fetch, require(join(f.root, 'node_modules/undici/index.js')).fetch);
    assert.equal(f.guard.verifyExecution(f.cli).undici, join(f.root, 'node_modules/undici'));
  } finally {f.close();}
});
for (const location of ['wrangler/wrangler-dist', 'wrangler', 'miniflare/dist/src', 'miniflare'])
  test('Astra bypass rejected before preparation and at CLI startup: ' + location, () => {
    const f = fixture();
    try {
      const dir = join(f.root, 'node_modules', location, 'node_modules/undici'); mkdirSync(dir, {recursive: true});
      const marker = join(f.root, 'unchecked-module-executed');
      writeFileSync(join(dir, 'index.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe'); module.exports = {};\n`);
      assert.throws(() => prepare(f.root), /nested Undici/);
      assert.throws(() => f.guard.load(f.cli, 'index.js'), /nested Undici/);
      // Invoke the actual prepared CLI with a non-network informational option.
      // Its startup guard must fail before any other Wrangler import executes.
      const child = spawnSync(process.execPath, [f.cli, '--version'], {encoding: 'utf8', env: {PATH: process.env.PATH, WRANGLER_SEND_METRICS: 'false'}});
      assert.notEqual(child.status, 0); assert.match(child.stderr, /nested Undici/);
      assert.equal(existsSync(marker), false);
    } finally {f.close();}
  });
for (const kind of ['altered package', 'extra package', 'missing package', 'symlinked package', 'symlinked module',
  'altered CLI', 'symlinked CLI', 'wrong caller', 'path traversal', 'unapproved module'])
  test('runtime rejects post-prepare substitution: ' + kind, () => {
    const f = fixture();
    try {
      const pkg = join(f.root, 'node_modules/undici'), index = join(pkg, 'index.js');
      let caller = f.cli, modulePath = 'index.js';
      if (kind === 'altered package') writeFileSync(index, readFileSync(index) + '\n');
      if (kind === 'extra package') writeFileSync(join(pkg, 'extra.js'), '');
      if (kind === 'missing package') rmSync(index);
      if (kind === 'symlinked package') {rmSync(pkg, {recursive: true}); symlinkSync(join(ROOT, 'node_modules/undici'), pkg);}
      if (kind === 'symlinked module') {rmSync(index); symlinkSync(join(ROOT, 'node_modules/undici/index.js'), index);}
      if (kind === 'altered CLI') writeFileSync(f.cli, readFileSync(f.cli) + '\n');
      if (kind === 'symlinked CLI') {rmSync(f.cli); symlinkSync(join(ROOT, 'node_modules/wrangler/wrangler-dist/cli.js'), f.cli);}
      if (kind === 'wrong caller') caller = join(f.root, 'other.js');
      if (kind === 'path traversal') modulePath = '../package.json';
      if (kind === 'unapproved module') modulePath = 'README.md';
      assert.throws(() => f.guard.load(caller, modulePath));
    } finally {f.close();}
  });
test('startup verification precedes all third-party imports and every wrapper uses runtime binding', () => {
  const cli = readFileSync(join(ROOT, 'node_modules/wrangler/wrangler-dist/cli.js'), 'utf8');
  assert(cli.indexOf('__classylineUndici.verifyExecution(__filename)') < cli.indexOf("require('miniflare')"));
  assert.equal((cli.match(/module\.exports = __classylineUndici\.load\(/g) || []).length, 112);
  assert.doesNotMatch(cli, /module\.exports = require\("undici\//);
});
test('runtime requires the exact patched Node and built-in Undici, rejecting old and unknown versions', () => {
  runtime.requireRuntime();
  for (const versions of [{node: '24.19.0', undici: '7.29.0'}, {node: '24.22.1', undici: '7.29.0'},
    {node: '24.22.2', undici: '7.30.1'}, {node: '24.22.1'}]) assert.throws(() => runtime.requireRuntime(versions));
});
test('both built-in and package fetch reject incorrect mixed-case SRI and accept correct SRI', async () => {
  const {createHash} = await import('node:crypto');
  const body = 'synthetic runtime security test';
  const server = createServer((req, res) => res.end(body));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (const fetch of [globalThis.fetch, require(join(ROOT, 'node_modules/undici')).fetch]) {
      await assert.rejects(fetch(url, {integrity: 'SHA256-' + Buffer.alloc(32).toString('base64')}));
      const response = await fetch(url, {integrity: 'Sha256-' + createHash('sha256').update(body).digest('base64')});
      assert.equal(await response.text(), body);
    }
  } finally {server.closeAllConnections(); await new Promise(r => server.close(r));}
});
test('built-in and package fetch handle excessive content encodings without an uncaught crash', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {'Content-Encoding': 'gzip, gzip, gzip, gzip, gzip, gzip', 'Content-Length': '100'});
    res.flushHeaders(); setImmediate(() => res.destroy());
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    for (const fetch of [globalThis.fetch, require(join(ROOT, 'node_modules/undici')).fetch])
      await assert.rejects(fetch(`http://127.0.0.1:${server.address().port}/`));
    await new Promise(r => setImmediate(r));
  } finally {server.closeAllConnections(); await new Promise(r => server.close(r));}
});
