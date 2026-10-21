// Tests execute the committed workflow script with read-only APIs and CLI mocked.
// Only the immutable review gate is instrumented; release checks stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const yaml = readFileSync(new URL('../.github/workflows/classyline-production-manual.yml', import.meta.url), 'utf8');
const scripts = [...yaml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)^          NODE/gm)]
  .map(m => m[1].replace(/^          /gm, ''));
assert.equal(scripts.length, 4);
const release = scripts.at(-1).replace("import {execFileSync, spawn} from 'node:child_process';",
  'const {execFileSync, spawn} = globalThis.mockChild;').replaceAll('setTimeout(resolve, 5000)', 'setTimeout(resolve, 0)')
  .replaceAll('/tmp/classyline-functions-build', './functions-build')
  .replace("setTimeout(() => finish(null, 'SIGKILL', true), 180000)", "setTimeout(() => finish(null, 'SIGKILL', true), 20)");
assert.notEqual(release, scripts.at(-1), 'Real subprocess import must be mocked');
const instrumented = release.replace('const RELEASE_IMPLEMENTATION_REVIEWED = false;',
  'const RELEASE_IMPLEMENTATION_REVIEWED = true;');
assert.notEqual(release, instrumented, 'Immutable review gate must remain');
const releaseMock = readFileSync(new URL('./fixtures/wrangler-release-runtime.mjs', import.meta.url), 'utf8');
const ciMock = "\nconst scenario=process.argv[2];\nObject.assign(process.env,{GITHUB_REPOSITORY:'Skyeagle123/Classyline',GITHUB_REPOSITORY_ID:'1096008352',GITHUB_REPOSITORY_OWNER_ID:'125151458',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'Skyeagle123',GITHUB_ACTOR_ID:'125151458',GITHUB_TRIGGERING_ACTOR:'Skyeagle123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'workflow-commit',GITHUB_RUN_ID:'123'});\nif(scenario==='foreign-repo')process.env.GITHUB_REPOSITORY='other/Classyline';\nif(scenario==='foreign-repo-id')process.env.GITHUB_REPOSITORY_ID='other';\nif(scenario==='foreign-owner')process.env.GITHUB_REPOSITORY_OWNER_ID='other';\nif(scenario==='wrong-ref')process.env.GITHUB_REF='refs/heads/feature';\nif(scenario==='push-event')process.env.GITHUB_EVENT_NAME='push';\nif(scenario==='wrong-actor')process.env.GITHUB_ACTOR='other';\nif(scenario==='wrong-actor-id')process.env.GITHUB_ACTOR_ID='other';\nif(scenario==='wrong-trigger')process.env.GITHUB_TRIGGERING_ACTOR='other';\nif(scenario==='rerun')process.env.GITHUB_RUN_ATTEMPT='2';\nglobalThis.fetch=async(url)=>{let body;\n if(url.includes('/actions/workflows/')){body={total_count:scenario==='prior-dispatch'?2:1,workflow_runs:[{id:123,head_sha:'workflow-commit'}]};if(scenario==='wrong-dispatch-id')body.workflow_runs[0].id=124;}else if(url.includes('/jobs?')){body={total_count:1,jobs:[{name:'check',status:'completed',conclusion:'success'}]};if(scenario==='failed-job')body.jobs[0].conclusion='failure';if(scenario==='extra-job')body.total_count=2;}\n else{body={repository:{full_name:'Skyeagle123/Classyline'},head_sha:'b64e078ee6ecfc5f4e124fe6d68129164f521b8a',head_branch:'fix/image-processing-limit-messages',path:'.github/workflows/storefront.yml',event:'push',run_attempt:1,status:'completed',conclusion:'success'};\n if(scenario==='wrong-ci-sha')body.head_sha='bad';if(scenario==='failed-ci')body.conclusion='failure';if(scenario==='running-ci')body.status='in_progress';if(scenario==='ci-rerun')body.run_attempt=2;if(scenario==='wrong-ci-repo')body.repository.full_name='bad';if(scenario==='wrong-workflow')body.path='other.yml';}\n return {ok:scenario!=='api-denied',status:403,json:async()=>body};};\n";
function run(script, mock, scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'classyline-control-test-'));
  try {
    writeFileSync(join(dir, 'mock.mjs'), mock);
    writeFileSync(join(dir, 'run.mjs'), "import './mock.mjs';\n" + script);
    return spawnSync(process.execPath, [join(dir, 'run.mjs'), scenario], {
      encoding: 'utf8', timeout: 10000, env: {PATH: process.env.PATH}
    });
  } finally { rmSync(dir, {recursive: true, force: true}); }
}
function report(result) {
  assert.equal(result.error, undefined);
  const info = JSON.parse(result.stdout.trim().split('\n').at(-1));
  for (const secret of ['FAKE_TEST_VALUE_NOT_A_CREDENTIAL', 'FAKE_GITHUB_VALUE_NOT_A_CREDENTIAL']) {
    assert(!JSON.stringify(info.artifacts).includes(secret), 'Credential in evidence');
    assert(!result.stdout.includes(secret), 'Credential in console output');
    assert(!result.stderr.includes(secret), 'Credential in error output');
  }
  assert.equal(info.writes, 0, 'Workflow verification must use GET only');
  return info;
}
test('manual only, fixed identity, protected environment, minimal permissions and immutable actions', () => {
  assert.match(yaml, /on:\n  workflow_dispatch:\n/);
  assert.doesNotMatch(yaml, /^  (push|pull_request|workflow_run|schedule):/m);
  assert.doesNotMatch(yaml, /inputs:|\$\{\{ inputs\./);
  for (const m of yaml.matchAll(/uses: (\S+)/g)) assert.match(m[1], /@[a-f0-9]{40}$/);
  assert.match(yaml, /github\.repository_id == '1096008352'/);
  assert.match(yaml, /github\.actor_id == '125151458'/);
  assert.match(yaml, /github\.run_attempt == 1/);
  assert.match(yaml, /environment: classyline-production/);
  assert.match(yaml, /group: classyline2-production\n  cancel-in-progress: false/);
  assert.match(yaml, /permissions:\n  contents: read\n  actions: read/);
  assert.equal((scripts.at(-1).match(/spawn\('npx'/g) || []).length, 1);
  assert.doesNotMatch(yaml, /DirectUpload|AttemptJournal|stageAndCreate|pages-r2-|pages-qualification-|pages-release-artifacts/);
});
test('first workflow step unconditionally stops before checkout or secret use', () => {
  const steps = yaml.slice(yaml.indexOf('    steps:'));
  const first = steps.slice(0, steps.indexOf('      - name:', steps.indexOf('      - name:') + 1));
  assert.match(first, /^          exit 1$/m);
  assert(yaml.indexOf('exit 1') < yaml.indexOf('uses: actions/checkout'));
});
test('unmodified release script blocks before any API or deployment invocation', () => {
  const r = run(release, releaseMock, 'success'), info = report(r);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /BLOCKED/);
  assert.equal(info.calls, 0);
  assert.equal(info.historyReads, 0);
  assert.equal(info.projectReads, 0);
});
for (const arm of [undefined, '', 'false', 'TRUE', 'true']) test(`explicit arm ${String(arm)} is checked by actual shell gate`, () => {
  const shell = yaml.split('name: Require separately armed release window')[1]
    .split('      - name:')[0].split('run: |\n')[1].replace(/^          /gm, '');
  const r = spawnSync('bash', ['-e', '-c', shell], {encoding: 'utf8',
    env: {...(arm === undefined ? {} : {RELEASE_ARMED: arm}), PATH: process.env.PATH}});
  assert.equal(r.status === 0, arm === 'true');
});
const afterInvoke = new Set(['success', 'wrong-source', 'missing-functions', 'failed-deployment',
  'unknown-status', 'dirty-metadata', 'wrong-deployed-flags', 'multiple-new',
  'uncertain-no-deployment', 'uncertain-but-deployed', 'nonzero-cli', 'signal-cli', 'spawn-throws',
  'timeout-cli', 'parent-cancelled', 'post-config-drift']);
const releaseCases = [...afterInvoke, 'missing-arm', 'missing-token', 'main-changed', 'wrong-project', 'wrong-baseline',
  'wrong-d1', 'wrong-r2', 'missing-d1', 'missing-r2', 'extra-d1', 'extra-r2', 'unsafe-flags', 'wrong-date',
  'missing-secret', 'unexpected-placement', 'wrong-preview', 'rollback-missing', 'rollback-source-mismatch',
  'competing-build', 'candidate-attempt-exists', 'dirty-tree', 'tampered-artifact', 'api-denied',
  'auto-build-enabled', 'wrong-source-repo', 'late-main-drift', 'late-baseline-drift', 'late-binding-drift',
  'late-competing-build', 'late-completed-competitor', 'late-rollback-failure',
  'extra-dist', 'omitted-dist', 'duplicate-dist-record', 'symlink-dist', 'wrong-dist-size',
  'extra-functions', 'omitted-functions', 'duplicate-functions-record', 'symlink-functions',
  'local-override', 'late-added-dist', 'late-local-override', 'late-modified-functions'];
for (const scenario of releaseCases) test(`actual workflow preflight / single invocation / verification: ${scenario}`, () => {
  const r = run(instrumented, releaseMock, scenario), info = report(r);
  assert.equal(Boolean(info.artifacts['accepted-deployment.json']), scenario === 'success');
  assert.equal(info.artifacts['verified-deployment.json'], undefined);
  assert.equal(info.calls, afterInvoke.has(scenario) ? 1 : 0, r.stderr);
  assert.equal(r.status === 0, scenario === 'success', r.stderr);
  if (['uncertain-but-deployed', 'nonzero-cli', 'signal-cli', 'spawn-throws', 'timeout-cli', 'parent-cancelled'].includes(scenario))
    assert.equal(info.artifacts['observed-verification.json'].accepted, false);
  if (info.calls && scenario !== 'spawn-throws') assert.equal(info.kills, 1);
});
const ciCases = ['success','foreign-repo','foreign-repo-id','foreign-owner','wrong-ref','push-event',
 'wrong-actor','wrong-actor-id','wrong-trigger','rerun','failed-job','extra-job','wrong-ci-sha',
 'failed-ci','running-ci','ci-rerun','wrong-ci-repo','wrong-workflow','api-denied',
 'prior-dispatch','wrong-dispatch-id'];
for (const scenario of ciCases) test(`Owner identity and approved application CI: ${scenario}`, () => {
  const r = run(scripts[0], ciMock, scenario);
  assert.equal(r.error, undefined);
  assert.equal(r.status === 0, scenario === 'success', r.stderr);
});
test('dispatch history checks cannot be reset merely by changing the controller commit', () => {
  assert.doesNotMatch(scripts[0], /event=workflow_dispatch&head_sha=/);
  assert.match(scripts[0], /event=workflow_dispatch&per_page=100/);
  assert.notEqual(run(scripts[0], ciMock, 'prior-dispatch').status, 0);
});
const bindingFailures = {
  'wrong deployed D1 UUID': "fresh.d1_databases.DB.id='staging';",
  'wrong deployed R2 bucket': "fresh.r2_buckets.PRODUCT_IMAGES.name='staging';",
  'missing deployed D1 map': 'delete fresh.d1_databases;',
  'missing deployed R2 map': 'delete fresh.r2_buckets;',
  'additional deployed D1 binding': "fresh.d1_databases.EXTRA={id:'other'};",
  'additional deployed R2 binding': "fresh.r2_buckets.EXTRA={name:'other'};",
  'wrong deployed D1 binding name': "fresh.d1_databases={OTHER:fresh.d1_databases.DB};",
  'wrong deployed R2 binding name': "fresh.r2_buckets={OTHER:fresh.r2_buckets.PRODUCT_IMAGES};",
  'null deployed D1 map': 'fresh.d1_databases=null;',
  'array deployed R2 map': 'fresh.r2_buckets=[];',
  'null deployed D1 entry': 'fresh.d1_databases.DB=null;',
  'array deployed D1 entry': "fresh.d1_databases.DB=['10c800b1-ddf7-427b-8354-9cf8529782b6'];",
  'missing deployed D1 id': 'delete fresh.d1_databases.DB.id;',
  'missing deployed R2 name': 'delete fresh.r2_buckets.PRODUCT_IMAGES.name;',
};
function rejectsAfterUpload(mock, message) {
  const r = run(instrumented, mock, 'success'), info = report(r);
  assert.notEqual(r.status, 0, r.stdout);
  if (message) assert.match(r.stderr, message);
  assert.equal(info.calls, 1);
  assert.equal(info.artifacts['accepted-deployment.json'], undefined);
  return info;
}
for (const [label, injection] of Object.entries(bindingFailures)) test(label, () => {
  // Correct project defaults cannot substitute for this deployment's own bindings.
  rejectsAfterUpload(releaseMock.replace('const cfg =', injection + '\nconst cfg ='), /deployed binding|Deployed binding/);
});
for (const status of ['success', 'failure', 'skipped', 'active']) test(`completed/failed/skipped/active late competitor rejected: ${status}`, () => {
  const inject = `if (postHistoryReads === 2) result.push({...deployment('late-second', 'other-source'), latest_stage: {name:'deploy',status:'${status}'},is_skipped:${status === 'skipped'}});`;
  rejectsAfterUpload(releaseMock.replace('// INJECT_FINAL_HISTORY', inject), /Final new deployment set|Competing\/unknown/);
});
for (const [label, injection] of Object.entries({
  'duplicate final history IDs': 'result.push(structuredClone(baseline));',
  'accepted deployment absent from final history': 'result=result.filter(d=>d.id!==newID);',
  'baseline history disappears': 'result=result.filter(d=>d.id!==baselineID);',
  'final history unknown status': "result=result.map(d=>d.id===newID?{...d,latest_stage:{name:'deploy',status:'idle'}}:d);",
})) test(label, () => {
  rejectsAfterUpload(releaseMock.replace('// INJECT_FINAL_HISTORY', `if(postHistoryReads===2){${injection}}`));
});
for (const [label, injection] of Object.entries({
  'canonical changes after final history': 'result.canonical_deployment=structuredClone(baseline);',
  'canonical terminal success disappears': "result.canonical_deployment={...fresh,latest_stage:{name:'deploy',status:'active'}};",
  'canonical binding becomes unverifiable': 'result.canonical_deployment={...fresh,r2_buckets:null};',
  'configuration changes after final history': "result.deployment_configs.production.d1_databases.DB.id='other';",
})) test(label, () => {
  rejectsAfterUpload(releaseMock.replace('// INJECT_PROJECT', `if(postProjectReads===2){${injection}}`));
});
test('final acceptance is written only after independent verification and conclusive CLI outcome', () => {
  assert(yaml.indexOf("save('accepted-deployment.json'") > yaml.indexOf('Deployment observed but'));
  assert.doesNotMatch(yaml, /save\('verified-deployment\.json'/);
});
