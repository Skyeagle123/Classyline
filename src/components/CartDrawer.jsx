// src/components/CartDrawer.jsx
import React from 'react';
import { useCart } from '../store.jsx';

const WHATSAPP_NUMBER = '96181643280'; // ← غيّر الرقم من هون

function buildWhatsAppMessage(cart, subtotal) {
  if (!cart.length) return 'Hello, I want to order from Classyline, but my cart is empty.';

  const lines = [];
  lines.push('Hello, I want to order from Classyline:');
  lines.push('');

  cart.forEach(item => {
    lines.push(
      `• ${item.title} — size ${item.size} x${item.qty} = $${(item.price * item.qty).toFixed(2)}`
    );
  });

  lines.push('');
  lines.push(`Subtotal: $${subtotal.toFixed(2)}`);

  return encodeURIComponent(lines.join('\n'));
}

export default function CartDrawer({ open, onClose }) {
  const { cart, subtotal, remove, clear } = useCart();
  const hasItems = cart.length > 0;

  const handleCheckoutWhatsApp = () => {
    if (!hasItems) {
      alert('Your cart is empty.');
      return;
    }
    const text = buildWhatsAppMessage(cart, subtotal);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className={`fixed inset-0 z-40 transition ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* الخلفية السوداء الخفيفة */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      {/* الدرج الجانبي */}
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl border-l border-zinc-200 transform transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <h2 className="text-lg font-semibold">Your Cart</h2>
          <button onClick={onClose} className="text-sm text-zinc-500">
            Close
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {!hasItems && <p className="text-sm text-zinc-500">Your cart is empty.</p>}

          {hasItems && (
            <ul className="space-y-3">
              {cart.map(item => (
                <li
                  key={item.id + item.size}
                  className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-2"
                >
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-xs text-zinc-500">
                      Size: {item.size} · Qty: {item.qty}
                    </div>
                    <div className="text-sm text-zinc-700">
                      ${(item.price * item.qty).toFixed(2)}
                    </div>
                  </div>
                  <button
                    className="text-xs text-red-600"
                    onClick={() => remove(item.id, item.size)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-zinc-200 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Subtotal</span>
            <span className="font-semibold">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-outline flex-1"
              type="button"
              onClick={clear}
              disabled={!hasItems}
            >
              Clear cart
            </button>
            <button
              className="btn flex-1"
              type="button"
              onClick={handleCheckoutWhatsApp}
              disabled={!hasItems}
            >
              Order via WhatsApp
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

