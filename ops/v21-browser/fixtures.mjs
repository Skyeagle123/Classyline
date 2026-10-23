// Synthetic, local-only data. No customer records or live image references.
export const SOURCE_SHA = '04feef6a48968e736d99a072efbf98750feb7bdf';
export const SOURCE_TREE = '8fcdaf50e3e2a900c900d37d0f9ad3ecaa2a6ed7';
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
  for (const p of products) p.sizes = [...new Set(p.variants.map(v => v.size))];
  return {products, regions: [{id: 'beirut', name: 'Synthetic Beirut', fee_cents: 200}], whatsapp_enabled: whatsapp};
}
export const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#d7c2a3"/><path d="M160 150H480V650H160Z" fill="#a8c7df"/><text x="320" y="720" text-anchor="middle" font-size="24">SYNTHETIC QUALIFICATION</text></svg>';
