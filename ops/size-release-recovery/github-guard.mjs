import {verifyConsumedSizeAttempt} from './failed-release.mjs';
import assert from 'node:assert/strict';
import {verifyBrowserReceipt} from './qualification.mjs';
export async function verifySizeRelease(get, readJobLog, e = process.env) {
  const path = '.github/workflows/classyline-production-size-recovery.yml';
  const historicalPath = '.github/workflows/classyline-production-manual.yml';
  const owner = 'Skyeagle123', ownerID = 125151458, workflowID = 391522489;
  const failedSHA = 'cddb2e8303df17b78d1880e73f311547ea333dc0';
  const failedTree = 'c5d0d4ba5281660d00c5924511d0639885a3d875';
  assert.equal(e.GITHUB_RUN_ATTEMPT, '1');
  assert.equal(e.GITHUB_RUN_NUMBER, '1', 'V2.1 release opportunity consumed');
  assert.equal(e.RELEASE_ARMED, 'true', 'Release window is not armed');
  for (const [key, value] of Object.entries({GITHUB_REPOSITORY:'Skyeagle123/Classyline',
    GITHUB_REPOSITORY_ID:'1096008352', GITHUB_REPOSITORY_OWNER_ID:'125151458',
    GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'workflow_dispatch',
    GITHUB_ACTOR:'Skyeagle123', GITHUB_ACTOR_ID:'125151458', GITHUB_TRIGGERING_ACTOR:'Skyeagle123'}))
    assert.equal(e[key], value, 'Unauthorized V2.1 release identity');
  assert.match(e.GITHUB_SHA, /^[a-f0-9]{40}$/);
  assert.equal(e.GITHUB_WORKFLOW_SHA, e.GITHUB_SHA, 'Controller execution identity mismatch');
  assert.equal(e.GITHUB_WORKFLOW_REF, `Skyeagle123/Classyline/${path}@refs/heads/main`);
  const currentID = Number(e.GITHUB_RUN_ID);
  assert(Number.isSafeInteger(currentID) && currentID > 39838839195);
  const inventory = await get('/actions/workflows/classyline-production-manual.yml/runs' +
    '?event=workflow_dispatch&per_page=100');
  assert.equal(inventory.total_count, 3, 'Unexpected dispatch inventory');
  assert(Array.isArray(inventory.workflow_runs));
  assert.equal(inventory.workflow_runs.length, 3, 'Incomplete dispatch inventory');
  const expectedIDs = [39629341749, 39814798811, 39838839195].sort((a,b) => a-b);
  assert.deepEqual(inventory.workflow_runs.map(r => r.id).sort((a,b) => a-b), expectedIDs,
    'Missing, duplicate or unexpected dispatch');
  function identity(r, id, number, sha, tree, status, conclusion, expectedPath = historicalPath, expectedWorkflow = workflowID) {
    assert.equal(r.id, id); assert.equal(r.workflow_id, expectedWorkflow);
    assert.equal(r.repository?.full_name, 'Skyeagle123/Classyline');
    assert.equal(r.repository?.id, 1096008352);
    assert.equal(r.path, expectedPath); assert.equal(r.event, 'workflow_dispatch');
    assert.equal(r.actor?.login, owner); assert.equal(r.actor?.id, ownerID);
    assert.equal(r.triggering_actor?.login, owner); assert.equal(r.triggering_actor?.id, ownerID);
    assert.equal(r.head_branch, 'main'); assert.equal(r.head_sha, sha);
    assert.equal(r.head_commit?.id, sha); assert.equal(r.head_commit?.tree_id, tree);
    assert.equal(r.run_number, number); assert.equal(r.run_attempt, 1);
    assert.equal(r.status, status); assert.equal(r.conclusion, conclusion);
  }
  const controller = await get('/git/commits/' + e.GITHUB_SHA);
  assert.equal(controller.sha, e.GITHUB_SHA);
  assert.match(controller.tree?.sha, /^[a-f0-9]{40}$/);
  // A reviewed activation squash from this exact installed baseline is required.
  assert.deepEqual(controller.parents?.map(p => p.sha), ['7d978f3ab539efb89a4cd5a2c44abe87775c4451']);
  const expected = [
    [39629341749, 1, '492fb4a963f9a0c9a8a24cf783a47cbe44ae7586',
      '2632c6bd097c61af2eff1b48cefb186b1ad3802d', 'completed', 'success'],
    [39814798811, 2, failedSHA, failedTree, 'completed', 'failure'],
    [39838839195, 3, '583105d0c548caf9c81228f0d1f3572d9b6cbe37',
      '6b9139f265772078cb8d912ad9ad2a888c82d4bb', 'completed', 'success']
  ];
  for (const args of expected) {
    identity(inventory.workflow_runs.find(r => r.id === args[0]), ...args);
    identity(await get('/actions/runs/' + args[0]), ...args);
  }
  assert.equal(e.GITHUB_SHA,e.REVIEWED_CONTROLLER_SHA,'Unreviewed installed controller');
  assert.equal(controller.tree.sha,e.REVIEWED_CONTROLLER_TREE,'Installed controller tree drift');
  assert.match(e.REVIEWED_CONTROLLER_TREE||'',/^[a-f0-9]{40}$/);
  const ref=await get('/git/ref/heads/main');assert.equal(ref.object?.sha,e.GITHUB_SHA,'main drift');
  const consumedPath='.github/workflows/classyline-production-v21.yml';
  const consumedList=await get('/actions/workflows/classyline-production-v21.yml/runs?event=workflow_dispatch&per_page=100');
  assert.equal(consumedList.total_count,1);assert.equal(consumedList.workflow_runs?.length,1);
  const consumedArgs=[40005672896,1,'b37ada79be5f3d3a5e9554bbf1c444fba25752b7','2285234c0f7d14e39c2681e57586eb5258bc808a','completed','success',consumedPath,393398792];
  identity(consumedList.workflow_runs[0],...consumedArgs);identity(await get('/actions/runs/40005672896'),...consumedArgs);
  const workflow = await get('/actions/workflows/classyline-production-size-recovery.yml');
  assert(Number.isSafeInteger(workflow.id) && workflow.id > 0 && workflow.id !== workflowID);
  assert.equal(workflow.path, path); assert.equal(workflow.state, 'active');
  const currentInventory = await get('/actions/workflows/classyline-production-size-recovery.yml/runs?event=workflow_dispatch&per_page=100');
  assert.equal(currentInventory.total_count, 1, 'V2.1 dispatch opportunity consumed');
  assert(Array.isArray(currentInventory.workflow_runs));
  assert.equal(currentInventory.workflow_runs.length, 1, 'Incomplete V2.1 dispatch inventory');
  const allDispatches=await get('/actions/runs?event=workflow_dispatch&per_page=100');
  assert.equal(allDispatches.total_count,6,'Unexpected repository-wide manual dispatch');
  assert.equal(allDispatches.workflow_runs?.length,6,'Truncated repository dispatch inventory');
  assert.deepEqual(allDispatches.workflow_runs.map(r=>r.id).sort((a,b)=>a-b),[39629341749,39814798811,39838839195,40005672896,40070135911,currentID].sort((a,b)=>a-b));
  const currentArgs = [currentID, 1, e.GITHUB_SHA, controller.tree.sha, 'in_progress', null, path, workflow.id];
  identity(currentInventory.workflow_runs[0], ...currentArgs);
  identity(await get('/actions/runs/' + currentID), ...currentArgs);
  // Revalidate accepted CI and the exact source, tested merge and published squash.
  const ci = await get('/actions/runs/40019223658');
  assert.equal(ci.id, 40019223658); assert.equal(ci.repository?.full_name, 'Skyeagle123/Classyline');
  assert.equal(ci.repository?.id, 1096008352); assert.equal(ci.path, '.github/workflows/storefront.yml');
  assert.equal(ci.head_sha, '335c31f8a629593e462f144296b5c4a29653206f');
  assert.equal(ci.head_branch, 'phase/storefront-v21-size-ordering');
  assert.equal(ci.event, 'pull_request'); assert.equal(ci.run_attempt, 1);
  assert.equal(ci.status, 'completed'); assert.equal(ci.conclusion, 'success');
  assert.equal(ci.head_commit?.tree_id, '823de98f6faa7fcb65ea980f771f1c7318561694');
  const ciJobs = await get('/actions/runs/40019223658/attempts/1/jobs?per_page=100');
  assert.equal(ciJobs.total_count, 1); assert.equal(ciJobs.jobs?.length, 1);
  const ciJob = ciJobs.jobs[0];
  assert.equal(ciJob.run_id, 40019223658); assert.equal(ciJob.run_attempt, 1);
  assert.equal(ciJob.head_sha, ci.head_sha); assert.equal(ciJob.name, 'check');
  assert.equal(ciJob.status, 'completed'); assert.equal(ciJob.conclusion, 'success');
  const expectedCIsteps = ['Run npm ci --ignore-scripts','Run npm test','Run npm run security:check',
    'Run npm run build','Run npm run build:functions','Run npm audit --audit-level=high'];
  for (const name of expectedCIsteps) {
    const matches = ciJob.steps?.filter(s => s.name === name);
    assert.equal(matches?.length, 1); assert.equal(matches[0].status, 'completed');
    assert.equal(matches[0].conclusion, 'success');
  }
  const source = await get('/git/commits/335c31f8a629593e462f144296b5c4a29653206f');
  const tested = await get('/git/commits/9ccc89b0c5507b5ca98b00328c72f0391522400f');
  const squash = await get('/git/commits/00b25b282d66818632a2d214e7a52ffbd0f8a1cb');
  for (const [commit, sha] of [[source,ci.head_sha], [tested,'9ccc89b0c5507b5ca98b00328c72f0391522400f'],
    [squash,'00b25b282d66818632a2d214e7a52ffbd0f8a1cb']]) {
    assert.equal(commit.sha, sha); assert.equal(commit.tree?.sha, ci.head_commit.tree_id);
  }
  assert.deepEqual(source.parents?.map(p=>p.sha), ['b37ada79be5f3d3a5e9554bbf1c444fba25752b7']);
  assert.deepEqual(tested.parents?.map(p=>p.sha), ['b37ada79be5f3d3a5e9554bbf1c444fba25752b7',ci.head_sha]);
  assert.deepEqual(squash.parents?.map(p=>p.sha), ['b37ada79be5f3d3a5e9554bbf1c444fba25752b7']);
  const failedCommit = await get('/git/commits/' + failedSHA);
  assert.equal(failedCommit.sha, failedSHA); assert.equal(failedCommit.tree?.sha, failedTree);
  const jobs = await get('/actions/runs/39814798811/attempts/1/jobs?per_page=100');
  assert.equal(jobs.total_count, 1); assert.equal(jobs.jobs?.length, 1);
  const job = jobs.jobs[0];
  assert.equal(job.id, 119950374894); assert.equal(job.name, 'deploy');
  assert.equal(job.run_id, 39814798811); assert.equal(job.run_attempt, 1);
  assert.equal(job.head_sha, failedSHA); assert.equal(job.status, 'completed');
  assert.equal(job.conclusion, 'failure');
  const steps = [
    ['Set up job', 'success'],
    ['Require separately armed release window', 'failure'],
    ['Verify approved CI and dispatch identity', 'skipped'],
    ['Check out reviewed release controller', 'skipped'],
    ['Check out approved application only', 'skipped'],
    ['Verify reviewed controller checkout', 'skipped'],
    ['Set up Node 24', 'skipped'],
    ['Verify source and locked tooling', 'skipped'],
    ['Validate and build complete application', 'skipped'],
    ['Record source and artifact provenance', 'skipped'],
    ['Preflight, one Wrangler deployment invocation, and read-only verification', 'skipped'],
    ['Retain credential-free release evidence', 'success'],
    ['Complete job', 'success']
  ];
  assert(Array.isArray(job.steps)); assert.equal(job.steps.length, steps.length);
  for (const [index, [name, conclusion]] of steps.entries()) {
    assert.equal(job.steps[index].number, index + 1);
    assert.equal(job.steps[index].name, name);
    assert.equal(job.steps[index].status, 'completed');
    assert.equal(job.steps[index].conclusion, conclusion, 'Historical execution evidence changed');
  }
  for (const id of [39814798811, currentID]) {
    const approvals = await get('/actions/runs/' + id + '/approvals');
    assert(Array.isArray(approvals) && approvals.length === 1, 'Unverifiable environment approval');
    const approval = approvals[0];
    assert.equal(approval.state, 'approved');
    assert.equal(approval.user?.login, owner); assert.equal(approval.user?.id, ownerID);
    assert.equal(approval.environments?.length, 1);
    const environment = approval.environments[0];
    assert.equal(environment.id, 24902198946); assert.equal(environment.name, 'classyline-production');
    assert.equal(environment.can_admins_bypass, false, 'Environment approval bypass permitted');
  }
  // Preserve exact original logs in Git, not an expiring Actions artifact. Live job
  // metadata remains mandatory: this archive never substitutes for missing history.
  const blobID = '071fce850fcf330ef2efd4c9e969793f67852872';
  const logSHA256 = 'b48a0342e34036759e3196050941baa2b39b9243b0db5ef80c62ebaace4dc54f';
  const blob = await get('/git/blobs/' + blobID);
  assert.equal(blob.sha, blobID); assert.equal(blob.encoding, 'base64');
  assert.equal(blob.size, 4574); assert.equal(typeof blob.content, 'string');
  assert(blob.content.length <= 6400, 'Oversized historical log encoding');
  const base64 = blob.content.replace(/\n/g, '');
  const bytes = Buffer.from(base64, 'base64');
  assert(bytes.toString('base64') === base64, 'Malformed historical log encoding');
  assert.equal(bytes.length, 4574);
  const {createHash: hash} = await import('node:crypto');
  assert.equal(hash('sha256').update(bytes).digest('hex'), logSHA256);
  assert.equal(hash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), blobID);
  const failedReceipt=await verifyConsumedSizeAttempt(get,readJobLog);
  await verifySecureProvenance(get);
  const browserReceipt=await verifyBrowserReceipt(get,e,readJobLog);
  return {failed_size_receipt:failedReceipt,consumed_v21_run:40005672896,browser_receipt:browserReceipt,historical_run_ids: [39629341749, 39814798811, 39838839195], release_run_id: currentID,
    release_run_number: 1, release_attempt: 1, controller_sha: controller.sha,
    controller_tree: controller.tree.sha, failed_job_id: job.id,
    failed_deployment_step: 'skipped', original_log_blob: blobID, original_log_sha256: logSHA256,
    owner_environment_approval_verified: true, replay_permitted: false};
}

