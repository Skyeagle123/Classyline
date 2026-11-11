// Synthetic, local-only data. No customer records or live image references.
export const SOURCE_SHA = '7d978f3ab539efb89a4cd5a2c44abe87775c4451';
export const SOURCE_TREE = '75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8';
export const NUMBER = '96178719771';
export const COLORS = Object.freeze({
  Red: '#a23c43', 'Light Blue': '#a8c7df', Cream: '#fff2d5', Teal: '#287e80',
  'Olive Green': '#6b7040', 'Light Grey': '#d3d3d3', 'Navy Blue': '#27394e',
  Magenta: '#b52682', Burgundy: '#7c263b', Bordeaux: '#7c263b', Beige: '#d7c2a3',
  Black: '#241e1b', 'Charcoal Grey': '#45474b', 'Chocolate Brown': '#664133',
  'Cream Beige': '#e7d8ba', 'Emerald Green': '#227354', Ivory: '#f6f1e8',
  Pink: '#c9a39b', 'Rose Pink': '#d28fa4', 'Washed Blue': '#809bb4', White: '#fff',
});
const variant = (id, color, size, stock = 2) => ({
  id, product_id: 'ISOLATED-SHIRT', color, size, stock,
});
export function catalog(whatsapp = true) {
  const products = [{
    id: 'ISOLATED-SHIRT', title: 'Synthetic qualification shirt', category: 'Shirts',
    description: 'Synthetic fixture only. No live inventory.', active: 1,
    image: '/__qualification__/shirt.svg', price_cents: 3800, price: 38,
    collections: ['new-in'],
    variants: [
      ...Object.keys(COLORS).map((color, i) => variant(`SWATCH-${i}`, color, 'M')),
      variant('RED-L-SOLD', 'Red', 'L', 0),
      variant('RED-FREE', 'Red', 'Free Size'),
      variant('WHITE-NONE', 'White', 'No Size'),
      variant('UNKNOWN-NONE', 'Eashed Blue', 'No Size'),
      variant('SOLD-COLOR', 'Unavailable Blue', 'M', 0),
    ],
  }, {
    id: 'ISOLATED-HAT', title: 'Synthetic qualification hat', category: 'Hats',
    description: 'Synthetic fixture only.', active: 1,
    image: '/__qualification__/hat.svg', price_cents: 1800, price: 18,
    collections: ['sale'],
    variants: [{id: 'HAT-NONE', product_id: 'ISOLATED-HAT', color: 'Cream', size: 'No Size', stock: 1}],
  }];
  products.push(...sizeProducts());
  for (const p of products) p.sizes = [...new Set(p.variants.map(v => v.size))];
  return {products, regions: [{id: 'beirut', name: 'Synthetic Beirut', fee_cents: 200}], whatsapp_enabled: whatsapp};
}
export const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#d7c2a3"/><path d="M160 150H480V650H160Z" fill="#a8c7df"/><text x="320" y="720" text-anchor="middle" font-size="24">SYNTHETIC QUALIFICATION</text></svg>';

// Expected labels are literal independent oracles, never imported from app sorter.
export const SIZE_CASES = Object.freeze([
 {id:'SIZE-ADULT',input:['6XL','M','XXS','4XL','XS','2XL','S','5XL','L','3XL','XL'],expected:['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL']},
 {id:'SIZE-CASE',input:['xl','m','XS','s','L'],expected:['XS','s','m','L','xl']},
 {id:'SIZE-AGES-Y',input:['16Y','10Y','4Y','14Y','8Y','12Y','6Y'],expected:['4Y','6Y','8Y','10Y','12Y','14Y','16Y']},
 {id:'SIZE-AGES',input:['16','10','4','14','8','12','6'],expected:['4','6','8','10','12','14','16']},
 {id:'SIZE-AGES-CASE',input:['16y','10Y','4y','14Y','8y','12Y','6y'],expected:['4y','6y','8y','10Y','12Y','14Y','16y']},
 {id:'SIZE-IDENTITIES',input:['10Y','4y','6','4Y','4'],expected:['4','4Y','4y','6','10Y']},
 {id:'SIZE-SPECIAL',input:['Free Size','One Size','No Size'],expected:['No Size','One Size','Free Size']},
 {id:'SIZE-MIXED',input:['Free Size','10','XL','4y','One Size','2XL','4','XS','4Y','No Size','6.5'],expected:['XS','XL','2XL','4','4Y','4y','6.5','10','No Size','One Size','Free Size']},
]);
export function sizeProducts() {
 return SIZE_CASES.map(c=>({id:c.id,title:'Synthetic '+c.id,category:'Shirts',
 description:'Synthetic size qualification only.',active:1,image:'/__qualification__/shirt.svg',
 price_cents:3800,price:38,collections:['size-fixtures'],
 variants:c.input.flatMap((size,i)=>['Red','Blue'].map(color=>({
 id:`${c.id}-${color}-${i}`,product_id:c.id,color,size,stock:color==='Red'&&i===0?0:2,
 })))}));
}
