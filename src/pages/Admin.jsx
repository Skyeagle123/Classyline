import React,{useState} from 'react';
import PasswordGate from '../auth/PasswordGate.jsx';
export default function AdminPage(){
  const[msg,setMsg]=useState('');
  const onCSV=async(e)=>{
    const f=e.target.files?.[0];
    if(!f) return;
    const t=await f.text();
    localStorage.setItem('PRODUCTS_CSV_OVERRIDE', t);
    setMsg('CSV uploaded locally. Refresh to see changes.');
  };
  const setPwd=()=>{
    const p=prompt('Set new admin password', localStorage.getItem('ADMIN_PASSWORD')||'classy123');
    if(p){localStorage.setItem('ADMIN_PASSWORD',p); alert('Saved (local)');}
  };
  return(
    <PasswordGate>
      <main className="max-w-3xl mx-auto p-4">
        <div className="card p-6 space-y-4">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <div>
            <label className="block text-sm font-medium mb-1">Upload products.csv</label>
            <input type="file" accept=".csv,text/csv" onChange={onCSV}/>
            <p className="text-sm text-zinc-600 mt-2">{msg}</p>
          </div>
          <div>
            <button className="btn" onClick={setPwd}>Set admin password (local)</button>
          </div>
        </div>
      </main>
    </PasswordGate>
  );
}
