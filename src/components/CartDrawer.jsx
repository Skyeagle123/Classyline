import React from "react";
import { useCart } from "../store.jsx";

export default function CartDrawer({ open, onClose }) {
  const { cart, remove, subtotal, clear } = useCart();

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex justify-end">
      <div className="w-[320px] h-full bg-white shadow-xl p-4 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Your Cart</h2>
          <button onClick={onClose} className="text-lg">✕</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {cart.length === 0 && (
            <p className="text-zinc-600">Your cart is empty.</p>
          )}

          {cart.map((item) => (
            <div key={item.id + item.size}
                 className="border p-2 rounded-lg flex justify-between">
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="text-sm text-zinc-600">Size: {item.size}</div>
                <div className="text-sm">${item.price} × {item.qty}</div>
              </div>
              <button
                onClick={() => remove(item.id, item.size)}
                className="text-red-500 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 border-t pt-4">
          <div className="flex justify-between font-semibold text-lg">
            <span>Total:</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          <button className="btn w-full mt-3">Checkout</button>

          <button className="btn-outline w-full mt-2" onClick={clear}>
            Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}
