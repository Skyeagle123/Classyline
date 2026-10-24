// Offline-only read boundary; never imported by the live workflow.
import assert from 'node:assert/strict';
import {receipt,FAILED_RUN,FAILED_SHA,FAILED_TREE,FAILED_WORKFLOW,FAILED_JOB,FAILED_PATH} from './failed-release.mjs';
import {readFileSync} from 'node:fs';
import {createRecoveryAPI} from '../fixtures/recovery-api.mjs';
const historical=JSON.parse(readFileSync(new URL('../fixtures/recovery-history.json',import.meta.url)));
const source='335c31f8a629593e462f144296b5c4a29653206f',tree='823de98f6faa7fcb65ea980f771f1c7318561694';
const base='b37ada79be5f3d3a5e9554bbf1c444fba25752b7',main='00b25b282d66818632a2d214e7a52ffbd0f8a1cb';
const activationBase='7d978f3ab539efb89a4cd5a2c44abe87775c4451';
const path='.github/workflows/classyline-production-size-recovery.yml',workflowID=999999001;
export function createSizeAPI(e,scenario) {
 const counts={reads:0,inventories:0},legacy=createRecoveryAPI(e,scenario,true);
 function respond(url,options) {
  assert.equal(options.redirect,'error');assert(options.signal);assert(!options.method||options.method==='GET');
  const p=url.replace('https://api.github.com/repos/Skyeagle123/Classyline','');
  const failedSize={id:FAILED_RUN,workflow_id:FAILED_WORKFLOW,repository:{full_name:'Skyeagle123/Classyline',id:1096008352},path:FAILED_PATH,event:'workflow_dispatch',actor:{login:'Skyeagle123',id:125151458},triggering_actor:{login:'Skyeagle123',id:125151458},head_branch:'main',head_sha:FAILED_SHA,head_commit:{id:FAILED_SHA,tree_id:FAILED_TREE},run_number:1,run_attempt:1,status:'completed',conclusion:'failure',created_at:receipt.created_at};
  if(p==='/actions/workflows/classyline-production-size-update.yml/runs?event=workflow_dispatch&per_page=100')return reply({total_count:1,workflow_runs:[failedSize]});
  if(p==='/actions/runs/'+FAILED_RUN)return reply(failedSize);
  if(p===`/actions/runs/${FAILED_RUN}/attempts/1/jobs?per_page=100`)return reply({total_count:1,jobs:[{id:FAILED_JOB,name:'deploy',run_id:FAILED_RUN,run_attempt:1,head_sha:FAILED_SHA,status:'completed',conclusion:'failure',steps:structuredClone(receipt.steps)}]});
  if(p===`/actions/runs/${FAILED_RUN}/approvals`)return reply([{state:'approved',user:{login:'Skyeagle123',id:125151458},environments:[{name:'classyline-production',id:24902198946,can_admins_bypass:false}]}]);
  if(p==='/git/commits/'+FAILED_SHA)return reply({sha:FAILED_SHA,tree:{sha:FAILED_TREE},parents:[{sha:'00b25b282d66818632a2d214e7a52ffbd0f8a1cb'}]});
  const secure='7d978f3ab539efb89a4cd5a2c44abe87775c4451',secureTree='75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8';
  if(p==='/git/commits/'+secure)return reply({sha:secure,tree:{sha:secureTree},parents:[{sha:FAILED_SHA}]});
  for(const [id,event,path,name] of [[40088721086,'push','.github/workflows/size-toolchain-offline.yml','qualify'],[40088725192,'pull_request','.github/workflows/size-toolchain-offline.yml','qualify'],[40088725220,'pull_request','.github/workflows/storefront.yml','check']]){
   if(p==='/actions/runs/'+id)return reply({id,repository:{id:1096008352},event,path,head_sha:'61516210c329776e5c3098b0ea4ef46cc881e7cc',head_commit:{tree_id:secureTree},status:'completed',conclusion:'success',run_attempt:1});
   if(p===`/actions/runs/${id}/attempts/1/jobs?per_page=100`)return reply({total_count:1,jobs:[{run_id:id,run_attempt:1,name,status:'completed',conclusion:'success',steps:[{status:'completed',conclusion:'success'}]}]});
  }
  if(p.startsWith('/contents/.github/workflows/size-isolated-browser.yml'))return reply({encoding:'base64',content:Buffer.from(secure+' '+secureTree).toString('base64')});
  let s=scenario;if(s.startsWith('late-recovery-')&&(counts.inventories>=2||(counts.inventories===1&&p.startsWith('/actions/workflows/classyline-production-manual.yml/runs'))))s=s.replace('late-','');
  const previous=structuredClone(historical.previous),failed=structuredClone(historical.failed);
  const completed={...structuredClone(previous),id:39838839195,run_number:3,head_sha:'583105d0c548caf9c81228f0d1f3572d9b6cbe37',head_commit:{id:'583105d0c548caf9c81228f0d1f3572d9b6cbe37',tree_id:'6b9139f265772078cb8d912ad9ad2a888c82d4bb'}};
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
  if(p==='/actions/workflows/classyline-production-size-recovery.yml')return reply({id:workflowID,path,state:s==='workflow-disabled'?'disabled_manually':'active'});
  if(p.startsWith('/actions/workflows/classyline-production-size-recovery.yml/runs')) {
   const list=s==='current-missing'?[]:[current];
   if(s==='extra-dispatch')list.push({...current,id:current.id+1,run_number:2});
   if(s==='duplicate-dispatch')list.push(structuredClone(current));
   return reply({total_count:s==='current-truncated'?2:list.length,workflow_runs:list});
  }
  if(p==='/git/commits/'+e.GITHUB_SHA) {
   const parentScenario=s.startsWith('late-controller-parent')&&counts.inventories>=2?s.replace('late-',''):s;
   const parents={
    'controller-parent':[{sha:'bad'}],
    'controller-parent-obsolete':[{sha:main}],
    'controller-parent-old-pin':[{sha:'54c5a3ac9cf11e1aa5aca762220c7267289702e0'}],
    'controller-parent-previous-main':[{sha:'04feef6a48968e736d99a072efbf98750feb7bdf'}],
    'controller-parent-missing':[],
    'controller-parent-multiple':[{sha:activationBase},{sha:'04feef6a48968e736d99a072efbf98750feb7bdf'}],
   }[parentScenario]??[{sha:activationBase}];
   return reply({sha:e.GITHUB_SHA,tree:{sha:'d'.repeat(40)},parents});
  }
  for(const r of [...runs,current])if(p==='/actions/runs/'+r.id)return reply(r);
  if(p==='/actions/runs/40019223658')return reply({id:40019223658,repository:{id:1096008352,full_name:'Skyeagle123/Classyline'},head_sha:s==='wrong-ci-sha'?'bad':source,head_branch:'phase/storefront-v21-size-ordering',path:'.github/workflows/storefront.yml',event:'pull_request',head_commit:{tree_id:tree},run_attempt:s==='ci-rerun'?2:1,status:s==='running-ci'?'in_progress':'completed',conclusion:s==='failed-ci'?'failure':'success'});
  if(p==='/actions/runs/40019223658/attempts/1/jobs?per_page=100') {
   const steps=['Run npm ci --ignore-scripts','Run npm test','Run npm run security:check','Run npm run build','Run npm run build:functions','Run npm audit --audit-level=high'].map(name=>({name,status:'completed',conclusion:'success'}));
   if(s==='missing-ci-step')steps.pop();if(s==='failed-ci-step')steps[1].conclusion='failure';
   return reply({total_count:1,jobs:[{name:'check',run_id:40019223658,run_attempt:1,head_sha:source,status:'completed',conclusion:'success',steps}]});
  }
  for(const sha of [source,'9ccc89b0c5507b5ca98b00328c72f0391522400f',main])if(p==='/git/commits/'+sha)return reply({sha,tree:{sha:s==='source-tree'?'bad':tree},parents:[{sha:base},...(sha.startsWith('9ccc')?[{sha:source}]:[])]});
  const consumed={...structuredClone(previous),id:40005672896,workflow_id:393398792,path:'.github/workflows/classyline-production-v21.yml',run_number:1,head_sha:'b37ada79be5f3d3a5e9554bbf1c444fba25752b7',head_commit:{id:'b37ada79be5f3d3a5e9554bbf1c444fba25752b7',tree_id:'2285234c0f7d14e39c2681e57586eb5258bc808a'}};
  if(s==='consumed-rerun')consumed.run_attempt=2;
  if(p==='/actions/runs?event=workflow_dispatch&per_page=100')return reply({total_count:s==='global-truncated'?7:6,workflow_runs:s==='global-missing'?[...runs,current]:[...runs,consumed,failedSize,current,...(s==='global-extra'?[{id:777}]:[])]});
  if(p==='/actions/runs/40005672896')return reply(consumed);
  if(p.startsWith('/actions/workflows/classyline-production-v21.yml/runs'))return reply({total_count:s==='consumed-extra'?2:1,workflow_runs:s==='consumed-missing'?[]:[consumed]});
  if(p==='/git/ref/heads/main')return reply({object:{sha:s==='main-changed'?'bad':e.GITHUB_SHA}});
  if(p==='/actions/runs/'+e.BROWSER_RUN_ID)return reply({id:Number(e.BROWSER_RUN_ID),repository:{id:1096008352,full_name:'Skyeagle123/Classyline'},path:'.github/workflows/size-isolated-browser.yml',head_sha:e.BROWSER_HARNESS_SHA,head_commit:{tree_id:e.BROWSER_HARNESS_TREE},head_branch:'phase/storefront-size-browser-qualification',event:'push',run_attempt:1,status:'completed',conclusion:s==='browser-failed'?'failure':'success'});
  if(p==='/git/commits/'+e.BROWSER_HARNESS_SHA)return reply({sha:e.BROWSER_HARNESS_SHA,tree:{sha:e.BROWSER_HARNESS_TREE}});
  if(p===`/actions/runs/${e.BROWSER_RUN_ID}/attempts/1/jobs?per_page=100`)return reply({total_count:1,jobs:[{id:98765,run_id:Number(e.BROWSER_RUN_ID),run_attempt:1,head_sha:e.BROWSER_HARNESS_SHA,status:'completed',conclusion:'success',steps:['Verify source identities and credential-free execution','Run credential-free harness and workflow safety regressions','Build exact accepted static application','Qualify isolated UI using synthetic responses only','Preserve synthetic screenshots and network evidence even on failure'].map(name=>({name,status:'completed',conclusion:'success'}))}]});
  if(p===`/actions/runs/${e.BROWSER_RUN_ID}/artifacts?per_page=100`)return reply({total_count:1,artifacts:[{id:Number(e.BROWSER_ARTIFACT_ID),name:`size-isolated-browser-${e.BROWSER_RUN_ID}-1`,expired:s==='browser-expired',digest:s==='browser-digest'?'bad':e.BROWSER_ARTIFACT_DIGEST,workflow_run:{id:Number(e.BROWSER_RUN_ID),head_sha:e.BROWSER_HARNESS_SHA}}]});
  const delegated=legacy.respond(url,options);if(delegated)return delegated;
  return null;
  function reply(body){counts.reads++;return {ok:true,status:200,json:async()=>body};}
 }
 return {respond,counts};
}
