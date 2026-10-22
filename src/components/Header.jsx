import React from "react";
import { useCart } from "../store.jsx";
import CartDrawer from "./CartDrawer.jsx";
import ShopNavigation from "./ShopNavigation.jsx";
import ContactLinks from "./ContactLinks.jsx";
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
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center gap-4">
          <a href="/" className="brand">
            ClassyLine<span>EVERYDAY, CONSIDERED</span>
          </a>
          <nav aria-label="Shopping" className="ml-auto flex gap-2">
            <button className="navchip" onClick={() => setOpen(true)}>
              Bag ({count})
            </button>
          </nav>
          <ContactLinks className="header-contact" />
        </div>
        <ShopNavigation />
      </header>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
