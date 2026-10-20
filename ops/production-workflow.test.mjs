// Offline release-control tests. No credential, GitHub or Cloudflare access.
// The test-only instrumented module permits exercising unreachable acceptance
// checks behind the immutable block. Production YAML keeps both blocks intact.
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
const release = scripts.at(-1).replace("import {execFileSync} from 'node:child_process';",
  'const {execFileSync} = globalThis.mockChild;').replaceAll('setTimeout(resolve, 5000)', 'setTimeout(resolve, 0)');
const directMock = `class AttemptJournal {}
class DirectUpload { async stageAndCreate() { const result=globalThis.mockChild.spawnSync(); return {returned:'12345678-0000-0000-0000-000000000001',evidence:{uncertain:Boolean(result.error||result.signal||result.status!==0)}}; } }`;
const adapted = release.replace("const {DirectUpload, AttemptJournal} = await import('file://' + e.GITHUB_WORKSPACE + '/control/ops/pages-direct-upload.mjs');", directMock)
  .replace("const {loadPlan, pinnedHash} = await import('file://' + e.GITHUB_WORKSPACE + '/control/ops/pages-release-artifacts.mjs');", 'const loadPlan=()=>({}); const pinnedHash=()=>null;');
const instrumented = adapted.replace('const NO_RETRY_TRANSPORT_VERIFIED = false;',
  'const NO_RETRY_TRANSPORT_VERIFIED = true;');
