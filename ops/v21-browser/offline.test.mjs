import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseDocument} from 'yaml';
import {decision, sandbox, staticServer, inventory} from './isolation.mjs';
import {catalog, COLORS, NUMBER, SOURCE_SHA, SOURCE_TREE} from './fixtures.mjs';

const origin='http://127.0.0.1:45678';
const root=resolve(import.meta.dirname,'../..');
const workflowPath=join(root,'.github/workflows/v21-isolated-browser.yml');
const workflowText=readFileSync(workflowPath,'utf8');
const doc=parseDocument(workflowText,{uniqueKeys:true});
assert.deepEqual(doc.errors,[]); const workflow=doc.toJS();
const job=workflow.jobs['isolated-browser'];
const harness=readFileSync(new URL('./qualify.mjs',import.meta.url),'utf8');

for(const [path,method,expected] of [
  ['/api/catalog','GET','fixture-catalog'],['/api/catalog','HEAD','block-api'],
  ['/api/catalog?extra=1','GET','block-api'],['/api/unknown','GET','block-api'],
  ['/api/admin/catalog','GET','block-api'],['/api','GET','block-api'],
  ['/api/orders','POST','block-mutation'],['/api/orders/recover','POST','block-mutation'],
  ['/api/admin/product-images','POST','block-mutation'],['/api/admin/catalog/import','POST','block-mutation'],
  ['/api/admin/products','PUT','block-mutation'],['/api/admin/orders','PATCH','block-mutation'],
  ['/assets/app.js','DELETE','block-mutation'],['/assets/app.js','GET','static'],
  ['/product/ISOLATED-SHIRT','GET','static'],['/__qualification__/shirt.svg','GET','fixture-image'],
  ['/__qualification__/hat.svg','GET','fixture-image'],['/__qualification__/other.svg','GET','static'],
  ['https://classyline2.pages.dev/api/catalog','GET','block-external'],
  ['https://0195c05f.classyline2.pages.dev/api/catalog','GET','block-external'],
  ['https://api.cloudflare.com/client/v4/accounts','POST','block-external'],
  ['https://api.github.com/repos/Skyeagle123/Classyline/actions/workflows/x/dispatches','POST','block-external'],
  ['http://localhost:45678/api/catalog','GET','block-external'],
  ['http://127.0.0.1:45679/api/catalog','GET','block-external'],
  ['http://user:password@127.0.0.1:45678/api/catalog','GET','block-external'],
]) test(`route policy ${method} ${path}`,()=>assert.equal(decision(new URL(path,origin).href,method,origin),expected));

function browserDouble() {
  let httpRoute, socketRoute; const order=[], events={};
  const page={setDefaultTimeout(ms){order.push(['timeout',ms]);},on(name,fn){events[name]=fn;}};
  const context={
    async route(pattern,fn){order.push('route');httpRoute=fn;},
    async routeWebSocket(pattern,fn){order.push('socket-route');socketRoute=fn;},
    on(name,fn){events[name]=fn;},
    async newPage(){order.push('new-page');return page;},
  };
  const browser={async newContext(options){order.push(['context',options]);return context;}};
  async function request(path,method='GET') {
    const actions=[];const url=new URL(path,origin).href;
    await httpRoute({request:()=>({url:()=>url,method:()=>method}),
      async fulfill(value){actions.push(['fulfill',value]);},async continue(){actions.push(['continue']);},async abort(value){actions.push(['abort',value]);}});
    return actions;
  }
  return {browser,order,events,request,socket:()=>socketRoute};
}
test('real sandbox installs both interceptors before page creation and navigation',async()=>{
  const b=browserDouble(),events=[];await sandbox(b.browser,origin,360,events);
  assert.deepEqual(b.order.slice(1,4),['route','socket-route','new-page']);
  assert.deepEqual(events.map(e=>e.event),['interception-installed','page-created']);
  assert.deepEqual(b.order[0][1].storageState,{cookies:[],origins:[]});
  assert.equal(b.order[0][1].serviceWorkers,'block');assert.equal(b.order[0][1].acceptDownloads,false);
  assert.deepEqual(b.order[0][1].viewport,{width:360,height:900});
});
test('real catalog interceptor returns fixed synthetic contract and no upstream request',async()=>{
  const b=browserDouble(),events=[];const s=await sandbox(b.browser,origin,768,events);
  let actions=await b.request('/api/catalog');assert.equal(actions.length,1);assert.equal(actions[0][0],'fulfill');
  assert.deepEqual(JSON.parse(actions[0][1].body),catalog(true));
  s.model.whatsapp=false;actions=await b.request('/api/catalog');assert.equal(JSON.parse(actions[0][1].body).whatsapp_enabled,false);
  s.assertSafe();
});
for(const [path,method] of [['/api/orders','POST'],['/api/orders/recover','POST'],['/api/unknown','GET'],['https://classyline2.pages.dev/api/catalog','GET'],['https://api.cloudflare.com/client/v4/accounts','POST'],['https://api.github.com/repos/Skyeagle123/Classyline/actions/workflows/x/dispatches','POST']])
  test(`actual routing handler aborts ${method} ${path} and fails acceptance`,async()=>{
    const b=browserDouble(),s=await sandbox(b.browser,origin,1363,[]);
    assert.deepEqual(await b.request(path,method),[['abort','blockedbyclient']]);
    assert.throws(()=>s.assertSafe(),/Unexpected application request/);
  });
