// Test-only runtime for the actual embedded release script. No API or CLI I/O.
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';

const scenario = process.argv[2];
const candidate = 'b64e078ee6ecfc5f4e124fe6d68129164f521b8a';
const candidateTree = '123889f9fd27b3f0b2138ea057efa2e762a231b1';
const baselineID = '5824179f-af77-4a18-9a23-ab22019e8ccc';
const baselineSHA = '393ff88e76dcca226de7f83e148554699e85ca01';
const projectID = '25d5c0d3-f248-4d69-b5a3-feacfcb66dec';
const newID = '12345678-0000-0000-0000-000000000001';
const otherID = '12345678-0000-0000-0000-000000000002';
const fakeToken = 'FAKE_TEST_VALUE_NOT_A_CREDENTIAL';
const fakeGitHubToken = 'FAKE_GITHUB_VALUE_NOT_A_CREDENTIAL';
const temp = mkdtempSync(join(tmpdir(), 'classyline-wrangler-test-'));
let calls = 0, writes = 0, observed = false;
let historyReads = 0, projectReads = 0, mainReads = 0, rollbackReads = 0;
let postHistoryReads = 0, postProjectReads = 0;
let kills = 0;
process.kill = (pid, signal) => {
  assert.equal(pid, -987654321, 'Only the fake child process group can be terminated');
  assert.equal(signal, 'SIGKILL'); kills++; return true;
};

