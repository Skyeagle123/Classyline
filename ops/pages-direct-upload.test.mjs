// Real local HTTP fault injection. All sockets bind loopback; no Cloudflare calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {RELEASE,ROOT,prepare,pagesKey,verifyPlan,verifyFunctions,multipart,sha256,inventory,
  assertInventory,AttemptJournal,DirectUpload,requestOnce,deploymentIdentity} from './pages-direct-upload.mjs';
import {pinnedHash} from './pages-release-artifacts.mjs';

const application=resolve(process.env.CLASSYLINE_TEST_APPLICATION??process.cwd());
const blake3=pinnedHash(application), req=createRequire(join(application,'package.json'));
const CONTROL='437f806c59a63088e94f7235603d900b69b625e0';
const ID='12345678-0000-4000-8000-000000000001', SECRET='FAKE_SECRET_MUST_NEVER_APPEAR_IN_EVIDENCE';
const route=Buffer.from(JSON.stringify({routes:[{routePath:'/api/:path*',mountPath:'/api',method:'',module:['api/[[path]].js:onRequest']}],baseURL:'/'}));
const routes=Buffer.from('{"version":1,"include":["/api/*"],"exclude":[]}');
function bundle() {
  return multipart([{name:'metadata',type:'application/json',bytes:Buffer.from('{"main_module":"worker.js"}')},
    {name:'worker.js',type:'application/javascript+module',bytes:Buffer.from('export default {fetch(){return new Response("offline");}}'),file:true}]).body;
}
function argumentsForPlan() {
  return {identity:{...RELEASE},files:[{path:'index.html',bytes:Buffer.from('hello')},
    {path:'assets/site.css',bytes:Buffer.from('body{}')},{path:'_routes.json',bytes:routes}],bundle:bundle(),routing:route,blake3};
}
function deployed() {
  return {id:ID,project_id:RELEASE.projectID,project_name:RELEASE.project,environment:'production',
    deployment_trigger:{metadata:{branch:'main',commit_hash:RELEASE.sha,commit_dirty:false}},
    latest_stage:{name:'deploy',status:'success'},is_skipped:false,uses_functions:true,
    compatibility_date:RELEASE.date,compatibility_flags:[],url:`https://${ID.slice(0,8)}.classyline2.pages.dev`,
    d1_databases:{DB:{id:RELEASE.database}},r2_buckets:{PRODUCT_IMAGES:{name:RELEASE.bucket}}};
}
async function faultServer(scenario,plan) {
  const calls=[],sockets=new Set();let observed=false;
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const bytes=Buffer.concat(chunks),path=req.url.replace('/client/v4','');
    calls.push({method:req.method,path,sha256:sha256(bytes)});
    function reply(result) {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({success:true,result}));}
    if(path===ROOT+'/upload-token') {
      const claims=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+300,max_file_count_allowed:20000})).toString('base64url');
      reply({jwt:`header.${claims}.signature`});
    } else if(path==='/pages/assets/check-missing') {
      const hashes=JSON.parse(bytes).hashes;reply(scenario==='unknown-missing-key'?['unplanned']:hashes);
    } else if(path==='/pages/assets/upload') {
      if(scenario==='asset-reset'){req.socket.destroy();return;}
      for(const asset of JSON.parse(bytes)) {
        const original=plan.assets.find(a=>a.key===asset.key);
        assert(original);assert.equal(asset.value,original.bytes.toString('base64'));
        assert.equal(asset.metadata.contentType,original.contentType);assert.equal(asset.base64,true);
      }
      reply(null);
    } else if(path==='/pages/assets/upsert-hashes') reply(null);
    else if(path===ROOT+'/deployments' && req.method==='POST') {
      observed=true;server.emit('creation-seen');
      assert.deepEqual(bytes,plan.payload.body);
      assert.equal(req.headers['content-type'],plan.payload.contentType);
      if(scenario==='timeout')return;
      if(scenario==='reset'){req.socket.destroy();return;}
      if(scenario==='http-503'){res.writeHead(503);res.end(SECRET);return;}
      if(scenario==='redirect'){res.writeHead(307,{location:`http://127.0.0.1:${server.address().port}/redirect-target`});res.end();return;}
      if(scenario==='malformed'){res.end('{'+SECRET);return;}
      if(scenario==='partial'){res.writeHead(200,{'content-length':9999});res.write('{');req.socket.destroy();return;}
      if(scenario==='large-response'){res.end('x'.repeat(4096));return;}
      if(scenario==='ambiguous'){reply({});return;}
      reply({id:ID});
    } else if(req.method==='GET' && path===ROOT+'/deployments') {
      const d=deployed();reply(observed?[d]:[]);
    } else if(req.method==='GET' && (path===ROOT || path===ROOT+'/deployments/'+ID)) {
      const d=deployed();
      if(scenario==='bad-binding')d.d1_databases.DB.id='staging';
      if(scenario==='extra-binding')d.r2_buckets.EXTRA={name:'other'};
      reply(path===ROOT?{canonical_deployment:d}:d);
    } else {res.writeHead(404);res.end();}
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {calls,events:server,port:server.address().port,request:options=>requestOnce({...options,hostname:'127.0.0.1',port:server.address().port,secure:false,
    timeoutMs:200,maxResponse:scenario==='large-response'?1024:4*1024*1024}),
    close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}};
}
for(const scenario of ['success','timeout','reset','http-503','redirect','malformed','partial','large-response','ambiguous','asset-reset','unknown-missing-key','bad-binding','extra-binding'])
  test(`actual HTTP single-use transport: ${scenario}`,async()=>{
    const plan=await prepare(argumentsForPlan()),dir=mkdtempSync(join(tmpdir(),'classyline-http-'));
    const server=await faultServer(scenario,plan);
    try {
      const upload=new DirectUpload({request:server.request,token:SECRET});
      let preflights=0,result,error;
      const options={plan,blake3,journal:new AttemptJournal(dir),controlSHA:CONTROL,
        checkpoint:async intent=>{assert.equal(intent.consumed,true);return true;},
        preflight:async()=>{preflights++;return [];},
        reconcile:async({read})=>{
          const history=(await read(ROOT+'/deployments')).result;assert.equal(history.length,1);
          const d=(await read(ROOT+'/deployments/'+ID)).result;
          const final=(await read(ROOT)).result.canonical_deployment;
          deploymentIdentity(final);assert.equal(final.id,d.id);return d;
        }};
      try {result=await upload.execute(options);}catch(e){error=e;}
      assert.equal(Boolean(result?.accepted),scenario==='success');
      if(scenario!=='success')assert(error);
      const creations=server.calls.filter(c=>c.method==='POST'&&c.path===ROOT+'/deployments');
      assert.equal(creations.length,['asset-reset','unknown-missing-key'].includes(scenario)?0:1);
      const createIndex=server.calls.findIndex(c=>c.method==='POST'&&c.path===ROOT+'/deployments');
      if(createIndex>=0)assert(server.calls.slice(createIndex+1).every(c=>c.method==='GET'));
      assert(!server.calls.some(c=>c.path==='/redirect-target'));
      assert.equal(preflights,['asset-reset','unknown-missing-key'].includes(scenario)?1:2);
      const count=server.calls.length;
      await assert.rejects(upload.execute(options),/already consumed/);assert.equal(server.calls.length,count);
      await assert.rejects(new DirectUpload({request:server.request,token:SECRET}).execute(options),/consumed/);
      assert.equal(server.calls.length,count);
      assert(!JSON.stringify(result??{}).includes(SECRET));assert(!String(error).includes(SECRET));
      assert(!readFileSync(join(dir,RELEASE.sha+'.consumed.json'),'utf8').includes(SECRET));
    } finally {await server.close();rmSync(dir,{recursive:true,force:true});}
  });
