import React from 'react';
import { useCart } from '../store.jsx';
export default function ProductCard({ p }){
  const { add } = useCart();
  const size = (p.sizes && p.sizes[0]) || 'S';
  return (
    <article className="card overflow-hidden flex flex-col">
      <a href={`/product/${encodeURIComponent(p.id)}`}>
        <img src={p.image} alt={p.title} className="w-full aspect-[4/5] object-cover" />
      </a>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold mb-1">{p.title}</h3>
        <div className="text-sm text-zinc-600 mb-2">{p.category}</div>
        <div className="mt-auto flex items-center justify-between">
          <span className="font-bold">${(p.price||0).toFixed(2)}</span>
          <button className="btn" onClick={()=>add({id:p.id, title:p.title, price:p.price, size})}>Add to cart</button>
        </div>
      </div>
    </article>
  )
}
