import assert from 'node:assert/strict';
export async function assertSizeOrder(page, expected) {
 await page.waitForFunction(labels=>{
  const buttons=[...document.querySelectorAll('button[aria-label^="Size: "]')];
  return buttons.length===labels.length && buttons.every((b,i)=>b.textContent.trim()===labels[i]);
 },expected,{timeout:10000});
 const actual=await page.locator('button[aria-label^="Size: "]').evaluateAll(els=>els.map(e=>e.textContent.trim()));
 assert.deepEqual(actual,expected);
}

export function assertFixtureCart(cart,fixture,labels) {
 assert.equal(cart.lines.length,labels.length,'Merged or extra variants in cart');
 assert.deepEqual(cart.lines.map(l=>l.variant_id).sort(),labels.map(label=>`${fixture.id}-Blue-${fixture.input.indexOf(label)}`).sort());
 assert(cart.lines.every(l=>l.qty===1));assert.equal(cart.attempt,null);
}
