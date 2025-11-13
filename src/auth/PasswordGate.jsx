import React,{useState,useEffect} from 'react';
export default function PasswordGate({children}){
  const[ok,setOk]=useState(false);const[pwd,setPwd]=useState('');
  useEffect(()=>{ if(localStorage.getItem('ADMIN_OK')==='1') setOk(true); },[]);
  const check=(e)=>{
    e.preventDefault();
    const exp=(window.APP_CONFIG&&window.APP_CONFIG.ADMIN_PASSWORD)||'classy123';
    if(pwd===exp){localStorage.setItem('ADMIN_OK','1');setOk(true);} else alert('Wrong password');
  };
  if(ok) return children;
  return(
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={check} className="card p-6 w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-4">Admin access</h2>
        <input type="password" placeholder="Enter password" value={pwd}
               onChange={e=>setPwd(e.target.value)} className="input mb-3"/>
        <button className="btn w-full" type="submit">Enter</button>
      </form>
    </div>
  );
}
