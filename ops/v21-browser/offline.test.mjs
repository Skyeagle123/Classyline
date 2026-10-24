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
  assert.equal(pkg.dependencies.playwright,'1.62.1');assert.equal(pkg.dependencies.yaml,'2.8.3');
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

// Execute the actual cart-readiness statement. Rendering and the deadline are
// controlled events, so these offline regressions need no browser or sleeps.
const cartReadyStart = "const dialog=page.getByRole('dialog');await dialog.waitFor({state:'visible'});";
function cartReadiness(source = harness) {
  assert.equal(source.split(cartReadyStart).length, 2, 'Unique cart-readiness boundary');
  const body = source.split(cartReadyStart)[1].split('await overflow();')[0];
  return new (Object.getPrototypeOf(async function(){}).constructor)('dialog', 'assert', body);
}
function delayedCart() {
  const expected = 'Free Size / Red · Qty 1';
  let text = null, waiter, waits = 0, immediateReads = 0;
  const dialog = {getByText(label, options) {
    assert.equal(label, expected); assert.deepEqual(options, {exact:true});
    return {
      async isVisible() { immediateReads++; return text === label; },
      async waitFor(options) {
        assert.deepEqual(options, {state:'visible', timeout:10000}); waits++;
        if (text === label) return;
        await new Promise((resolve,reject) => { waiter = {resolve,reject,label}; });
        assert.equal(text, label);
      },
    };
  }};
  return {dialog,
    render(value) { text = value; if (waiter && text === waiter.label) waiter.resolve(); },
    expire() { assert(waiter, 'A bounded visibility wait must be pending'); waiter.reject(new Error('Cart text visibility deadline exceeded')); },
    counts() { return {waits, immediateReads}; },
  };
}
test('actual cart statement waits for delayed exact item rendering',async()=>{
  const cart=delayedCart(); let finished=false;
  const pending=cartReadiness()(cart.dialog,assert).then(()=>{finished=true;});
  await Promise.resolve(); assert.equal(finished,false);
  assert.deepEqual(cart.counts(),{waits:1,immediateReads:0});
  cart.render('Free Size / Red · Qty 1'); await pending; assert.equal(finished,true);
});
for(const wrong of [null,'Free Size / Blue · Qty 1','Free Size / Red · Qty 2'])
  test(`actual cart statement rejects missing/incorrect text: ${JSON.stringify(wrong)}`,async()=>{
    const cart=delayedCart(); let finished=false;
    const pending=cartReadiness()(cart.dialog,assert).then(()=>{finished=true;});
    const rejected=assert.rejects(pending,/Cart text visibility deadline exceeded/);
    cart.render(wrong); await Promise.resolve(); assert.equal(finished,false);
    assert.deepEqual(cart.counts(),{waits:1,immediateReads:0});
    cart.expire(); await rejected; assert.equal(finished,false);
  });
test('original immediate visibility mutation fails before delayed cart rendering',async()=>{
  const start=harness.indexOf(cartReadyStart)+cartReadyStart.length;
  const end=harness.indexOf('await overflow();',start);
  const original=harness.slice(0,start)+
    "\nassert(await dialog.getByText('Free Size / Red · Qty 1',{exact:true}).isVisible());\n"+
    harness.slice(end);
  const cart=delayedCart();
  await assert.rejects(cartReadiness(original)(cart.dialog,assert),assert.AssertionError);
  assert.deepEqual(cart.counts(),{waits:0,immediateReads:1});
  cart.render('Free Size / Red · Qty 1');
});

