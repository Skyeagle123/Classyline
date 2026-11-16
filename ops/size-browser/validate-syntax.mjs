// Execute the entire hash-pinned shared validator with one reviewed parser-pin change.
// The accepted source and shared validator are never edited.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {SOURCE_SHA,SOURCE_TREE} from './fixtures.mjs';
import {verifyYamlScopes,verifyWorkflowSources,secureSyntaxSource} from './yaml-policy.mjs';

export function validateSyntax(application,root=resolve(import.meta.dirname,'../..')) {
 assert.equal(process.versions.node,'24.22.1');assert.equal(process.versions.undici,'7.30.1');
 application=resolve(application);root=resolve(root);
 const git=(...args)=>execFileSync('git',args,{cwd:application,encoding:'utf8'}).trim();
 assert.equal(git('rev-parse','HEAD'),SOURCE_SHA);assert.equal(git('rev-parse','HEAD^{tree}'),SOURCE_TREE);
 assert.equal(git('status','--porcelain'),'');
 verifyYamlScopes(root);verifyWorkflowSources(root);
 const source=secureSyntaxSource(readFileSync(join(application,'ops/validate-offline-workflows.mjs'),'utf8'));
 const temp=mkdtempSync(join(tmpdir(),'classyline-secure-syntax-'));
 try{
  const script=join(temp,'validate.mjs');writeFileSync(script,source,{flag:'wx',mode:0o600});
  return execFileSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:120000,
   env:{...process.env,CLASSYLINE_VALIDATION_TOOLS:join(root,'ops/offline-validation')}});
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.equal(process.argv.length,3);process.stdout.write(validateSyntax(process.argv[2]));
}
