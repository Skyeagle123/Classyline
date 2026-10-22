// Exercise BOTH real embedded guards and the real release controller together.
// Only API/process boundaries and test deadlines are substituted. No real fetch,
// credentials, npx, Cloudflare client, or Pages deployment operation is available.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const yaml=readFileSync(new URL('../.github/workflows/classyline-production-manual.yml',import.meta.url),'utf8');
const scripts=[...yaml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)^          NODE/gm)]
  .map(m=>m[1].replace(/^          /gm,''));
const guards=[...yaml.matchAll(/          \/\/ BEGIN FIXED RECOVERY GUARD[\s\S]*?          \/\/ END FIXED RECOVERY GUARD/g)];
const early=scripts[0].replace("import assert from 'node:assert/strict';",'');
const final=scripts.at(-1).replace("import {execFileSync, spawn} from 'node:child_process';",
  'const {execFileSync, spawn} = globalThis.mockChild;')
  .replaceAll('setTimeout(resolve, 5000)','setTimeout(resolve, 0)')
  .replaceAll('/tmp/classyline-functions-build','./functions-build')
  .replace("setTimeout(() => finish(null, 'SIGKILL', true), 180000)",
    "setTimeout(() => finish(null, 'SIGKILL', true), 20)");
const mock=readFileSync(new URL('./fixtures/wrangler-release-runtime.mjs',import.meta.url),'utf8')
  .replace("'./recovery-api.mjs'",JSON.stringify(new URL('./fixtures/recovery-api.mjs',import.meta.url).href));
