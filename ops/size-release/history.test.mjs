import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {previewHistoryVerifier,verifyBaselineHistory} from './history.mjs';

const pins=JSON.parse(readFileSync(new URL('./history-baseline.json',import.meta.url)));
const original=pins.preview.map(k=>({id:k.id,project_id:'25d5c0d3-f248-4d69-b5a3-feacfcb66dec',project_name:'classyline2',environment:k.environment,is_skipped:k.is_skipped,deployment_trigger:{type:'github:push',metadata:{branch:'historical',commit_hash:k.source,commit_dirty:false}},latest_stage:{name:k.stage,status:k.status},stages:[],url:'https://historical.invalid/'}));
const record={id:'f374e640-1719-4f6d-ae22-86303756ab6e',project_id:'25d5c0d3-f248-4d69-b5a3-feacfcb66dec',project_name:'classyline2',environment:'preview',branch:'phase/storefront-size-browser-qualification',commit:'3b14920c32940f628b50220aec292926aa2cd4c6',created_on:'2026-10-23T21:33:31.336319Z'};
const idle=name=>({name,status:'idle',started_on:null,ended_on:null});
const live=r=>({id:r.id,project_id:r.project_id,project_name:r.project_name,environment:r.environment,created_on:r.created_on,is_skipped:true,deployment_trigger:{type:'github:push',metadata:{branch:r.branch,commit_hash:r.commit,commit_dirty:false}},latest_stage:idle('queued'),stages:['queued','initialize','clone_repo','build','deploy'].map(idle)});
const encode=m=>JSON.stringify(m);
const sha=raw=>'sha256:'+createHash('sha256').update(raw).digest('hex');
function setup(records=[record]){
 const m={version:1,repository:'Skyeagle123/Classyline',controller_sha:'c'.repeat(40),controller_tree:'d'.repeat(40),records:structuredClone(records)};
 const e={GITHUB_SHA:m.controller_sha,REVIEWED_CONTROLLER_SHA:m.controller_sha,REVIEWED_CONTROLLER_TREE:m.controller_tree,INSTALL_SKIPPED_ID:'33333333-0000-0000-0000-000000000001',PREVIEW_SKIPS_MANIFEST:encode(m),PREVIEW_SKIPS_SHA256:sha(encode(m))};
 return {m,e,list:structuredClone([...original,...records.map(live)])};
}
function receiptChange(s,change){change(s.m);s.e.PREVIEW_SKIPS_MANIFEST=encode(s.m);s.e.PREVIEW_SKIPS_SHA256=sha(s.e.PREVIEW_SKIPS_MANIFEST);}
test('original 72 Preview and 31 Production pins remain mandatory',()=>{
 assert.equal(createHash('sha256').update(readFileSync(new URL('./history-baseline.json',import.meta.url))).digest('hex'),'37262f769561deed0cb1777e7800fde131a4c39282704cc787e2c9213f7b41b7');
 assert.equal(pins.preview.length,72);assert.equal(pins.production.length,31);
 verifyBaselineHistory(original,null,'preview');
 assert.throws(()=>verifyBaselineHistory(original.slice(1),null,'preview'));
});
test('manifest configuration belongs to the protected job and full verifier runs before and after creation',()=>{
 const yaml=readFileSync(new URL('../../.github/workflows/classyline-production-size-update.yml',import.meta.url),'utf8');
 assert(yaml.includes('environment: classyline-production'));
 for(const key of ['MANIFEST','SHA256'])assert(yaml.includes(`PREVIEW_SKIPS_${key}: \u0024{{ vars.CLASSYLINE_SIZE_PREVIEW_SKIPS_${key} }}`));
 assert(yaml.includes('const previewVerifier=previewHistoryVerifier(e);'));
 assert(yaml.includes('const previewEvidence=previewVerifier.verify(previewBefore);'));
 assert(yaml.includes('previewVerifier.verify(list);'));
 assert(!yaml.includes('ids.size===previewIDs.size'));
 const first=yaml.indexOf('await verifyPreview();'),spawn=yaml.indexOf('child = spawn(process.execPath,'),last=yaml.lastIndexOf('await verifyPreview();');
 assert(first>0&&spawn>first&&last>spawn,'Final full Preview checks must surround the only invocation');
});
test('reviewed supplement accepts exact inventory and repeated full validation',()=>{
 const {e,list}=setup();const verifier=previewHistoryVerifier(e);const result=verifier.verify(list);
 assert.deepEqual(verifier.verify(structuredClone(list)),result);assert.equal(result.total_records,73);assert.equal(result.supplementary_records,1);
});
test('explicitly reviewed empty supplement is valid only for the original inventory',()=>{
 const {e,list}=setup([]);const v=previewHistoryVerifier(e);v.verify(list);assert.throws(()=>v.verify([...list,live(record)]));
});
test('future reviewed skip admitted without editing historical count or dropping earlier evidence',()=>{
 const next={...record,id:'12345678-0000-0000-0000-000000000002',branch:'phase/storefront-size-release-preparation',commit:'e'.repeat(40)};
 const {e,list}=setup([record,next]);assert.equal(previewHistoryVerifier(e).verify(list).total_records,74);
 const v=previewHistoryVerifier(e);assert.throws(()=>v.verify(list.filter(d=>d.id!==record.id)));
});
const manifestMutations={
 'wrong version':m=>m.version=2,'wrong repository':m=>m.repository='other/repository',
 'wrong controller SHA':m=>m.controller_sha='e'.repeat(40),'wrong controller tree':m=>m.controller_tree='e'.repeat(40),
 'duplicate record':m=>m.records.push(structuredClone(m.records[0])),
 'historical UUID collision':m=>m.records[0].id=original[0].id,
 'Production UUID collision':m=>m.records[0].id=pins.production[0].id,
 'installation UUID collision':m=>m.records[0].id='33333333-0000-0000-0000-000000000001',
 'wrong project ID':m=>m.records[0].project_id='wrong','wrong project name':m=>m.records[0].project_name='wrong',
 'wrong environment':m=>m.records[0].environment='production','unapproved branch':m=>m.records[0].branch='main',
 'invalid commit':m=>m.records[0].commit='not-a-commit','uppercase commit':m=>m.records[0].commit='A'.repeat(40),
 'invalid UUID':m=>m.records[0].id='bad','missing timestamp':m=>delete m.records[0].created_on,
 'invalid timestamp':m=>m.records[0].created_on='not-a-date','unknown root field':m=>m.accept_all=true,
 'unknown record field':m=>m.records[0].accept_all=true,'non-array records':m=>m.records={},
 'unbounded entries':m=>m.records=Array(21).fill(record),
};
for(const [name,change]of Object.entries(manifestMutations))test('manifest rejects '+name,()=>{
 const s=setup();receiptChange(s,change);assert.throws(()=>previewHistoryVerifier(s.e));
});
for(const [name,change]of Object.entries({
 'missing receipt':e=>delete e.PREVIEW_SKIPS_MANIFEST,
 'missing digest':e=>delete e.PREVIEW_SKIPS_SHA256,
 'altered digest':e=>e.PREVIEW_SKIPS_SHA256='sha256:'+'0'.repeat(64),
 'malformed digest':e=>e.PREVIEW_SKIPS_SHA256='SHA256:'+'0'.repeat(64),
 'unreviewed controller':e=>e.REVIEWED_CONTROLLER_SHA='e'.repeat(40),
 'oversized receipt':e=>e.PREVIEW_SKIPS_MANIFEST=' '.repeat(32769),
}))test('protected configuration rejects '+name,()=>{const {e}=setup();change(e);assert.throws(()=>previewHistoryVerifier(e));});
for(const duplicate of [false,true])test('reject noncanonical or duplicate-key receipt '+duplicate,()=>{
 const {e}=setup();e.PREVIEW_SKIPS_MANIFEST=duplicate?e.PREVIEW_SKIPS_MANIFEST.replace('"version":1','"version":1,"version":1'):' '+e.PREVIEW_SKIPS_MANIFEST;
 e.PREVIEW_SKIPS_SHA256=sha(e.PREVIEW_SKIPS_MANIFEST);assert.throws(()=>previewHistoryVerifier(e));
});
const liveMutations={
 'missing supplement':list=>list.pop(), 'duplicate UUID':list=>list.push(structuredClone(list.at(-1))),
 'unknown extra skip':list=>list.push(live({...record,id:'12345678-0000-0000-0000-000000000002'})),
 'unknown replacement skip':list=>list[list.length-1].id='12345678-0000-0000-0000-000000000002',
 'missing original':list=>list.shift(),'altered original source':list=>list[0].deployment_trigger.metadata.commit_hash='e'.repeat(40),
 'altered original status':list=>list[0].latest_stage.status='unknown',
 'changed source':list=>list.at(-1).deployment_trigger.metadata.commit_hash='e'.repeat(40),
 'changed branch':list=>list.at(-1).deployment_trigger.metadata.branch='main',
 'dirty source':list=>list.at(-1).deployment_trigger.metadata.commit_dirty=true,
 'changed trigger':list=>list.at(-1).deployment_trigger.type='ad_hoc',
 'wrong project':list=>list.at(-1).project_id='other','wrong name':list=>list.at(-1).project_name='other',
 'wrong environment':list=>list.at(-1).environment='production',
 'changed timestamp':list=>list.at(-1).created_on='2026-10-23T21:35:00Z',
 'not skipped':list=>list.at(-1).is_skipped=false,
 'latest stage started':list=>list.at(-1).latest_stage.started_on='now',
 'latest stage ended':list=>list.at(-1).latest_stage.ended_on='now',
 'unknown latest status':list=>list.at(-1).latest_stage.status='unknown',
 'wrong latest name':list=>list.at(-1).latest_stage.name='deploy',
 'missing stage':list=>list.at(-1).stages.pop(),
 'duplicate stage':list=>list.at(-1).stages.push(idle('deploy')),
 'reordered stages':list=>list.at(-1).stages.reverse(),
 'same UUID altered stage start':list=>list.at(-1).stages[1].started_on='now',
 'same UUID altered stage end':list=>list.at(-1).stages[1].ended_on='now',
 'same UUID altered stage status':list=>list.at(-1).stages[1].status='success',
};
for(const [name,change]of Object.entries(liveMutations))test('live history rejects '+name,()=>{
 const {e,list}=setup();change(list);assert.throws(()=>previewHistoryVerifier(e).verify(list));
});
for(const [name,change]of Object.entries({
 'supplementary non-pinned field':list=>list.at(-1).new_field='altered',
 'original non-pinned field':list=>list[0].url+='altered',
 'original stages':list=>list[0].stages.push(idle('build')),
}))test('final full-content reconciliation rejects '+name,()=>{
 const {e,list}=setup();const v=previewHistoryVerifier(e);v.verify(list);change(list);assert.throws(()=>v.verify(list),/contents changed/);
});
for(const key of ['PREVIEW_SKIPS_MANIFEST','PREVIEW_SKIPS_SHA256','GITHUB_SHA','REVIEWED_CONTROLLER_SHA','REVIEWED_CONTROLLER_TREE'])test('release window rejects changed '+key,()=>{
 const {e,list}=setup();const v=previewHistoryVerifier(e);v.verify(list);e[key]+='changed';assert.throws(()=>v.verify(list));
});
test('API record/key ordering cannot disguise or spuriously create content drift',()=>{
 const {e,list}=setup();const v=previewHistoryVerifier(e);const initial=v.verify(list);
 const reordered=list.slice().reverse().map(d=>Object.fromEntries(Object.entries(d).reverse()));
 assert.deepEqual(v.verify(reordered),initial);
});
test('mutation control: IDs-only validation misses a started skipped stage',()=>{
 const {e,list}=setup();const v=previewHistoryVerifier(e);v.verify(list);const ids=list.map(d=>d.id);
 list.at(-1).stages[1].started_on='now';assert.deepEqual(list.map(d=>d.id),ids);
 assert.throws(()=>v.verify(list),/stage started or changed/);
});
