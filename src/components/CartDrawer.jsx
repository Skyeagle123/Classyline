// src/components/CartDrawer.jsx
import React from "react";
import { useCart } from "../store.jsx";

export default function CartDrawer({ open, onClose }) {
  const { cart, subtotal, remove, clear } = useCart();

  const hasItems = cart.length > 0;

  const handleWhatsAppCheckout = () => {
    if (!hasItems) return;

    const phone = "96100000000"; // <-- حط رقم الواتساب تبعك هون بدون + أو فراغات
    const lines = cart.map(
      (item) =>
        `- ${item.title} | size: ${item.size} | qty: ${item.qty} | $${(
          item.price * item.qty
        ).toFixed(2)}`
    );
    const message = [
      "Hello, I would like to order:",
      "",
      ...lines,
      "",
      `Subtotal: $${subtotal.toFixed(2)}`
    ].join("\n");

    const url =
      "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
    window.open(url, "_blank");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-zinc-200 transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <h2 className="text-lg font-semibold">Your cart</h2>
          <button
            className="text-sm text-zinc-500 hover:text-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-4 h-[calc(100%-4rem)] flex flex-col">
          {/* Items */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {!hasItems && (
              <p className="text-sm text-zinc-500">Your cart is empty.</p>
            )}

            {cart.map((item) => (
              <div
                key={item.id + item.size}
                className="flex items-center justify-between gap-3 border border-zinc-200 rounded-xl px-3 py-2"
              >
                <div>
                  <div className="font-medium text-sm">{item.title}</div>
                  <div className="text-xs text-zinc-500">
                    Size: {item.size} · Qty: {item.qty}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    ${(item.price * item.qty).toFixed(2)}
                  </div>
                  <button
                    className="text-[11px] text-red-600 mt-1"
                    onClick={() => remove(item.id, item.size)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-200 pt-3 mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Subtotal</span>
              <span className="font-semibold">${subtotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <button
                className="btn-outline flex-1 rounded-xl"
                type="button"
                onClick={clear}
                disabled={!hasItems}
              >
                Clear cart
              </button>
              <button
                className="btn flex-1 rounded-xl"
                type="button"
                onClick={handleWhatsAppCheckout}
                disabled={!hasItems}
              >
                Checkout on WhatsApp
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