test('BLAKE3 golden key and extension-sensitive Wrangler helper parity',()=>{
  assert.equal(pagesKey(Buffer.from('hello'),'index.html',blake3),'a2b82584e50075886b08927390f2f573');
  for(const [path,bytes] of [['a.js',Buffer.alloc(0)],['a.png',Buffer.from([0,255,128])],['a.woff2',Buffer.alloc(8192,7)]]) {
    const expected=req('blake3-wasm').hash(bytes.toString('base64')+path.split('.').at(-1)).toString('hex').slice(0,32);
    assert.equal(pagesKey(bytes,path,blake3),expected);
  }
  assert.notEqual(pagesKey(Buffer.from('same'),'x.js',blake3),pagesKey(Buffer.from('same'),'x.css',blake3));
});
for(const field of ['account','project','branch','sha','tree','database','bucket'])
  test(`reject arbitrary ${field} before transport`,async()=>{
    const args=argumentsForPlan();args.identity[field]='unapproved';await assert.rejects(prepare(args),/identity/);
  });
for(const scenario of ['asset-bytes','asset-key','manifest','body','MIME','extra-asset'])
  test(`reject changed plan: ${scenario}`,async()=>{
    const p=await prepare(argumentsForPlan());
    if(scenario==='asset-bytes')p.assets[0].bytes[0]^=1;
    if(scenario==='asset-key')p.assets[0].key='bad';
    if(scenario==='manifest')p.manifest['/index.html']='bad';
    if(scenario==='body')p.payload.body[0]^=1;
    if(scenario==='MIME')p.assets[0].contentType='text/plain';
    if(scenario==='extra-asset')p.assets.push({...p.assets[0],path:'other.html'});
    assert.throws(()=>verifyPlan(p,blake3));
  });
