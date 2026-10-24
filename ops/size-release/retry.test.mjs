import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {patched,ORIGINAL_SHA256,apply} from './patch-wrangler.mjs';
const require=createRequire(import.meta.url),{createDispatcher,TARGET}=require('./create-gate.cjs');
const options={origin:'https://api.cloudflare.com',path:'/client/v4'+TARGET,method:'POST'};
for(const outcome of ['timeout','lost response','UNKNOWN_ERROR','cancellation','ambiguous 200','success'])
 test('persistent transport claim prevents replay after '+outcome,()=>{
  const dir=mkdtempSync(join(tmpdir(),'size-gate-')),journal=join(dir,'create.json');let sent=0;
  try{const delegate={dispatch(o){sent++;assert.equal(o.idempotent,false);assert.equal(o.maxRedirections,0);if(outcome!=='success')throw Error(outcome);return true;}};
   const first=createDispatcher(delegate,journal);if(outcome==='success')first.dispatch(options,{});else assert.throws(()=>first.dispatch(options,{}));
   assert.throws(()=>first.dispatch(options,{}),/EEXIST/);
   assert.throws(()=>createDispatcher(delegate,journal).dispatch(options,{}),/EEXIST/);
   assert.equal(sent,1);assert.equal(JSON.parse(readFileSync(journal)).consumed,true);
   const r=spawnSync(process.execPath,['-e',`require(${JSON.stringify(new URL('./create-gate.cjs',import.meta.url).pathname)}).claim(process.argv[1])`,journal],{encoding:'utf8'});
   assert.notEqual(r.status,0);assert.match(r.stderr,/EEXIST/);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
test('concurrent create attempts admit at most one transport dispatch',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'size-gate-'));let sent=0;
 try{const gate=createDispatcher({dispatch(){sent++;return true;}},join(dir,'claim'));
 const results=await Promise.allSettled(Array.from({length:20},()=>Promise.resolve().then(()=>gate.dispatch(options,{}))));
 assert.equal(sent,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const changed of [{method:'GET'},{origin:'https://other.test'},{path:'/client/v4'+TARGET+'?retry=1'}])
 test('unexpected transport target rejected '+JSON.stringify(changed),()=>{
 const dir=mkdtempSync(join(tmpdir(),'size-gate-'));try{assert.throws(()=>createDispatcher({dispatch(){assert.fail();}},join(dir,'claim')).dispatch({...options,...changed},{}));}finally{rmSync(dir,{recursive:true,force:true});}
 });
test('missing journal blocks before transport',()=>assert.throws(()=>createDispatcher({dispatch(){assert.fail();}},undefined).dispatch(options,{})));
// Exercise the native fetch HTTP 421 replay path against loopback only. The gate
// sees the exact Production API target; its delegate rewrites only in this test.
for(const status of [421,307,500,200])test('real fetch status '+status+' never reaches loopback twice',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'size-fetch-'));let requests=0;
 const server=createServer((req,res)=>{requests++;req.resume();res.writeHead(status,status===307?{Location:'https://api.cloudflare.com/client/v4'+TARGET}:{});res.end(status===200?'not-json':'uncertain');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await fetch('data:,initialize');const native=globalThis[Symbol.for('undici.globalDispatcher.1')];assert(native);
 const loopback=`http://127.0.0.1:${server.address().port}`;
 const gate=createDispatcher({dispatch(o,h){return native.dispatch({...o,origin:loopback},h);}},join(dir,'claim'));
 await fetch('https://api.cloudflare.com/client/v4'+TARGET,{method:'POST',body:'synthetic',redirect:'error',dispatcher:gate,signal:AbortSignal.timeout(2000)}).catch(()=>{});
 assert.equal(requests,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
test('unknown CLI bytes are rejected without patching',()=>assert.throws(()=>patched(Buffer.from('wrong'),'/tmp/gate'),/drift/));