Object.assign(process.env, {
  RUNNER_TEMP: temp, GITHUB_WORKSPACE: temp, HOME: temp,
  CLOUDFLARE_API_TOKEN: scenario === 'missing-token' ? '' : fakeToken,
  CLOUDFLARE_ACCOUNT_ID: '4bfa1a9c849c3da50520f7a4bcccccab',
  GH_TOKEN: fakeGitHubToken, GITHUB_TOKEN: fakeGitHubToken,
  GITHUB_SHA: 'c'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
  WRANGLER_LOG: 'debug', CLOUDFLARE_API_BASE_URL: 'https://forbidden.invalid',
  NODE_OPTIONS: '--require=/forbidden', CLASSYLINE_RELEASE_ARMED: 'true', RELEASE_ARMED: 'true',
});
if (scenario === 'missing-arm') delete process.env.RELEASE_ARMED;
if (scenario === 'false-arm') process.env.RELEASE_ARMED = 'false';
if (scenario === 'empty-arm') process.env.RELEASE_ARMED = '';
if (scenario === 'uppercase-arm') process.env.RELEASE_ARMED = 'TRUE';
const evidence = join(temp, 'classyline-evidence');
mkdirSync(evidence);
const app = join(temp, 'app');
mkdirSync(app); process.chdir(app);
mkdirSync('dist'); mkdirSync('functions-build');
writeFileSync('dist/index.html', 'validated');
writeFileSync('dist/_routes.json', '{"version":1,"include":["/api/*"],"exclude":[]}');
writeFileSync('functions-build/worker.mjs', 'export default {};');
const records = ['dist/index.html', 'dist/_routes.json', 'functions-build/worker.mjs'].map(path => {
  const data = readFileSync(path);
  return {path: path.replace('functions-build/', 'functions-build-check/'), bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex')};
});
if (scenario === 'tampered-artifact') records[0].sha256 = 'bad';
if (scenario === 'extra-dist') writeFileSync('dist/extra.js', 'unapproved');
if (scenario === 'omitted-dist') rmSync('dist/index.html');
if (scenario === 'duplicate-dist-record') records.push({...records[0]});
if (scenario === 'wrong-dist-size') records[0].bytes++;
if (scenario === 'symlink-dist') {rmSync('dist/index.html'); symlinkSync('../functions-build/worker.mjs', 'dist/index.html');}
if (scenario === 'extra-functions') writeFileSync('functions-build/extra.mjs', 'unapproved');
if (scenario === 'omitted-functions') rmSync('functions-build/worker.mjs');
if (scenario === 'duplicate-functions-record') records.push({...records[2]});
if (scenario === 'symlink-functions') {rmSync('functions-build/worker.mjs'); symlinkSync('../dist/index.html', 'functions-build/worker.mjs');}
if (scenario === 'local-override') writeFileSync('wrangler.json', '{}');
writeFileSync(join(evidence, 'provenance.json'), JSON.stringify({
  application_sha: candidate, application_tree: candidateTree,
  workflow_sha: process.env.GITHUB_SHA, run_id: '123', run_attempt: '1',
  wrangler: '4.150.0', files: records,
}));

function deployment(id, sha) {
  return {id, project_id: projectID, project_name: 'classyline2', environment: 'production', is_skipped: false,
    deployment_trigger: {metadata: {branch: 'main', commit_hash: sha, commit_dirty: false}},
    latest_stage: {name: 'deploy', status: 'success'}, compatibility_date: '2025-11-13',
    compatibility_flags: [], uses_functions: id === newID,
    url: `https://${id.slice(0, 8)}.classyline2.pages.dev`};
}
const baseline = deployment(baselineID, baselineSHA), fresh = deployment(newID, candidate);
fresh.d1_databases = {DB: {id: '10c800b1-ddf7-427b-8354-9cf8529782b6'}};
fresh.r2_buckets = {PRODUCT_IMAGES: {name: 'classyline-storefront-production-images'}};
const cfg = (database, bucket) => ({compatibility_date: '2025-11-13', compatibility_flags: [],
  usage_model: 'standard', d1_databases: {DB: {id: database}}, r2_buckets: {PRODUCT_IMAGES: {name: bucket}},
  env_vars: {ADMIN_PASSWORD_HASH: {type: 'secret_text', value: fakeToken},
    ADMIN_PASSWORD_SALT: {type: 'secret_text', value: fakeToken}}});
function project() {
  return {id: projectID, name: 'classyline2', production_branch: 'main', source: {type: 'github',
    config: {owner: 'Skyeagle123', repo_name: 'Classyline', production_deployments_enabled: false}},
    canonical_deployment: observed ? structuredClone(fresh) : structuredClone(baseline),
    deployment_configs: {
      production: cfg('10c800b1-ddf7-427b-8354-9cf8529782b6', 'classyline-storefront-production-images'),
      preview: cfg('ce1d28f3-f20b-485d-9799-619a7fc52ade', 'classyline-storefront-preview-images')}};
}

globalThis.mockChild = {
  execFileSync(command, args) {
    assert.equal(command, 'git', 'Only read-only Git subprocesses may be mocked');
    if (args[0] === 'rev-parse') return (args[1]?.includes('tree') ? candidateTree : candidate) + '\n';
    assert.equal(args[0], 'status');
    return scenario === 'dirty-tree' ? ' M changed\n' : '';
  },
  spawn(command, args, options) {
    calls++;
    assert.equal(calls, 1, 'Duplicate Wrangler deployment invocation');
    assert.equal(command, 'npx');
    assert.deepEqual(args, ['--no-install', 'wrangler', 'pages', 'deploy', 'dist',
      '--project-name', 'classyline2', '--branch', 'main', '--commit-hash', candidate, '--commit-dirty=false']);
    assert.equal(options.stdio, 'ignore', 'Never capture or publish raw Wrangler output');
    assert.equal(options.shell ?? false, false);
    assert.equal(options.detached, true, 'The entire CLI process tree must have its own process group');
    assert.equal(options.env.CLOUDFLARE_API_TOKEN, fakeToken);
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_ACCOUNT_ID);
    assert.equal(options.env.WRANGLER_SEND_METRICS, 'false');
    assert.equal(options.env.WRANGLER_WRITE_LOGS, 'false');
    assert.equal(options.env.npm_config_logs_max, '0');
    assert.equal(options.env.npm_config_offline, 'true');
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'CLOUDFLARE_API_BASE_URL'])
      assert.equal(options.env[key], undefined, `Forbidden child environment: ${key}`);
    assert.notEqual(options.env.WRANGLER_LOG, 'debug');
    observed = scenario !== 'uncertain-no-deployment';
    if (scenario === 'wrong-source') fresh.deployment_trigger.metadata.commit_hash = 'bad';
    if (scenario === 'missing-functions') fresh.uses_functions = false;
    if (scenario === 'failed-deployment') fresh.latest_stage.status = 'failure';
    if (scenario === 'unknown-status') fresh.latest_stage.status = 'unknown';
    if (scenario === 'dirty-metadata') fresh.deployment_trigger.metadata.commit_dirty = true;
    if (scenario === 'wrong-deployed-flags') fresh.compatibility_flags = ['no_strict_compression_checks'];
    if (scenario === 'spawn-throws') throw new Error(fakeToken + fakeGitHubToken);
    const child = new EventEmitter(); child.pid = 987654321;
    queueMicrotask(() => {
      if (scenario === 'timeout-cli') return;
      if (scenario === 'parent-cancelled') {process.emit('SIGTERM'); return;}
      if (scenario === 'nonzero-cli') {child.emit('close', 1, null); return;}
      if (scenario === 'signal-cli') {child.emit('close', null, 'SIGTERM'); return;}
      if (scenario.startsWith('uncertain')) {child.emit('error', new Error(fakeToken)); return;}
      child.emit('close', 0, null);
    });
    return child;
  },
};