async function verifySecureProvenance(get){
 const sha='7d978f3ab539efb89a4cd5a2c44abe87775c4451',tree='75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8';
 const c=await get('/git/commits/'+sha);assert.equal(c.sha,sha);assert.equal(c.tree?.sha,tree);
 assert.deepEqual(c.parents?.map(x=>x.sha),['e08316796a14476712bcf0f79f6606c62c7bc294']);
 for(const [id,event,path,jobName] of [[40088721086,'push','.github/workflows/size-toolchain-offline.yml','qualify'],[40088725192,'pull_request','.github/workflows/size-toolchain-offline.yml','qualify'],[40088725220,'pull_request','.github/workflows/storefront.yml','check']]){
  const r=await get('/actions/runs/'+id);assert.equal(r.id,id);assert.equal(r.repository?.id,1096008352);assert.equal(r.path,path);assert.equal(r.event,event);assert.equal(r.head_sha,'61516210c329776e5c3098b0ea4ef46cc881e7cc');assert.equal(r.head_commit?.tree_id,tree);assert.equal(r.status,'completed');assert.equal(r.conclusion,'success');assert.equal(r.run_attempt,1);
  const jobs=await get(`/actions/runs/${id}/attempts/1/jobs?per_page=100`);assert.equal(jobs.total_count,1);assert.equal(jobs.jobs?.length,1);const j=jobs.jobs[0];assert.equal(j.run_id,id);assert.equal(j.run_attempt,1);assert.equal(j.name,jobName);assert.equal(j.status,'completed');assert.equal(j.conclusion,'success');assert(j.steps?.length>0);assert(j.steps.every(s=>s.status==='completed'&&s.conclusion==='success'));
 }
}
