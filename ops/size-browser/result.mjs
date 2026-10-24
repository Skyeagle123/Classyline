// Receipt is emitted only after independently checking actual browser evidence.
import assert from 'node:assert/strict';
import {readFile, readdir, lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {SOURCE_SHA,SOURCE_TREE,SIZE_CASES} from './fixtures.mjs';

export const WIDTHS=Object.freeze([360,768,1363]);
const cases=[
 'clean storage and interception before navigation',
 'keyboard menu, categories, Escape and focus',
 'Shop tiles, New In, Sale, Accessories and refresh',
 '21 rendered swatches, neutral fallback and borders',
 'independent dimensions, unavailable variants and exact bag ID',
 'WhatsApp/COD methods and public destination without submission',
 ...SIZE_CASES.map(c=>`${c.id} exact DOM order, color availability and identity`),
 'blocked checkout/recovery/Admin/import/unknown/external probes',
];
export const SCREENSHOTS=Object.freeze(WIDTHS.flatMap(w=>[
 'home','navigation','shop','product','cart',...SIZE_CASES.map(c=>c.id.toLowerCase()),
].map(name=>`${w}-${name}.png`)));

export function verifyResult(s,n,screenshots) {
 assert.equal(s.source_sha,SOURCE_SHA);assert.equal(s.source_tree,SOURCE_TREE);
 assert.equal(s.completed,true);assert.equal(s.error,undefined);
 assert.equal(s.planned_cases,45);assert.equal(s.total,45);assert.equal(s.passed,45);assert.equal(s.failed,0);
 assert.deepEqual(s.tests,WIDTHS.flatMap(w=>cases.map(name=>({name:`${w}: ${name}`,status:'PASS'}))));
 assert.deepEqual(s.viewports,WIDTHS.map(width=>({width,height:900,isMobile:width===360,hasTouch:width===360})));
 assert.equal(s.browser?.engine,'Chromium');assert.match(s.browser.version,/^\d+\.\d+\.\d+\.\d+$/);
 assert.equal(s.external_application_requests_forwarded,0);assert.equal(s.api_requests_reaching_static_server,0);
 assert.deepEqual(screenshots.map(x=>x.name).sort(),[...SCREENSHOTS].sort());
 for(const f of screenshots){assert.equal(f.width,Number(f.name.split('-')[0]));assert(f.height>=900);}
 assert(Array.isArray(n.serverTraffic)&&n.serverTraffic.length>0);
 for(const r of n.serverTraffic){assert(['GET','HEAD'].includes(r.method));assert(r.path!=='/api'&&!r.path.startsWith('/api/'));}
 assert.deepEqual(n.traffic.map(t=>t.width),WIDTHS);
 for(const {events} of n.traffic){
  assert.equal(events[0]?.event,'interception-installed');assert.equal(events[1]?.event,'page-created');
  assert(events.length>2);assert.deepEqual(events.map(e=>e.sequence),events.map((_,i)=>i+1));
  const forwarded=events.filter(e=>e.event==='request'&&e.action==='static');assert(forwarded.length>0);
  const origin=new URL(forwarded[0].url).origin;assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  for(const e of events.slice(2)){
   assert.equal(e.event,'request','Unexpected event or WebSocket');
   if(e.action.startsWith('block-')){assert.equal(e.expectedBlock,true);continue;}
   assert(['static','fixture-catalog','fixture-image'].includes(e.action));
   assert(['GET','HEAD'].includes(e.method),'Mutation permitted');
   assert.equal(new URL(e.url).origin,origin,'External request permitted');
  }
 }
 return {application_sha:SOURCE_SHA,application_tree:SOURCE_TREE,tests:45,passed:45,
  screenshots:39,external_forwarded:0,static_api_requests:0,mutations:0};
}

export async function verifyEvidence(output) {
 const s=JSON.parse(await readFile(join(output,'summary.json'))),n=JSON.parse(await readFile(join(output,'network.json')));
 const screenshots=[];
 for(const name of (await readdir(output)).filter(n=>n.endsWith('.png'))){
  assert((await lstat(join(output,name))).isFile(),'Screenshot must be a regular file');
  const bytes=await readFile(join(output,name));assert(bytes.length>=24);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.subarray(12,16).toString(),'IHDR');
  screenshots.push({name,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
 }
 return verifyResult(s,n,screenshots);
}