for(const scenario of ['routing','routes','binding-override','missing-module','duplicate-module'])
  test(`reject mismatched Functions package: ${scenario}`,async()=>{
    const args=argumentsForPlan();
    if(scenario==='routing')args.routing=Buffer.from('{"baseURL":"/","routes":[]}');
    if(scenario==='routes')args.files[2].bytes=Buffer.from('{"version":1,"include":["/*"],"exclude":[]}');
    if(scenario==='binding-override')args.bundle=multipart([{name:'metadata',type:'application/json',bytes:Buffer.from('{"main_module":"worker.js","bindings":[]}')}]).body;
    if(scenario==='missing-module')args.bundle=multipart([{name:'metadata',type:'application/json',bytes:Buffer.from('{"main_module":"absent.js"}')}]).body;
    if(scenario==='duplicate-module')args.bundle=multipart([{name:'metadata',type:'application/json',bytes:Buffer.from('{"main_module":"worker.js"}')},...Array(2).fill({name:'worker.js',type:'application/javascript+module',bytes:Buffer.from('export default {}'),file:true})]).body;
    await assert.rejects(prepare(args));
  });
test('payload round-trip preserves exact static manifest, Functions and routing bytes',async()=>{
  const a=argumentsForPlan(),p=await prepare(a);
  const form=await new Response(p.payload.body,{headers:{'content-type':p.payload.contentType}}).formData();
  assert.deepEqual(JSON.parse(form.get('manifest')),{...p.manifest});
  assert.deepEqual(Buffer.from(await form.get('_worker.bundle').arrayBuffer()),a.bundle);
  assert.deepEqual(Buffer.from(await form.get('functions-filepath-routing-config.json').arrayBuffer()),a.routing);
  assert.equal(form.get('branch'),'main');assert.equal(form.get('commit_hash'),RELEASE.sha);
  assert.equal(form.get('commit_dirty'),'false');verifyPlan(p,blake3);
});
test('self-consistent audit hash cannot disguise a manifest different from frozen multipart',async()=>{
  const p=await prepare(argumentsForPlan());
  [p.manifest['/index.html'],p.manifest['/assets/site.css']]=[p.manifest['/assets/site.css'],p.manifest['/index.html']];
  p.planHash=sha256(JSON.stringify(p.evidence));
  assert.throws(()=>verifyPlan(p,blake3),/manifest mismatch/);
});
test('changing a frozen Functions part is rejected before any request',async()=>{
  const p=await prepare(argumentsForPlan());
  p.parts.find(x=>x.name==='_worker.bundle').bytes=Buffer.from('wrong bundle');
  assert.throws(()=>verifyPlan(p,blake3),/part provenance/);
});
test('no durable checkpoint means zero requests, including on a fresh runner directory',async()=>{
  const p=await prepare(argumentsForPlan());let requests=0;
  for(let i=0;i<2;i++) {
    const dir=mkdtempSync(join(tmpdir(),'classyline-runner-loss-'));
    try {await assert.rejects(new DirectUpload({request:()=>{requests++;},token:SECRET}).stageAndCreate({
      plan:p,blake3,journal:new AttemptJournal(dir),controlSHA:CONTROL,checkpoint:async()=>false}),/checkpoint/);}
    finally {rmSync(dir,{recursive:true,force:true});}
  }
  assert.equal(requests,0);
});
test('SIGKILL after fsync: independent replacement process cannot reclaim attempt',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'classyline-crash-')),module=pathToFileURL(resolve('ops/pages-direct-upload.mjs')).href;
  const source=`import {AttemptJournal,RELEASE} from ${JSON.stringify(module)};const p={planHash:'offline',payload:{body:Buffer.from('offline')}};new AttemptJournal(${JSON.stringify(dir)}).claim(p,${JSON.stringify(CONTROL)});console.log('durably-consumed');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
  try {
    await once(child.stdout,'data');const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    const journal=JSON.parse(readFileSync(join(dir,RELEASE.sha+'.consumed.json')));assert.equal(journal.consumed,true);
    const restarted=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:2000,env:{PATH:process.env.PATH}});
    assert.notEqual(restarted.status,0);assert.match(restarted.stderr,/consumed/);
  } finally {child.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});}
});
test('SIGKILL after server received creation: replacement process sends no second POST',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'classyline-post-crash-')),p=await prepare(argumentsForPlan());
  const server=await faultServer('timeout',p);
  const mod=pathToFileURL(resolve('ops/pages-direct-upload.mjs')).href;
  const helper=pathToFileURL(resolve('ops/pages-release-artifacts.mjs')).href;
  const raw={...p,assets:p.assets.map(a=>({...a,bytes:a.bytes.toString('base64')})),parts:p.parts.map(a=>({...a,bytes:a.bytes.toString('base64')})),payload:{...p.payload,body:p.payload.body.toString('base64')}};
  const source=`import {DirectUpload,AttemptJournal,requestOnce} from ${JSON.stringify(mod)};
    import {pinnedHash} from ${JSON.stringify(helper)};
    const p=${JSON.stringify(raw)};p.assets=p.assets.map(a=>({...a,bytes:Buffer.from(a.bytes,'base64')}));p.parts=p.parts.map(a=>({...a,bytes:Buffer.from(a.bytes,'base64')}));p.payload.body=Buffer.from(p.payload.body,'base64');
    const request=o=>requestOnce({...o,hostname:'127.0.0.1',secure:false,port:${server.port},timeoutMs:10000});
    try {await new DirectUpload({request,token:'FAKE'}).stageAndCreate({plan:p,blake3:pinnedHash(${JSON.stringify(application)}),journal:new AttemptJournal(${JSON.stringify(dir)}),controlSHA:${JSON.stringify(CONTROL)},checkpoint:async()=>true,preflight:async()=>[]});}
    catch {console.error('Consumed attempt refused or uncertain');process.exitCode=1;}`;
  const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
  try {
    await once(server.events,'creation-seen');const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    const restarted=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
    const [status]=await once(restarted,'exit');assert.equal(status,1);
    assert.equal(server.calls.filter(c=>c.method==='POST'&&c.path===ROOT+'/deployments').length,1);
  } finally {child.kill('SIGKILL');await server.close();rmSync(dir,{recursive:true,force:true});}
});
test('missing, extra, renamed and mismatched deployed bindings fail closed',()=>{
  for(const mutate of [d=>delete d.d1_databases,d=>d.r2_buckets.PRODUCT_IMAGES.name='preview',
    d=>d.d1_databases.EXTRA={id:'x'},d=>d.r2_buckets={OTHER:{name:RELEASE.bucket}}]) {
    const d=deployed();mutate(d);assert.throws(()=>deploymentIdentity(d),/binding/);
  }
});
test('inventory detects new files and rejects symlinks',()=>{
  const dir=mkdtempSync(join(tmpdir(),'classyline-inventory-'));
  try {
    writeFileSync(join(dir,'index.html'),'a');const files=inventory(dir),record=files.map(f=>({path:f.path,sha256:sha256(f.bytes)}));
    assertInventory(files,record);writeFileSync(join(dir,'new.css'),'a');assert.throws(()=>assertInventory(inventory(dir),record));
    symlinkSync('/etc/hosts',join(dir,'unsafe.txt'));assert.throws(()=>inventory(dir),/Unsafe/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('transport rejects arbitrary hosts and schemes',()=>{
  assert.throws(()=>requestOnce({hostname:'attacker.invalid',path:'/',method:'POST',body:Buffer.alloc(0)}));
  assert.throws(()=>requestOnce({hostname:'api.cloudflare.com',secure:false,port:80,path:'/'}));
});
test('pinned Wrangler offline compiler produces an accepted complete Functions payload',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'classyline-compiler-'));
  try {
    const wrangler=dirname(req.resolve('wrangler/package.json'));
    assert.equal(JSON.parse(readFileSync(join(wrangler,'package.json'))).version,'4.150.0');
    mkdirSync(join(dir,'functions/api'),{recursive:true});mkdirSync(join(dir,'dist'));
    writeFileSync(join(dir,'functions/api/[[path]].js'),'export async function onRequest() { return new Response("offline"); }');
    const r=spawnSync(process.execPath,[join(wrangler,'bin/wrangler.js'),'pages','functions','build',
      '--outfile',join(dir,'worker.bundle'),'--output-config-path',join(dir,'routing.json'),
      '--build-output-directory',join(dir,'dist'),'--compatibility-date',RELEASE.date],
      {cwd:dir,env:{PATH:process.env.PATH,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:30000});
    assert.equal(r.status,0,r.stderr);
    const args=argumentsForPlan();args.bundle=readFileSync(join(dir,'worker.bundle'));args.routing=readFileSync(join(dir,'routing.json'));
    const p=await prepare(args);assert(p.evidence.functions.modules.length>0);verifyPlan(p,blake3);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
