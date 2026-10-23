// Tests execute the exact local activation proposal with every network/process boundary mocked.
// The proposed workflow is not installed, armed or authorized to deploy.
import test from 'node:test';
import {createHash as hash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const yaml = readFileSync(new URL('../.github/workflows/classyline-production-v21.yml', import.meta.url), 'utf8');
const scripts = [...yaml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)^          NODE/gm)]
  .map(m => m[1].replace(/^          /gm, ''));
assert.equal(scripts.length, 4);
const release = scripts.at(-1).replace("import {execFileSync, spawn} from 'node:child_process';",
  'const {execFileSync, spawn} = globalThis.mockChild;').replaceAll('setTimeout(resolve, 5000)', 'setTimeout(resolve, 0)')
  .replaceAll('/tmp/classyline-functions-build', './functions-build')
  .replace("setTimeout(() => finish(null, 'SIGKILL', true), 180000)", "setTimeout(() => finish(null, 'SIGKILL', true), 20)");
assert.notEqual(release, scripts.at(-1), 'Real subprocess import must be mocked');
assert.match(release, /const RELEASE_IMPLEMENTATION_REVIEWED = true;/);
const releaseMock = readFileSync(new URL('./fixtures/v21-release-runtime.mjs',import.meta.url),'utf8')
  .replace("'./v21-release-api.mjs'",JSON.stringify(new URL('./fixtures/v21-release-api.mjs',import.meta.url).href));
const early = scripts[0].replace("import assert from 'node:assert/strict';",'');