const source=`import './mock.mjs';\nawait (async()=>{${early}\n})();\n${final}`;
function execute(scenario,env={},unset=[],script=source) {
  const temp=mkdtempSync(join(tmpdir(),'classyline-recovery-test-'));
  try {
    writeFileSync(join(temp,'mock.mjs'),mock+`\nObject.assign(process.env,${JSON.stringify(env)});\n`+
      `for(const key of ${JSON.stringify(unset)}) delete process.env[key];\n`);
    writeFileSync(join(temp,'run.mjs'),script);
    const result=spawnSync(process.execPath,[join(temp,'run.mjs'),scenario],{
      encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
    assert.equal(result.error,undefined);
    const evidence=JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(evidence.writes,0);
    assert(!/FAKE_(TEST|GITHUB)_VALUE_NOT_A_CREDENTIAL/.test(result.stdout+result.stderr),
      'Mock credential leaked into logs');
    assert(!JSON.stringify(evidence.artifacts).includes('NOT_A_CREDENTIAL'));
    assert(evidence.calls<=1,'Wrapper replayed a deployment');
    return {...result,evidence};
  } finally {rmSync(temp,{recursive:true,force:true});}
}
test('both embedded recovery guards are byte-identical and execute before the only invocation',()=>{
  assert.equal(guards.length,2);assert.equal(guards[0][0],guards[1][0]);
  assert.match(scripts[0],/await verifyRecovery\(get\)/);
  assert(final.indexOf('await verifyRecovery(recoveryGet)')<final.indexOf('await invokeWranglerOnce()'));
  assert.equal((yaml.match(/spawn\('npx'/g)||[]).length,1);
  assert.match(yaml,/GITHUB_RUN_NUMBER, '3'/);
  assert.match(yaml,/GITHUB_RUN_ATTEMPT, '1'/);
});
test('exact audit history and two real guards permit one mocked invocation and acceptance',()=>{
  const {status,stderr,evidence}=execute('success');assert.equal(status,0,stderr);
  assert.equal(evidence.calls,1);assert.equal(evidence.recoveryReads.inventories,2);
  assert.equal(evidence.artifacts['recovery-verification.json'].failed_deployment_step,'skipped');
  assert.equal(evidence.artifacts['accepted-deployment.json'].accepted,true);
  const after=evidence.boundaryEvents.slice(evidence.boundaryEvents.indexOf('final-recovery-log-response')+1);
  assert(after.indexOf('cloudflare-project')>=0);
  assert(after.indexOf('cloudflare-project')<after.indexOf('cloudflare-rollback'));
  assert(after.indexOf('cloudflare-rollback')<after.indexOf('cloudflare-history'));
  assert(after.indexOf('cloudflare-history')<after.indexOf('wrangler'));
});
test('final recovery guard precedes the last Cloudflare project, rollback and complete-history validation',()=>{
  const recovery=final.indexOf('const recoveryEvidence = await verifyRecovery(recoveryGet);');
  const cloudflare=final.indexOf('const current = (await cf(root)).result;');
  const history=final.indexOf('const preUpload = await history(); noActive(preUpload);');
  const invocation=final.indexOf('const result = await invokeWranglerOnce();');
  assert(recovery>=0 && recovery<cloudflare && cloudflare<history && history<invocation);
  assert.match(final.slice(recovery,cloudflare),/await mainUnchanged\(\);\nverifyInputs\(\);/);
  assert.match(final.slice(cloudflare,history),/identity\(current.canonical_deployment, baseline, baselineSHA\)/);
  assert.match(final.slice(cloudflare,history),/JSON.stringify\(project\(current\)\) === JSON.stringify\(bindings\)/);
  assert.match(final.slice(history,invocation),/await mainUnchanged\(\);\nverifyInputs\(\);/);
  assert.doesNotMatch(final.slice(cloudflare,invocation),/await verifyRecovery\(/,
    'Recovery API preparation must not follow the final Cloudflare revalidation');
});
const duringRecoveryFaults=['during-recovery-r2','during-recovery-d1','during-recovery-competitor',
  'during-recovery-baseline','during-recovery-main-drift','during-recovery-source-drift'];
for(const scenario of duringRecoveryFaults)
  test(`drift inside final recovery verification blocks the actual invocation: ${scenario}`,()=>{
    const r=execute(scenario);assert.notEqual(r.status,0);assert.equal(r.evidence.calls,0,r.stderr);
    assert.equal(r.evidence.recoveryReads.inventories,2,'Initial guard must have passed');
    assert.equal(r.evidence.recoveryDrift,true,'Fault must occur during the second guard');
    assert(r.evidence.artifacts['preflight.json'],'Earlier Cloudflare preflight must have passed');
    assert(r.evidence.boundaryEvents.includes('final-recovery-log-response'));
    assert.equal(r.evidence.artifacts['accepted-deployment.json'],undefined);
  });
// Mutation controls: the same faults must reproduce Astra's original unsafe
// ordering. Only an in-memory test copy is changed; no deployable file is written.
const recoveryBlock='const recoveryEvidence = await verifyRecovery(recoveryGet);\nawait mainUnchanged();\nverifyInputs();\n';
const oldOrder=final.replace(recoveryBlock,'').replace("save('recovery-verification.json', recoveryEvidence);",
  recoveryBlock+"save('recovery-verification.json', recoveryEvidence);");
for(const scenario of duringRecoveryFaults.slice(0,4))
  test(`regression detects the previously unsafe ordering: ${scenario}`,()=>{
    assert.notEqual(oldOrder,final);
    const r=execute(scenario,{},[],`import './mock.mjs';\nawait (async()=>{${early}\n})();\n${oldOrder}`);
    assert.notEqual(r.status,0);assert.equal(r.evidence.recoveryDrift,true);
    assert.equal(r.evidence.calls,1,'Old ordering must reproduce the pre-upload safety gap');
    assert.equal(r.evidence.artifacts['accepted-deployment.json'],undefined);
  });
test('credential-free CI admits exactly the new recovery branch plus the five existing branches',()=>{
  const ci=readFileSync(new URL('../.github/workflows/pr4-offline-validation.yml',import.meta.url),'utf8');
  const branches=['phase/manual-production-deployment-preparation','phase/production-activation-preparation',
    'phase/production-release-enablement-review','phase/production-final-release-gate',
    'phase/storefront-v2-production-release','phase/storefront-v2-release-recovery'];
  const push=ci.match(/  push:\n    branches:\n([\s\S]*?)  workflow_dispatch:/)[1];
  assert.deepEqual([...push.matchAll(/^      - (.+)$/gm)].map(m=>m[1]),branches);
  const condition=ci.match(/    if: >-\n([\s\S]*?)    runs-on:/)[1].trim().replace(/\n\s*/g,' ');
  for(const branch of [...branches,'main','phase/unapproved-recovery']) {
    const github={repository:'Skyeagle123/Classyline',ref:'refs/heads/'+branch};
    assert.equal(runInNewContext(condition,{github},{timeout:1000}),branches.includes(branch));
    assert.equal(runInNewContext(condition,{github:{...github,repository:'other/Classyline'}},{timeout:1000}),false);
  }
  assert.match(ci,/permissions:\n  contents: read\njobs:/);
  assert.doesNotMatch(ci,/secrets\.|environment:|CLOUDFLARE_API_TOKEN|GH_TOKEN|pages deploy|gh\s+workflow|actions\/workflows.*dispatch/i);
  assert.match(ci,/run: node --test ops\/\*\.test.mjs/);
  assert.match(ci,/persist-credentials: false/);
});
const failures=[
  'recovery-missing-previous','recovery-missing-failed','recovery-extra-dispatch','recovery-duplicate',
  'recovery-inventory-malformed','recovery-inventory-string-count','truncated-dispatch',
  ...['previous','failed','current'].flatMap(which=>[
    'sha','tree','branch','path','event','rerun','active','conclusion','number','workflow','repo','actor','trigger'
  ].map(field=>`recovery-${which}-${field}`)),
  'recovery-failed-success','recovery-previous-failed','recovery-controller-parent','recovery-original-tree',
  'recovery-detail-failed-success','recovery-detail-failed-rerun','recovery-current-approval-bypass',
  'recovery-missing-jobs','recovery-extra-job','recovery-truncated-jobs','recovery-wrong-job',
  'recovery-job-attempt','recovery-job-source','recovery-missing-step','recovery-extra-step',
  'recovery-reordered-steps','recovery-step-number','recovery-step-status','recovery-arm-succeeded',
  ...Array.from({length:9},(_,i)=>`recovery-executed-${i+2}`),
  'recovery-no-approval','recovery-approval-actor','recovery-approval-bypass',
  'recovery-approval-environment','recovery-approval-rejected',
  'recovery-log-tampered','recovery-log-missing','recovery-log-size','recovery-log-encoding',
  'recovery-api-denied','recovery-api-timeout',
  'main-changed','late-main-drift','wrong-baseline','late-baseline-drift','wrong-d1','wrong-r2',
  'missing-d1','missing-r2','extra-d1','extra-r2','late-binding-drift','rollback-missing',
  'rollback-source-mismatch','competing-build','late-competing-build','late-completed-competitor',
  'candidate-attempt-exists','paginated-no-info-success','paginated-competing','paginated-bound-exceeded'
];
for(const scenario of failures) test(`integrated recovery rejects before any CLI: ${scenario}`,()=>{
  const r=execute(scenario);assert.notEqual(r.status,0,scenario);assert.equal(r.evidence.calls,0,r.stderr);
  assert.equal(r.evidence.artifacts['accepted-deployment.json'],undefined);
});
for(const scenario of ['late-recovery-extra-dispatch','late-recovery-failed-rerun',
  'late-recovery-failed-conclusion','late-recovery-missing-step','late-recovery-executed-10',
  'late-recovery-log-tampered','late-recovery-no-approval'])
  test(`second guard rejects changed historical/current evidence: ${scenario}`,()=>{
    const r=execute(scenario);assert.notEqual(r.status,0);assert.equal(r.evidence.calls,0,r.stderr);
    assert.equal(r.evidence.recoveryReads.inventories,2,'Initial full guard must have succeeded');
    assert(r.evidence.artifacts['preflight.json'],'Existing CF preflight must also have succeeded');
  });
const badEnv=[
  {GITHUB_RUN_NUMBER:'4'}, {GITHUB_RUN_ATTEMPT:'2'}, {GITHUB_ACTOR:'other'},
  {GITHUB_TRIGGERING_ACTOR:'other'}, {GITHUB_REF:'refs/heads/feature'},
  {GITHUB_WORKFLOW_SHA:'0'.repeat(40)}, {GITHUB_WORKFLOW_REF:'other/workflow@refs/heads/main'},
  ...['','false','True','TRUE',' true','true ','1','null'].map(RELEASE_ARMED=>({RELEASE_ARMED}))
];
for(const env of badEnv) test(`integrated recovery rejects unauthorized context: ${JSON.stringify(env)}`,()=>{
  const r=execute('success',env);assert.notEqual(r.status,0);assert.equal(r.evidence.calls,0,r.stderr);
});
test('missing arm is refused by the real first shell gate and the integrated release body',()=>{
  const shell=yaml.split('name: Require separately armed release window')[1]
    .split('      - name:')[0].split('run: |\n')[1].replace(/^          /gm,'');
  assert.notEqual(spawnSync('bash',['-e','-c',shell],{env:{PATH:process.env.PATH}}).status,0);
  const r=execute('success',{},['RELEASE_ARMED']);
  assert.notEqual(r.status,0);assert.equal(r.evidence.calls,0);
});
for(const scenario of ['nonzero-cli','timeout-cli','signal-cli','parent-cancelled','spawn-throws',
  'uncertain-no-deployment','uncertain-but-deployed','multiple-new'])
  test(`recovery opportunity not replayed after invocation: ${scenario}`,()=>{
    const r=execute(scenario);assert.notEqual(r.status,0);assert.equal(r.evidence.calls,1,r.stderr);
    assert.equal(r.evidence.artifacts['accepted-deployment.json'],undefined);
    assert.equal(r.evidence.artifacts['attempt.json'].workflow_rerun_permitted,false);
    const replacement=execute('success',{GITHUB_RUN_NUMBER:'4',GITHUB_RUN_ID:'39820000001'});
    assert.notEqual(replacement.status,0);assert.equal(replacement.evidence.calls,0);
  });
test('archived original job log is exact and credential-free; original failure is not rewritten',()=>{
  const bytes=readFileSync(new URL('./fixtures/recovery-39814798811.log',import.meta.url));
  assert.equal(bytes.length,4574);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'b48a0342e34036759e3196050941baa2b39b9243b0db5ef80c62ebaace4dc54f');
  assert.match(bytes.toString(),/RELEASE_ARMED: True/);
  assert.match(bytes.toString(),/Process completed with exit code 1/);
  assert.doesNotMatch(bytes.toString(),/Bearer |ghp_|github_pat_|CLOUDFLARE_API_TOKEN:/);
});

test('all original workflow bytes outside the approved recovery insertions/fence remain unchanged',()=>{
  let text=yaml;
  text=text.replace(/          \/\/ BEGIN FIXED RECOVERY GUARD[^\n]*\n[\s\S]*?          \/\/ END FIXED RECOVERY GUARD\n/g,'');
  text=text.replace('          await verifyRecovery(get);\n','');
  text=text.replace(/          async function recoveryGet\(path\) \{[\s\S]*?^          \}\n/m,'');
  text=text.replace("          const recoveryEvidence = await verifyRecovery(recoveryGet);\n          await mainUnchanged();\n          verifyInputs();\n",'');
  text=text.replace("          save('recovery-verification.json', recoveryEvidence);\n",'');
  text=text.replace('# Keep the independently verified arm false throughout recovery preparation.\n# Installation and a new recovery dispatch require separate Owner authorization.','# RECOVERY COMMENT');
  assert.equal(createHash('sha256').update(text).digest('hex'),'21840f05f9b9e171b91cb15891ff8742ce660c2f9901061be18bc27a985a0ebe');
});
