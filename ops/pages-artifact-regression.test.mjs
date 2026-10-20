// Artifact-contract regressions. Fake hashes isolate packaging; the native suite
// separately verifies the pinned BLAKE3 implementation and compiler output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {multipart,verifyFunctions,prepare,verifyPlan,sha256,DirectUpload,RELEASE} from './pages-direct-upload.mjs';

const routing=Buffer.from(JSON.stringify({baseURL:'/',routes:[{routePath:'/api/:path*',mountPath:'/api',method:'',module:['api/[[path]].js:onRequest']}]}));
const routes=Buffer.from('{"version":1,"include":["/api/*"],"exclude":[]}');
const entryBytes=Buffer.from('export default {fetch(){return new Response("offline");}}');
const modulePart=(name='entry.js',type='application/javascript+module',bytes=entryBytes,file=true)=>({name,type,bytes,file});
const metadata=(main_module='entry.js')=>({name:'metadata',type:'application/json',bytes:Buffer.from(JSON.stringify({main_module}))});
const bundle=(parts=[metadata(),modulePart()])=>multipart(parts).body;
const hash=bytes=>Buffer.from(sha256(bytes),'hex');
const inputs=()=>({identity:{...RELEASE},files:[{path:'index.html',bytes:Buffer.from('hello')},{path:'site.css',bytes:Buffer.from('body{}')},{path:'_routes.json',bytes:routes}],bundle:bundle(),routing,blake3:hash});
function reseal(p) {
  p.parts.find(x=>x.name==='manifest').bytes=Buffer.from(JSON.stringify(p.manifest));
  p.evidence.manifest=p.manifest;
  p.evidence.parts=p.parts.map(x=>({name:x.name,type:x.type,file:Boolean(x.file),sha256:sha256(x.bytes)}));
  p.payload=multipart(p.parts);
  p.evidence.body_sha256=sha256(p.payload.body);p.evidence.body_bytes=p.payload.body.length;
  p.evidence.content_type=p.payload.contentType;p.planHash=sha256(JSON.stringify(p.evidence));
}
function rehash(p) {p.planHash=sha256(JSON.stringify(p.evidence));}

test('complete manifest preserves every path, exact size and SHA-256',async()=>{
  const a=inputs(),p=await prepare(a);verifyPlan(p,hash);
  assert.deepEqual(Object.keys(p.manifest),['/index.html','/site.css']);
  assert.deepEqual(p.evidence.files,a.files.map(f=>({path:f.path,size:f.bytes.length,sha256:sha256(f.bytes)})));
});
test('identical assets deduplicate content without losing manifest paths',async()=>{
  const a=inputs();a.files.push({path:'copy.html',bytes:Buffer.from('hello')});
  const p=await prepare(a);verifyPlan(p,hash);
  assert.equal(p.assets.length,2);assert.equal(p.manifest['/copy.html'],p.manifest['/index.html']);
});
test('same bytes and MIME cannot reuse a key computed for a different extension',async()=>{
  const a=inputs(),bytes=Buffer.from('offline JPEG-shaped bytes');
  a.files.push({path:'image.jpg',bytes},{path:'image.jpeg',bytes:Buffer.from(bytes)});
  const p=await prepare(a);verifyPlan(p,hash);
  assert.notEqual(p.manifest['/image.jpg'],p.manifest['/image.jpeg']);
  p.manifest['/image.jpeg']=p.manifest['/image.jpg'];
  p.assets=p.assets.filter(asset=>asset.path!=='image.jpeg');
  p.evidence.assets=p.evidence.assets.filter(asset=>asset.path!=='image.jpeg');
  reseal(p);
  assert.throws(()=>verifyPlan(p,hash),/Manifest file provenance mismatch/);
});
test('special files use exact multipart bytes and never static manifest entries',async()=>{
  const a=inputs();a.files.push({path:'_headers',bytes:Buffer.from('/api/*\n  Cache-Control: no-store\n')},
    {path:'_redirects',bytes:Buffer.from('/old /new 302\n')});
  const p=await prepare(a);verifyPlan(p,hash);
  for(const f of a.files.filter(f=>f.path.startsWith('_'))) {
    assert.equal(p.manifest['/'+f.path],undefined);
    assert.deepEqual(p.parts.find(x=>x.name===f.path).bytes,f.bytes);
  }
});
for(const scenario of ['omitted file','extra path','duplicate recorded path','case collision','unsafe path','wrong file size','wrong file hash','wrong body size','extra asset'])
  test(`self-consistent plan rejects ${scenario}`,async()=>{
    const p=await prepare(inputs());
    if(scenario==='omitted file') {
      delete p.manifest['/site.css'];
      p.assets=p.assets.filter(a=>a.path!=='site.css');p.evidence.assets=p.evidence.assets.filter(a=>a.path!=='site.css');
    }
    if(scenario==='extra path')p.manifest['/extra.html']=p.manifest['/index.html'];
    if(scenario==='duplicate recorded path')p.evidence.files.push({...p.evidence.files[0]});
    if(scenario==='case collision')p.evidence.files.push({...p.evidence.files[0],path:'INDEX.HTML'});
    if(scenario==='unsafe path')p.evidence.files[1].path='../site.css';
    if(scenario==='wrong file size')p.evidence.files[0].size++;
    if(scenario==='wrong file hash')p.evidence.files[0].sha256='0'.repeat(64);
    if(scenario==='extra asset'){p.assets.push({...p.assets[0]});p.evidence.assets.push({...p.evidence.assets[0]});}
    reseal(p);
    if(scenario==='wrong body size'){p.evidence.body_bytes++;rehash(p);}
    assert.throws(()=>verifyPlan(p,hash));
  });
