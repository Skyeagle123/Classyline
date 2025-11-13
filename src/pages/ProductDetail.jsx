import React from 'react';
import { loadProducts } from '../utils.js';
import { useCart } from '../store.jsx';

export default function ProductDetail({ id }){
  const { add } = useCart();
  const [p,setP] = React.useState(null);
  const [size,setSize] = React.useState('');
  React.useEffect(()=>{ (async()=>{
    const all = await loadProducts();
    const found = all.find(x => String(x.id)===String(id));
    setP(found||null);
    setSize((found?.sizes && found.sizes[0]) || 'S');
  })(); },[id]);

  if(!p) return <main className="max-w-7xl mx-auto px-4 py-10">Product not found.</main>;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <div className="grid md:grid-cols-2 gap-6">
        <img src={p.image} alt={p.title} className="w-full aspect-[4/5] object-cover rounded-2xl" />
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{p.title}</h1>
          <div className="text-zinc-600 text-lg">${(p.price||0).toFixed(2)}</div>
          <div className="flex gap-2">{(p.sizes||['S','M','L']).map(s=>(
            <button key={s} className={`btn-outline px-3 py-1 rounded-full ${size===s?'!bg-zinc-900 !text-white':''}`} onClick={()=>setSize(s)}>{s}</button>
          ))}</div>
          <button className="btn" onClick={()=>add({id:p.id,title:p.title,price:p.price,size})}>Add to cart</button>
        </div>
      </div>
    </main>
  )
}
