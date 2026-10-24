// Browser-owned parser integrity checks. No package-resolution fallback.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

export const POLICY=JSON.parse(readFileSync(new URL('./validation-policy.json',import.meta.url)));
export const YAML_SCOPES=Object.freeze(['ops/size-browser','ops/v21-browser','ops/offline-validation']);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=path=>{assert.equal(realpathSync(path),path,'Noncanonical validation path');return path;};

export function verifyYamlScope(scope) {
 scope=canonical(resolve(scope));const directory=canonical(join(scope,'node_modules/yaml'));
 const pkg=JSON.parse(readFileSync(join(scope,'package.json'))),lock=JSON.parse(readFileSync(join(scope,'package-lock.json')));
 assert.equal(pkg.dependencies?.yaml,POLICY.yaml_version,'Unreviewed parser dependency');
 assert.equal(lock.packages?.['']?.dependencies?.yaml,POLICY.yaml_version,'Unreviewed root lock');
 const locked=lock.packages?.['node_modules/yaml'];
 assert.equal(locked?.version,POLICY.yaml_version,'Unreviewed parser lock');
 assert.equal(locked?.resolved,POLICY.yaml_resolved,'Unreviewed parser registry source');
 assert.equal(locked?.integrity,POLICY.yaml_integrity,'Parser lock integrity changed');
 const files={};
 function walk(dir,prefix='') {
  for(const n of readdirSync(dir).sort()){
   const p=join(dir,n),s=lstatSync(p);assert(!s.isSymbolicLink(),'Symlink in parser');
   if(s.isDirectory())walk(p,prefix+n+'/');
   else{assert(s.isFile());files[prefix+n]=sha256(readFileSync(p));}
  }
 }
 walk(directory);assert.deepEqual(files,POLICY.yaml_files,'Parser package contents changed');
 const installed=JSON.parse(readFileSync(join(directory,'package.json')));assert.equal(installed.version,POLICY.yaml_version);
 // Resolve without executing the parser, then bind the actual importing scope.
 const from=createRequire(join(scope,'package.json'));
 assert.equal(canonical(from.resolve('yaml')),join(directory,'dist/index.js'),'Parser module substituted');
 assert.equal(canonical(from.resolve('yaml/package.json')),join(directory,'package.json'),'Parser identity substituted');
 return {version:installed.version,entry:join(directory,'dist/index.js'),integrity:locked.integrity};
}

export function verifyYamlScopes(root) {
 root=canonical(resolve(root));return YAML_SCOPES.map(scope=>({scope,...verifyYamlScope(join(root,scope))}));
}

export function verifyWorkflowSources(root) {
 root=canonical(resolve(root));const directory=canonical(join(root,'.github/workflows'));
 const files=readdirSync(directory).filter(n=>/\.ya?ml$/.test(n)).sort();
 assert.deepEqual(files,Object.keys(POLICY.workflow_sha256).sort(),'Workflow inventory changed');
 for(const name of files){
  const file=join(directory,name);assert(lstatSync(file).isFile(),'Workflow must be a regular file');canonical(file);
  assert.equal(sha256(readFileSync(file)),POLICY.workflow_sha256[name],'Workflow source changed: '+name);
 }
 return files.length;
}

export function secureSyntaxSource(original) {
 assert.equal(sha256(original),POLICY.shared_validator_sha256,'Shared validator source changed');
 const old="assert.equal(require('yaml/package.json').version, '2.8.2');";
 const patched="assert.equal(require('yaml/package.json').version, '2.8.3');";
 assert.equal(original.split(old).length,2,'Unique reviewed parser guard required');
 const source=original.replace(old,patched);
 assert.equal(sha256(source),POLICY.secure_validator_sha256,'Secure validator transformation changed');
 return source;
}
