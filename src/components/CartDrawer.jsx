import React from "react";
import { useCart } from "../store.jsx";
import { api, money } from "../api.js";
export default function CartDrawer({ open, onClose }) {
  const { cart, remove, clear } = useCart();
  const [catalog, setCatalog] = React.useState(null),
    [error, setError] = React.useState(""),
    [busy, setBusy] = React.useState(false),
    [receipt, setReceipt] = React.useState(null);
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    address: "",
    region: "",
    channel: "cod",
  });
  const retry = React.useRef(null);
  const dialog = React.useRef(null);
  React.useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      api("/catalog")
        .then(setCatalog)
        .catch((e) => setError(e.message));
    } else dialog.current?.close();
  }, [open]);
  const items = cart.map((i) => {
    for (const p of catalog?.products || []) {
      const v = p.variants.find((v) => v.id === i.variant_id);
      if (v) return { ...i, ...v, title: p.title, price_cents: p.price_cents };
    }
    return { ...i, missing: true };
  });
  const subtotal = items.reduce((s, i) => s + (i.price_cents || 0) * i.qty, 0),
    region = catalog?.regions.find((r) => r.id === form.region),
    available =
      items.length && items.every((i) => !i.missing && i.stock >= i.qty),
    fee = region?.fee_cents;
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      items: cart.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
      expected_total_cents: subtotal + fee,
    };
    const signature = JSON.stringify(payload);
    if (!retry.current || retry.current.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await api("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": retry.current.key },
        body: signature,
      });
      setReceipt(result);
      clear();
      retry.current = null;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} onCancel={onClose} className="bag">
      <div className="p-5">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-2xl">Your bag</h2>
          <button className="navchip" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        {receipt ? (
          <section role="status">
            <h3>Order received: {receipt.reference}</h3>
            <p>
              {money(receipt.total_cents)} · Cash on Delivery · {receipt.status}
            </p>
            {receipt.whatsapp_url && (
              <a
                className="btn mt-4"
                href={receipt.whatsapp_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send itemized order on WhatsApp
              </a>
            )}
            <button className="navchip mt-4" onClick={() => setReceipt(null)}>
              Continue shopping
            </button>
          </section>
        ) : (
          <>
            <ul>
              {items.map((i) => (
                <li
                  key={i.variant_id}
                  className="border-b py-3 flex justify-between gap-2"
                >
                  <div>
                    {i.title || "Unavailable item"}
                    <p className="text-sm">
                      {i.size} / {i.color} · Qty {i.qty}
                    </p>
                    <p>{money((i.price_cents || 0) * i.qty)}</p>
                    {(i.missing || i.stock < i.qty) && (
                      <p role="alert">
                        Please remove this unavailable quantity.
                      </p>
                    )}
                  </div>
                  <button
                    className="navchip"
                    onClick={() => remove(i.variant_id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            {!cart.length ? (
              <p>Your bag is empty.</p>
            ) : (
              <form className="space-y-3 mt-5" onSubmit={submit}>
                <p>Subtotal {money(subtotal)}</p>
                {["name", "phone", "address"].map((field) => (
                  <label className="block" key={field}>
                    {field === "name"
                      ? "Full name"
                      : field === "phone"
                        ? "Phone number"
                        : "Town, street, building and delivery details"}
                    <input
                      required
                      maxLength={
                        field === "address" ? 500 : field === "phone" ? 30 : 120
                      }
                      type={field === "phone" ? "tel" : "text"}
                      autoComplete={
                        field === "name"
                          ? "name"
                          : field === "phone"
                            ? "tel"
                            : "street-address"
                      }
                      className="input mt-1"
                      value={form[field]}
                      onChange={(e) =>
                        setForm({ ...form, [field]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label className="block">
                  Delivery region
                  <select
                    className="input"
                    required
                    value={form.region}
                    onChange={(e) =>
                      setForm({ ...form, region: e.target.value })
                    }
                  >
                    <option value="">Choose a region</option>
                    {catalog?.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {fee == null
                    ? "Delivery fee awaiting configuration for this region."
                    : `Delivery ${money(fee)} · Total ${money(subtotal + fee)}`}
                </p>
                <label className="block">
                  Order method
                  <select
                    className="input"
                    value={form.channel}
                    onChange={(e) =>
                      setForm({ ...form, channel: e.target.value })
                    }
                  >
                    <option value="cod">Cash on Delivery</option>
                    {catalog?.whatsapp_enabled && (
                      <option value="whatsapp">
                        WhatsApp + Cash on Delivery
                      </option>
                    )}
                  </select>
                </label>
                <p className="text-xs">
                  Your name, phone and address are stored privately to fulfil
                  this order. WhatsApp opens only when you choose to send the
                  saved order.
                </p>
                <button
                  className="btn w-full"
                  disabled={busy || !available || fee == null}
                >
                  {busy ? "Saving order…" : "Place order · Pay on delivery"}
                </button>
              </form>
            )}
          </>
        )}
        <p className="mt-3" role="alert">
          {error}
        </p>
      </div>
    </dialog>
  );
}
