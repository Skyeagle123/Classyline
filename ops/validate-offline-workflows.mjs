// Syntax and safety checks only. Never execute workflow run bodies or API clients.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
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
try {
  for (const name of readdirSync('.github/workflows').filter(n => /\.ya?ml$/.test(n)).sort()) {
    const text = readFileSync(join('.github/workflows', name), 'utf8');
    const document = parseDocument(text, {version: '1.2', uniqueKeys: true, strict: true});
    assert.equal(document.errors.length, 0, `Invalid or duplicate-key YAML: ${name}`);
    const workflow = document.toJS();
    assert(workflow && typeof workflow === 'object' && workflow.jobs, `Missing workflow jobs: ${name}`);
    workflows.set(name, {text, workflow}); counts.yaml++;
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[a-f0-9]{40}$/, 'Unpinned external Action');
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
  for (const name of readdirSync('ops').filter(n => n.endsWith('.mjs')).sort()) {
    checkSyntax(process.execPath, ['--check', join('ops', name)]); counts.javascript_files++;
  }
  const {text: productionText, workflow: production} = workflows.get('classyline-production-manual.yml');
  assert.deepEqual(Object.keys(production.on), ['workflow_dispatch'], 'Production workflow must be manual only');
  assert.deepEqual(production.permissions, {contents: 'read', actions: 'read'});
  assert.equal(production.jobs.deploy.environment, 'classyline-production');
  assert.match(production.jobs.deploy.steps[0].run, /^exit 1$/m, 'Missing first unconditional deployment block');
  assert.match(productionText, /const NO_RETRY_TRANSPORT_VERIFIED = false;/, 'Missing transport block');
  assert.match(productionText, /checkpoint:async \(\) => false/, 'Missing durable-checkpoint block');
  const {text: offlineText, workflow: offline} = workflows.get('pr4-offline-validation.yml');
  assert.deepEqual(Object.keys(offline.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(offline.on.push.branches, ['phase/manual-production-deployment-preparation']);
  assert.deepEqual(offline.permissions, {contents: 'read'});
  assert.deepEqual(Object.keys(offline.jobs), ['offline']);
  assert.equal(offline.jobs.offline.environment, undefined, 'Offline validation must not enter a protected release environment');
  assert.doesNotMatch(offlineText, /secrets\.|CLOUDFLARE_API_TOKEN|GH_TOKEN|pages deploy|stageAndCreate|curl\s|gh\s+workflow/i);
  const appCheckout = offline.jobs.offline.steps.find(s => s.with?.path === 'app');
  assert.equal(appCheckout?.with?.ref, 'b64e078ee6ecfc5f4e124fe6d68129164f521b8a');
  assert.equal(appCheckout.with['persist-credentials'], false);
  assert(offline.jobs.offline.steps.some(s => s['working-directory'] === 'app' &&
    s.run === 'npm ci --ignore-scripts --no-audit --no-fund'), 'Application lockfile must be installed separately');
  assert(offline.jobs.offline.steps.some(s => s.run === 'node --test ops/*.test.mjs'), 'Missing complete offline suite');
  console.log(JSON.stringify({status: 'PASS', ...counts, deployment_blocks: 3, offline_credentials: 'none'}));
} finally { rmSync(temp, {recursive: true, force: true}); }
