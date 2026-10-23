import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const yaml=readFileSync(new URL('../../.github/workflows/classyline-production-size-update.yml',import.meta.url),'utf8');
const scripts=[...yaml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)^          NODE/gm)].map(m=>m[1].replace(/^          /gm,''));
const release=scripts.at(-1).replace("import {execFileSync, spawn} from 'node:child_process';",'const {execFileSync,spawn}=globalThis.mockChild;').replaceAll('/tmp/classyline-functions-build','./functions-build').replaceAll('setTimeout(resolve, 5000)','setTimeout(resolve, 0)').replace("setTimeout(() => finish(null, 'SIGKILL', true), 180000)","setTimeout(() => finish(null, 'SIGKILL', true), 20)");
assert.notEqual(release,scripts.at(-1));
function run(scenario,source=release){const dir=mkdtempSync(join(tmpdir(),'size-controller-'));try{
 const script=`import ${JSON.stringify(new URL('./runtime-double.mjs',import.meta.url).href)};\n${source}`;
 writeFileSync(join(dir,'run.mjs'),script);return spawnSync(process.execPath,[join(dir,'run.mjs'),scenario],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
}finally{rmSync(dir,{recursive:true,force:true});}}
const after=new Set(['success','missing-create-claim','missing-deployed-secret','wrong-deployed-secret','wrong-source','missing-functions','failed-deployment','unknown-status','dirty-metadata','wrong-deployed-flags','multiple-new','uncertain-no-deployment','uncertain-but-deployed','nonzero-cli','signal-cli','spawn-throws','timeout-cli','parent-cancelled','post-config-drift','preview-post-stage','preview-post-original-field']);
const before=['false-arm','uppercase-arm','missing-token','main-changed','wrong-project','wrong-baseline','wrong-d1','wrong-r2','missing-d1','missing-r2','extra-d1','extra-r2','unsafe-flags','wrong-date','missing-secret','unexpected-placement','wrong-preview','rollback-missing','rollback-source-mismatch','competing-build','candidate-attempt-exists','dirty-tree','tampered-artifact','api-denied','auto-build-enabled','wrong-source-repo','extra-dist','omitted-dist','duplicate-dist-record','symlink-dist','wrong-dist-size','extra-functions','omitted-functions','duplicate-functions-record','symlink-functions','local-override','whatsapp-missing','whatsapp-wrong','whatsapp-newline','whatsapp-secret-type','skipped-missing','skipped-started','history-altered','preview-competitor','pagination-truncated','pagination-duplicate','pagination-drift','consumed-extra','browser-failed'];
const previewBefore=['manifest-missing','manifest-missing-digest','manifest-wrong-digest','manifest-wrong-controller','manifest-wrong-tree','manifest-duplicate-entry','manifest-unapproved-branch','preview-missing-supplement','preview-duplicate-supplement','preview-extra-skipped','preview-altered-source','preview-altered-branch','preview-unknown-status','preview-started-stage','preview-altered-project','preview-altered-environment','preview-dirty','preview-missing-original','preview-altered-original','preview-late-stage','preview-late-original-field','manifest-late-change','manifest-late-digest'];
for(const scenario of [...after,...before,...previewBefore])test('actual new release script with offline boundaries: '+scenario,()=>{
 const r=run(scenario);assert.equal(r.error,undefined);let info;
 try{info=JSON.parse(r.stdout.trim().split('\n').at(-1));}catch{assert.fail(r.stderr+'\n'+r.stdout);}
 assert.equal(info.writes,0);assert.equal(info.calls,after.has(scenario)?1:0,r.stderr);
 assert.equal(r.status===0,scenario==='success',r.stderr);
 for(const secret of ['FAKE_TEST_VALUE_NOT_A_CREDENTIAL','FAKE_GITHUB_VALUE_NOT_A_CREDENTIAL']){
 assert(!JSON.stringify(info.artifacts).includes(secret));assert(!r.stdout.includes(secret));assert(!r.stderr.includes(secret));}
 assert.equal(Boolean(info.artifacts['accepted-deployment.json']),scenario==='success');
 if(previewBefore.includes(scenario))assert(!info.artifacts['create-claimed.json'],'History rejection must precede create');
 if(scenario==='success'){
  const accepted=info.artifacts['accepted-deployment.json'];
  assert.equal(accepted.disarming_verified,false);assert(info.historyReads>20,'Both histories must paginate repeatedly');
  assert.equal(accepted.preview_history.original_records,72);assert.equal(accepted.preview_history.supplementary_records,2);
  assert.equal(accepted.preview_history.total_records,74);assert.match(accepted.preview_history.manifest_sha256,/^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(accepted.preview_history,info.artifacts['preflight.json'].preview_history);
 }
});
test('mutation control: removing final full-content verification permits same-ID field drift',()=>{
 const unsafe=release.replace('previewVerifier.verify(list);','/* omitted final verifier */');assert.notEqual(unsafe,release);
 const r=run('preview-late-original-field',unsafe);assert.equal(r.error,undefined);
 const info=JSON.parse(r.stdout.trim().split('\n').at(-1));assert.equal(r.status,0,r.stderr);
 assert.equal(info.calls,1);assert.equal(info.writes,0);assert(info.artifacts['accepted-deployment.json']);
});