// Execute the actual enabled/disabled readiness blocks, including their final
// strict assertions. Render events and deadline expiry are controlled, without
// Chromium, wall-clock sleeps, or a duplicate readiness implementation.
const methodStart = "await check(`${width}: WhatsApp/COD methods and public destination without submission`,async()=>{";
const methodAssert = "assert.deepEqual(await method.locator('option').evaluateAll(els=>els.map(e=>e.value)),['cod','whatsapp']);";
function methodReadiness(disabled = false, source = harness) {
  assert.equal(source.split(methodStart).length, 2, 'Unique Order method check');
  const check = source.split(methodStart)[1].split('        });')[0];
  const body = disabled
    ? check.split("await page.getByRole('button',{name:'Bag (1)',exact:true}).click();")[1].split("await page.keyboard.press('Escape');")[0]
    : check.split("await method.selectOption('whatsapp');")[0];
  assert(body, 'Readiness block must exist');
  return new (Object.getPrototypeOf(async function(){}).constructor)(disabled ? 'method' : 'page', 'assert', body);
}
function orderForm({present = true, visible = true, values = [], name = 'Order method', count = 1} = {}) {
  const state = {present,visible,values,name,count};
  const waits = [], pending = [], notices = [];
  let reads = 0;
  const notify = () => { for (const fn of notices.splice(0)) fn(); };
  function control(kind, expected, exact) {
    const matches = () => state.present && (kind === 'role'
      ? state.name === expected
      : (exact ? state.name + state.values.map(v => v === 'cod' ? 'Cash on Delivery' : 'WhatsApp + Cash on Delivery').join('') === expected : state.name.includes(expected)));
    function wait(target, options) {
      assert.deepEqual(options,{state:target === 'control' ? 'visible' : options.state,timeout:10000});
      assert(['visible','attached','detached'].includes(options.state));
      const item = {target,options,ready:() => {
        if (matches() && state.count > 1) throw new Error('Strict Order method selector matched multiple controls');
        if (target === 'control') return matches() && state.visible;
        const attached = matches() && state.values.includes(target);
        return options.state === 'detached' ? !attached : attached;
      }};
      waits.push({target,...options});
      if (item.ready()) return Promise.resolve();
      return new Promise((resolve,reject) => { pending.push({...item,resolve,reject}); notify(); });
    }
    return {
      waitFor:options => wait('control',options),
      locator(selector) {
        if (selector === 'option') return {async evaluateAll(fn) {
          reads++;
          return fn(matches() ? state.values.map(value => ({value})) : []);
        }};
        const value = /^option\[value="(cod|whatsapp)"\]$/.exec(selector)?.[1];
        assert(value, 'Readiness must inspect the exact expected option value');
        return {waitFor:options => wait(value,options)};
      },
    };
  }
  const dialog = {
    getByRole(role, options) {
      assert.equal(role,'combobox');assert.deepEqual(options,{name:'Order method',exact:true});
      return control('role',options.name,options.exact);
    },
    getByLabel(label, options) { return control('label',label,options.exact); },
  };
  return {
    page:{getByRole(role) { assert.equal(role,'dialog'); return dialog; }},
    method:control('role','Order method',true), waits,
    render(update) {
      Object.assign(state,update);
      for (const item of [...pending]) if (item.ready()) {
        pending.splice(pending.indexOf(item),1); item.resolve();
      }
      notify();
    },
    async waitingFor(target) {
      while (!pending.some(item => item.target === target)) await new Promise(resolve => notices.push(resolve));
    },
    expire() {
      assert(pending.length,'A bounded readiness wait must be pending');
      for (const item of pending.splice(0)) item.reject(new Error(`Order method ${item.target} readiness deadline exceeded`));
    },
    reads:() => reads,
  };
}
test('Order method accepts delayed control and both delayed correct options',async()=>{
  const form=orderForm({present:false});let done=false;
  const pending=methodReadiness()(form.page,assert).then(()=>{done=true;});
  await form.waitingFor('control');assert.equal(form.reads(),0);
  form.render({present:true});await form.waitingFor('cod');assert.equal(done,false);
  form.render({values:['cod']});await form.waitingFor('whatsapp');assert.equal(form.reads(),0);
  form.render({values:['cod','whatsapp']});await pending;assert.equal(done,true);
  assert.deepEqual(form.waits,[
    {target:'control',state:'visible',timeout:10000},
    {target:'cod',state:'attached',timeout:10000},
    {target:'whatsapp',state:'attached',timeout:10000},
  ]);assert.equal(form.reads(),1);
});
for (const [name,options,target] of [
  ['missing control',{present:false},'control'],
  ['hidden control',{visible:false},'control'],
  ['near-match label',{name:'Order method backup'},'control'],
  ['COD-only when WhatsApp is expected',{values:['cod']},'whatsapp'],
  ['wrong COD value',{values:['cash','whatsapp']},'cod'],
  ['wrong WhatsApp value',{values:['cod','chat']},'whatsapp'],
]) test(`Order method rejects ${name}`,async()=>{
  const form=orderForm(options),pending=methodReadiness()(form.page,assert);
  const rejected=assert.rejects(pending,/Order method .* readiness deadline exceeded/);
  await form.waitingFor(target);assert.equal(form.reads(),0);form.expire();await rejected;
});
for (const values of [['whatsapp','cod'],['cod','whatsapp','chat'],['cod','cod','whatsapp']])
  test(`Order method strict final assertion rejects values/order ${JSON.stringify(values)}`,async()=>{
    const form=orderForm({values});
    await assert.rejects(methodReadiness()(form.page,assert),assert.AssertionError);
    assert.equal(form.reads(),1);
  });
