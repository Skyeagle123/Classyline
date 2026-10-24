import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recoveryHistoryVerifier} from './history.mjs';
const baseline=JSON.parse(readFileSync(new URL('../size-release/history-baseline.json',import.meta.url)));
const known=JSON.parse(readFileSync(new URL('./reviewed-skips.json',import.meta.url)));
function fixture(){
 const e={GITHUB_SHA:'c'.repeat(40),REVIEWED_CONTROLLER_SHA:'c'.repeat(40),REVIEWED_CONTROLLER_TREE:'d'.repeat(40),INSTALL_SKIPPED_ID:'33333333-0000-0000-0000-000000000001'};
 const install={id:e.INSTALL_SKIPPED_ID,project_id:known[0].project_id,project_name:'classyline2',environment:'production',branch:'main',commit:e.GITHUB_SHA,created_on:'2026-10-24T15:00:00Z'};
 const manifest={version:2,repository:'Skyeagle123/Classyline',controller_sha:e.GITHUB_SHA,controller_tree:e.REVIEWED_CONTROLLER_TREE,records:[...structuredClone(known),install]};
 const seal=()=>{e.SKIPS_MANIFEST=JSON.stringify(manifest);e.SKIPS_SHA256='sha256:'+createHash('sha256').update(e.SKIPS_MANIFEST).digest('hex');};seal();
 const idle=name=>({name,status:'idle',started_on:null,ended_on:null});
 const lists=Object.fromEntries(['production','preview'].map(env=>[env,[...baseline[env].map(k=>({id:k.id,environment:env,is_skipped:k.is_skipped,deployment_trigger:{metadata:{commit_hash:k.source}},latest_stage:{name:k.stage,status:k.status}})),...manifest.records.filter(k=>k.environment===env).map(r=>({...r,is_skipped:true,deployment_trigger:{type:'github:push',metadata:{branch:r.branch,commit_hash:r.commit,commit_dirty:false}},latest_stage:idle('queued'),stages:['queued','initialize','clone_repo','build','deploy'].map(idle)}))]]));
 for(const d of lists.production)if(['104abcf0-b542-4ea5-b655-70abab5339ba','32efafa7-5985-4ae8-98b5-326c6425295a','e346342b-626e-4d1b-962c-b688f24e2bab'].includes(d.id)){Object.assign(d,{project_id:known[0].project_id,project_name:'classyline2',latest_stage:idle('queued'),stages:['queued','initialize','clone_repo','build','deploy'].map(idle)});d.deployment_trigger.type='github:push';Object.assign(d.deployment_trigger.metadata,{branch:'main',commit_dirty:false});}
 return {e,manifest,seal,lists};
}
test('exact original and explicitly approved supplemental inventories plus future installation pass',()=>{const f=fixture(),v=recoveryHistoryVerifier(f.e);for(const env of ['production','preview']){const r=v.verify(f.lists[env],env);assert.equal(r.total_records,f.lists[env].length);v.verify(structuredClone(f.lists[env]),env);}});
for(const env of ['production','preview'])for(const mutation of ['missing-original','missing-supplement','duplicate','unknown','source','branch','created','project','dirty','skip','status',...['queued','initialize','clone_repo','build','deploy'].flatMap(n=>[n+'-start',n+'-end',n+'-status'])])test('history rejects '+env+' '+mutation,()=>{
 const f=fixture(),list=f.lists[env],d=list.at(-1);const v=recoveryHistoryVerifier(f.e);
 if(mutation==='missing-original')list.shift();else if(mutation==='missing-supplement')list.pop();else if(mutation==='duplicate')list.push(structuredClone(d));else if(mutation==='unknown')list.push({...d,id:'44444444-0000-0000-0000-000000000001'});
 else if(mutation==='source')d.deployment_trigger.metadata.commit_hash='f'.repeat(40);else if(mutation==='branch')d.deployment_trigger.metadata.branch='other';else if(mutation==='created')d.created_on+='x';else if(mutation==='project')d.project_id='wrong';else if(mutation==='dirty')d.deployment_trigger.metadata.commit_dirty=true;else if(mutation==='skip')d.is_skipped=false;else if(mutation==='status')d.latest_stage.status='unknown';else {const [stage,field]=mutation.split('-'),s=d.stages.find(s=>s.name===stage);s[field==='start'?'started_on':field==='end'?'ended_on':'status']='changed';}
 assert.throws(()=>v.verify(list,env));
});
for(const key of ['SKIPS_MANIFEST','SKIPS_SHA256','GITHUB_SHA','REVIEWED_CONTROLLER_SHA','REVIEWED_CONTROLLER_TREE','INSTALL_SKIPPED_ID'])test('receipt freeze rejects '+key,()=>{const f=fixture(),v=recoveryHistoryVerifier(f.e);v.verify(f.lists.production,'production');f.e[key]+='x';assert.throws(()=>v.verify(f.lists.production,'production'));});
for(const mutation of ['digest-missing','digest-altered','controller','tree','duplicate-key','duplicate-entry','omitted-reviewed','altered-reviewed','unapproved-branch'])test('manifest rejects '+mutation,()=>{
 const f=fixture();if(mutation==='controller')f.manifest.controller_sha='f'.repeat(40);if(mutation==='tree')f.manifest.controller_tree='f'.repeat(40);if(mutation==='duplicate-entry')f.manifest.records.push(f.manifest.records[0]);if(mutation==='omitted-reviewed')f.manifest.records.shift();if(mutation==='altered-reviewed')f.manifest.records[0].commit='f'.repeat(40);if(mutation==='unapproved-branch')f.manifest.records.push({...f.manifest.records[2],id:'44444444-0000-0000-0000-000000000001',branch:'anything'});f.seal();if(mutation==='digest-missing')delete f.e.SKIPS_SHA256;if(mutation==='digest-altered')f.e.SKIPS_SHA256='sha256:'+'0'.repeat(64);if(mutation==='duplicate-key'){f.e.SKIPS_MANIFEST=f.e.SKIPS_MANIFEST.replace('"version":2','"version":2,"version":2');f.e.SKIPS_SHA256='sha256:'+createHash('sha256').update(f.e.SKIPS_MANIFEST).digest('hex');}assert.throws(()=>recoveryHistoryVerifier(f.e));
});
for(const env of ['production','preview'])test('same-ID full-content drift rejects '+env,()=>{const f=fixture(),v=recoveryHistoryVerifier(f.e);v.verify(f.lists[env],env);f.lists[env][0].unreviewed='changed';assert.throws(()=>v.verify(f.lists[env],env),/Full history contents/);});
test('one explicit accepted ID only after initial snapshot; extra or altered history still fails',()=>{const f=fixture(),v=recoveryHistoryVerifier(f.e),id='55555555-0000-0000-0000-000000000001';assert.throws(()=>v.verify([...f.lists.production,{id}],'production',id));v.verify(f.lists.production,'production');v.verify([...f.lists.production,{id}],'production',id);assert.throws(()=>v.verify([...f.lists.production,{id},{id:'other'}],'production',id));});

