// Offline qualification only. No deployment entry point or release credentials.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync, mkdirSync, writeFileSync, lstatSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepare, ROOT} from './prepare.mjs';
import runtime from './runtime.cjs';

export function verifyTap(text, expected) {
  const fields = {};
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...text.matchAll(new RegExp('^# ' + field + ' (\\d+)$', 'gm'))];
    assert.equal(matches.length, 1, 'Missing or ambiguous TAP summary: ' + field);
    fields[field] = Number(matches[0][1]);
  }
  assert.equal(fields.tests, expected, 'Missing or extra required test');
  assert.equal(fields.pass, expected, 'Required tests did not all pass');
  for (const field of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(fields[field], 0, field + ' tests are forbidden');
  return fields;
}
export function discover(root, kind) {
  const directories = kind === 'application' ? ['tests'] : ['ops', 'ops/size-release', 'ops/size-toolchain', 'ops/size-release-recovery'];
  const suffix = kind === 'application' ? '.test.js' : '.test.mjs';
  return directories.flatMap(dir => readdirSync(join(root, dir)).filter(name => name.endsWith(suffix)).map(name => dir + '/' + name)).sort();
}
export function verifyInventory(root, plan) {
  for (const kind of ['application', 'security']) {
    assert.deepEqual(discover(root, kind), plan[kind].files, 'Required test file inventory changed');
    for (const file of plan[kind].files) assert(lstatSync(join(root, file)).isFile(), 'Required test must be a regular file');
  }
}
export function main() {
  assert.equal(resolve('.'), ROOT, 'Qualification must run from the exact checkout');
  runtime.requireRuntime();
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN'])
    assert(!process.env[name], 'Release credentials forbidden during offline qualification');
  const output = '/tmp/classyline-toolchain-qualification';
  mkdirSync(output, {recursive: false});
  const plan = JSON.parse(readFileSync(new URL('./ci-plan.json', import.meta.url)));
  verifyInventory(ROOT, plan);
  const tooling = prepare();
  const env = {...process.env, WRANGLER_SEND_METRICS: 'false',
    CLASSYLINE_VALIDATION_TOOLS: join(ROOT, 'ops/offline-validation'),
    SIZE_TEST_WRANGLER_CLI: join(ROOT, 'node_modules/wrangler/wrangler-dist/cli.js.classyline-original')};
  const run = (name, command, args, options = {}) => {
    const result = spawnSync(command, args, {cwd: ROOT, env, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024, ...options});
    writeFileSync(join(output, name + '.log'), (result.stdout || '') + (result.stderr || ''));
    assert(!result.error, name + ': ' + result.error?.message);
    assert.equal(result.signal, null, name + ' was interrupted');
    assert.equal(result.status, 0, name + ' failed; inspect its evidence log');
    return result.stdout;
  };
  const results = {};
  for (const [name, group] of Object.entries(plan)) {
    const tap = run(name, process.execPath, ['--test', '--test-reporter=tap', ...group.files]);
    results[name] = verifyTap(tap, group.count);
    console.log(`${name}: ${results[name].pass}/${group.count} PASS; zero skips`);
  }
  run('syntax', process.execPath, ['ops/validate-offline-workflows.mjs']);
  for (const file of ['ops/size-toolchain/runtime.cjs', 'ops/size-toolchain/offline-boundary.cjs', 'ops/size-release/create-gate.cjs'])
    run('syntax-' + file.split('/').at(-1), process.execPath, ['--check', file]);
  run('security-scan', 'npm', ['run', 'security:check']);
  const audit = JSON.parse(run('full-audit', 'npm', ['audit', '--audit-level=high', '--json']));
  assert.equal(audit.metadata?.vulnerabilities?.total, 0, 'Full audit must report zero vulnerabilities');
  const buildEnv = {...env, NODE_OPTIONS: '--require=' + join(ROOT, 'ops/size-toolchain/offline-boundary.cjs')};
  run('static-build', 'npm', ['run', 'build'], {env: buildEnv});
  run('functions-build', 'npm', ['run', 'build:functions'], {env: buildEnv});
  const summary = {node: process.versions.node, builtin_undici: process.versions.undici, tooling, results,
    audit_vulnerabilities: 0, network_during_builds: 'denied', production_environment: false};
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