test('expected safety probe is logged distinctly but never forwarded',async()=>{
  const b=browserDouble(),events=[],s=await sandbox(b.browser,origin,360,events);
  s.expectedBlocks.add(origin+'/api/orders');assert.deepEqual(await b.request('/api/orders','POST'),[['abort','blockedbyclient']]);
  assert.equal(events.at(-1).expectedBlock,true);s.assertSafe();
});
test('WebSocket is closed without connection and fails acceptance',async()=>{
  const b=browserDouble(),s=await sandbox(b.browser,origin,360,[]);let closed=0;
  b.socket()({url:()=> 'wss://classyline2.pages.dev/socket',close(){closed++;}});
  assert.equal(closed,1);assert.throws(()=>s.assertSafe());
});
test('an external response or page error prevents acceptance',async()=>{
  const b=browserDouble(),s=await sandbox(b.browser,origin,360,[]);
  b.events.response({url:()=> 'https://classyline2.pages.dev/'});assert.throws(()=>s.assertSafe(),/External HTTP response/);
  s.responses.length=0;b.events.pageerror(new Error('synthetic failure'));assert.throws(()=>s.assertSafe(),/Browser application error/);
});

test('static server rejects API, mutations and unknown assets without an upstream',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'v21-static-'));let server;
  try{
    writeFileSync(join(dir,'index.html'),'<h1>synthetic offline server boundary</h1>');
    mkdirSync(join(dir,'assets'));writeFileSync(join(dir,'assets/x.js'),'// synthetic');
    const logs=[];server=await staticServer(dir,logs);
    for(const [path,options,status] of [
      ['/api/catalog',{},403],['/api/orders',{method:'POST'},403],['/api/orders/recover',{method:'POST'},403],
      ['/assets/x.js',{},200],['/missing.js',{},404],['/product/x',{},200],['/api',{},403],
    ])assert.equal((await fetch(server.origin+path,options)).status,status);
    assert.equal(logs.length,7);
    writeFileSync(join(dir,'assets/x.js'),'// drift');
    assert.equal((await fetch(server.origin+'/assets/x.js')).status,500);
  }finally{await server?.close();rmSync(dir,{recursive:true,force:true});}
});
test('build inventory rejects symlinks',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'v21-symlink-'));
  try{writeFileSync(join(dir,'x'),'x');symlinkSync(join(dir,'x'),join(dir,'link'));await assert.rejects(inventory(dir),/Symlink/);}
  finally{rmSync(dir,{recursive:true,force:true});}
});
test('synthetic catalog preserves 21 independent color labels and variant IDs',()=>{
  assert.equal(Object.keys(COLORS).length,21);const c=catalog();
  for(const p of c.products){assert(p.image.startsWith('/__qualification__/'));assert.equal(new Set(p.variants.map(v=>v.id)).size,p.variants.length);}
  assert.equal(c.products[0].variants.find(v=>v.id==='UNKNOWN-NONE').color,'Eashed Blue');
  assert.equal(c.products[0].variants.find(v=>v.id==='RED-L-SOLD').stock,0);
  assert(c.products[0].sizes.includes('Free Size'));assert(c.products[0].sizes.includes('No Size'));
  assert.equal(NUMBER,'96178719771');
});

