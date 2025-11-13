import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import Category from './pages/Category.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import AdminPage from './pages/Admin.jsx';
import { CartProvider } from './store.jsx';

function usePath(){
  const [path,setPath] = React.useState(location.pathname);
  React.useEffect(()=>{
    const f=()=>setPath(location.pathname);
    addEventListener('popstate', f);
    const onClick = (e)=>{
      const a = e.target.closest('a[href^="/"]');
      if (a && a.origin===location.origin) {
        e.preventDefault();
        history.pushState({}, '', a.getAttribute('href'));
        setPath(location.pathname);
      }
    };
    document.addEventListener('click', onClick);
    return ()=>{
      removeEventListener('popstate', f);
      document.removeEventListener('click', onClick);
    };
  },[]);
  return path;
}

function Router(){
  const path = usePath();
  const cat = path.match(/^\/category\/(.+)$/);
  const prod = path.match(/^\/product\/(.+)$/);
  if (path === '/' || path === '') return <Home/>;
  if (cat) return <Category slug={decodeURIComponent(cat[1])}/>;
  if (prod) return <ProductDetail id={decodeURIComponent(prod[1])}/>;
  if (path.startsWith('/admin')) return <AdminPage/>;
  return <main className="max-w-7xl mx-auto px-4 py-10">Not found.</main>;
}

function AppShell(){
  return (
    <CartProvider>
      <Header/>
      <Router/>
    </CartProvider>
  );
}

createRoot(document.getElementById('root')).render(<AppShell/>);
