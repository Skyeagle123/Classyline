import React from 'react';
import Filters from '../components/Filters.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { loadProducts } from '../utils.js';

const sizesAll = ['XS','S','M','L','XL','XXL'];

export default function Home(){
  const [products,setProducts] = React.useState([]);
  React.useEffect(()=>{ (async()=>setProducts(await loadProducts()))(); },[]);

  const [q,setQ] = React.useState('');
  const [min,setMin] = React.useState(0);
  const [max,setMax] = React.useState(1000);
  const [cat,setCat] = React.useState('all');
  const [size,setSize] = React.useState('');

  const cats = React.useMemo(()=>['all', ...Array.from(new Set(products.map(p=>p.category||'Other')))], [products]);

  const list = products.filter(p =>
    (!q || p.title.toLowerCase().includes(q.toLowerCase())) &&
    p.price >= min && p.price <= max &&
    (cat==='all' || p.category===cat) &&
    (!size || (p.sizes||[]).includes(size))
  );

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
      <Filters {...{q,setQ,min,setMin,max,setMax,cat,setCat,size,setSize,cats,sizesAll}} />
      <section className="lg:col-span-3">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(p => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>
    </main>
  )
}
