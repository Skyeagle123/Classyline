import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {patched,apply,ORIGINAL_SHA256} from './patch-wrangler.mjs';
const require=createRequire(import.meta.url),{TARGET}=require('./create-gate.cjs');
const cli=process.env.SIZE_TEST_WRANGLER_CLI || resolve(require.resolve('wrangler/package.json'),'../wrangler-dist/cli.js');
const original=readFileSync(cli),gate=new URL('./create-gate.cjs',import.meta.url).pathname;
assert.equal(createHash('sha256').update(original).digest('hex'),ORIGINAL_SHA256);
// Only expose internals in memory in this test. Never run the CLI entry point.
const compiled=new Module(cli);compiled.filename=cli;compiled.paths=Module._nodeModulePaths(resolve(cli,'..'));
compiled._compile(patched(original,gate)+'\ninit_cfetch();exports.__size={u:import_undici,perform:performApiFetchBase};',cli);
const {u,perform}=compiled.exports.__size;
for(const scenario of ['success','UNKNOWN_ERROR','lost-response','timeout','cancel','421','redirect','malformed'])
 test('actual patched Wrangler transport: '+scenario,async()=>{
  const dir=mkdtempSync(join(tmpdir(),'size-toolchain-'));let requests=0;
  const cancelController=new AbortController();
  const server=createServer((req,res)=>{requests++;req.resume();if(scenario==='cancel')queueMicrotask(()=>cancelController.abort());if(scenario==='lost-response'){req.on('end',()=>req.socket.destroy());return;}
   if(scenario==='timeout'||scenario==='cancel')return;
   const status=scenario==='421'?421:scenario==='redirect'?307:200;
   res.writeHead(status,scenario==='redirect'?{Location:'https://api.cloudflare.com/client/v4'+TARGET}:{'Content-Type':'application/json'});
   res.end(scenario==='UNKNOWN_ERROR'?JSON.stringify({success:false,errors:[{code:8000000,message:'UNKNOWN_ERROR'}]}):scenario==='malformed'?'bad':JSON.stringify({success:true,result:{id:'synthetic'}}));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const native=new u.Agent({connections:1,pipelining:0}),before=u.getGlobalDispatcher();
  // The sole network delegate is test-only loopback. Production URL validation
  // and the real bundled fetch/replay implementation remain exercised.
  u.setGlobalDispatcher({dispatch(o,h){return native.dispatch({...o,origin:`http://127.0.0.1:${server.address().port}`},h);}});
  const oldJournal=process.env.CLASSYLINE_CREATE_JOURNAL;process.env.CLASSYLINE_CREATE_JOURNAL=join(dir,'create.json');
  try{
   const abort=scenario==='timeout'?AbortSignal.timeout(100):scenario==='cancel'?cancelController.signal:undefined;
   const call=()=>perform({},TARGET,{method:'POST',body:'synthetic'},'test',{debug(){},debugWithSanitization(){}},undefined,abort,{apiToken:'SYNTHETIC_NOT_A_CREDENTIAL'});
   let response;try{response=await call();await response.text();}catch{}
   assert.equal(requests,1,'First transport must reach loopback once');
   await assert.rejects(call());assert.equal(requests,1,'Retry must fail before transport');
  }finally{
   if(oldJournal===undefined)delete process.env.CLASSYLINE_CREATE_JOURNAL;else process.env.CLASSYLINE_CREATE_JOURNAL=oldJournal;
   u.setGlobalDispatcher(before);server.closeAllConnections();await new Promise(r=>server.close(r));await native.destroy();rmSync(dir,{recursive:true,force:true});
  }
 });
test('exact patch reconstruction, verification and tamper rejection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'size-patch-'));try{const p=join(dir,'cli.js'),o=join(dir,'original.js');writeFileSync(p,original);
 const receipt=apply(p,o);assert.equal(receipt.max_create_dispatches,1);assert.deepEqual(apply(p,o,true),receipt);
 writeFileSync(p,readFileSync(p)+'\n// modified');assert.throws(()=>apply(p,o,true),/changed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('mutation control: ungated bundled fetch replays HTTP 421',async()=>{
 let requests=0;const server=createServer((req,res)=>{requests++;req.resume();res.writeHead(requests===1?421:200);res.end('synthetic');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const agent=new u.Agent({connections:1,pipelining:0});
 try{const response=await u.fetch(`http://127.0.0.1:${server.address().port}/create`,{method:'POST',body:'synthetic',dispatcher:agent});await response.text();assert.equal(requests,2,'Mutation control must reproduce HTTP replay');}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));await agent.destroy();}
});