assert.notEqual(release, instrumented);
const releaseMock = "\nimport {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync} from 'node:fs';\nimport {tmpdir} from 'node:os';\nimport {join as mockJoin} from 'node:path';\nconst scenario = process.argv[2];\nconst cand='b64e078ee6ecfc5f4e124fe6d68129164f521b8a';\nconst baseid='5824179f-af77-4a18-9a23-ab22019e8ccc';\nconst oldsha='393ff88e76dcca226de7f83e148554699e85ca01';\nconst projectid='25d5c0d3-f248-4d69-b5a3-feacfcb66dec';\nconst newid='12345678-0000-0000-0000-000000000001';\nlet calls=0, writes=0, observed=false, historyReads=0, projectReads=0;\nprocess.env.RUNNER_TEMP=mkdtempSync(mockJoin(tmpdir(),'classyline-workflow-'));\nprocess.env.CLOUDFLARE_API_TOKEN=scenario==='missing-token'?'':'FAKE_TEST_VALUE_NOT_A_CREDENTIAL';\nprocess.env.CLOUDFLARE_ACCOUNT_ID='4bfa1a9c849c3da50520f7a4bcccccab';\nprocess.env.GITHUB_SHA='control-workflow-commit';\nprocess.env.GITHUB_RUN_ID='test';process.env.GITHUB_RUN_ATTEMPT='1';\nconst evidence=mockJoin(process.env.RUNNER_TEMP,'classyline-evidence');\nmkdirSync(evidence);\nconst input=mockJoin(process.env.RUNNER_TEMP,'input.txt');\nwriteFileSync(input,'validated');\nconst {createHash:mockHash}=await import('node:crypto');\nwriteFileSync(mockJoin(evidence,'provenance.json'),JSON.stringify({files:[{path:input,sha256:scenario==='tampered-artifact'?'bad':mockHash('sha256').update('validated').digest('hex')}]}));\nfunction deployment(id,sha){return {id,project_id:projectid,project_name:'classyline2',environment:'production',is_skipped:false,deployment_trigger:{metadata:{branch:'main',commit_hash:sha,commit_dirty:false}},latest_stage:{name:'deploy',status:'success'},compatibility_date:'2025-11-13',compatibility_flags:[],uses_functions:id===newid,url:`https://${id.slice(0,8)}.classyline2.pages.dev`};}\nconst baseline=deployment(baseid,oldsha), fresh=deployment(newid,cand);\nfresh.d1_databases={DB:{id:'10c800b1-ddf7-427b-8354-9cf8529782b6'}};\nfresh.r2_buckets={PRODUCT_IMAGES:{name:'classyline-storefront-production-images'}};\nconst cfg=(db,bucket)=>({compatibility_date:'2025-11-13',compatibility_flags:[],usage_model:'standard',d1_databases:{DB:{id:db}},r2_buckets:{PRODUCT_IMAGES:{name:bucket}},env_vars:{ADMIN_PASSWORD_HASH:{type:'secret_text'},ADMIN_PASSWORD_SALT:{type:'secret_text'}}});\nfunction project(){return {id:projectid,name:'classyline2',production_branch:'main',source:{type:'github',config:{owner:'Skyeagle123',repo_name:'Classyline',production_deployments_enabled:false}},canonical_deployment:observed?fresh:baseline,deployment_configs:{production:cfg('10c800b1-ddf7-427b-8354-9cf8529782b6','classyline-storefront-production-images'),preview:cfg('ce1d28f3-f20b-485d-9799-619a7fc52ade','classyline-storefront-preview-images')}};}\nglobalThis.mockChild={execFileSync:(_cmd,args)=>args[0]==='rev-parse'?cand+'\\n':scenario==='dirty-tree'?' M bad\\n':'',spawnSync:()=>{calls++;if(calls>1)throw Error('Duplicate deploy invocation');observed=scenario!=='uncertain-no-deployment';if(scenario==='wrong-source')fresh.deployment_trigger.metadata.commit_hash='bad';if(scenario==='missing-functions')fresh.uses_functions=false;if(scenario==='failed-deployment')fresh.latest_stage.status='failure';if(scenario==='dirty-metadata')fresh.deployment_trigger.metadata.commit_dirty=true;if(scenario==='wrong-deployed-flags')fresh.compatibility_flags=['no_strict_compression_checks'];return {status:scenario.startsWith('uncertain')?null:0,error:scenario.startsWith('uncertain')?new Error('timeout'):undefined,signal:scenario.startsWith('uncertain')?'SIGTERM':null};}};\nglobalThis.fetch=async(url,opts)=>{if(opts?.method && opts.method!=='GET'){writes++;throw Error('Unexpected API mutation');}let body; if(url.startsWith('https://api.github.com/'))body={object:{sha:scenario==='main-changed'?'different':process.env.GITHUB_SHA}};else{let result;\n if(scenario==='api-denied')return {ok:false,status:403};\n if(url.includes('/deployments?')){historyReads++;result=[baseline];if(scenario==='competing-build')result.push({...deployment('other', 'other'),latest_stage:{name:'build',status:'active'}});if(scenario==='candidate-attempt-exists')result.push(deployment('existing',cand));if(observed)result.unshift(fresh);if(observed&&scenario==='multiple-new')result.push(deployment('unexpected','unexpected'));body={success:true,result,result_info:{total_pages:1}};}\n else if(url.endsWith('/deployments/'+baseid)){result=structuredClone(baseline);if(scenario==='rollback-missing')result.latest_stage.status='failure';if(scenario==='rollback-source-mismatch')result.deployment_trigger.metadata.commit_hash='wrong';body={success:true,result};}\n else if(url.endsWith('/deployments/'+newid)){body={success:true,result:fresh};}\n else{result=project();projectReads++;if(scenario==='wrong-project')result.id='bad';if(scenario==='wrong-baseline')result.canonical_deployment=deployment('bad',oldsha);if(scenario==='auto-build-enabled')result.source.config.production_deployments_enabled=true;if(scenario==='wrong-source-repo')result.source.config.repo_name='other';if(scenario==='post-config-drift'&&observed)result.deployment_configs.production.r2_buckets.PRODUCT_IMAGES.name='changed';const c=result.deployment_configs.production;\n if(scenario==='wrong-d1')c.d1_databases.DB.id='staging';if(scenario==='wrong-r2')c.r2_buckets.PRODUCT_IMAGES.name='staging';if(scenario==='unsafe-flags')c.compatibility_flags=['no_strict_compression_checks'];if(scenario==='wrong-date')c.compatibility_date='2020-01-01';if(scenario==='missing-secret')delete c.env_vars.ADMIN_PASSWORD_HASH;if(scenario==='unexpected-placement')c.placement={mode:'smart'};if(scenario==='wrong-preview')result.deployment_configs.preview.d1_databases.DB.id='production';body={success:true,result};}}\n return {ok:true,status:200,json:async()=>body};};\nprocess.on('exit',()=>{const artifacts=Object.fromEntries(readdirSync(evidence).filter(f=>f.endsWith('.json')).map(f=>[f,JSON.parse(readFileSync(mockJoin(evidence,f)))]));rmSync(process.env.RUNNER_TEMP,{recursive:true,force:true});console.log(JSON.stringify({scenario,calls,writes,artifacts}));});\n";
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
test('only manual trigger, no inputs, fixed identity and immutable action pins', () => {
  assert.match(yaml, /on:\n  workflow_dispatch:\n/);
  assert.doesNotMatch(yaml, /^  (push|pull_request|workflow_run|schedule):/m);
  assert.doesNotMatch(yaml, /inputs:|\$\{\{ inputs\./);
  for (const m of yaml.matchAll(/uses: (\S+)/g)) assert.match(m[1], /@[a-f0-9]{40}$/);
  assert.match(yaml, /github\.repository_id == '1096008352'/);
  assert.match(yaml, /github\.actor_id == '125151458'/);
  assert.match(yaml, /environment: classyline-production/);
  assert.match(yaml, /group: classyline2-production\n  cancel-in-progress: false/);
  assert.match(yaml, /permissions:\n  contents: read\n  actions: read/);
  assert.equal((yaml.match(/spawnSync\('npx'/g) || []).length, 0);
  assert.match(yaml, /transport\.stageAndCreate/);
  assert.match(yaml, /checkpoint:async \(\) => false/);
});
test('workflow entry unconditionally blocks before any actions or secrets', () => {
  const entry = yaml.split('name: Block unresolved deployment transport')[1].split('      - name:')[0];
  assert.match(entry, /exit 1/);
  assert(yaml.indexOf('exit 1') < yaml.indexOf('uses: actions/checkout'));
});
test('unmodified release script blocks before any API or deployment invocation', () => {
  const r = run(release, releaseMock, 'success');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /BLOCKED: no verified supported no-retry deployment transport/);
  const info = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(info.calls, 0); assert.equal(info.writes, 0);
});
const releaseCases = ['success','missing-token','main-changed','wrong-project','wrong-baseline',
 'wrong-d1','wrong-r2','unsafe-flags','wrong-date','missing-secret','unexpected-placement',
 'wrong-preview','rollback-missing','rollback-source-mismatch','competing-build','candidate-attempt-exists',
 'dirty-tree','tampered-artifact','api-denied','wrong-source','missing-functions','failed-deployment',
 'dirty-metadata','wrong-deployed-flags','multiple-new','uncertain-no-deployment','uncertain-but-deployed',
 'auto-build-enabled','wrong-source-repo','post-config-drift'];
const afterInvoke = new Set(['success','wrong-source','missing-functions','failed-deployment',
 'dirty-metadata','wrong-deployed-flags','multiple-new','uncertain-no-deployment',
 'uncertain-but-deployed','post-config-drift']);
for (const scenario of releaseCases) test(`instrumented acceptance checks: ${scenario}`, () => {
  const r = run(instrumented, releaseMock, scenario);
  assert.equal(r.error, undefined);
  const info = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(Boolean(info.artifacts['accepted-deployment.json']), scenario === 'success');
  assert.equal(info.artifacts['verified-deployment.json'], undefined);
  assert(!JSON.stringify(info.artifacts).includes('FAKE_TEST_VALUE_NOT_A_CREDENTIAL'));
  if (scenario === 'uncertain-but-deployed')
    assert.equal(info.artifacts['observed-verification.json'].accepted, false);
  assert.equal(info.writes, 0); // fake API supports GET only
  assert.equal(info.calls, afterInvoke.has(scenario) ? 1 : 0, r.stderr);
  assert.equal(r.status === 0, scenario === 'success', r.stderr);
});
const ciCases = ['success','foreign-repo','foreign-repo-id','foreign-owner','wrong-ref','push-event',
 'wrong-actor','wrong-actor-id','wrong-trigger','rerun','failed-job','extra-job','wrong-ci-sha',
 'failed-ci','running-ci','ci-rerun','wrong-ci-repo','wrong-workflow','api-denied',
 'prior-dispatch','wrong-dispatch-id'];
for (const scenario of ciCases) test(`identity and approved CI: ${scenario}`, () => {
  const r = run(scripts[0], ciMock, scenario);
  assert.equal(r.error, undefined);
  assert.equal(r.status === 0, scenario === 'success', r.stderr);
});

test('new controller commits cannot hide an earlier fixed-release dispatch', () => {
  assert.doesNotMatch(scripts[0], /event=workflow_dispatch&head_sha=/);
  assert.match(scripts[0], /event=workflow_dispatch&per_page=100/);
  const mock = ciMock.replace("if(url.includes('/actions/workflows/')){body=",
    "if(url.includes('/actions/workflows/')){if(url.includes('head_sha='))throw Error('Unsafe history filter');body=");
  const denied = run(scripts[0], mock, 'prior-dispatch');
  assert.notEqual(denied.status, 0);
  const initial = run(scripts[0], mock, 'success');
  assert.equal(initial.status, 0, initial.stderr);
});

// Counterexamples from the independent review, plus missing/unverifiable snapshots.
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
  const r = run(instrumented, mock, 'success');
  assert.equal(r.error, undefined);
  assert.notEqual(r.status, 0, r.stdout);
  if (message) assert.match(r.stderr, message);
  const info = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(info.calls, 1); assert.equal(info.writes, 0);
  assert.equal(info.artifacts['accepted-deployment.json'], undefined);
  return info;
}
for (const [label, injection] of Object.entries(bindingFailures)) test(label, () => {
  // Project settings remain correct: only the actual deployment differs.
  const mock = releaseMock.replace('const cfg=', injection + '\nconst cfg=');
  rejectsAfterUpload(mock, /deployed binding|Deployed binding/);
});
for (const status of ['success', 'failure', 'skipped', 'active']) test(`late competing deployment: ${status}`, () => {
  const injection = `if(historyReads===4)result.push({...deployment('late-second','other-source'),latest_stage:{name:'deploy',status:'${status}'},is_skipped:${status === 'skipped'}});`;
  const mock = releaseMock.replace('historyReads++;result=[baseline];',
    'historyReads++;result=[baseline];' + injection);
  rejectsAfterUpload(mock, /Final new deployment set|Competing\/unknown/);
});
for (const [label, injection] of Object.entries({
  'duplicate final history IDs': "result.push(baseline);",
  'accepted deployment absent from final history': 'result=result.filter(d=>d.id!==newid);',
  'baseline history disappears': 'result=result.filter(d=>d.id!==baseid);',
  'final history unknown status': "result=result.map(d=>d.id===newid?{...d,latest_stage:{name:'deploy',status:'idle'}}:d);",
})) test(label, () => {
  const mock = releaseMock.replace('body={success:true,result,result_info:{total_pages:1}};',
    `if(historyReads===4){${injection}}body={success:true,result,result_info:{total_pages:1}};`);
  rejectsAfterUpload(mock);
});
for (const [label, injection] of Object.entries({
  'canonical changes after final history': 'result.canonical_deployment=baseline;',
  'canonical terminal success disappears': "result.canonical_deployment={...fresh,latest_stage:{name:'deploy',status:'active'}};",
  'canonical binding becomes unverifiable': "result.canonical_deployment={...fresh,r2_buckets:null};",
  'configuration changes after final history': "result.deployment_configs.production.d1_databases.DB.id='other';",
})) test(label, () => {
  const mock = releaseMock.replace('result=project();projectReads++;',
    `result=project();projectReads++;if(projectReads===4){${injection}}`);
  rejectsAfterUpload(mock);
});
test('accepted evidence follows all verification and the creation certainty check', () => {
  assert(yaml.indexOf("save('accepted-deployment.json'") > yaml.indexOf('Deployment observed but creation outcome uncertain'));
  assert.doesNotMatch(yaml, /save\('verified-deployment\.json'/);
});

test('creation response ID must match the independently observed deployment', () => {
  const script = instrumented.replace("returned:'12345678-0000-0000-0000-000000000001'", "returned:'99999999-0000-0000-0000-000000000001'");
  const r = run(script, releaseMock, 'success');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Creation response ID differs/);
  const info = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(info.artifacts['accepted-deployment.json'], undefined);
});
