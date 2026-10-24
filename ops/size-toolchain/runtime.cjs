'use strict';
// Runtime enforcement, before Wrangler imports Miniflare or opens any transport.
// No network access, environment-selected paths, or package-resolution fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const ROOT = path.resolve(__dirname, '../..');
const receipt = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'ops/size-toolchain/manifest.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function requireRuntime(versions = process.versions) {
  assert.equal(versions.node, '24.22.1', 'Unreviewed Node runtime');
  assert.equal(versions.undici, '7.30.1', 'Unreviewed built-in Undici');
}
function canonical(file) {
  assert.equal(fs.realpathSync(file), file, 'Noncanonical or symlinked runtime path');
  return file;
}
function packageFiles(root) {
  const files = {};
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file), key = prefix + name;
      assert(!stat.isSymbolicLink(), 'Symlink in pinned Undici');
      if (stat.isDirectory()) walk(file, key + '/');
      else {assert(stat.isFile()); files[key] = hash(fs.readFileSync(file));}
    }
  }
  walk(root); return files;
}
function verifyInstallation(root = ROOT) {
  requireRuntime(); canonical(root);
  const manifest = receipt();
  const app = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(app.devDependencies.wrangler, '4.150.0');
  assert.equal(app.devDependencies.undici, '7.30.1');
  assert.equal(app.overrides?.miniflare?.undici, '7.30.1');
  const undici = canonical(path.join(root, 'node_modules/undici'));
  assert.deepEqual(packageFiles(undici), manifest.undici_files, 'Undici package contents changed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(undici, 'package.json'))).version, '7.30.1');
  const wrangler = canonical(path.join(root, 'node_modules/wrangler'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(wrangler, 'package.json'))).version, '4.150.0');
  const cli = canonical(path.join(wrangler, 'wrangler-dist/cli.js'));
  const fromCLI = createRequire(cli);
  const miniflare = canonical(fromCLI.resolve('miniflare'));
  assert(miniflare.startsWith(path.join(root, 'node_modules/miniflare') + path.sep), 'Miniflare path substituted');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'node_modules/miniflare/package.json'))).version, '5.20261006.2-beta');
  // Check every wrapper's resolution from the actual callers. An unchecked
  // nested package is an error even though load() below uses absolute paths.
  for (const from of [fromCLI, createRequire(miniflare)]) {
    // Node caches resolution results. Inspect the filesystem as well so a
    // nested package inserted after preparation cannot hide behind that cache.
    for (const directory of from.resolve.paths('undici') || []) {
      const possible = path.join(directory, 'undici');
      if (possible !== undici && possible.startsWith(root + path.sep)) {
        let present = false;
        try {fs.lstatSync(possible); present = true;} catch (error) {if (error.code !== 'ENOENT') throw error;}
        assert(!present, 'Unchecked nested Undici resolution');
      }
    }
    for (const {path: modulePath} of manifest.bundled_modules) {
      const expected = canonical(path.join(undici, modulePath));
      assert.equal(from.resolve('undici/' + modulePath), expected, 'Unchecked nested Undici resolution');
    }
  }
  for (const [file, digest] of Object.entries(manifest.guard_files))
    assert.equal(hash(fs.readFileSync(canonical(path.join(root, file)))), digest, 'Reviewed guard changed');
  return {cli, undici, manifest};
}
function verifyExecution(caller) {
  const verified = verifyInstallation();
  assert.equal(caller, verified.cli, 'Unexpected runtime caller');
  assert.equal(hash(fs.readFileSync(verified.cli)), verified.manifest.prepared_cli_sha256, 'Prepared CLI changed');
  return verified;
}
function load(caller, modulePath) {
  const {undici, manifest} = verifyExecution(caller);
  assert(manifest.bundled_modules.some(entry => entry.path === modulePath), 'Unapproved module path');
  const expected = canonical(path.join(undici, modulePath));
  assert.equal(require.resolve(expected), expected, 'Runtime module path substituted');
  // Only the exact hashed local file may execute; never a bare package import.
  return require(expected);
}
module.exports = {ROOT, requireRuntime, verifyInstallation, verifyExecution, load};