function run(script, mock, scenario, includeInitialGuard = true) {
  const dir = mkdtempSync(join(tmpdir(), 'classyline-control-test-'));
  try {
    writeFileSync(join(dir, 'mock.mjs'), mock);
    writeFileSync(join(dir, 'run.mjs'), "import './mock.mjs';\n" + (script === scripts[0] || !includeInitialGuard ? "" : `import assert from 'node:assert/strict';\nawait (async()=>{${early}\n})();\n`).replace("import assert from 'node:assert/strict';\n", "") + script);
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
test('activation proposal removes obsolete exits but preserves first runtime arm gate', () => {
 const first=yaml.split('    steps:')[1].split('      - name: Verify approved CI')[0];
 assert.match(first,/name: Require separately armed release window/);
 assert.doesNotMatch(first,/exit 1|preparation remains disabled/);
 assert.match(first,/test "\$RELEASE_ARMED" = true/);
 assert.match(release,/const RELEASE_IMPLEMENTATION_REVIEWED = true;/);
 assert.doesNotMatch(release,/const RELEASE_IMPLEMENTATION_REVIEWED = false;/);
});
for (const scenario of ['missing-arm','false-arm','empty-arm','uppercase-arm'])
 test('final runtime arm independently blocks '+scenario+' without prior guard',()=>{
  const r=run(release,releaseMock,scenario,false),info=report(r);
  assert.notEqual(r.status,0);assert.equal(info.calls,0);assert.equal(info.projectReads,0);
  assert.equal(info.recoveryReads.reads,0);assert.match(r.stderr,/Release window is not armed/);
 });
test('review gate still fails closed when disabled in a temporary negative test',()=>{
 const disabled=release.replace('const RELEASE_IMPLEMENTATION_REVIEWED = true;','const RELEASE_IMPLEMENTATION_REVIEWED = false;');
 const r=run(disabled,releaseMock,'success',false),info=report(r);
 assert.notEqual(r.status,0);assert.equal(info.calls,0);assert.equal(info.projectReads,0);
 assert.match(r.stderr,/awaits independent review/);
});
for (const scenario of ['missing-arm', 'false-arm', 'empty-arm', 'uppercase-arm']) test(`runtime release arm blocks ${scenario} before any API or deployment invocation`, () => {
  const r = run(release, releaseMock, scenario), info = report(r);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Release window is not armed/);
  assert.equal(info.calls, 0);
  assert.equal(info.historyReads, 0);
  assert.equal(info.projectReads, 0);
});
for (const arm of [undefined, '', 'false', 'False', 'True', 'TRUE', ' true', 'true ', 'true\n', 'true']) test(`explicit arm ${String(arm)} is checked by actual shell gate`, () => {
  const shell = yaml.split('name: Require separately armed release window')[1]
    .split('      - name:')[0].split('run: |\n')[1].replace(/^          /gm, '');
  const r = spawnSync('bash', ['-e', '-c', shell], {encoding: 'utf8',
    env: {...(arm === undefined ? {} : {RELEASE_ARMED: arm}), PATH: process.env.PATH}});
  assert.equal(r.status === 0, arm === 'true');
});
const afterInvoke = new Set(['success', 'wrong-source', 'missing-functions', 'failed-deployment',
  'unknown-status', 'dirty-metadata', 'wrong-deployed-flags', 'multiple-new',
  'uncertain-no-deployment', 'uncertain-but-deployed', 'nonzero-cli', 'signal-cli', 'spawn-throws',
  'timeout-cli', 'parent-cancelled', 'post-config-drift',
  'paginated-success', 'paginated-late-competitor', 'paginated-page-boundary',
  'paginated-max-success', 'paginated-post-bound-exceeded']);
const acceptedCases = new Set(['success', 'paginated-success', 'paginated-page-boundary', 'paginated-max-success']);
const releaseCases = [...afterInvoke, 'missing-arm', 'missing-token', 'main-changed', 'wrong-project', 'wrong-baseline',
  'wrong-d1', 'wrong-r2', 'missing-d1', 'missing-r2', 'extra-d1', 'extra-r2', 'unsafe-flags', 'wrong-date',
  'missing-secret', 'unexpected-placement', 'wrong-preview', 'rollback-missing', 'rollback-source-mismatch',
  'competing-build', 'candidate-attempt-exists', 'dirty-tree', 'tampered-artifact', 'api-denied',
  'auto-build-enabled', 'wrong-source-repo', 'late-main-drift', 'late-baseline-drift', 'late-binding-drift',
  'late-competing-build', 'late-completed-competitor', 'late-rollback-failure',
  'extra-dist', 'omitted-dist', 'duplicate-dist-record', 'symlink-dist', 'wrong-dist-size',
  'extra-functions', 'omitted-functions', 'duplicate-functions-record', 'symlink-functions',
  'local-override', 'late-added-dist', 'late-local-override', 'late-modified-functions',
  'paginated-competing', 'paginated-no-info-success', 'paginated-no-info-competing', 'paginated-bound-exceeded'];
for (const scenario of releaseCases) test(`actual workflow preflight / single invocation / verification: ${scenario}`, () => {
  const r = run(release, releaseMock, scenario), info = report(r);
  assert.equal(Boolean(info.artifacts['accepted-deployment.json']), acceptedCases.has(scenario));
  assert.equal(info.artifacts['verified-deployment.json'], undefined);
  assert.equal(info.calls, afterInvoke.has(scenario) ? 1 : 0, r.stderr);
  assert.equal(r.status === 0, acceptedCases.has(scenario), r.stderr);
  if (acceptedCases.has(scenario) && scenario.startsWith('paginated-')) {
    const counts = {'paginated-success': [10, 11], 'paginated-page-boundary': [7, 10],
      'paginated-max-success': [50, 99]};
    assert.equal(info.historyReads, counts[scenario][0], 'All five history snapshots must be complete');
    assert.equal(info.artifacts['preflight.json'].known_production_deployments.length, counts[scenario][1]);
  }
  if (['uncertain-but-deployed', 'nonzero-cli', 'signal-cli', 'spawn-throws', 'timeout-cli', 'parent-cancelled'].includes(scenario))
    assert.equal(info.artifacts['observed-verification.json'].accepted, false);
  if (info.calls && scenario !== 'spawn-throws') assert.equal(info.kills, 1);
});
test('Pages deployment-history pagination uses the live-supported bounded page size', () => {
  assert.match(scripts.at(-1), /deployments\?env=production&per_page=10&page=/);
  assert.doesNotMatch(scripts.at(-1), /deployments\?env=production&per_page=100/);
  assert.doesNotMatch(scripts.at(-1), /else if \(b\.result\.length < 10\) return all;/);
  assert.match(scripts.at(-1), /Deployment history exceeds verification bound/);
});

// Exercise the real preflight and final reconciliation, not a copied paginator.
// The normal two-page fixture gives three pre-upload traversals, then discovery
// and final reconciliation. Faults at the latter cannot be masked by earlier reads.
const paginationFaults = {
  'missing metadata': 'delete body.result_info;',
  'null metadata': 'body.result_info=null;',
  'array metadata': 'body.result_info=[];',
  'zero pages': 'body.result_info.total_pages=0;',
  'negative pages': 'body.result_info.total_pages=-1;',
  'string pages': 'body.result_info.total_pages="1";',
  'fractional pages': 'body.result_info.total_pages=1.5;',
  'page bound exceeded': 'body.result_info.total_pages=11;body.result_info.total_count=101;',
  'wrong page number': 'body.result_info.page=page+1;',
  'string page number': 'body.result_info.page=String(page);',
  'wrong page size': 'body.result_info.per_page=100;',
  'string page size': 'body.result_info.per_page="10";',
  'wrong reported count': 'body.result_info.count++;',
  'string count': 'body.result_info.count=String(body.result_info.count);',
  'negative count': 'body.result_info.count=-1;',
  'zero inventory': 'body.result_info.total_count=0;',
  'negative inventory': 'body.result_info.total_count=-1;',
  'string inventory': 'body.result_info.total_count=String(body.result_info.total_count);',
  'unsafe integer inventory': 'body.result_info.total_count=Number.MAX_SAFE_INTEGER+1;',
  'contradictory page total': 'body.result_info.total_pages=1;',
  'contradictory record total': 'body.result_info.total_count=10;',
  'short first page': 'if(page===1){body.result.pop();body.result_info.count=body.result.length;}',
  'short final page': 'if(page===2){body.result.pop();body.result_info.count=body.result.length;}',
  'empty final page': 'if(page===2){body.result=[];body.result_info.count=0;}',
  'oversized first page': 'if(page===1){body.result.push(deployment(otherID,"other"));body.result_info.count++;}',
  'totals drift between pages': 'if(page===2){body.result.push(deployment(otherID,"other"));body.result_info.count++;body.result_info.total_count++;}',
  'page total shrinks on final page': 'if(page===2){body.result_info.total_pages=1;body.result_info.total_count=10;}',
  'duplicate ID within page': 'if(page===1)body.result[1]=structuredClone(body.result[0]);',
  'duplicate ID across pages': 'if(page===2)body.result[0]=structuredClone(observed?fresh:baseline);',
  'inconsistent duplicate record across pages': 'if(page===2)body.result[0]={...structuredClone(observed?fresh:baseline),latest_stage:{name:"build",status:"active"}};',
  'missing record ID': 'delete body.result[0].id;',
  'invalid record ID': 'body.result[0].id="bad";',
  'wrong record environment': 'body.result[0].environment="preview";',
  'null record': 'body.result[0]=null;',
  'missing result': 'delete body.result;',
  'missing metadata and short page hiding a competitor': 'delete body.result_info;body.result=body.result.slice(0,1);',
};
for (const key of ['page', 'per_page', 'count', 'total_count', 'total_pages'])
  paginationFaults[`missing ${key}`] = `delete body.result_info.${key};`;
for (const phase of ['pre-upload', 'final-reconciliation']) {
  for (const [label, injection] of Object.entries(paginationFaults)) {
    test(`pagination rejects ${label} during ${phase}`, () => {
      const when = phase === 'pre-upload' ? '!observed' : 'observed && postHistoryReads >= 3';
      const mock = releaseMock.replace('// INJECT_HISTORY_RESPONSE', `if(${when}){${injection}}`);
      // A real competitor is on the later page: corrupt first-page metadata must
      // not hide it. Final-only faults use a stable preflight and valid discovery.
      const r = run(release, mock, phase === 'pre-upload' ? 'paginated-competing' : 'paginated-success');
      const info = report(r);
      assert.notEqual(r.status, 0, r.stdout);
      assert.match(r.stderr, /pagination|history|deployment page|history environment/i);
      assert.equal(info.calls, phase === 'pre-upload' ? 0 : 1);
      assert.equal(info.artifacts['accepted-deployment.json'], undefined);
      if (phase === 'final-reconciliation') {
        assert(info.artifacts['observed-deployment.json'], 'Discovery completed before the injected final fault');
      }
    });
  }
}
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
  const r = run(release, mock, 'success'), info = report(r);
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
  const inject = `if (postHistoryReads === 2) result.push({...deployment('33333333-0000-0000-0000-000000000001', 'other-source'), latest_stage: {name:'deploy',status:'${status}'},is_skipped:${status === 'skipped'}});`;
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


test('V2.1 exact release identities and immutable historical controller',()=>{
 assert.match(yaml,/ref: 0ce95a706a88c63a914c25b142d4fc6878de66d8/);
 assert.match(yaml,/accepted_squash_main: '0ce95a706a88c63a914c25b142d4fc6878de66d8'/);
 assert.match(yaml,/ci_tested_checkout: '4f1770c12451aed3495f66e3990e399016249ada'/);
 assert.match(yaml,/const baseline = '9f36717b-a93f-410b-858a-4e9c0e4314fe'/);
 assert.match(yaml,/const baselineSHA = '45ac09182cca5cc989fbae1c967c6e7e849e63c3'/);
 assert.match(yaml,/const expectedIDs = \[39629341749, 39814798811, 39838839195\]/);
 assert.match(yaml,/currentInventory.total_count, 1/);
 const old=readFileSync(new URL('../.github/workflows/classyline-production-manual.yml',import.meta.url));
 assert.equal((awaitHash(old)),'4eb841baff287a4570bb2607102d6207c1edf55d17bf65f9078c0c89e66cf572');
});
function awaitHash(bytes){return hash('sha256').update(bytes).digest('hex');}

for(const scenario of ['history-missing','history-recovery-omitted','history-extra','history-duplicate','history-truncated',
 'extra-dispatch','duplicate-dispatch','current-missing','current-truncated','controller-parent','controller-parent-obsolete','workflow-disabled',
 'wrong-ci-sha','failed-ci','running-ci','ci-rerun','missing-ci-step','failed-ci-step','source-tree',
 'recovery-no-approval','recovery-approval-actor','recovery-approval-bypass','recovery-approval-environment',
 'recovery-missing-jobs','recovery-extra-job','recovery-missing-step','recovery-arm-succeeded','recovery-log-tampered'])
 test('V2.1 real initial/final dispatch guard rejects '+scenario,()=>{
  const r=run(release,releaseMock,scenario),info=report(r);
  assert.notEqual(r.status,0,r.stdout);assert.equal(info.calls,0);assert.equal(info.artifacts['accepted-deployment.json'],undefined);
 });
for(const role of ['previous','failed','completed','current'])for(const property of ['sha','tree','branch','rerun','path','workflow','actor','trigger','conclusion','number','active'])
 test('V2.1 rejects altered '+role+' '+property,()=>{
  const r=run(release,releaseMock,role+'-'+property),info=report(r);assert.notEqual(r.status,0,r.stdout);assert.equal(info.calls,0);
 });
for(const scenario of ['whatsapp-missing','whatsapp-wrong','whatsapp-newline','whatsapp-secret-type'])
 test('exact Production WhatsApp binding: '+scenario,()=>{
  const r=run(release,releaseMock,scenario),info=report(r);assert.notEqual(r.status,0,r.stdout);assert.equal(info.calls,0);
 });
for(const scenario of ['during-recovery-d1','during-recovery-r2','during-recovery-competitor','during-recovery-baseline','during-recovery-main-drift','during-recovery-source-drift','late-recovery-extra-dispatch'])
 test('V2.1 integrated final-guard drift: '+scenario,()=>{
  const r=run(release,releaseMock,scenario),info=report(r);assert.notEqual(r.status,0,r.stdout);assert.equal(info.calls,0);
 });
test('both V2.1 guards are identical and the last guard precedes final Cloudflare revalidation',()=>{
 const guards=[...yaml.matchAll(/          \/\/ BEGIN FIXED V21 GUARD[\s\S]*?          \/\/ END FIXED V21 GUARD/g)];
 assert.equal(guards.length,2);assert.equal(guards[0][0],guards[1][0]);
 const end=release.indexOf('const recoveryEvidence = await verifyV21(recoveryGet)');
 assert(end>=0);assert(end<release.indexOf('const current = (await cf(root)).result;'));
 assert.equal(release.slice(end).match(/await verifyV21/g)?.length,1);
});

for(const [key,value] of [['GITHUB_ACTOR','other'],['GITHUB_ACTOR_ID','1'],['GITHUB_TRIGGERING_ACTOR','other'],
 ['GITHUB_REF','refs/heads/feature'],['GITHUB_EVENT_NAME','push'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_RUN_NUMBER','2'],
 ['GITHUB_WORKFLOW_SHA','0'.repeat(40)],['GITHUB_REPOSITORY','other/Classyline'],['RELEASE_ARMED','True'],
 ['RELEASE_ARMED',' true'],['RELEASE_ARMED','true '],['RELEASE_ARMED','true\\n']])
 test('V2.1 actual dispatch context rejects '+key+'='+JSON.stringify(value),()=>{
  const r=run(release,releaseMock+'\nObject.assign(process.env,'+JSON.stringify({[key]:value})+');\n','success'),info=report(r);
  assert.notEqual(r.status,0);assert.equal(info.calls,0);
 });

for(const scenario of ['rollback-d1','rollback-r2'])test('rollback own binding evidence: '+scenario,()=>{
 const r=run(release,releaseMock,scenario),info=report(r);assert.notEqual(r.status,0);assert.equal(info.calls,0);
});
test('final deployment must carry its own exact WhatsApp configuration',()=>{
 rejectsAfterUpload(releaseMock.replace('const cfg =',"fresh.env_vars.WHATSAPP_NUMBER.value='other';\nconst cfg ="),/WhatsApp binding/);
});

test('future hosted controller validation is automatic and credential-free',()=>{
 const ci=readFileSync(new URL('../.github/workflows/v21-release-offline.yml',import.meta.url),'utf8');
 assert.match(ci,/pull_request:/);assert.match(ci,/phase\/storefront-v21-production-release/);
 assert.match(ci,/node --test ops\/\*\.test\.mjs/);
 assert.doesNotMatch(ci,/secrets\.|environment:|workflow_dispatch|CLOUDFLARE_API_TOKEN|pages deploy|gh workflow/);
 assert.match(ci,/permissions:\n  contents: read/);
 for(const action of ci.matchAll(/uses: (\S+)/g))assert.match(action[1],/@[a-f0-9]{40}$/);
});


test('both controller parent guards pin the exact installed activation baseline',()=>{
 const pin="assert.deepEqual(controller.parents?.map(p => p.sha), ['54c5a3ac9cf11e1aa5aca762220c7267289702e0']);";
 assert.equal(yaml.split(pin).length-1,2);
 assert.doesNotMatch(yaml,/controller.parents[^\n]+0ce95a/);
});
test('controller-parent drift in final guard blocks after valid initial guard',()=>{
 const r=run(release,releaseMock,'late-controller-parent'),info=report(r);
 assert.notEqual(r.status,0);assert.equal(info.calls,0);assert.equal(info.recoveryReads.inventories,2);
});
test('approved squash is checked out and recorded while CI original source remains pinned',()=>{
 assert.match(yaml,/ref: 0ce95a706a88c63a914c25b142d4fc6878de66d8/);
 assert.match(yaml,/const candidate = '0ce95a706a88c63a914c25b142d4fc6878de66d8'/);
 assert.match(yaml,/application_sha: '0ce95a706a88c63a914c25b142d4fc6878de66d8'/);
 assert.match(yaml,/ci.head_sha, '9ce02cce69d5774df46c7555543a7f95262c8507'/);
 const r=run(release,releaseMock,'success'),info=report(r);
 assert.equal(r.status,0,r.stderr);assert.equal(info.calls,1);
 assert.equal(info.artifacts['accepted-deployment.json'].sha,'0ce95a706a88c63a914c25b142d4fc6878de66d8');
});
const skippedFailures=['wrong-id','unskipped','wrong-source','wrong-environment','wrong-project',
 'wrong-project-name','wrong-branch','wrong-trigger','dirty','missing-dirty','missing-skip','missing-latest',
 'latest-active','latest-started','missing-stages','short-stages','duplicate-stage','active-stage',
 'started-stage','ended-stage','duplicate','second-candidate','prior-ci-source-attempt','pre-upload-drift','final-drift'];
for(const label of ['valid',...skippedFailures])test('exact historical skipped squash evidence: '+label,()=>{
 const r=run(release,releaseMock,'skipped-candidate-'+label),info=report(r);
 const succeeds=label==='valid';
 assert.equal(r.status===0,succeeds,r.stderr);
 assert.equal(info.calls,succeeds||label==='final-drift'?1:0,r.stderr);
 assert.equal(Boolean(info.artifacts['accepted-deployment.json']),succeeds);
});
test('native-tested invocation wrapper remains byte-identical to the consumed V2 controller',()=>{
 const old=readFileSync(new URL('../.github/workflows/classyline-production-manual.yml',import.meta.url),'utf8');
 const pattern=/\/\/ BEGIN WRANGLER INVOCATION([\s\S]*?)\/\/ END WRANGLER INVOCATION/;
 assert.equal(yaml.match(pattern)[1],old.match(pattern)[1]);
});

// Pinned evidence is mandatory even when it vanished before our first snapshot.
for (const label of ['absent-initial', 'absent-all', 'absent-pre-upload', 'absent-discovery', 'absent-final'])
 test('mandatory pinned history rejects '+label+' without replay',()=>{
  const r=run(release,releaseMock,'skipped-candidate-'+label),info=report(r);
  assert.notEqual(r.status,0,r.stderr);
  const postUpload=['absent-discovery','absent-final'].includes(label);
  assert.equal(info.calls,postUpload?1:0);
  assert.equal(info.artifacts['accepted-deployment.json'],undefined);
  assert.match(r.stderr,/Missing or duplicate pinned skipped-history evidence/);
 });
test('exact pinned evidence is required inside every complete history traversal',()=>{
 const history=release.slice(release.indexOf('async function history()'),release.indexOf('function noActive('));
 assert.match(history,/pinnedSkippedHistory\(all\);\s*return all;/);
 assert.match(release,/function candidateHistory\(list, acceptedID = null\) \{\s*pinnedSkippedHistory\(list\);/);
});
test('mutation control reproduces original omission vulnerability',()=>{
 const needle="check(matches.length === 1, 'Missing or duplicate pinned skipped-history evidence');";
 assert.equal(release.split(needle).length,2,'Mutation must change the actual presence guard');
 const unsafe=release.replace(needle,'if (matches.length === 0) return; '+needle);
 const fixed=report(run(release,releaseMock,'skipped-candidate-absent-all'));
 const result=run(unsafe,releaseMock,'skipped-candidate-absent-all'),mutant=report(result);
 assert.equal(fixed.calls,0);assert.equal(fixed.artifacts['accepted-deployment.json'],undefined);
 assert.equal(result.status,0,result.stderr);assert.equal(mutant.calls,1);
 assert.equal(mutant.artifacts['accepted-deployment.json'].accepted,true,
  'The omission regression must detect the original unsafe behavior');
});
test('mutation control detects missing validation of discovery snapshots',()=>{
 const needle='pinnedSkippedHistory(all);';
 assert.equal(release.split(needle).length,2);
 const fixed=run(release,releaseMock,'skipped-candidate-absent-discovery'),fixedInfo=report(fixed);
 assert.notEqual(fixed.status,0);assert.equal(fixedInfo.calls,1);
 assert.equal(fixedInfo.artifacts['accepted-deployment.json'],undefined);
 const mutant=run(release.replace(needle,'/* removed in offline mutation only */'),releaseMock,
  'skipped-candidate-absent-discovery'),info=report(mutant);
 assert.equal(mutant.status,0,mutant.stderr);assert.equal(info.calls,1);
 assert.equal(info.artifacts['accepted-deployment.json'].accepted,true);
});

test('dedicated activation CI adds one exact branch and retains credential isolation',()=>{
 const ci=readFileSync(new URL('../.github/workflows/v21-release-offline.yml',import.meta.url),'utf8');
 assert.match(ci,/branches: \[phase\/storefront-v21-production-release, phase\/storefront-v21-activation\]/);
 assert.match(ci,/branches: \[main\]/);
 assert.doesNotMatch(ci,/secrets\.|environment:|workflow_dispatch|pull_request_target|CLOUDFLARE_API_TOKEN|pages deploy|gh workflow/);
 assert.match(ci,/permissions:\n  contents: read\n/);
 assert.match(ci,/node --test ops\/\*\.test\.mjs/);
 assert.match(ci,/node ops\/validate-offline-workflows.mjs/);
 for(const a of ci.matchAll(/uses: (\S+)/g))assert.match(a[1],/@[a-f0-9]{40}$/);
});
for(const [event,ref,head,repo,allowed] of [
 ['push','refs/heads/phase/storefront-v21-activation','','Skyeagle123/Classyline',true],
 ['push','refs/heads/phase/storefront-v21-production-release','','Skyeagle123/Classyline',true],
 ['pull_request','refs/pull/13/merge','phase/storefront-v21-activation','Skyeagle123/Classyline',true],
 ['pull_request','refs/pull/13/merge','phase/storefront-v21-production-release','Skyeagle123/Classyline',true],
 ['push','refs/heads/main','','Skyeagle123/Classyline',false],
 ['push','refs/heads/phase/storefront-v21-activation-evil','','Skyeagle123/Classyline',false],
 ['pull_request','refs/pull/13/merge','unapproved','Skyeagle123/Classyline',false],
 ['push','refs/heads/phase/storefront-v21-activation','','other/Classyline',false],
])test('actual credential-free CI branch condition: '+event+' '+ref+' '+head+' '+repo,()=>{
 const ci=readFileSync(new URL('../.github/workflows/v21-release-offline.yml',import.meta.url),'utf8');
 const expression=ci.split('    if: >-\n')[1].split('    runs-on:')[0].trim();
 const evaluate=new Function('github','return ('+expression+');');
 assert.equal(evaluate({event_name:event,ref,head_ref:head,repository:repo}),allowed);
});
for(const condition of ['missing','altered'])test('uncertain CLI and '+condition+' discovery evidence never replays',()=>{
 const inject=condition==='missing'
  ? "if(observed) result=result.filter(d=>d.id!=='104abcf0-b542-4ea5-b655-70abab5339ba');"
  : "if(observed) result.find(d=>d.id==='104abcf0-b542-4ea5-b655-70abab5339ba').stages[4].status='active';";
 const mock=releaseMock.replace('// INJECT_FINAL_HISTORY',inject);
 const result=run(release,mock,'uncertain-but-deployed'),info=report(result);
 assert.notEqual(result.status,0);assert.equal(info.calls,1);
 assert.equal(info.artifacts['accepted-deployment.json'],undefined);
 assert.equal(info.artifacts['command-result.json'].uncertain,true);
});
