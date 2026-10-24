import assert from 'node:assert/strict';
export async function verifyBrowserReceipt(get,e,readJobLog) {
 for(const key of ['BROWSER_HARNESS_SHA','BROWSER_HARNESS_TREE'])assert.match(e[key]||'',/^[a-f0-9]{40}$/,'Missing reviewed browser identity');
 for(const key of ['BROWSER_RUN_ID','BROWSER_ARTIFACT_ID'])assert.match(e[key]||'',/^[1-9][0-9]{0,15}$/,'Missing reviewed browser evidence');
 assert.match(e.BROWSER_ARTIFACT_DIGEST||'',/^sha256:[a-f0-9]{64}$/,'Missing reviewed artifact digest');
 const id=Number(e.BROWSER_RUN_ID),artifactID=Number(e.BROWSER_ARTIFACT_ID);
 assert(Number.isSafeInteger(id)&&Number.isSafeInteger(artifactID));
 const r=await get('/actions/runs/'+id);
 assert.equal(r.id,id);assert.equal(r.repository?.full_name,'Skyeagle123/Classyline');assert.equal(r.repository.id,1096008352);
 assert.equal(r.path,'.github/workflows/size-isolated-browser.yml');
 assert(['push','pull_request'].includes(r.event));assert.equal(r.head_branch,'phase/storefront-size-browser-qualification');
 assert.equal(r.head_sha,e.BROWSER_HARNESS_SHA);assert.equal(r.head_commit?.tree_id,e.BROWSER_HARNESS_TREE);
 assert.equal(r.run_attempt,1);assert.equal(r.status,'completed');assert.equal(r.conclusion,'success');
 const commit=await get('/git/commits/'+e.BROWSER_HARNESS_SHA);assert.equal(commit.sha,e.BROWSER_HARNESS_SHA);assert.equal(commit.tree?.sha,e.BROWSER_HARNESS_TREE);
 const jobs=await get(`/actions/runs/${id}/attempts/1/jobs?per_page=100`);
 assert.equal(jobs.total_count,1);assert.equal(jobs.jobs?.length,1);const j=jobs.jobs[0];
 assert.equal(j.run_id,id);assert.equal(j.run_attempt,1);assert.equal(j.head_sha,e.BROWSER_HARNESS_SHA);
 assert.equal(j.status,'completed');assert.equal(j.conclusion,'success');
 for(const name of ['Verify source identities and credential-free execution','Run credential-free harness and workflow safety regressions','Build exact accepted static application','Qualify isolated UI using synthetic responses only','Preserve synthetic screenshots and network evidence even on failure']) {
  const steps=j.steps?.filter(s=>s.name===name);assert.equal(steps?.length,1);assert.equal(steps[0].status,'completed');assert.equal(steps[0].conclusion,'success');
 }
 const a=await get(`/actions/runs/${id}/artifacts?per_page=100`);
 assert.equal(a.total_count,1);assert.equal(a.artifacts?.length,1);const artifact=a.artifacts[0];
 assert.equal(artifact.id,artifactID);assert.equal(artifact.expired,false);
 assert.equal(artifact.name,`size-isolated-browser-${id}-1`);assert.equal(artifact.digest,e.BROWSER_ARTIFACT_DIGEST);
 assert.equal(artifact.workflow_run?.id,id);assert.equal(artifact.workflow_run?.head_sha,e.BROWSER_HARNESS_SHA);
 assert(Number.isSafeInteger(j.id)&&j.id>0);
 const log=await readJobLog(j.id);const rows=log.split('\n').filter(l=>l.includes('CLASSYLINE_BROWSER_RECEIPT=')).map(l=>JSON.parse(l.slice(l.indexOf('CLASSYLINE_BROWSER_RECEIPT=')+27)));
 assert.equal(rows.length,1,'Missing exact secure-source browser summary');assert.deepEqual(rows[0],{application_sha:'7d978f3ab539efb89a4cd5a2c44abe87775c4451',application_tree:'75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8',tests:45,passed:45,screenshots:39,external_forwarded:0,static_api_requests:0,mutations:0});
 return {run_id:id,artifact_id:artifactID,digest:artifact.digest};
}
