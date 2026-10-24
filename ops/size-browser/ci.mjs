// Offline builds/tests only. No deployment entry point, credentials or release imports.
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SOURCE_SHA,SOURCE_TREE} from './fixtures.mjs';
import {verifyYamlScopes,verifyWorkflowSources} from './yaml-policy.mjs';

export const COUNTS=Object.freeze({browser:167,legacy:70,application:206,size:33});
export function verifyTap(text,count) {
 const result={};
 for(const f of ['tests','pass','fail','cancelled','skipped','todo']){
  const values=[...text.matchAll(new RegExp('^# '+f+' (\\d+)$','gm'))];
  assert.equal(values.length,1,'Missing or ambiguous TAP '+f);result[f]=Number(values[0][1]);
 }
 assert.equal(result.tests,count,'Required test count mismatch');assert.equal(result.pass,count);
 for(const f of ['fail','cancelled','skipped','todo'])assert.equal(result[f],0,'Forbidden test outcome: '+f);
 return result;
}
export function testFiles(root,directory,suffix) {
 const dir=join(root,directory);return readdirSync(dir).filter(n=>n.endsWith(suffix)).sort().map(n=>{
  assert(lstatSync(join(dir,n)).isFile(),'Test file must be regular');return join(dir,n);
 });
}
export async function main(application,output) {
 application=resolve(application);output=resolve(output);const harness=resolve(import.meta.dirname,'../..');
 assert.equal(process.versions.node,'24.22.1');assert.equal(process.versions.undici,'7.30.1');
 for(const k of ['CLOUDFLARE_API_TOKEN','CF_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_ACCOUNT_ID','D1_DATABASE_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','GH_TOKEN','GITHUB_TOKEN'])assert(!process.env[k],'Credential/binding forbidden: '+k);
 const git=(...args)=>execFileSync('git',args,{cwd:application,encoding:'utf8'}).trim();
 assert.equal(git('rev-parse','HEAD'),SOURCE_SHA);assert.equal(git('rev-parse','HEAD^{tree}'),SOURCE_TREE);assert.equal(git('status','--porcelain'),'');
 mkdirSync(output,{recursive:false});
 const run=(name,command,args,cwd=application,extraEnv={})=>{
  const r=spawnSync(command,args,{cwd,env:{...process.env,WRANGLER_SEND_METRICS:'false',...extraEnv},encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
  writeFileSync(join(output,name+'.log'),(r.stdout||'')+(r.stderr||''));
  assert(!r.error,name+': '+r.error?.message);assert.equal(r.signal,null);assert.equal(r.status,0,name+' failed');return r.stdout;
 };
 const runtime=(await import(pathToFileURL(join(application,'ops/size-toolchain/runtime.cjs')))).default;
 runtime.requireRuntime();
 const {prepare}=await import(pathToFileURL(join(application,'ops/size-toolchain/prepare.mjs')));
 const tooling=prepare();runtime.verifyExecution(join(application,'node_modules/wrangler/wrangler-dist/cli.js'));
 const yaml=verifyYamlScopes(harness);verifyWorkflowSources(harness);
 const results={};
 const groups={browser:testFiles(harness,'ops/size-browser','.test.mjs'),legacy:testFiles(harness,'ops/v21-browser','.test.mjs'),application:testFiles(application,'tests','.test.js'),size:[join(application,'tests/size-ordering.test.js')]};
 assert.deepEqual(groups.browser.map(f=>f.split('/').at(-1)),['ci.test.mjs','offline.test.mjs','sizes.test.mjs','yaml-security.test.mjs']);
 assert.deepEqual(groups.legacy.map(f=>f.split('/').at(-1)),['offline.test.mjs']);
 for(const [name,files]of Object.entries(groups)){
  const cwd=['application','size'].includes(name)?application:harness;
  results[name]=verifyTap(run(name,process.execPath,['--test','--test-reporter=tap',...files],cwd),COUNTS[name]);
 }
 run('syntax',process.execPath,['ops/size-browser/validate-syntax.mjs',application],harness);
 run('security','npm',['run','security:check']);
 run('harness-security',process.execPath,['scripts/security-check.mjs'],harness);
 for(const [name,cwd] of [['application',application],['browser',join(harness,'ops/size-browser')],['legacy',join(harness,'ops/v21-browser')],['syntax',join(harness,'ops/offline-validation')]]){
  const audit=JSON.parse(run('audit-'+name,'npm',['audit','--audit-level=high','--json'],cwd));assert.equal(audit.metadata?.vulnerabilities?.total,0,'Audit must have zero vulnerabilities');
 }
 const offline={NODE_OPTIONS:'--require='+join(application,'ops/size-toolchain/offline-boundary.cjs')};
 run('static-build','npm',['run','build'],application,offline);run('functions-build','npm',['run','build:functions'],application,offline);
 assert.equal(git('status','--porcelain'),'');
 const summary={source_sha:SOURCE_SHA,source_tree:SOURCE_TREE,node:process.versions.node,builtin_undici:process.versions.undici,tooling,yaml,results,audit_vulnerabilities:0,build_network:'denied',production_environment:false};
 writeFileSync(join(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.equal(process.argv.length,4);main(process.argv[2],process.argv[3]).catch(e=>{console.error(e);process.exitCode=1;});
}