test('duplicate path names in serialized manifest JSON are rejected',async()=>{
  const p=await prepare(inputs()),key=p.manifest['/index.html'];
  p.parts.find(x=>x.name==='manifest').bytes=Buffer.from(`{"/index.html":"${key}","/index.html":"${key}","/site.css":"${p.manifest['/site.css']}"}`);
  p.evidence.parts=p.parts.map(x=>({name:x.name,type:x.type,file:Boolean(x.file),sha256:sha256(x.bytes)}));
  p.payload=multipart(p.parts);p.evidence.body_sha256=sha256(p.payload.body);p.evidence.body_bytes=p.payload.body.length;
  p.evidence.content_type=p.payload.contentType;rehash(p);
  assert.throws(()=>verifyPlan(p,hash),/Payload release\/manifest mismatch/);
});
for(const scenario of ['changed special bytes','missing special part','extra special part','extra payload override','duplicate special record'])
  test(`special-file contract rejects ${scenario}`,async()=>{
    const a=inputs();a.files.push({path:'_headers',bytes:Buffer.from('original')});const p=await prepare(a);
    if(scenario==='changed special bytes')p.parts.find(x=>x.name==='_headers').bytes=Buffer.from('changed');
    if(scenario==='missing special part')p.parts=p.parts.filter(x=>x.name!=='_headers');
    if(scenario==='extra special part')p.parts.push({name:'_redirects',type:'text/plain',file:true,bytes:Buffer.from('extra')});
    if(scenario==='extra payload override')p.parts.push({name:'_worker.js',type:'application/javascript+module',file:true,bytes:entryBytes});
    if(scenario==='duplicate special record')p.evidence.files.push({...p.evidence.files.find(f=>f.path==='_headers')});
    reseal(p);assert.throws(()=>verifyPlan(p,hash));
  });
for(const scenario of ['metadata entry','missing entry','text entry','wasm entry','data entry','empty entry','field instead of file','duplicate module','duplicate metadata','no executable module'])
  test(`Functions reject ${scenario}`,async()=>{
    let parts=[metadata(),modulePart()];
    if(scenario==='metadata entry')parts=[metadata('metadata')];
    if(scenario==='missing entry')parts=[metadata('missing.js'),modulePart()];
    if(scenario==='text entry')parts=[metadata(),modulePart('entry.js','text/plain')];
    if(scenario==='wasm entry')parts=[metadata(),modulePart('entry.js','application/wasm')];
    if(scenario==='data entry')parts=[metadata(),modulePart('entry.js','application/octet-stream')];
    if(scenario==='empty entry')parts=[metadata(),modulePart('entry.js','application/javascript+module',Buffer.alloc(0))];
    if(scenario==='field instead of file')parts=[metadata(),modulePart('entry.js','application/javascript+module',entryBytes,false)];
    if(scenario==='duplicate module')parts.push(modulePart());
    if(scenario==='duplicate metadata')parts.push(metadata());
    if(scenario==='no executable module')parts=[metadata()];
    await assert.rejects(verifyFunctions(bundle(parts),routing,routes));
  });
test('Functions preserve exact executable and auxiliary module bytes and hashes',async()=>{
  const helper=Buffer.from('text fixture'),b=bundle([metadata(),modulePart(),modulePart('fixture.txt','text/plain',helper)]);
  const evidence=await verifyFunctions(b,routing,routes);
  assert.deepEqual(evidence.modules,[{name:'entry.js',type:'application/javascript+module',size:entryBytes.length,sha256:sha256(entryBytes)},
    {name:'fixture.txt',type:'text/plain',size:helper.length,sha256:sha256(helper)}]);
  assert.equal(evidence.bundle_sha256,sha256(b));assert.equal(evidence.routing_sha256,sha256(routing));
});
test('reloaded plan revalidates executable entry before journal, checkpoint or HTTP',async()=>{
  const p=await prepare(inputs()),bad=bundle([metadata('metadata')]);
  p.parts.find(x=>x.name==='_worker.bundle').bytes=bad;
  p.evidence.functions={...p.evidence.functions,metadata:{main_module:'metadata'},modules:[],bundle_sha256:sha256(bad)};
  reseal(p);verifyPlan(p,hash); // Hash consistency alone is deliberately insufficient.
  let claims=0,checkpoints=0,requests=0;
  const upload=new DirectUpload({token:'offline',request:()=>{requests++;}});
  await assert.rejects(upload.stageAndCreate({plan:p,blake3:hash,journal:{claim(){claims++;}},
    controlSHA:'437f806c59a63088e94f7235603d900b69b625e0',checkpoint:async()=>{checkpoints++;return true;}}),/Functions main module missing/);
  assert.deepEqual({claims,checkpoints,requests},{claims:0,checkpoints:0,requests:0});
});
test('self-consistent recorded module evidence must match parsed exact module bytes',async()=>{
  const p=await prepare(inputs());p.evidence.functions.modules[0].sha256='0'.repeat(64);rehash(p);
  verifyPlan(p,hash);let touched=false;
  await assert.rejects(new DirectUpload({token:'offline',request(){touched=true;}}).stageAndCreate({
    plan:p,blake3:hash,journal:{claim(){touched=true;}},checkpoint:async()=>{touched=true;return true;}
  }),/Functions module evidence mismatch/);
  assert.equal(touched,false);
});
test('plan changes during asynchronous Functions parsing fail before journal or HTTP',async()=>{
  const p=await prepare(inputs());let touched=false;
  const operation=new DirectUpload({token:'offline',request(){touched=true;}}).stageAndCreate({
    plan:p,blake3:hash,journal:{claim(){touched=true;}},checkpoint:async()=>{touched=true;return true;}
  });
  p.payload.body[0]^=1;
  await assert.rejects(operation,/Payload\/manifest provenance mismatch/);
  assert.equal(touched,false);
});
