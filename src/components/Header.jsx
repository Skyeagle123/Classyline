import React from "react";
import { useCart } from "../store.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { collections } from "../catalog.js";
export default function Header() {
  const { count } = useCart(),
    [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="announcement">
        Delivery throughout Lebanon · Cash on Delivery
      </div>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <a href="/" className="brand">
            ClassyLine<span>EVERYDAY, CONSIDERED</span>
          </a>
          <nav aria-label="Shopping" className="ml-auto flex gap-2">
            <a href="/" className="navchip">
              Shop
            </a>
            <button className="navchip" onClick={() => setOpen(true)}>
              Bag ({count})
            </button>
          </nav>
        </div>
        <nav className="collection-nav" aria-label="Collections">
          {collections.map((c) => (
            <a key={c.slug} href={`/category/${c.slug}`}>
              {c.label}
            </a>
          ))}
        </nav>
      </header>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
