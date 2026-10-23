// Test-only runtime for the actual embedded release script. No API or CLI I/O.
import assert from 'node:assert/strict';
import {createSizeAPI as createRecoveryAPI} from './api-double.mjs';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';

const scenario = process.argv[2];
const candidate = '00b25b282d66818632a2d214e7a52ffbd0f8a1cb';
const candidateTree = '823de98f6faa7fcb65ea980f771f1c7318561694';
const baselineID = '9974ad77-a81d-40dc-8281-789d0d0c1284';
const baselineSHA = '0ce95a706a88c63a914c25b142d4fc6878de66d8';
const projectID = '25d5c0d3-f248-4d69-b5a3-feacfcb66dec';
const newID = '12345678-0000-0000-0000-000000000001';
const otherID = '12345678-0000-0000-0000-000000000002';
const fakeToken = 'FAKE_TEST_VALUE_NOT_A_CREDENTIAL';
const fakeGitHubToken = 'FAKE_GITHUB_VALUE_NOT_A_CREDENTIAL';
const temp = mkdtempSync(join(tmpdir(), 'classyline-wrangler-test-'));
let calls = 0, writes = 0, observed = false;
let recoveryDrift = false;
const boundaryEvents = [];
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
  GITHUB_SHA: 'c'.repeat(40), GITHUB_RUN_ID: '40100000000', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_RUN_NUMBER: '1', GITHUB_WORKFLOW_SHA: 'c'.repeat(40),
  GITHUB_WORKFLOW_REF: 'Skyeagle123/Classyline/.github/workflows/classyline-production-size-update.yml@refs/heads/main',
  GITHUB_REPOSITORY:'Skyeagle123/Classyline', GITHUB_REPOSITORY_ID:'1096008352',
  GITHUB_REPOSITORY_OWNER_ID:'125151458', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_ACTOR:'Skyeagle123', GITHUB_ACTOR_ID:'125151458', GITHUB_TRIGGERING_ACTOR:'Skyeagle123',
  WRANGLER_LOG: 'debug', CLOUDFLARE_API_BASE_URL: 'https://forbidden.invalid',
  NODE_OPTIONS: '--require=/forbidden', CLASSYLINE_RELEASE_ARMED: 'true', RELEASE_ARMED: 'true',
});
if (scenario === 'missing-arm') delete process.env.RELEASE_ARMED;
if (scenario === 'false-arm') process.env.RELEASE_ARMED = 'false';
if (scenario === 'empty-arm') process.env.RELEASE_ARMED = '';
if (scenario === 'uppercase-arm') process.env.RELEASE_ARMED = 'TRUE';
Object.assign(process.env,{REVIEWED_CONTROLLER_SHA:'c'.repeat(40),REVIEWED_CONTROLLER_TREE:'d'.repeat(40),BROWSER_RUN_ID:'40020000000',BROWSER_HARNESS_SHA:'a'.repeat(40),BROWSER_HARNESS_TREE:'b'.repeat(40),BROWSER_ARTIFACT_ID:'88',BROWSER_ARTIFACT_DIGEST:'sha256:'+'e'.repeat(64),INSTALL_SKIPPED_ID:'33333333-0000-0000-0000-000000000001'});
mkdirSync(join(temp,'control','ops'),{recursive:true});
symlinkSync(new URL('.',import.meta.url).pathname,join(temp,'control','ops','size-release'));
const recovery = createRecoveryAPI(process.env, scenario, true);
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
    compatibility_flags: [], uses_functions: true,
    url: `https://${id.slice(0, 8)}.classyline2.pages.dev`};
}
const baseline = deployment(baselineID, baselineSHA), fresh = deployment(newID, candidate);
baseline.env_vars={WHATSAPP_NUMBER:{type:'plain_text',value:'96178719771'},ADMIN_PASSWORD_HASH:{type:'secret_text'},ADMIN_PASSWORD_SALT:{type:'secret_text'}};
baseline.d1_databases = {DB:{id:'10c800b1-ddf7-427b-8354-9cf8529782b6'}};
baseline.r2_buckets = {PRODUCT_IMAGES:{name:'classyline-storefront-production-images'}};
fresh.env_vars = {WHATSAPP_NUMBER:{type:'plain_text',value:'96178719771'},ADMIN_PASSWORD_HASH:{type:'secret_text'},ADMIN_PASSWORD_SALT:{type:'secret_text'}};
fresh.d1_databases = {DB: {id: '10c800b1-ddf7-427b-8354-9cf8529782b6'}};
fresh.r2_buckets = {PRODUCT_IMAGES: {name: 'classyline-storefront-production-images'}};
const cfg = (database, bucket) => ({compatibility_date: '2025-11-13', compatibility_flags: [],
  usage_model: 'standard', d1_databases: {DB: {id: database}}, r2_buckets: {PRODUCT_IMAGES: {name: bucket}},
  env_vars: {WHATSAPP_NUMBER:{type:'plain_text',value:'96178719771'},ADMIN_PASSWORD_HASH: {type: 'secret_text', value: fakeToken},
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
    if(command===process.execPath){assert(args[0].endsWith('/patch-wrangler.mjs'));assert.equal(args.at(-1),'verify');return 'mocked pinned tool verification';}
    assert.equal(command, 'git', 'Only read-only Git subprocesses may be mocked');
    boundaryEvents.push('source-check');
    if (recoveryDrift && scenario === 'during-recovery-source-drift' && args[0] === 'rev-parse')
      return 'unreviewed-source\n';
    if (args[0] === 'rev-parse') return (args[1]?.includes('tree') ? candidateTree : candidate) + '\n';
    assert.equal(args[0], 'status');
    return scenario === 'dirty-tree' ? ' M changed\n' : '';
  },
  spawn(command, args, options) {
    boundaryEvents.push('wrangler');
    calls++;
    assert.equal(calls, 1, 'Duplicate Wrangler deployment invocation');
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [join(process.cwd(),'node_modules/wrangler/wrangler-dist/cli.js'), 'pages', 'deploy', 'dist',
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
    if(scenario!=='missing-create-claim')writeFileSync(join(evidence,'create-claimed.json'),JSON.stringify({consumed:true,max_create_dispatches:1}));
    observed = scenario !== 'uncertain-no-deployment';
    if (scenario === 'wrong-source') fresh.deployment_trigger.metadata.commit_hash = 'bad';
    if (scenario === 'missing-functions') fresh.uses_functions = false;
    if (scenario === 'missing-deployed-secret') delete fresh.env_vars.ADMIN_PASSWORD_HASH;
    if (scenario === 'wrong-deployed-secret') fresh.env_vars.ADMIN_PASSWORD_SALT.type='plain_text';
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
    const response = recovery.respond(url, options);
    if (response) {
      // Inject drift only during the second real guard's last API response.
      // The guard still validates the log bytes/digests after this boundary.
      if (recovery.counts.inventories === 2 && url.includes('/git/blobs/')) {
        boundaryEvents.push('final-recovery-log-response');
        if (scenario.startsWith('during-recovery-')) recoveryDrift = true;
      }
      return response;
    }
    assert(url.endsWith('/git/ref/heads/main'), 'Unexpected GitHub read');
    boundaryEvents.push('main-check');
    mainReads++;
    body = {object: {sha: scenario === 'main-changed' || (scenario === 'late-main-drift' && mainReads >= 3)
      ? 'different' : process.env.GITHUB_SHA}};
    if (recoveryDrift && scenario === 'during-recovery-main-drift') body.object.sha = 'unreviewed-main';
  } else {
    assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/4bfa1a9c849c3da50520f7a4bcccccab/pages/projects/classyline2'));
    if (scenario === 'api-denied') return {ok: false, status: 403};
    let result;
    if (url.includes('/deployments?')) {
      boundaryEvents.push('cloudflare-history');
      const query = new URL(url).searchParams;
      const environment=query.get('env');assert(['production','preview'].includes(environment));
      assert.equal(query.get('per_page'),'10');const page=Number(query.get('page'));historyReads++;
      const known=JSON.parse(readFileSync(new URL('./history-baseline.json',import.meta.url)))[environment];
      const idle=name=>({name,status:'idle',started_on:null,ended_on:null});
      const skip=(id,sha)=>({...deployment(id,sha),is_skipped:true,deployment_trigger:{type:'github:push',metadata:{branch:'main',commit_hash:sha,commit_dirty:false}},latest_stage:idle('queued'),stages:['queued','initialize','clone_repo','build','deploy'].map(idle)});
      result=known.map(k=>({...deployment(k.id,k.source),environment,is_skipped:k.is_skipped,latest_stage:{name:k.stage,status:k.status}}));
      if(environment==='production'){
       for(const id of ['104abcf0-b542-4ea5-b655-70abab5339ba','32efafa7-5985-4ae8-98b5-326c6425295a','e346342b-626e-4d1b-962c-b688f24e2bab']){const index=result.findIndex(d=>d.id===id);result[index]=skip(id,known.find(d=>d.id===id).source);}
       result.unshift(skip(process.env.INSTALL_SKIPPED_ID,process.env.GITHUB_SHA));
       if(observed)result.unshift(structuredClone(fresh));
       if(scenario==='competing-build')result.push({...deployment(otherID,'other'),latest_stage:{name:'build',status:'active'}});
       if(scenario==='candidate-attempt-exists')result.push(deployment(otherID,candidate));
       if(scenario==='multiple-new'&&observed)result.push(deployment(otherID,candidate));
       if(scenario==='skipped-missing')result=result.filter(d=>d.id!=='e346342b-626e-4d1b-962c-b688f24e2bab');
       if(scenario==='skipped-started')result.find(d=>d.id==='e346342b-626e-4d1b-962c-b688f24e2bab').stages[1].started_on='now';
       if(scenario==='history-altered')result.at(-1).deployment_trigger.metadata.commit_hash='other';
      }else if(scenario==='preview-competitor')result.push({...deployment(otherID,'other'),environment:'preview'});
      const total=result.length;result=result.slice((page-1)*10,page*10);
      body={success:true,result,result_info:{page,per_page:10,count:result.length,total_count:total,total_pages:Math.ceil(total/10)}};
      if(scenario==='pagination-truncated'&&page===2)body.result.pop();
      if(scenario==='pagination-duplicate'&&page===2)body.result[0]=structuredClone(known[0]);
      if(scenario==='pagination-drift'&&page===2)body.result_info.total_count++;
      // INJECT_HISTORY_RESPONSE
    } else if (url.endsWith('/deployments/' + baselineID)) {
      boundaryEvents.push('cloudflare-rollback');
      rollbackReads++;
      result = structuredClone(baseline);
      if (scenario === 'rollback-missing' || (scenario === 'late-rollback-failure' && rollbackReads >= 2)) result.latest_stage.status = 'failure';
      if (scenario === 'rollback-d1') result.d1_databases.DB.id='other';
      if (scenario === 'rollback-r2') result.r2_buckets.PRODUCT_IMAGES.name='other';
      if (scenario === 'rollback-source-mismatch') result.deployment_trigger.metadata.commit_hash = 'wrong';
      body = {success: true, result};
    } else if (url.endsWith('/deployments/' + newID)) {
      body = {success: true, result: structuredClone(fresh)};
    } else {
      boundaryEvents.push('cloudflare-project');
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
      if (scenario === 'whatsapp-missing') delete c.env_vars.WHATSAPP_NUMBER;
      if (scenario === 'whatsapp-wrong') c.env_vars.WHATSAPP_NUMBER.value='9613505598';
      if (scenario === 'whatsapp-newline') c.env_vars.WHATSAPP_NUMBER.value+='\n';
      if (scenario === 'whatsapp-secret-type') c.env_vars.WHATSAPP_NUMBER.type='secret_text';
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
      if (recoveryDrift && scenario === 'during-recovery-d1') c.d1_databases.DB.id = 'unexpected-database';
      if (recoveryDrift && scenario === 'during-recovery-r2') c.r2_buckets.PRODUCT_IMAGES.name = 'unexpected-bucket';
      if (recoveryDrift && scenario === 'during-recovery-baseline')
        result.canonical_deployment = deployment(otherID, baselineSHA);
      body = {success: true, result};
    }
  }
  return {ok: true, status: 200, json: async () => body};
};

process.on('exit', () => {
  const artifacts = Object.fromEntries(readdirSync(evidence).filter(name => name.endsWith('.json'))
    .map(name => [name, JSON.parse(readFileSync(join(evidence, name)))]));
  rmSync(temp, {recursive: true, force: true});
  console.log(JSON.stringify({scenario, calls, writes, kills, historyReads, projectReads,
    recoveryReads:recovery.counts, boundaryEvents, recoveryDrift, artifacts}));
});
