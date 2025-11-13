import React from 'react';
import ProductCard from '../components/ProductCard.jsx';
import { loadProducts } from '../utils.js';

export default function Category({ slug }){
  const [products,setProducts] = React.useState([]);
  React.useEffect(()=>{ (async()=>{
    let all = await loadProducts();
    if (slug==='new') all = all.filter(p => String(p.badge||'').toLowerCase().includes('new'));
    else all = all.filter(p => (p.category||'')===slug);
    setProducts(all);
  })(); },[slug]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold mb-4">Category: {slug}</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {products.map(p => <ProductCard key={p.id} p={p} />)}
      </div>
    </main>
  )
}
