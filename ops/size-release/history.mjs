import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const baseline=JSON.parse(readFileSync(new URL('./history-baseline.json',import.meta.url)));
export function verifySkipped(list,controllerSHA,installationID) {
 assert.match(installationID||'',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,'Missing reviewed installation skip ID');
 const records=[['104abcf0-b542-4ea5-b655-70abab5339ba','0ce95a706a88c63a914c25b142d4fc6878de66d8'],
 ['32efafa7-5985-4ae8-98b5-326c6425295a','b37ada79be5f3d3a5e9554bbf1c444fba25752b7'],
 ['e346342b-626e-4d1b-962c-b688f24e2bab','00b25b282d66818632a2d214e7a52ffbd0f8a1cb'],[installationID,controllerSHA]];
 assert.equal(new Set(records.map(r=>r[0])).size,4);
 for(const [id,sha] of records){const matches=list.filter(d=>d.id===id);assert.equal(matches.length,1,'Missing pinned skip');const d=matches[0];
 assert.equal(d.project_id,'25d5c0d3-f248-4d69-b5a3-feacfcb66dec');assert.equal(d.project_name,'classyline2');
 assert.equal(d.environment,'production');assert.equal(d.is_skipped,true);assert.equal(d.deployment_trigger?.type,'github:push');
 assert.equal(d.deployment_trigger.metadata.branch,'main');assert.equal(d.deployment_trigger.metadata.commit_hash,sha);assert.equal(d.deployment_trigger.metadata.commit_dirty,false);
 const idle=s=>s?.status==='idle'&&s.started_on===null&&s.ended_on===null;
 assert.equal(d.latest_stage?.name,'queued');assert(idle(d.latest_stage));
 assert.deepEqual(d.stages?.map(s=>s.name),['queued','initialize','clone_repo','build','deploy']);assert(d.stages.every(idle));
 }
}
export function verifyBaselineHistory(list,installationID,environment='production',acceptedID=null) {
 const expected=baseline[environment];assert(Array.isArray(expected));
 assert.equal(list.length,expected.length+(installationID?1:0)+(acceptedID?1:0),'Unexpected complete history inventory');
 assert.equal(new Set(list.map(d=>d.id)).size,list.length);
 for(const known of expected){const d=list.find(d=>d.id===known.id);assert(d,'Historical record missing');
 assert.equal(d.environment,known.environment);assert.equal(d.is_skipped,known.is_skipped);
 assert.equal(d.deployment_trigger?.metadata?.commit_hash,known.source);assert.equal(d.latest_stage?.status,known.status);assert.equal(d.latest_stage?.name,known.stage);}
 const allowed=new Set([...expected.map(d=>d.id),installationID,acceptedID]);assert(list.every(d=>allowed.has(d.id)),'Unexpected completed or active deployment');
}
