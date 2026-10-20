// Offline preparer only. No credentials, network, upload or deployment imports.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {RELEASE,check,inventory,prepare,verifyPlan,sha256} from './pages-direct-upload.mjs';

export function pinnedHash(application) {
  const req=createRequire(join(resolve(application),'package.json'));
  const manifest=req('blake3-wasm/package.json');
  check(manifest.version==='2.1.5','Unreviewed BLAKE3 version');
  const lock=JSON.parse(readFileSync(join(application,'package-lock.json')));
  check(lock.packages['node_modules/blake3-wasm']?.version==='2.1.5','BLAKE3 lock mismatch');
  return req('blake3-wasm').hash;
}
export function sourceIdentity(application) {
  const git=(...args)=>execFileSync('git',args,{cwd:application,encoding:'utf8'}).trim();
  check(git('rev-parse','HEAD')===RELEASE.sha && git('rev-parse','HEAD^{tree}')===RELEASE.tree &&
    git('status','--porcelain=v1','--untracked-files=all')==='', 'Source identity/cleanliness mismatch');
}
export async function prepareApplication(application, output) {
  sourceIdentity(application);
  const files=inventory(join(application,'dist'));
  const bundle=readFileSync(join(output,'worker.bundle'));
  const routing=readFileSync(join(output,'routing.json'));
  const plan=await prepare({identity:{...RELEASE},files,bundle,routing,blake3:pinnedHash(application)});
  const record={...plan,assets:plan.assets.map(a=>({...a,bytes:a.bytes.toString('base64')})),
    parts:plan.parts.map(p=>({...p,bytes:p.bytes.toString('base64')})),
    payload:{...plan.payload,body:plan.payload.body.toString('base64')}};
  writeFileSync(join(output,'plan.json'),JSON.stringify(record),{flag:'wx',mode:0o600});
  // Only this allowlisted evidence file is eligible for an Actions artifact.
  writeFileSync(join(output,'direct-upload-provenance.json'),JSON.stringify({...plan.evidence,
    plan_sha256:plan.planHash,node:process.version,wrangler:'4.150.0'},null,2),{flag:'wx',mode:0o600});
  return plan;
}
export function loadPlan(application, output) {
  sourceIdentity(application);
  const plan=JSON.parse(readFileSync(join(output,'plan.json')));
  plan.assets=plan.assets.map(a=>({...a,bytes:Buffer.from(a.bytes,'base64')}));
  plan.parts=plan.parts.map(p=>({...p,bytes:Buffer.from(p.bytes,'base64')}));
  plan.payload.body=Buffer.from(plan.payload.body,'base64');
  verifyPlan(plan,pinnedHash(application));
  const actual=inventory(join(application,'dist')).map(f=>({path:f.path,size:f.bytes.length,sha256:sha256(f.bytes)}));
  check(JSON.stringify(actual)===JSON.stringify(plan.evidence.files),'Static file set changed after preparation');
  check(sha256(readFileSync(join(output,'worker.bundle')))===plan.evidence.functions.bundle_sha256 &&
    sha256(readFileSync(join(output,'routing.json')))===plan.evidence.functions.routing_sha256,'Functions changed after preparation');
  return plan;
}
if(process.argv[1] && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
  // Fixed local paths, no caller-supplied ref/project/account/shell command.
  try {
    check(process.argv.length===2,'No release inputs accepted');
    const output=join(process.env.RUNNER_TEMP,'classyline-direct-upload');mkdirSync(output,{recursive:true,mode:0o700});
    await prepareApplication(process.cwd(),output);
    console.log('Exact static/Functions upload payload prepared; no network request made.');
  } catch {console.error('Artifact preparation failed; no deployment permitted.');process.exitCode=1;}
}
