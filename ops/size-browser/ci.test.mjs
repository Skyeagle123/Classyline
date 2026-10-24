import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDocument} from 'yaml';
import {verifyTap,COUNTS} from './ci.mjs';
import {verifyResult,SCREENSHOTS,WIDTHS} from './result.mjs';
import {SOURCE_SHA,SOURCE_TREE,SIZE_CASES} from './fixtures.mjs';
const workflowText=readFileSync(new URL('../../.github/workflows/size-isolated-browser.yml',import.meta.url),'utf8');
const workflow=parseDocument(workflowText,{uniqueKeys:true}).toJS();
const steps=workflow.jobs['isolated-browser'].steps;
const tap=(count=COUNTS.browser)=>`# tests ${count}\n# pass ${count}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
test('strict TAP accepts the exact complete suite',()=>assert.equal(verifyTap(tap(),COUNTS.browser).pass,COUNTS.browser));
for(const [label,mutation] of [
 ['missing summary',s=>s.replace(`# tests ${COUNTS.browser}\n`,'')],
 ['duplicate summary',s=>s+`# pass ${COUNTS.browser}\n`],
 ['missing test',()=>tap(COUNTS.browser-1)],
 ['failed',s=>s.replace('# fail 0','# fail 1')],
 ['skipped',s=>s.replace('# skipped 0','# skipped 1')],
 ['cancelled',s=>s.replace('# cancelled 0','# cancelled 1')],
 ['todo',s=>s.replace('# todo 0','# todo 1')],
])test('strict TAP rejects '+label,()=>assert.throws(()=>verifyTap(mutation(tap()),COUNTS.browser)));

function evidence(){
 const suffixes=['clean storage and interception before navigation','keyboard menu, categories, Escape and focus','Shop tiles, New In, Sale, Accessories and refresh','21 rendered swatches, neutral fallback and borders','independent dimensions, unavailable variants and exact bag ID','WhatsApp/COD methods and public destination without submission',...SIZE_CASES.map(c=>`${c.id} exact DOM order, color availability and identity`),'blocked checkout/recovery/Admin/import/unknown/external probes'];
 return {s:{source_sha:SOURCE_SHA,source_tree:SOURCE_TREE,completed:true,planned_cases:45,total:45,passed:45,failed:0,
  tests:WIDTHS.flatMap(w=>suffixes.map(name=>({name:`${w}: ${name}`,status:'PASS'}))),
  viewports:WIDTHS.map(width=>({width,height:900,isMobile:width===360,hasTouch:width===360})),browser:{engine:'Chromium',version:'151.0.7922.34'},external_application_requests_forwarded:0,api_requests_reaching_static_server:0},
 n:{serverTraffic:[{method:'GET',path:'/'}],traffic:WIDTHS.map(width=>({width,events:[{sequence:1,event:'interception-installed'},{sequence:2,event:'page-created'},{sequence:3,event:'request',action:'static',url:'http://127.0.0.1:1234/',method:'GET'}]}))},
 shots:SCREENSHOTS.map(name=>({name,width:Number(name.split('-')[0]),height:900}))};
}
test('receipt binds actual full evidence to secure source, 45 cases and 39 screenshots',()=>{
 const {s,n,shots}=evidence();assert.deepEqual(verifyResult(s,n,shots),{application_sha:SOURCE_SHA,application_tree:SOURCE_TREE,tests:45,passed:45,screenshots:39,external_forwarded:0,static_api_requests:0,mutations:0});
});
for(const [name,change]of [
 ['historical source',e=>e.s.source_sha='00b25b282d66818632a2d214e7a52ffbd0f8a1cb'],
 ['wrong source tree',e=>e.s.source_tree='0'.repeat(40)],
 ['incomplete run',e=>e.s.completed=false],
 ['missing browser case',e=>e.s.tests.pop()],
 ['skipped browser case',e=>e.s.tests[0].status='SKIP'],
 ['missing screenshot',e=>e.shots.pop()],
 ['wrong screenshot viewport',e=>e.shots[0].width=361],
 ['API reached server',e=>e.n.serverTraffic.push({method:'GET',path:'/api/catalog'})],
 ['forwarded mutation',e=>e.n.traffic[0].events[2].method='POST'],
 ['forwarded external request',e=>e.n.traffic[0].events.push({sequence:4,event:'request',action:'static',method:'GET',url:'https://classyline2.pages.dev/'})],
 ['unexpected blocked request',e=>e.n.traffic[0].events.push({sequence:4,event:'request',action:'block-api',method:'GET',expectedBlock:false})],
 ['socket event',e=>e.n.traffic[0].events.push({sequence:4,event:'blocked-websocket'})],
])test('receipt rejects '+name,()=>{const e=evidence();change(e);assert.throws(()=>verifyResult(e.s,e.n,e.shots));});
test('workflow runs new and legacy exact-count suites before browser installation',()=>{
 const checks=steps.findIndex(s=>s.name==='Run credential-free harness and workflow safety regressions');
 assert(checks>=0);assert.match(steps[checks].run,/node harness\/ops\/size-browser\/ci.mjs application/);
 assert(checks<steps.findIndex(s=>s.name==='Install official pinned Playwright Chromium and OS libraries'));
 assert.equal(COUNTS.legacy,70);assert.equal(COUNTS.application,206);assert.equal(COUNTS.size,33);
});
test('workflow pins patched runtime and exact independent secure source',()=>{
 assert.equal(steps.find(s=>s.uses?.startsWith('actions/setup-node@')).with['node-version'],'24.22.1');
 assert.equal(steps.find(s=>s.with?.path==='application').with.ref,SOURCE_SHA);assert(workflowText.includes(SOURCE_TREE));
 assert.match(workflow.jobs['isolated-browser'].if,/github.base_ref == 'main'/);
 for(const path of ['application','harness/ops/size-browser','harness/ops/v21-browser','harness/ops/offline-validation'])assert(workflowText.includes(`npm ci --prefix ${path} --ignore-scripts`));
});
test('only one strict evidence artifact can be produced and receipts are not hardcoded in workflow',()=>{
 const upload=steps.filter(s=>s.uses?.startsWith('actions/upload-artifact@'));assert.equal(upload.length,1);
 assert.equal(upload[0].with['if-no-files-found'],'error');assert(!workflowText.includes('CLASSYLINE_BROWSER_RECEIPT='));
 const source=readFileSync(new URL('./qualify.mjs',import.meta.url),'utf8');
 assert.match(source,/if\(summary.completed\)/);assert.match(source,/const receipt=await verifyEvidence\(output\)/);
});
test('offline build runner uses verified secure toolchain and denied build network',()=>{
 const source=readFileSync(new URL('./ci.mjs',import.meta.url),'utf8');
 assert.match(source,/runtime.verifyExecution/);assert.match(source,/runtime.requireRuntime/);
 assert.match(source,/offline-boundary.cjs/);assert.match(source,/audit.metadata\?\.vulnerabilities\?\.total,0/);
 assert(!/spawnSync\([^\n]*deploy|workflow.*dispatch|secrets\./.test(source));
});
