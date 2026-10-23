// Independent readback only; no arm/configuration write capability.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export async function verifyDisarmed(get) {
 const env=await get('/environments/classyline-production');
 assert.equal(env.name,'classyline-production');assert.equal(env.id,24902198946);assert.equal(env.can_admins_bypass,false);
 const review=env.protection_rules?.filter(r=>r.type==='required_reviewers');assert.equal(review?.length,1);
 assert(review[0].reviewers?.some(r=>r.reviewer?.login==='Skyeagle123'&&r.reviewer?.id===125151458));
 assert.equal(env.deployment_branch_policy?.custom_branch_policies,true);
 const branches=await get('/environments/classyline-production/deployment-branch-policies?per_page=100');
 assert.equal(branches.total_count,1);assert.equal(branches.branch_policies?.length,1);assert.equal(branches.branch_policies[0].name,'main');assert.equal(branches.branch_policies[0].type,'branch');
 const arm=await get('/environments/classyline-production/variables/CLASSYLINE_RELEASE_ARMED');
 assert.equal(arm.name,'CLASSYLINE_RELEASE_ARMED');assert.equal(arm.value,'false','UNRESOLVED: release remains armed');
 return {disarming_verified:true,release_armed:'false',environment:'classyline-production',checked_at:new Date().toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const token=process.env.GH_TOKEN;assert(token,'Authenticated Owner read access required');
 const get=async path=>{const r=await fetch('https://api.github.com/repos/Skyeagle123/Classyline'+path,{redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});assert(r.ok,'UNVERIFIED: protected setting read unavailable');return r.json();};
 verifyDisarmed(get).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('UNVERIFIED: independent disarming readback failed; Owner evidence required');process.exitCode=1;});
}
