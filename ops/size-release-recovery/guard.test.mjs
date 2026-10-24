import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySizeRelease} from './github-guard.mjs';
import {createSizeAPI} from './api-double.mjs';
import {verifyDisarmed} from '../size-release/verify-disarmed.mjs';
const logs=async id=>id===98765?'CLASSYLINE_BROWSER_RECEIPT='+JSON.stringify({application_sha:'7d978f3ab539efb89a4cd5a2c44abe87775c4451',application_tree:'75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8',tests:45,passed:45,screenshots:39,external_forwarded:0,static_api_requests:0,mutations:0}):readFileSync(new URL('./evidence/failed-size-release.log',import.meta.url),'utf8');
const workflow='.github/workflows/classyline-production-size-recovery.yml';
export function environment(){return {
 GITHUB_REPOSITORY:'Skyeagle123/Classyline',GITHUB_REPOSITORY_ID:'1096008352',GITHUB_REPOSITORY_OWNER_ID:'125151458',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'Skyeagle123',GITHUB_ACTOR_ID:'125151458',GITHUB_TRIGGERING_ACTOR:'Skyeagle123',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1',GITHUB_SHA:'c'.repeat(40),GITHUB_WORKFLOW_SHA:'c'.repeat(40),GITHUB_WORKFLOW_REF:`Skyeagle123/Classyline/${workflow}@refs/heads/main`,GITHUB_RUN_ID:'40100000000',RELEASE_ARMED:'true',REVIEWED_CONTROLLER_SHA:'c'.repeat(40),REVIEWED_CONTROLLER_TREE:'d'.repeat(40),BROWSER_RUN_ID:'40020000000',BROWSER_HARNESS_SHA:'a'.repeat(40),BROWSER_HARNESS_TREE:'b'.repeat(40),BROWSER_ARTIFACT_ID:'88',BROWSER_ARTIFACT_DIGEST:'sha256:'+'e'.repeat(64),INSTALL_SKIPPED_ID:'33333333-0000-0000-0000-000000000001',
};}
export function api(e,scenario='success'){const double=createSizeAPI(e,scenario);return async path=>{const r=double.respond('https://api.github.com/repos/Skyeagle123/Classyline'+path,{redirect:'error',signal:AbortSignal.timeout(1000)});assert(r,'Unexpected mock read '+path);assert(r.ok);return r.json();};}
test('exact future controller, source CI, historical dispatches and browser receipt accepted',async()=>{
 const e=environment();const result=await verifySizeRelease(api(e),logs,e);assert.equal(result.replay_permitted,false);
});
for(const scenario of ['controller-parent','controller-parent-missing','controller-parent-multiple','controller-parent-previous-main','controller-parent-old-pin','main-changed','history-missing','history-duplicate','history-extra','history-truncated','extra-dispatch','current-missing','current-truncated','current-rerun','current-actor','current-trigger','wrong-ci-sha','source-tree','ci-rerun','failed-ci','missing-ci-step','failed-ci-step','consumed-rerun','consumed-extra','consumed-missing','browser-failed','browser-expired','browser-digest','recovery-api-denied','global-missing','global-extra','global-truncated'])
 test('actual GitHub guard rejects '+scenario,async()=>{const e=environment();await assert.rejects(verifySizeRelease(api(e,scenario),logs,e));});
for(const [key,value] of [['RELEASE_ARMED','false'],['RELEASE_ARMED','True'],['RELEASE_ARMED',' true'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_RUN_NUMBER','2'],['GITHUB_ACTOR','other'],['GITHUB_EVENT_NAME','push'],['GITHUB_REF','refs/heads/feature'],['REVIEWED_CONTROLLER_SHA','0'.repeat(40)],['REVIEWED_CONTROLLER_TREE','0'.repeat(40)],['BROWSER_RUN_ID',''],['BROWSER_ARTIFACT_DIGEST','']])
 test('guard fails closed for '+key+'='+value,async()=>{const e=environment();e[key]=value;await assert.rejects(verifySizeRelease(api(e),logs,e));});
const yaml=readFileSync(new URL('../../.github/workflows/classyline-production-size-recovery.yml',import.meta.url),'utf8');
test('new workflow preserves protected identity, manual-only dispatch and immutable actions',()=>{
 assert.match(yaml,/on:\n  workflow_dispatch:\n/);assert.doesNotMatch(yaml,/^  (push|pull_request|schedule):/m);
 assert.match(yaml,/environment: classyline-production/);assert.match(yaml,/permissions:\n  contents: read\n  actions: read/);
 assert.match(yaml,/github.actor_id == '125151458'/);assert.match(yaml,/github.ref == 'refs\/heads\/main'/);
 for(const m of yaml.matchAll(/uses: (\S+)/g))assert.match(m[1],/@[a-f0-9]{40}$/);
 assert.equal((yaml.match(/spawn\(process.execPath, args/g)||[]).length,1);
 assert.match(yaml,/CLASSYLINE_CREATE_JOURNAL/);assert.doesNotMatch(yaml,/wrangler_internal_retries_accepted: true/);
});
function disarmAPI(value='false',bypass=false){return async path=>{
 if(path.endsWith('CLASSYLINE_RELEASE_ARMED'))return {name:'CLASSYLINE_RELEASE_ARMED',value};
 if(path.includes('deployment-branch-policies'))return {total_count:1,branch_policies:[{name:'main',type:'branch'}]};
 return {id:24902198946,name:'classyline-production',can_admins_bypass:bypass,deployment_branch_policy:{custom_branch_policies:true},protection_rules:[{type:'required_reviewers',reviewers:[{reviewer:{login:'Skyeagle123',id:125151458}}]}]};
};}
test('independent disarm verifier accepts exact false and protected environment',async()=>assert.equal((await verifyDisarmed(disarmAPI())).disarming_verified,true));
for(const arm of ['true','False','FALSE','','false\n'])test('independent verifier rejects arm '+JSON.stringify(arm),async()=>assert.rejects(verifyDisarmed(disarmAPI(arm))));
test('disarm read permission failure remains unverified',async()=>assert.rejects(verifyDisarmed(async()=>{throw Error('403');})));
test('disarm verifier rejects administrator bypass',async()=>assert.rejects(verifyDisarmed(disarmAPI('false',true))));

test('automatic security CI is narrowly admitted and credential-free',()=>{
 const text=readFileSync(new URL('../../.github/workflows/size-recovery-offline.yml',import.meta.url),'utf8');
 assert.match(text,/branches: \[phase\/storefront-size-release-recovery\]/);
 assert.match(text,/github.head_ref == 'phase\/storefront-size-release-recovery'/);
 assert.match(text,/head.repo.full_name == 'Skyeagle123\/Classyline'/);
 assert.match(text,/permissions:\n  contents: read/);
 assert.doesNotMatch(text,/secrets\.|environment:|workflow_dispatch:|pages deploy|actions: write|id-token:/);
 assert.match(text,/node ops\/size-toolchain\/ci.mjs/);
});
