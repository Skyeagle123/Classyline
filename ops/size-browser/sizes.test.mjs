import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SIZE_CASES,sizeProducts,SOURCE_SHA,SOURCE_TREE} from './fixtures.mjs';
import {assertSizeOrder,assertFixtureCart} from './size-readiness.mjs';
function pageDouble(frames,final=frames.at(-1)) {
 let waited=false,iterations=0;
 return {get iterations(){return iterations;},async waitForFunction(predicate,labels,options){
  assert.equal(options.timeout,10000);
  for(const frame of frames){iterations++;const buttons=frame.map(text=>({textContent:text}));
   const value=vm.runInNewContext(`(${predicate.toString()})(labels)`,{labels,document:{querySelectorAll:()=>buttons}});
   if(value){waited=true;return;}}
  throw Error('bounded readiness timeout');
 },locator(selector){assert.equal(selector,'button[aria-label^="Size: "]');return {async evaluateAll(fn){assert(waited);return fn(final.map(text=>({textContent:text})));}};}};
}
for(const c of SIZE_CASES) {
 test(`${c.id}: delayed exact DOM labels accepted`,async()=>{const p=pageDouble([[],c.input,c.expected]);await assertSizeOrder(p,c.expected);assert(p.iterations>=2);});
 for(const [name,actual] of [['missing',c.expected.slice(1)],['reordered',[...c.expected].reverse()],['duplicate',[...c.expected,c.expected[0]]]])
  test(`${c.id}: ${name} DOM rejected`,async()=>assert.rejects(assertSizeOrder(pageDouble([actual]),c.expected),/timeout/));
}
test('strict final DOM assertion rejects change after readiness',async()=>{
 await assert.rejects(assertSizeOrder(pageDouble([['4','4Y','4y']],['4','4y','4Y']),['4','4Y','4y']));
});
test('fixture size identities, product links, price, stock and colors remain distinct',()=>{
 const products=sizeProducts(),ids=new Set();
 for(const p of products){assert.equal(p.price_cents,3800);for(const v of p.variants){assert(!ids.has(v.id));ids.add(v.id);assert.equal(v.product_id,p.id);assert(['Red','Blue'].includes(v.color));assert([0,2].includes(v.stock));}}
 const p=products.find(p=>p.id==='SIZE-IDENTITIES');
 for(const label of ['4','4Y','4y'])assert.equal(p.variants.filter(v=>v.size===label).length,2);
 const special=products.find(p=>p.id==='SIZE-SPECIAL');assert.equal(new Set(special.variants.map(v=>v.size)).size,3);
});
test('application identity is exact merged source and tree',()=>{
 assert.equal(SOURCE_SHA,'00b25b282d66818632a2d214e7a52ffbd0f8a1cb');
 assert.equal(SOURCE_TREE,'823de98f6faa7fcb65ea980f771f1c7318561694');
});

const identity=SIZE_CASES.find(c=>c.id==='SIZE-IDENTITIES');
const identityCart=()=>({lines:['4','4Y','4y'].map(label=>({variant_id:`${identity.id}-Blue-${identity.input.indexOf(label)}`,qty:1})),attempt:null});
test('cart oracle retains all 4/4Y/4y identities',()=>assertFixtureCart(identityCart(),identity,['4','4Y','4y']));
for(const mutation of ['merged','wrong-id','quantity','checkout-attempt','cross-product'])test('cart oracle rejects '+mutation,()=>{
 const cart=identityCart();if(mutation==='merged')cart.lines.pop();if(mutation==='wrong-id')cart.lines[1].variant_id=cart.lines[0].variant_id;if(mutation==='quantity')cart.lines[0].qty=2;if(mutation==='checkout-attempt')cart.attempt={id:'bad'};if(mutation==='cross-product')cart.lines[1].variant_id='SIZE-OTHER-Blue-0';
 assert.throws(()=>assertFixtureCart(cart,identity,['4','4Y','4y']));
});