test('workflow is automatic qualification-only with minimum permissions and restricted branch',()=>{
  assert.deepEqual(Object.keys(workflow.on).sort(),['pull_request','push']);
  assert.deepEqual(workflow.on.push.branches,['phase/storefront-v21-browser-qualification']);
  assert.deepEqual(workflow.permissions,{contents:'read'});
  assert.deepEqual(Object.keys(workflow.jobs),['isolated-browser']);
  assert.match(job.if,/github\.repository == 'Skyeagle123\/Classyline'/);
  assert.match(job.if,/head\.repo\.full_name == 'Skyeagle123\/Classyline'/);
  assert.equal(job.environment,undefined);assert.equal(job.permissions,undefined);
  assert(!/secrets\.|workflow_dispatch|pull_request_target|workflow_run|id-token:|actions:\s*write|deployments:\s*write/.test(workflowText));
});
test('every supporting action is pinned; checkouts never persist credentials',()=>{
  const expected={'actions/checkout':'11d5960a326750d5838078e36cf38b85af677262','actions/setup-node':'49933ea5288caeca8642d1e84afbd3f7d6820020','actions/upload-artifact':'ea165f8d65b6e75b540449e92b4886f43607fa02'};
  for(const step of job.steps.filter(s=>s.uses)){
    const [name,sha]=step.uses.split('@');assert.equal(sha,expected[name]);assert.match(sha,/^[a-f0-9]{40}$/);
    if(name==='actions/checkout')assert.equal(step.with['persist-credentials'],false);
  }
});
test('application checkout, clean tree and toolchain are fixed independently from harness',()=>{
  const source=job.steps.find(s=>s.with?.path==='application');assert.equal(source.with.ref,SOURCE_SHA);
  assert(workflowText.includes(SOURCE_TREE));assert(workflowText.includes('status --porcelain'));
  assert(workflowText.includes('npm ci --prefix application --ignore-scripts'));
  assert(workflowText.includes('npm ci --prefix harness/ops/v21-browser --ignore-scripts'));
  assert(workflowText.includes('install --with-deps chromium --only-shell'));
  assert.equal(job.steps.find(s=>s.uses?.startsWith('actions/setup-node')).with['node-version'],'24.19.0');
});
test('workflow cannot dispatch, upload a site or invoke a release on success or failure',()=>{
  const commands=job.steps.map(s=>s.run||'').join('\n');
  assert(!/wrangler|pages deploy|gh\s+|curl\s+|cloudflare\.com|\.\/.*production|workflow.*dispatch/i.test(commands));
  const failureSteps=job.steps.filter(s=>s.if);assert.equal(failureSteps.length,1);
  assert.equal(failureSteps[0].uses,'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  assert.equal(workflow.concurrency['cancel-in-progress'],false);
  assert(!JSON.stringify(workflow).includes('classyline-production'));
});
test('browser cases explicitly use three widths, no submission or WhatsApp navigation',()=>{
  assert.match(harness,/for \(const width of \[360,768,1363\]\)/);
  assert(!/\.submit\(|request\.(post|put|patch|delete)|\.click\([^\n]*WhatsApp/.test(harness));
  assert.match(harness,/engine:'Chromium',version:browser\.version\(\)/);
  assert.match(harness,/external_application_requests_forwarded/);
  assert.match(harness,/api_requests_reaching_static_server/);
  assert.match(harness,/setDefaultTimeout|async function check/);
});
test('all YAML and shell bodies parse; JavaScript passes node syntax checks',()=>{
  for(const step of job.steps.filter(s=>s.run)) execFileSync('bash',['-n'],{input:step.run,stdio:['pipe','pipe','pipe']});
  for(const file of ['fixtures.mjs','isolation.mjs','qualify.mjs','offline.test.mjs'])
    execFileSync(process.execPath,['--check',join(import.meta.dirname,file)],{stdio:'pipe'});
});
test('isolated tool lock pins Playwright and registry integrity without application dependency changes',()=>{
  const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url)));
  const lock=JSON.parse(readFileSync(new URL('./package-lock.json',import.meta.url)));
  assert.equal(pkg.dependencies.playwright,'1.62.1');assert.equal(pkg.dependencies.yaml,'2.8.2');
  for(const [path,value] of Object.entries(lock.packages).filter(([p])=>p)){
    assert(value.resolved.startsWith('https://registry.npmjs.org/'),path);assert.match(value.integrity,/^sha512-/);
    // Playwright's locked optional macOS watcher is never installed on this
    // Ubuntu workflow. Lifecycle scripts are disabled for every npm ci anyway.
    if(value.hasInstallScript){
      assert.equal(path,'node_modules/fsevents');assert.equal(value.version,'2.3.2');
      assert.equal(value.optional,true);assert.deepEqual(value.os,['darwin']);
    }
  }
});