test('Order method rejects an ambiguous exact control',async()=>{
  const form=orderForm({count:2,values:['cod','whatsapp']});
  await assert.rejects(methodReadiness()(form.page,assert),/matched multiple controls/);
});
test('WhatsApp-disabled mode waits for COD and scoped WhatsApp removal',async()=>{
  const form=orderForm({values:['cod','whatsapp']});let done=false;
  const pending=methodReadiness(true)(form.method,assert).then(()=>{done=true;});
  await form.waitingFor('whatsapp');assert.equal(done,false);assert.equal(form.reads(),0);
  form.render({values:['cod']});await pending;assert.equal(done,true);assert.equal(form.reads(),1);
  assert.deepEqual(form.waits,[
    {target:'control',state:'visible',timeout:10000},
    {target:'cod',state:'attached',timeout:10000},
    {target:'whatsapp',state:'detached',timeout:10000},
  ]);
});
for (const [name,options,target] of [
  ['missing control',{present:false},'control'],
  ['missing COD',{values:[]},'cod'],
  ['retained WhatsApp',{values:['cod','whatsapp']},'whatsapp'],
]) test(`WhatsApp-disabled mode rejects ${name}`,async()=>{
  const form=orderForm(options),pending=methodReadiness(true)(form.method,assert);
  const rejected=assert.rejects(pending,/readiness deadline exceeded/);
  await form.waitingFor(target);form.expire();await rejected;
});
test('WhatsApp-disabled strict final assertion rejects unexpected options',async()=>{
  const form=orderForm({values:['cod','chat']});
  await assert.rejects(methodReadiness(true)(form.method,assert),assert.AssertionError);
});
test('original exact wrapped-label selector mutation reproduces empty option list',async()=>{
  const form=orderForm({values:['cod','whatsapp']});
  const original=harness.replace(/const dialog=page.getByRole\('dialog'\),method=dialog.getByRole\('combobox',\{name:'Order method',exact:true\}\);[\s\S]*?(?=          assert.deepEqual\(await method.locator\('option'\))/,"const dialog=page.getByRole('dialog'),method=dialog.getByLabel('Order method',{exact:true});\n");
  assert.notEqual(original,harness);
  await assert.rejects(methodReadiness(false,original)(form.page,assert),error => {
    assert.deepEqual(error.actual,[]);assert.deepEqual(error.expected,['cod','whatsapp']);return true;
  });assert.equal(form.waits.length,0);
});
test('Order method immediate-read mutation fails before delayed options',async()=>{
  const immediate=harness.replace(/          await method(?:\.locator\('option\[value="(?:cod|whatsapp)"\]'\))?\.waitFor\(\{state:'(?:visible|attached|detached)',timeout:10000\}\);\n/g,'');
  assert.notEqual(immediate,harness);
  const form=orderForm();
  await assert.rejects(methodReadiness(false,immediate)(form.page,assert),assert.AssertionError);
  assert.equal(form.waits.length,0);assert.equal(form.reads(),1);
});
test('Order method fix retains exact cart assertions, strict methods and no submission',()=>{
  assert(harness.includes(methodAssert));
  for(const text of ["stored.lines[0].variant_id,'RED-FREE'","stored.lines[0].qty,1","stored.attempt,null","['cod']);"])
    assert(harness.includes(text),text);
  const check=harness.split(methodStart)[1].split('        });')[0];
  assert(check.includes('s.model.whatsapp=false;'));
  assert(!/waitForTimeout|setTimeout|\.submit\(|\.request\.|\.evaluate\(|\.click\((?!\))/.test(check));
  assert(!/\.getByLabel\(|exact:false|\.first\(|\.nth\(|document\.querySelector/.test(check));
});
