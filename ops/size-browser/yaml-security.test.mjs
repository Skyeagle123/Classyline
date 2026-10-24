import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {POLICY,YAML_SCOPES,verifyYamlScope,verifyYamlScopes,verifyWorkflowSources,secureSyntaxSource} from './yaml-policy.mjs';
const root=resolve(import.meta.dirname,'../..');
const shared=readFileSync(join(root,'ops/validate-offline-workflows.mjs'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function scopeCopy(action){
 const temp=mkdtempSync(join(tmpdir(),'yaml-security-')),scope=join(temp,'scope');
 try{mkdirSync(scope);for(const p of ['package.json','package-lock.json','node_modules/yaml'])cpSync(join(root,'ops/size-browser',p),join(scope,p),{recursive:true});return action(scope,temp);}
 finally{rmSync(temp,{recursive:true,force:true});}
}
function changeJSON(file,fn){const x=JSON.parse(readFileSync(file));fn(x);writeFileSync(file,JSON.stringify(x));}
test('all three actual parser installations match exact locks, bytes and resolution',()=>{
 const verified=verifyYamlScopes(root);assert.deepEqual(verified.map(x=>x.scope),YAML_SCOPES);
 for(const x of verified){assert.equal(x.version,'2.8.3');assert.equal(x.integrity,POLICY.yaml_integrity);}
});
for(const version of ['2.8.2','2.8.1','9.0.0'])test('reject stale or unreviewed parser dependency '+version,()=>scopeCopy(scope=>{
 changeJSON(join(scope,'package.json'),p=>p.dependencies.yaml=version);assert.throws(()=>verifyYamlScope(scope),/Unreviewed parser dependency/);
}));
for(const [name,mutate]of [
 ['root lock',scope=>changeJSON(join(scope,'package-lock.json'),p=>p.packages[''].dependencies.yaml='2.8.2')],
 ['SRI integrity',scope=>changeJSON(join(scope,'package-lock.json'),p=>p.packages['node_modules/yaml'].integrity='sha512-incorrect')],
 ['registry substitution',scope=>changeJSON(join(scope,'package-lock.json'),p=>p.packages['node_modules/yaml'].resolved='https://example.invalid/yaml.tgz')],
 ['installed bytes',scope=>writeFileSync(join(scope,'node_modules/yaml/dist/index.js'),'throw Error("unverified parser must never execute");')],
 ['extra package file',scope=>writeFileSync(join(scope,'node_modules/yaml/extra.js'),'// unreviewed')],
 ['omitted package file',scope=>rmSync(join(scope,'node_modules/yaml/dist/index.js'))],
 ['symlink module',scope=>{const p=join(scope,'node_modules/yaml/dist/index.js');rmSync(p);symlinkSync(join(root,'ops/size-browser/node_modules/yaml/dist/index.js'),p);}],
])test('reject parser '+name,()=>scopeCopy(scope=>{mutate(scope);assert.throws(()=>verifyYamlScope(scope));}));
test('reject a symlinked validation scope',()=>scopeCopy((scope,temp)=>{
 const link=join(temp,'link');symlinkSync(scope,link);assert.throws(()=>verifyYamlScope(link),/Noncanonical/);
}));
test('missing verified installation never falls back to a parent parser',()=>scopeCopy(scope=>{
 rmSync(join(scope,'node_modules/yaml'),{recursive:true});assert.throws(()=>verifyYamlScope(scope));
}));
test('reject an unchecked nested parser package',()=>scopeCopy(scope=>{
 const nested=join(scope,'node_modules/yaml/node_modules/yaml');mkdirSync(nested,{recursive:true});writeFileSync(join(nested,'package.json'),'{}');
 assert.throws(()=>verifyYamlScope(scope),/Parser package contents changed/);
}));
for(const scope of YAML_SCOPES)test(scope+': real deeply nested YAML produces a bounded parse error',()=>{
 const v=verifyYamlScope(join(root,scope));const require=createRequire(join(root,scope,'package.json'));
 const yaml=require(v.entry),payload='['.repeat(5000)+'1'+']'.repeat(5000);
 const document=yaml.parseDocument(payload);assert(document.errors.length>0);
 assert.equal(document.errors[0].name,'YAMLParseError');
 assert.throws(()=>yaml.parse(payload),e=>e.name==='YAMLParseError'&&!(e instanceof RangeError));
});
test('secure validator preserves every source byte except the exact parser-version guard',()=>{
 const old="assert.equal(require('yaml/package.json').version, '2.8.2');";
 const updated="assert.equal(require('yaml/package.json').version, '2.8.3');";
 const secure=secureSyntaxSource(shared);assert.equal(secure,shared.replace(old,updated));assert.equal(secure.replace(updated,old),shared);
});
for(const [name,from,to]of [
 ['removed Bash check',"checkSyntax('bash', ['-n', bash]);",''],
 ['omitted Action pin',"assert.match(step.uses, /^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_./-]+@[a-f0-9]{40}$/, 'Unpinned external Action');",''],
 ['removed duplicate-key rule','uniqueKeys: true','uniqueKeys: false'],
 ['missing workflow context checks','checkEnvContexts(workflow.env','omittedContextCheck(workflow.env'],
 ['stale runtime','24.22.1','24.21.0'],
 ['parser pin substitution',"version, '2.8.2'","version, '2.8.1'"],
])test('source integrity rejects '+name,()=>{
 assert(shared.includes(from),'Mutation boundary must exist');const changed=shared.replace(from,to);assert.notEqual(changed,shared);
 assert.throws(()=>secureSyntaxSource(changed),/Shared validator source changed/);
});
function workflowCopy(action){const temp=mkdtempSync(join(tmpdir(),'workflow-integrity-'));try{cpSync(join(root,'.github/workflows'),join(temp,'.github/workflows'),{recursive:true});action(temp);}finally{rmSync(temp,{recursive:true,force:true});}}
for(const [name,mutate]of [
 ['altered body',dir=>writeFileSync(join(dir,'size-isolated-browser.yml'),'name: altered')],
 ['missing workflow',dir=>rmSync(join(dir,'size-isolated-browser.yml'))],
 ['unknown workflow',dir=>writeFileSync(join(dir,'unreviewed.yml'),'name: unreviewed')],
 ['symlink workflow',dir=>{const p=join(dir,'size-isolated-browser.yml');rmSync(p);symlinkSync(join(root,'.github/workflows/size-isolated-browser.yml'),p);}],
 ['duplicate YAML key',dir=>{const p=join(dir,'size-isolated-browser.yml');writeFileSync(p,readFileSync(p,'utf8')+'\npermissions: write-all\n');}],
])test('workflow integrity rejects '+name,()=>workflowCopy(temp=>{mutate(join(temp,'.github/workflows'));assert.throws(()=>verifyWorkflowSources(temp));}));
test('shared source remains the accepted immutable validator',()=>{
 assert.equal(POLICY.shared_validator_sha256,'acb0805e7414b45a3e23488f5afa98cea612469cff2c3fe3f8d8f0a0ce49b9a0');
 assert.equal(verifyWorkflowSources(root),12);assert.equal(POLICY.yaml_version,'2.8.3');
});
test('actual runner verifies parser and workflow integrity before launching tests',()=>{
 const source=readFileSync(new URL('./ci.mjs',import.meta.url),'utf8');
 assert(source.indexOf('verifyYamlScopes(harness)')<source.indexOf('for(const [name,files]of Object.entries(groups))'));
 assert.match(source,/\['ops\/size-browser\/validate-syntax.mjs',application\]/);
 assert(source.includes("run('harness-security',process.execPath,['scripts/security-check.mjs'],harness)"));
 assert(!source.includes("['ops/validate-offline-workflows.mjs']"));
 const wrapper=readFileSync(new URL('./validate-syntax.mjs',import.meta.url),'utf8');
 assert.match(wrapper,/CLASSYLINE_VALIDATION_TOOLS:join\(root,'ops\/offline-validation'\)/);
});
