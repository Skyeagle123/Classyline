import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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

// This receipt is reviewed out of band after the final publication and squash.
// It must never be discovered or populated from the live deployment inventory.
export function previewHistoryVerifier(e = process.env) {
 const raw=e.PREVIEW_SKIPS_MANIFEST, digest=e.PREVIEW_SKIPS_SHA256;
 const controllerSHA=e.GITHUB_SHA, controllerTree=e.REVIEWED_CONTROLLER_TREE;
 assert.equal(controllerSHA,e.REVIEWED_CONTROLLER_SHA,'Unreviewed manifest controller');
 assert.match(controllerSHA||'',/^[a-f0-9]{40}$/);assert.match(controllerTree||'',/^[a-f0-9]{40}$/);
 assert.equal(typeof raw,'string','Missing supplementary Preview manifest');
 assert(Buffer.byteLength(raw)>0&&Buffer.byteLength(raw)<=32768,'Invalid Preview manifest size');
 assert.match(digest||'',/^sha256:[a-f0-9]{64}$/,'Missing or malformed Preview manifest digest');
 const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
 assert.equal(hash(raw),digest,'Preview manifest digest mismatch');
 const m=JSON.parse(raw);
 // A single canonical JSON.stringify representation rejects duplicate keys,
 // alternate encodings and accidental whitespace without adding a JSON parser.
 assert.equal(JSON.stringify(m),raw,'Preview manifest must be canonical compact JSON');
 const keys=(value,names)=>{
  assert(value&&typeof value==='object'&&!Array.isArray(value),'Invalid manifest object');
  assert.deepEqual(Object.keys(value).sort(),names.slice().sort(),'Unexpected manifest fields');
 };
 keys(m,['version','repository','controller_sha','controller_tree','records']);
 assert.equal(m.version,1);assert.equal(m.repository,'Skyeagle123/Classyline');
 assert.equal(m.controller_sha,controllerSHA,'Manifest controller SHA mismatch');
 assert.equal(m.controller_tree,controllerTree,'Manifest controller tree mismatch');
 assert(Array.isArray(m.records)&&m.records.length<=20,'Unbounded supplementary Preview records');
 const pinnedIDs=new Set(baseline.preview.map(d=>d.id));
 const allPinnedIDs=new Set([...baseline.preview,...baseline.production].map(d=>d.id));
 const extraIDs=new Set();
 for(const record of m.records){
  keys(record,['id','project_id','project_name','environment','branch','commit','created_on']);
  assert.match(record.id||'',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert(!allPinnedIDs.has(record.id)&&!extraIDs.has(record.id)&&record.id!==e.INSTALL_SKIPPED_ID,'Duplicate or historical supplementary ID');
  extraIDs.add(record.id);
  assert.equal(record.project_id,'25d5c0d3-f248-4d69-b5a3-feacfcb66dec');
  assert.equal(record.project_name,'classyline2');assert.equal(record.environment,'preview');
  assert(['phase/storefront-size-browser-qualification','phase/storefront-size-release-preparation'].includes(record.branch),'Unapproved supplementary branch');
  assert.match(record.commit||'',/^[a-f0-9]{40}$/);
  assert.match(record.created_on||'',/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/);
  assert(Number.isFinite(Date.parse(record.created_on)),'Invalid skipped record timestamp');
 }
 const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  assert(value===null||['string','boolean','number'].includes(typeof value),'Non-JSON history field');
  return value;
 };
 let initialHash;
 return Object.freeze({verify(list){
  // The protected inputs are captured once and must not change during the run.
  assert.equal(e.PREVIEW_SKIPS_MANIFEST,raw,'Preview manifest changed during release');
  assert.equal(e.PREVIEW_SKIPS_SHA256,digest,'Preview digest changed during release');
  assert.equal(e.GITHUB_SHA,controllerSHA);assert.equal(e.REVIEWED_CONTROLLER_SHA,controllerSHA);
  assert.equal(e.REVIEWED_CONTROLLER_TREE,controllerTree);
  assert(Array.isArray(list));
  assert.equal(list.length,pinnedIDs.size+extraIDs.size,'Unexpected complete Preview inventory');
  assert.equal(new Set(list.map(d=>d.id)).size,list.length,'Duplicate Preview history ID');
  assert(list.every(d=>pinnedIDs.has(d.id)||extraIDs.has(d.id)),'Unapproved Preview history record');
  verifyBaselineHistory(list.filter(d=>pinnedIDs.has(d.id)),null,'preview');
  for(const record of m.records){
   const d=list.find(d=>d.id===record.id);assert(d,'Missing supplementary Preview record');
   for(const key of ['id','project_id','project_name','environment','created_on'])assert.equal(d[key],record[key],'Altered supplementary '+key);
   assert.equal(d.is_skipped,true,'Supplementary record was not skipped');
   assert.equal(d.deployment_trigger?.type,'github:push');
   assert.equal(d.deployment_trigger.metadata.branch,record.branch);
   assert.equal(d.deployment_trigger.metadata.commit_hash,record.commit);
   assert.equal(d.deployment_trigger.metadata.commit_dirty,false);
   const idle=s=>s?.status==='idle'&&s.started_on===null&&s.ended_on===null;
   assert.equal(d.latest_stage?.name,'queued');assert(idle(d.latest_stage),'Skipped latest stage started or changed');
   assert.deepEqual(d.stages?.map(s=>s.name),['queued','initialize','clone_repo','build','deploy']);
   assert(d.stages.every(idle),'Supplementary deployment stage started or changed');
  }
  // Preserve all JSON contents, including fields not in the historical pins.
  // Record order and object-key order are irrelevant; stage-array order is not.
  const current=hash(JSON.stringify(canonical([...list].sort((a,b)=>a.id.localeCompare(b.id)))));
  if(initialHash===undefined)initialHash=current;
  else assert.equal(current,initialHash,'Preview record contents changed during release');
  return {manifest_sha256:digest,history_sha256:current,original_records:pinnedIDs.size,supplementary_records:extraIDs.size,total_records:list.length};
 }});
}
