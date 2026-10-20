import test from 'node:test';
import assert from 'node:assert/strict';
import {multipart,verifyFunctions,prepare,verifyPlan,sha256} from './pages-direct-upload.mjs';
import {RELEASE} from './pages-direct-upload.mjs';

const routing=Buffer.from(JSON.stringify({baseURL:'/',routes:[{routePath:'/api/:path*',mountPath:'/api',method:'',module:['api/[[path]].js:onRequest']}]}));
const routes=Buffer.from('{"version":1,"include":["/api/*"],"exclude":[]}');
const bundle=()=>multipart([{name:'metadata',type:'application/json',bytes:Buffer.from('{"main_module":"entry.js"}')},{name:'entry.js',type:'application/javascript+module',bytes:Buffer.from('export default {}'),file:true}]).body;
const hash=bytes=>Buffer.from(sha256(bytes),'hex');
const inputs=()=>({identity:{...RELEASE},files:[{path:'index.html',bytes:Buffer.from('hello')},{path:'site.css',bytes:Buffer.from('body{}')},{path:'_routes.json',bytes:routes}],bundle:bundle(),routing,blake3:hash});
test('metadata cannot be the executable module',async()=>{
  const bad=multipart([{name:'metadata',type:'application/json',bytes:Buffer.from('{"main_module":"metadata"}')}]).body;
  await assert.rejects(verifyFunctions(bad,routing,routes),/Functions main module missing/);
});
test('manifest must cover every ordinary recorded file',async()=>{
  const p=await prepare(inputs());
  delete p.manifest['/site.css'];
  delete p.evidence.manifest['/site.css'];
  p.parts.find(x=>x.name==='manifest').bytes=Buffer.from(JSON.stringify(p.manifest));
  p.evidence.parts=p.parts.map(x=>({name:x.name,type:x.type,file:Boolean(x.file),sha256:sha256(x.bytes)}));
  p.payload=multipart(p.parts);
  p.evidence.body_sha256=sha256(p.payload.body);
  p.evidence.content_type=p.payload.contentType;
  p.planHash=sha256(Buffer.from(JSON.stringify(p.evidence)));
  assert.throws(()=>verifyPlan(p,hash),/Incomplete static manifest coverage/);
});