globalThis.fetch = async (url, options) => {
  if (options?.method && options.method !== 'GET') {writes++; throw new Error('Unexpected direct API mutation');}
  assert.equal(options.redirect, 'error');
  assert(options.signal, 'API read deadline must be configured');
  let body;
  if (url.startsWith('https://api.github.com/')) {
    mainReads++;
    body = {object: {sha: scenario === 'main-changed' || (scenario === 'late-main-drift' && mainReads >= 3)
      ? 'different' : process.env.GITHUB_SHA}};
  } else {
    assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/4bfa1a9c849c3da50520f7a4bcccccab/pages/projects/classyline2'));
    if (scenario === 'api-denied') return {ok: false, status: 403};
    let result;
    if (url.includes('/deployments?')) {
      const query = new URL(url).searchParams;
      assert.equal(query.get('env'), 'production');
      // The live Pages endpoint rejects 100; do not let mocks hide that contract.
      assert.equal(query.get('per_page'), '10');
      const page = Number(query.get('page'));
      assert(Number.isInteger(page) && page >= 1 && page <= 10);
      historyReads++;
      if (observed) postHistoryReads++;
      result = [structuredClone(baseline)];
      if (scenario === 'competing-build' || (scenario === 'late-competing-build' && historyReads >= 3 && !observed))
        result.push({...deployment(otherID, 'other'), latest_stage: {name: 'build', status: 'active'}});
      if (scenario === 'candidate-attempt-exists') result.push(deployment(otherID, candidate));
      if (scenario === 'late-completed-competitor' && historyReads >= 3 && !observed) result.push(deployment(otherID, 'other'));
      if (observed) result.unshift(structuredClone(fresh));
      if (observed && scenario === 'multiple-new') result.push(deployment(otherID, candidate));
      // INJECT_FINAL_HISTORY
      if (scenario.startsWith('paginated-')) {
        const count = scenario === 'paginated-bound-exceeded' ? 100 :
          scenario === 'paginated-page-boundary' ? 9 :
          scenario === 'paginated-max-success' ? 98 :
          scenario === 'paginated-post-bound-exceeded' ? 99 : 10;
        for (let i = 0; i < count; i++) result.push(deployment(
          `22222222-0000-0000-0000-${String(i).padStart(12, '0')}`, baselineSHA));
        if (scenario === 'paginated-competing' || scenario === 'paginated-no-info-competing')
          result.at(-1).latest_stage = {name: 'build', status: 'active'};
        if (observed && scenario === 'paginated-late-competitor') result.push(deployment(otherID, 'other'));
        const total = result.length;
        result = result.slice((page - 1) * 10, page * 10);
        body = {success: true, result};
        if (!scenario.startsWith('paginated-no-info-')) body.result_info = {
          page, per_page: 10, count: result.length, total_count: total, total_pages: Math.ceil(total / 10)};
      } else body = {success: true, result, result_info: {
        page, per_page: 10, count: result.length, total_count: result.length, total_pages: 1}};
      // INJECT_HISTORY_RESPONSE
    } else if (url.endsWith('/deployments/' + baselineID)) {
      rollbackReads++;
      result = structuredClone(baseline);
      if (scenario === 'rollback-missing' || (scenario === 'late-rollback-failure' && rollbackReads >= 2)) result.latest_stage.status = 'failure';
      if (scenario === 'rollback-source-mismatch') result.deployment_trigger.metadata.commit_hash = 'wrong';
      body = {success: true, result};
    } else if (url.endsWith('/deployments/' + newID)) {
      body = {success: true, result: structuredClone(fresh)};
    } else {
      result = project(); projectReads++;
      if (!observed && projectReads >= 3) {
        if (scenario === 'late-added-dist') writeFileSync('dist/late.js', 'unapproved');
        if (scenario === 'late-local-override') writeFileSync('.env', 'UNSAFE=override');
        if (scenario === 'late-modified-functions') writeFileSync('functions-build/worker.mjs', 'modified');
      }
      if (observed) postProjectReads++;
      // INJECT_PROJECT
      if (scenario === 'wrong-project') result.id = 'bad';
      if (scenario === 'wrong-baseline' || (scenario === 'late-baseline-drift' && projectReads >= 3 && !observed))
        result.canonical_deployment = deployment('bad', baselineSHA);
      if (scenario === 'auto-build-enabled') result.source.config.production_deployments_enabled = true;
      if (scenario === 'wrong-source-repo') result.source.config.repo_name = 'other';
      const c = result.deployment_configs.production;
      if ((scenario === 'post-config-drift' && observed) || (scenario === 'late-binding-drift' && projectReads >= 3 && !observed))
        c.r2_buckets.PRODUCT_IMAGES.name = 'changed';
      if (scenario === 'wrong-d1') c.d1_databases.DB.id = 'staging';
      if (scenario === 'wrong-r2') c.r2_buckets.PRODUCT_IMAGES.name = 'staging';
      if (scenario === 'missing-d1') delete c.d1_databases;
      if (scenario === 'missing-r2') delete c.r2_buckets;
      if (scenario === 'extra-d1') c.d1_databases.EXTRA = {id: 'other'};
      if (scenario === 'extra-r2') c.r2_buckets.EXTRA = {name: 'other'};
      if (scenario === 'unsafe-flags') c.compatibility_flags = ['no_strict_compression_checks'];
      if (scenario === 'wrong-date') c.compatibility_date = '2020-01-01';
      if (scenario === 'missing-secret') delete c.env_vars.ADMIN_PASSWORD_HASH;
      if (scenario === 'unexpected-placement') c.placement = {mode: 'smart'};
      if (scenario === 'wrong-preview') result.deployment_configs.preview.d1_databases.DB.id = 'production';
      body = {success: true, result};
    }
  }
  return {ok: true, status: 200, json: async () => body};
};

process.on('exit', () => {
  const artifacts = Object.fromEntries(readdirSync(evidence).filter(name => name.endsWith('.json'))
    .map(name => [name, JSON.parse(readFileSync(join(evidence, name)))]));
  rmSync(temp, {recursive: true, force: true});
  console.log(JSON.stringify({scenario, calls, writes, kills, historyReads, projectReads, artifacts}));
});
