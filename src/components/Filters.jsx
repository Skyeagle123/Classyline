import React from 'react';
export default function Filters({ q,setQ, min,setMin, max,setMax, cat,setCat, size,setSize, cats, sizesAll }){
  return (
    <aside className="lg:col-span-1 space-y-4">
      <div className="card p-4">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..." className="input" />
        <div className="flex items-center gap-2 mt-4">
          <input type="number" value={min} onChange={e=>setMin(Number(e.target.value))} className="input w-24" />
          <span>to</span>
          <input type="number" value={max} onChange={e=>setMax(Number(e.target.value))} className="input w-24" />
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-2 font-medium">Sizes</div>
        <div className="flex flex-wrap gap-2">
          {sizesAll.map(s => (
            <button key={s} onClick={()=>setSize(size===s?'':s)}
                    className={`btn-outline px-3 py-1 rounded-full ${size===s?'!bg-zinc-900 !text-white':''}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-2 font-medium">Category</div>
        <select value={cat} onChange={e=>setCat(e.target.value)} className="input">
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </aside>
  )
}
