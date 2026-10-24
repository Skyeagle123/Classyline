import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {ROOT} from './prepare.mjs';
import {verifyTap, verifyInventory} from './ci.mjs';
const require = createRequire(join(ROOT, 'ops/offline-validation/package.json'));
const {parseDocument} = require('yaml');
const text = readFileSync(join(ROOT, '.github/workflows/size-toolchain-offline.yml'), 'utf8');
const parsed = parseDocument(text, {version: '1.2', uniqueKeys: true, strict: true});
assert.equal(parsed.errors.length, 0);
const w = parsed.toJS(), branch = 'phase/storefront-size-toolchain-remediation';
const paths = ['.github/workflows/size-toolchain-offline.yml', 'package.json', 'package-lock.json',
  'ops/size-toolchain/**', 'ops/size-release-recovery/**', 'ops/validate-offline-workflows.mjs', 'docs/size-toolchain-recovery-design.md'];
const condition = `github.repository == 'Skyeagle123/Classyline' && ((github.event_name == 'push' && github.ref == 'refs/heads/${branch}') || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.event.pull_request.head.repo.full_name == 'Skyeagle123/Classyline' && github.head_ref == '${branch}'))`;
test('exact automatic event, branch, path and job restrictions', () => {
  assert.deepEqual(Object.keys(w.on).sort(), ['pull_request', 'push']);
  assert.deepEqual(w.on.push, {branches: [branch], paths});
  assert.deepEqual(w.on.pull_request, {branches: ['main'], paths});
  assert.equal(w.jobs.qualify.if.replace(/\s+/g, ' ').trim(), condition);
});
// Evaluate the actual checked workflow condition, with no external input/code.
const evaluate = new Function('github', 'return (' + w.jobs.qualify.if + ')');
function admitted(event, head = branch, repo = 'Skyeagle123/Classyline', base = 'main', file = 'ops/size-toolchain/runtime.cjs') {
  const g = {repository: 'Skyeagle123/Classyline', event_name: event, ref: 'refs/heads/' + head,
    head_ref: head, base_ref: base, event: {pull_request: {head: {repo: {full_name: repo}}}}};
  const trigger = w.on[event];
  if (!trigger || !trigger.branches.includes(event === 'push' ? head : base)) return false;
  if (!trigger.paths.some(p => p.endsWith('/**') ? file.startsWith(p.slice(0, -2)) : file === p)) return false;
  return Boolean(evaluate(g));
}
for (const event of ['push', 'pull_request']) {
  test('future publication is admitted for ' + event, () => assert.equal(admitted(event), true));
  test('unrelated branch rejected for ' + event, () => assert.equal(admitted(event, 'phase/unrelated'), false));
  test('unrelated path rejected for ' + event, () => assert.equal(admitted(event, branch, undefined, undefined, 'unrelated.txt'), false));
}
test('fork PR and wrong PR target are rejected', () => {
  assert.equal(admitted('pull_request', branch, 'other/Classyline'), false);
  assert.equal(admitted('pull_request', branch, undefined, 'develop'), false);
});
test('manual dispatch is not supported', () => assert.equal(admitted('workflow_dispatch'), false));
test('CI is read-only, pinned and isolated from release credentials and environments', () => {
  assert.deepEqual(w.permissions, {contents: 'read'});
  const j = w.jobs.qualify; assert.equal(j.environment, undefined); assert.equal(j.permissions, undefined);
  assert.equal(j['runs-on'], 'ubuntu-24.04');
  for (const s of j.steps.filter(s => s.uses)) assert.match(s.uses, /^[\w/-]+@[a-f0-9]{40}$/);
  assert.equal(j.steps.find(s => s.uses?.startsWith('actions/setup-node@')).with['node-version'], '24.22.1');
  assert.equal(j.steps.find(s => s.uses?.startsWith('actions/checkout@')).with['persist-credentials'], false);
  assert.doesNotMatch(text, /secrets\.|environment:|pages deploy|workflow_dispatch|gh workflow|CLOUDFLARE_API_TOKEN/);
  assert.match(text, /npm ci --ignore-scripts/);
  assert.match(text, /npm ci --prefix ops\/offline-validation --ignore-scripts/);
  assert(j.steps.some(s => s.run === 'node ops/size-toolchain/ci.mjs'));
});
const tap = '# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('exact all-pass TAP summary accepted', () => assert.equal(verifyTap(tap, 3).pass, 3));
for (const field of ['fail', 'cancelled', 'skipped', 'todo'])
  test('CI fails closed on ' + field, () => assert.throws(() => verifyTap(tap.replace('# ' + field + ' 0', '# ' + field + ' 1'), 3)));
