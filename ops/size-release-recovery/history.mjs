import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyBaselineHistory,verifySkipped} from '../size-release/history.mjs';
const baseline=JSON.parse(readFileSync(new URL('../size-release/history-baseline.json',import.meta.url)));
const mandatory=JSON.parse(readFileSync(new URL('./reviewed-skips.json',import.meta.url)));
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{40}$/;
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const keys=(o,ks)=>{assert(o&&typeof o==='object'&&!Array.isArray(o));assert.deepEqual(Object.keys(o).sort(),ks.slice().sort());};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const snapshot=list=>hash(JSON.stringify(canonical(list.slice().sort((a,b)=>a.id.localeCompare(b.id)))));
export function recoveryHistoryVerifier(e=process.env){
 const frozen=Object.fromEntries(['SKIPS_MANIFEST','SKIPS_SHA256','GITHUB_SHA','REVIEWED_CONTROLLER_SHA','REVIEWED_CONTROLLER_TREE','INSTALL_SKIPPED_ID','BROWSER_HARNESS_SHA','BROWSER_HARNESS_TREE'].map(k=>[k,e[k]]));
 assert.equal(e.GITHUB_SHA,e.REVIEWED_CONTROLLER_SHA);assert.match(e.GITHUB_SHA||'',sha);assert.match(e.REVIEWED_CONTROLLER_TREE||'',sha);assert.match(e.INSTALL_SKIPPED_ID||'',uuid);
 assert.equal(typeof e.SKIPS_MANIFEST,'string');assert(Buffer.byteLength(e.SKIPS_MANIFEST)<=32768);
 assert.match(e.SKIPS_SHA256||'',/^sha256:[a-f0-9]{64}$/);assert.equal(hash(e.SKIPS_MANIFEST),e.SKIPS_SHA256);
 const m=JSON.parse(e.SKIPS_MANIFEST);assert.equal(JSON.stringify(m),e.SKIPS_MANIFEST,'Noncanonical or duplicate-key manifest');
 keys(m,['version','repository','controller_sha','controller_tree','records']);assert.equal(m.version,2);assert.equal(m.repository,'Skyeagle123/Classyline');assert.equal(m.controller_sha,e.GITHUB_SHA);assert.equal(m.controller_tree,e.REVIEWED_CONTROLLER_TREE);
 assert(Array.isArray(m.records)&&m.records.length<=32);
 const ids=new Set([...baseline.production,...baseline.preview].map(d=>d.id));
 for(const r of m.records){
  const browser=r.environment==='preview'&&r.branch==='phase/storefront-size-browser-qualification'&&!mandatory.some(k=>k.id===r.id);
  keys(r,['id','project_id','project_name','environment','branch','commit','created_on',...(browser?['harness_tree']:[])]);assert.match(r.id,uuid);assert(!ids.has(r.id),'Duplicate or pinned ID');ids.add(r.id);
  assert.equal(r.project_id,'25d5c0d3-f248-4d69-b5a3-feacfcb66dec');assert.equal(r.project_name,'classyline2');assert(['production','preview'].includes(r.environment));assert.match(r.commit,sha);
  assert.match(r.created_on,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/);assert(Number.isFinite(Date.parse(r.created_on)));
  const known=mandatory.find(k=>k.id===r.id);
  if(known)assert.deepEqual(r,known,'Reviewed supplementary identity altered');
  else if(r.environment==='production') {assert.equal(r.id,e.INSTALL_SKIPPED_ID);assert.equal(r.branch,'main');assert.equal(r.commit,e.GITHUB_SHA);}
  else if(browser) {
   assert.match(e.BROWSER_HARNESS_SHA||'',sha);assert.match(e.BROWSER_HARNESS_TREE||'',sha);
   assert.equal(r.commit,e.BROWSER_HARNESS_SHA,'Unreviewed browser source');
   assert.equal(r.harness_tree,e.BROWSER_HARNESS_TREE,'Unreviewed browser tree');
  } else assert.equal(r.branch,'phase/storefront-size-release-recovery','Unapproved publication branch');
 }
 for(const r of mandatory)assert.deepEqual(m.records.find(x=>x.id===r.id),r,'Mandatory supplementary record missing');
 const installed=m.records.filter(r=>r.id===e.INSTALL_SKIPPED_ID);assert.equal(installed.length,1);assert.equal(installed[0].environment,'production');assert.equal(installed[0].commit,e.GITHUB_SHA);
 const initial={};
 function freeze(){for(const [k,v]of Object.entries(frozen))assert.equal(e[k],v,'Protected receipt changed during release');}
 function verifyKnown(list,env){
  freeze();assert(['production','preview'].includes(env));assert(Array.isArray(list));assert.equal(new Set(list.map(d=>d.id)).size,list.length);
  if(env==='production')verifySkipped(list,'e08316796a14476712bcf0f79f6606c62c7bc294','ceba0a45-4aa1-4ccd-9b4e-a7eaf696a038');
  const pinned=baseline[env];verifyBaselineHistory(list.filter(d=>pinned.some(k=>k.id===d.id)),null,env);
  for(const r of m.records.filter(x=>x.environment===env)){
   const d=list.find(x=>x.id===r.id);assert(d,'Missing approved skip');
   for(const k of ['id','project_id','project_name','environment','created_on'])assert.equal(d[k],r[k]);assert.equal(d.is_skipped,true);
   assert.equal(d.deployment_trigger?.type,'github:push');const x=d.deployment_trigger.metadata;assert.equal(x.branch,r.branch);assert.equal(x.commit_hash,r.commit);assert.equal(x.commit_dirty,false);
   const idle=s=>s?.status==='idle'&&s.started_on===null&&s.ended_on===null;
   assert.equal(d.latest_stage?.name,'queued');assert(idle(d.latest_stage));assert.deepEqual(d.stages?.map(s=>s.name),['queued','initialize','clone_repo','build','deploy']);assert(d.stages.every(idle));
  }
 }
 return Object.freeze({verifyKnown,verify(list,env,acceptedID=null){
  verifyKnown(list,env);const allowed=new Set([...baseline[env],...m.records.filter(x=>x.environment===env)].map(d=>d.id));
  if(acceptedID){assert.equal(env,'production');assert.match(acceptedID,uuid);assert(!allowed.has(acceptedID));assert(initial[env],'Missing initial history');}
  assert.equal(list.length,allowed.size+(acceptedID?1:0),'Unexpected complete inventory');assert(list.every(d=>allowed.has(d.id)||d.id===acceptedID),'Unknown deployment');
  const current=snapshot(list.filter(d=>d.id!==acceptedID));if(initial[env]===undefined)initial[env]=current;else assert.equal(current,initial[env],'Full history contents changed');
  return {manifest_sha256:frozen.SKIPS_SHA256,history_sha256:current,original_records:baseline[env].length,supplementary_records:allowed.size-baseline[env].length,total_records:list.length};
 }});
}
