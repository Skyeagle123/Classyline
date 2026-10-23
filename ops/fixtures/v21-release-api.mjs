// Offline-only read boundary; never imported by the live workflow.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRecoveryAPI} from './recovery-api.mjs';
const historical=JSON.parse(readFileSync(new URL('./recovery-history.json',import.meta.url)));
const source='9ce02cce69d5774df46c7555543a7f95262c8507',tree='8266d7f79405fca39374298b4695687b225de4c7';
const base='583105d0c548caf9c81228f0d1f3572d9b6cbe37',main='0ce95a706a88c63a914c25b142d4fc6878de66d8';
const activationBase='54c5a3ac9cf11e1aa5aca762220c7267289702e0';
const path='.github/workflows/classyline-production-v21.yml',workflowID=999999001;
export function createV21API(e,scenario) {
 const counts={reads:0,inventories:0},legacy=createRecoveryAPI(e,scenario,true);
 function respond(url,options) {
  assert.equal(options.redirect,'error');assert(options.signal);assert(!options.method||options.method==='GET');
  const p=url.replace('https://api.github.com/repos/Skyeagle123/Classyline','');
  let s=scenario;if(s.startsWith('late-recovery-')&&(counts.inventories>=2||(counts.inventories===1&&p.startsWith('/actions/workflows/classyline-production-manual.yml/runs'))))s=s.replace('late-','');
  const previous=structuredClone(historical.previous),failed=structuredClone(historical.failed);
  const completed={...structuredClone(previous),id:39838839195,run_number:3,head_sha:base,head_commit:{id:base,tree_id:'6b9139f265772078cb8d912ad9ad2a888c82d4bb'}};
  const current={...structuredClone(previous),id:Number(e.GITHUB_RUN_ID),workflow_id:workflowID,path,run_number:1,head_sha:e.GITHUB_SHA,head_commit:{id:e.GITHUB_SHA,tree_id:'d'.repeat(40)},status:'in_progress',conclusion:null};
  const runs=[previous,failed,completed];
  for(const [label,r] of [['previous',previous],['failed',failed],['completed',completed],['current',current]]) {
   const props={actor:['actor',{login:'other',id:1}],trigger:['triggering_actor',{login:'other',id:1}],sha:['head_sha','bad'],tree:['head_commit',{id:r.head_sha,tree_id:'bad'}],branch:['head_branch','feature'],rerun:['run_attempt',2],path:['path','wrong.yml'],workflow:['workflow_id',8],conclusion:['conclusion','cancelled'],number:['run_number',4],active:['status','queued']};
   for(const [prop,[key,val]] of Object.entries(props))if(s===label+'-'+prop)r[key]=val;
  }
  if(p.startsWith('/actions/workflows/classyline-production-manual.yml/runs')) {
   counts.inventories++;
   if(s==='history-missing')runs.pop();
   if(s==='history-duplicate')runs[2]=structuredClone(previous);
   if(s==='history-extra'||s==='recovery-extra-dispatch')runs.push({...completed,id:39838839196});
   if(s==='history-recovery-omitted')runs.splice(1,1);
   return reply({total_count:s==='history-truncated'?4:runs.length,workflow_runs:runs});
  }
  if(p==='/actions/workflows/classyline-production-v21.yml')return reply({id:workflowID,path,state:s==='workflow-disabled'?'disabled_manually':'active'});
  if(p.startsWith('/actions/workflows/classyline-production-v21.yml/runs')) {
   const list=s==='current-missing'?[]:[current];
   if(s==='extra-dispatch')list.push({...current,id:current.id+1,run_number:2});
   if(s==='duplicate-dispatch')list.push(structuredClone(current));
   return reply({total_count:s==='current-truncated'?2:list.length,workflow_runs:list});
  }
  if(p==='/git/commits/'+e.GITHUB_SHA)return reply({sha:e.GITHUB_SHA,tree:{sha:'d'.repeat(40)},parents:[{sha:s==='controller-parent'||(s==='late-controller-parent'&&counts.inventories>=2)?'bad':s==='controller-parent-obsolete'?main:activationBase}]});
  for(const r of [...runs,current])if(p==='/actions/runs/'+r.id)return reply(r);
  if(p==='/actions/runs/39851191294')return reply({id:39851191294,repository:{id:1096008352,full_name:'Skyeagle123/Classyline'},head_sha:s==='wrong-ci-sha'?'bad':source,head_branch:'phase/storefront-v21-whatsapp-swatches',path:'.github/workflows/storefront.yml',event:'pull_request',head_commit:{tree_id:tree},run_attempt:s==='ci-rerun'?2:1,status:s==='running-ci'?'in_progress':'completed',conclusion:s==='failed-ci'?'failure':'success'});
  if(p==='/actions/runs/39851191294/attempts/1/jobs?per_page=100') {
   const steps=['Run npm ci --ignore-scripts','Run npm test','Run npm run security:check','Run npm run build','Run npm run build:functions','Run npm audit --audit-level=high'].map(name=>({name,status:'completed',conclusion:'success'}));
   if(s==='missing-ci-step')steps.pop();if(s==='failed-ci-step')steps[1].conclusion='failure';
   return reply({total_count:1,jobs:[{name:'check',run_id:39851191294,run_attempt:1,head_sha:source,status:'completed',conclusion:'success',steps}]});
  }
  for(const sha of [source,'4f1770c12451aed3495f66e3990e399016249ada',main])if(p==='/git/commits/'+sha)return reply({sha,tree:{sha:s==='source-tree'?'bad':tree},parents:[{sha:base},...(sha.startsWith('4f17')?[{sha:source}]:[])]});
  const delegated=legacy.respond(url,options);if(delegated)return delegated;
  return null;
  function reply(body){counts.reads++;return {ok:true,status:200,json:async()=>body};}
 }
 return {respond,counts};
}