function browserFixture(){
 const f=fixture();Object.assign(f.e,{BROWSER_HARNESS_SHA:'a'.repeat(40),BROWSER_HARNESS_TREE:'b'.repeat(40)});
 const record={...f.manifest.records.find(r=>r.environment==='preview'),id:'66666666-0000-0000-0000-000000000001',branch:'phase/storefront-size-browser-qualification',commit:f.e.BROWSER_HARNESS_SHA,harness_tree:f.e.BROWSER_HARNESS_TREE};
 f.manifest.records.push(record);f.seal();const d=structuredClone(f.lists.preview.at(-1));
 Object.assign(d,{id:record.id,created_on:record.created_on});Object.assign(d.deployment_trigger.metadata,{branch:record.branch,commit_hash:record.commit});f.lists.preview.push(d);
 return {...f,record,d};
}
test('explicit browser skip binds exact protected harness source/tree and passes initial/final checks',()=>{
 const f=browserFixture(),v=recoveryHistoryVerifier(f.e);v.verify(f.lists.preview,'preview');v.verify(structuredClone(f.lists.preview),'preview');
});
for(const mutation of ['wrong-branch','wrong-source','wrong-tree','missing-tree','extra-field','wrong-project','wrong-environment','duplicate','missing-entry','unknown-record','missing-harness-sha','missing-harness-tree','changed-harness-sha','changed-harness-tree','started-stage','ended-stage','wrong-stage','dirty-source','live-source','late-field','late-stage','late-harness-sha','late-harness-tree'])test('browser manifest rejects '+mutation,()=>{
 const f=browserFixture();
 if(mutation==='wrong-branch')f.record.branch='phase/other';
 if(mutation==='wrong-source')f.record.commit='f'.repeat(40);
 if(mutation==='wrong-tree')f.record.harness_tree='f'.repeat(40);
 if(mutation==='missing-tree')delete f.record.harness_tree;
 if(mutation==='extra-field')f.record.unauthorized=true;
 if(mutation==='wrong-project')f.record.project_id='bad';
 if(mutation==='wrong-environment')f.record.environment='production';
 if(mutation==='duplicate')f.manifest.records.push({...f.record});
 if(mutation==='missing-entry')f.manifest.records.pop();
 if(mutation==='unknown-record')f.lists.preview.push({...f.d,id:'77777777-0000-0000-0000-000000000001'});
 if(mutation==='missing-harness-sha')delete f.e.BROWSER_HARNESS_SHA;
 if(mutation==='missing-harness-tree')delete f.e.BROWSER_HARNESS_TREE;
 if(mutation==='changed-harness-sha')f.e.BROWSER_HARNESS_SHA='e'.repeat(40);
 if(mutation==='changed-harness-tree')f.e.BROWSER_HARNESS_TREE='e'.repeat(40);
 if(mutation==='started-stage')f.d.stages[3].started_on='2026-10-24T00:00:00Z';
 if(mutation==='ended-stage')f.d.stages[3].ended_on='2026-10-24T00:00:00Z';
 if(mutation==='wrong-stage')f.d.stages[3].status='success';
 if(mutation==='dirty-source')f.d.deployment_trigger.metadata.commit_dirty=true;
 if(mutation==='live-source')f.d.deployment_trigger.metadata.commit_hash='f'.repeat(40);
 f.seal();
 if(mutation.startsWith('late-')){
  const v=recoveryHistoryVerifier(f.e);v.verify(f.lists.preview,'preview');
  if(mutation==='late-field')f.d.unreviewed='changed';
  if(mutation==='late-stage')f.d.stages[4].started_on='2026-10-24T00:00:00Z';
  if(mutation==='late-harness-sha')f.e.BROWSER_HARNESS_SHA='e'.repeat(40);
  if(mutation==='late-harness-tree')f.e.BROWSER_HARNESS_TREE='e'.repeat(40);
  assert.throws(()=>v.verify(f.lists.preview,'preview'));
 }else assert.throws(()=>recoveryHistoryVerifier(f.e).verify(f.lists.preview,'preview'));
});
