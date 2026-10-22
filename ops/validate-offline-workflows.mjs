// Syntax and safety checks only. Never execute workflow run bodies or API clients.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

assert.equal(process.versions.node, '24.19.0', 'Unreviewed Node runtime');
assert(process.env.CLASSYLINE_VALIDATION_TOOLS, 'Missing isolated validation dependencies');
const require = createRequire(join(resolve(process.env.CLASSYLINE_VALIDATION_TOOLS), 'package.json'));
assert.equal(require('yaml/package.json').version, '2.8.2');
const {parseDocument} = require('yaml');
const counts = {yaml: 0, bash: 0, embedded_javascript: 0, javascript_files: 0};
const temp = mkdtempSync(join(tmpdir(), 'classyline-syntax-'));
const workflows = new Map();
function checkSyntax(command, args) {
  try { execFileSync(command, args, {stdio: 'pipe', timeout: 10000}); }
  catch { throw new Error(`${command} syntax validation failed: ${args.at(-1)}`); }
}
// The runner context exists in steps, but not in workflow/job-level env.
// GitHub rejects that schema before creating any jobs, so YAML syntax alone
// cannot catch it. Validate the official context sets for both env locations.
// https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
function checkEnvContexts(env, allowed, location) {
  for (const value of Object.values(env ?? {})) {
    if (typeof value !== 'string') continue;
    for (const expression of value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
      const unquoted = expression[1].replace(/'(?:[^']|'')*'/g, "''");
      for (const reference of unquoted.matchAll(/(?<![\w.])([A-Za-z_][A-Za-z_0-9]*)\s*(?=\.|\[)/g)) {
        assert(allowed.includes(reference[1]), `${location}: unavailable expression context ${reference[1]}`);
      }
    }
  }
}
try {
  for (const name of readdirSync('.github/workflows').filter(n => /\.ya?ml$/.test(n)).sort()) {
    const text = readFileSync(join('.github/workflows', name), 'utf8');
    const document = parseDocument(text, {version: '1.2', uniqueKeys: true, strict: true});
    assert.equal(document.errors.length, 0, `Invalid or duplicate-key YAML: ${name}`);
    const workflow = document.toJS();
    assert(workflow && typeof workflow === 'object' && workflow.jobs, `Missing workflow jobs: ${name}`);
    checkEnvContexts(workflow.env, ['github', 'secrets', 'inputs', 'vars'], `${name}: env`);
    if (name === 'storefront.yml')
      assert.equal(createHash('sha256').update(text).digest('hex'),
        '3bf5c02ad2ad23b5dda1cb382ccdf4f362e549174917daaaa59a26745480a9ec',
        'Accepted application CI changed; review its Action references separately');
    workflows.set(name, {text, workflow}); counts.yaml++;
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      checkEnvContexts(job.env, ['github', 'needs', 'strategy', 'matrix', 'vars', 'secrets', 'inputs'], `${name}: jobs.${jobId}.env`);
      for (const step of job.steps ?? []) {
        if (step.uses && name !== 'storefront.yml') assert.match(step.uses, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[a-f0-9]{40}$/, 'Unpinned external Action');
        if (step.run === undefined) continue;
        assert.equal(typeof step.run, 'string');
        const shell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell ?? 'bash';
        assert.equal(shell, 'bash', `Unreviewed shell in ${name}`);
        // GitHub expressions are data placeholders for syntax validation only.
        const run = step.run.replace(/\$\{\{[\s\S]*?\}\}/g, 'GITHUB_EXPRESSION');
        const bash = join(temp, `run-${counts.bash++}.bash`);
        writeFileSync(bash, run); checkSyntax('bash', ['-n', bash]);
        const starts = [...run.matchAll(/^node --input-type=module <<'NODE'\s*$/gm)];
        const bodies = [...run.matchAll(/^node --input-type=module <<'NODE'\n([\s\S]*?)^NODE\s*$/gm)];
        assert.equal(bodies.length, starts.length, 'Unterminated embedded JavaScript');
        for (const body of bodies) {
          const js = join(temp, `embedded-${counts.embedded_javascript++}.mjs`);
          writeFileSync(js, body[1]); checkSyntax(process.execPath, ['--check', js]);
        }
      }
    }
  }
  function javascript(directory) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') javascript(path);
      else if (entry.isFile() && entry.name.endsWith('.mjs')) {
        checkSyntax(process.execPath, ['--check', path]); counts.javascript_files++;
      }
    }
  }
  javascript('ops');
  const {text: productionText, workflow: production} = workflows.get('classyline-production-manual.yml');
  assert.deepEqual(Object.keys(production.on), ['workflow_dispatch'], 'Production workflow must be manual only');
  assert.deepEqual(production.permissions, {contents: 'read', actions: 'read'});
  assert.equal(production.jobs.deploy.environment, 'classyline-production');
  assert.equal(production.jobs.deploy.steps[0].name, 'Require separately armed release window');
  assert.doesNotMatch(production.jobs.deploy.steps[0].run, /\bexit 1\b/, 'Obsolete first-step exit returned');
  assert.match(productionText, /const RELEASE_IMPLEMENTATION_REVIEWED = true;/, 'Unexpected source-review gate state');
  assert.match(production.jobs.deploy.steps[0].run, /test "\$RELEASE_ARMED" = true/, 'Missing first runtime arm gate');
  assert.match(productionText, /check\(e\.RELEASE_ARMED === 'true', 'Release window is not armed'\);/, 'Missing independent deployment arm gate');
  assert.doesNotMatch(productionText, /DirectUpload|AttemptJournal|pages-r2-|qualification|stageAndCreate/,
    'Retired custom transport must not be executable');
  assert.equal((productionText.match(/spawn\('npx'/g) ?? []).length, 1, 'Exactly one deployment invocation site');
  assert.match(productionText, /WRANGLER_WRITE_LOGS: 'false'/, 'Raw CLI debug logging must be disabled');
  const {text: offlineText, workflow: offline} = workflows.get('pr4-offline-validation.yml');
  assert.deepEqual(Object.keys(offline.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(offline.on.push.branches, ['phase/manual-production-deployment-preparation',
    'phase/production-activation-preparation', 'phase/production-release-enablement-review',
    'phase/production-final-release-gate', 'phase/storefront-v2-production-release',
    'phase/storefront-v2-release-recovery']);
  assert.deepEqual(offline.permissions, {contents: 'read'});
  assert.deepEqual(Object.keys(offline.jobs), ['offline']);
  assert.equal(offline.jobs.offline.environment, undefined, 'Offline validation must not enter a protected release environment');
  assert.doesNotMatch(offlineText, /secrets\.|CLOUDFLARE_API_TOKEN|GH_TOKEN|pages deploy|stageAndCreate|curl\s|gh\s+workflow/i);
  const checkout = offline.jobs.offline.steps.filter(s => s.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.length, 1, 'Offline controller tests do not need an application checkout');
  assert.equal(checkout[0].with?.ref, '${{ github.sha }}');
  assert.equal(checkout[0].with['persist-credentials'], false);
  assert.doesNotMatch(offlineText, /npm test|security:check|build:functions|CLASSYLINE_TEST_APPLICATION/,
    'Do not repeat unrelated accepted application suites');
  assert(offline.jobs.offline.steps.some(s => s.run === 'node --test ops/*.test.mjs'), 'Missing complete offline suite');
  console.log(JSON.stringify({status: 'PASS', ...counts, unconditional_deployment_blocks: 0,
    release_arm_checks: 2, offline_credentials: 'none'}));
} finally { rmSync(temp, {recursive: true, force: true}); }