test('missing required test count rejected', () => assert.throws(() => verifyTap(tap, 4)));
test('missing or duplicate TAP summary rejected', () => {
  assert.throws(() => verifyTap(tap.replace('# tests 3\n', ''), 3));
  assert.throws(() => verifyTap(tap + '# tests 3\n', 3));
});
test('required inventory includes every new suite and preserves legacy suites', () => {
  const plan = JSON.parse(readFileSync(join(ROOT, 'ops/size-toolchain/ci-plan.json')));
  verifyInventory(ROOT, plan);
  for (const name of ['runtime', 'toolchain', 'ci']) assert(plan.security.files.includes(`ops/size-toolchain/${name}.test.mjs`));
  assert(plan.security.files.includes('ops/size-release-recovery/failed-release.test.mjs'));
  assert.equal(plan.application.count, 206); assert.equal(plan.size.count, 33);
  assert.deepEqual(plan.size.files, ['tests/size-ordering.test.js']);
});
test('deleted required test file fails inventory verification', () => {
  const root = mkdtempSync(join(tmpdir(), 'size-ci-inventory-'));
  try {
    for (const dir of ['tests', 'ops', 'ops/size-release', 'ops/size-toolchain', 'ops/size-release-recovery']) mkdirSync(join(root, dir), {recursive: true});
    writeFileSync(join(root, 'tests/a.test.js'), '');
    const plan = {application: {files: ['tests/a.test.js']}, security: {files: ['ops/size-toolchain/deleted.test.mjs']}};
    assert.throws(() => verifyInventory(root, plan));
  } finally {rmSync(root, {recursive: true, force: true});}
});
test('runner requires complete tests, zero audit findings and network-denied builds', () => {
  const source = readFileSync(join(ROOT, 'ops/size-toolchain/ci.mjs'), 'utf8');
  assert.match(source, /verifyTap\(tap, group.count\)/);
  assert.match(source, /vulnerabilities\?\.total, 0/);
  assert.match(source, /offline-boundary.cjs/);
  assert.doesNotMatch(source, /--omit|audit fix|pages.*deploy|fetch\(/);
});

// Historical consumed controllers build separately pinned application sources.
// Keep their complete bytes immutable; they are not current-toolchain CI routes.
const consumed = {
  'classyline-production-manual.yml': '4eb841baff287a4570bb2607102d6207c1edf55d17bf65f9078c0c89e66cf572',
  'classyline-production-v21.yml': '53a20e23aed55f9052727ab2def4c9cb3c2c5bd71aba8706bf6343cc65a6c234',
  'classyline-production-size-update.yml': '0d83ead2ae7fe390eea537a708e44adbe662c700a5603070a09ace257bcf65b4',
};
const digest = text => createHash('sha256').update(text).digest('hex');
const workflows = new Map(readdirSync(join(ROOT, '.github/workflows')).filter(n => /\.ya?ml$/.test(n)).map(name => {
  const text = readFileSync(join(ROOT, '.github/workflows', name), 'utf8');
  const document = parseDocument(text, {version: '1.2', uniqueKeys: true, strict: true});
  assert.equal(document.errors.length, 0);
  return [name, {text, workflow: document.toJS()}];
}));
function verifyToolchainRuntimePins(inventory) {
  for (const [name, hash] of Object.entries(consumed))
    assert.equal(digest(inventory.get(name).text), hash, 'Consumed controller changed');
  const routes = [];
  for (const [name, {workflow}] of inventory) {
    if (Object.hasOwn(consumed, name)) continue;
    for (const [id, job] of Object.entries(workflow.jobs)) {
      let node;
      for (const step of job.steps || []) {
        if (step.uses?.startsWith('actions/setup-node@')) node = step.with?.['node-version'];
        if (/\b(?:npm run (?:build:functions|toolchain:prepare)|node ops\/size-toolchain\/(?:ci|prepare)\.mjs|wrangler (?:pages|deploy))\b/.test(step.run || '')) {
          assert.equal(node, '24.22.1', 'Exact patched Node must precede toolchain execution: ' + name + ':' + id);
          routes.push(name + ':' + id);
        }
      }
    }
  }
  return [...new Set(routes)].sort();
}
test('Storefront correction changes only the exact Node pin', () => {
  const text = workflows.get('storefront.yml').text;
  assert.equal((text.match(/node-version: '24\.22\.1'/g) || []).length, 1);
  assert.equal(digest(text.replace("node-version: '24.22.1'", 'node-version: 24')),
    '3bf5c02ad2ad23b5dda1cb382ccdf4f362e549174917daaaa59a26745480a9ec');
});
test('every current remediated-toolchain workflow requires the exact patched Node runtime', () => {
  assert.deepEqual(verifyToolchainRuntimePins(workflows), ['size-toolchain-offline.yml:qualify', 'storefront.yml:check']);
});
test('both toolchain CI routes reject floating, stale, substituted and missing Node pins', () => {
  for (const [name, id] of [['storefront.yml', 'check'], ['size-toolchain-offline.yml', 'qualify']])
    for (const pin of [24, '24', '24.x', '24.21.0', '24.22.0', 'latest', undefined]) {
      const changed = structuredClone(workflows);
      changed.get(name).workflow.jobs[id].steps.find(s => s.uses?.startsWith('actions/setup-node@')).with['node-version'] = pin;
      assert.throws(() => verifyToolchainRuntimePins(changed), /Exact patched Node/, name + ': ' + pin);
    }
});
test('toolchain commands reject missing or late setup and a subsequent runtime downgrade', () => {
  for (const [name, id] of [['storefront.yml', 'check'], ['size-toolchain-offline.yml', 'qualify']])
    for (const mutation of ['missing', 'late', 'downgrade']) {
      const changed = structuredClone(workflows), steps = changed.get(name).workflow.jobs[id].steps;
      const index = steps.findIndex(s => s.uses?.startsWith('actions/setup-node@'));
      const setup = steps[index];
      if (mutation === 'missing') steps.splice(index, 1);
      if (mutation === 'late') {steps.splice(index, 1); steps.push(setup);}
      if (mutation === 'downgrade') steps.splice(index + 1, 0, {...setup, with: {'node-version': '24.21.0'}});
      assert.throws(() => verifyToolchainRuntimePins(changed), /Exact patched Node/, name + ': ' + mutation);
    }
});
