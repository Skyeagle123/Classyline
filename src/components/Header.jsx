import React, { useState } from 'react';
import { useCart } from '../store.jsx';
import CartDrawer from './CartDrawer.jsx';

export default function Header() {
  const { count } = useCart();
  const [openCart, setOpenCart] = useState(false);

  return (
    <>
      {/* Cart Drawer */}
      <CartDrawer open={openCart} onClose={() => setOpenCart(false)} />

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <img src="/logo.svg" alt="logo" className="w-9 h-9 rounded-xl" />
          <h1 className="text-lg font-bold">Classyline</h1>

          <nav className="ml-auto flex flex-wrap gap-2 justify-end">
            <a className="navchip" href="/">Home</a>
            <a className="navchip" href="/category/Women">Women</a>
            <a className="navchip" href="/category/Men">Men</a>
            <a className="navchip" href="https://instagram.com/classyline78" target="_blank">Instagram</a>
            <a className="navchip" href="https://wa.me/96181643280" target="_blank">WhatsApp</a>

            {/* CART BUTTON */}
            <button
              className="navchip"
              onClick={() => setOpenCart(true)}
            >
              Cart: {count}
            </button>

            <a className="navchip" href="/admin">Admin</a>
          </nav>
        </div>
      </header>
    </>
  );
}

