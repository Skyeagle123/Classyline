import React from "react";
import { useCart } from "../store.jsx";
import { api, money } from "../api.js";
import { checkout } from "../checkout.js";
export default function CartDrawer({ open, onClose }) {
  const {
    cart,
    remove,
    coordinator,
    cartVersion,
    ready,
    error: cartError,
    reviewRequired,
    review,
    reconcile,
  } = useCart();
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
  const recovery = React.useMemo(
    () =>
      checkout({
        storage: {
          getItem: (k) => localStorage.getItem(k),
          setItem: (k, v) => localStorage.setItem(k, v),
          removeItem: (k) => localStorage.removeItem(k),
        },
        tabStorage: {
          getItem: (k) => sessionStorage.getItem(k),
          setItem: (k, v) => sessionStorage.setItem(k, v),
          removeItem: (k) => sessionStorage.removeItem(k),
        },
        request: api,
        cart: coordinator,
        lock: navigator.locks
          ? (name, fn) => navigator.locks.request(name, fn)
          : null,
      }),
    [coordinator],
  );
  const [unresolved, setUnresolved] = React.useState(false);
  const dialog = React.useRef(null);
  React.useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      api("/catalog")
        .then(setCatalog)
        .catch((e) => setError(e.message));
      resolveCheckout();
    } else dialog.current?.close();
  }, [open]);
  async function resolveCheckout() {
    setBusy(true);
    try {
      await reconcile();
      const snapshot = recovery.snapshot();
      if (snapshot)
        setForm({
          name: snapshot.name,
          phone: snapshot.phone,
          address: snapshot.address,
          region: snapshot.region,
          channel: snapshot.channel,
        });
      const result = await recovery.recover();
      setUnresolved(false);
      setReceipt(result);
      setError("");
    } catch (e) {
      setUnresolved(true);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
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
    if (busy || unresolved || !ready || reviewRequired) return;
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      items: cart.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
      expected_total_cents: subtotal + fee,
    };
    try {
      const result = await recovery.submit(payload, cartVersion);
      setReceipt(result);
    } catch (e) {
      setUnresolved(true);
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
            {receipt.status === "pending" && (
              <p>
                Please wait for merchant confirmation. Unconfirmed reservations
                expire after 30 minutes. Sending WhatsApp does not confirm the
                order.
              </p>
            )}
            {receipt.cancellation_reason === "expired" && (
              <p>
                This reservation expired and its stock was released. To order
                these items again, add them to the bag for a new order.
              </p>
            )}
            {receipt.status === "cancelled" &&
              receipt.cancellation_reason !== "expired" && (
                <p>
                  This order was cancelled. Add products to the bag if you
                  intend to place a new order.
                </p>
              )}
            {receipt.whatsapp_url && receipt.status !== "cancelled" && (
              <a
                className="btn mt-4"
                href={receipt.whatsapp_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send itemized order on WhatsApp
              </a>
            )}
            <button
              className="navchip mt-4"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await recovery.acknowledge();
                  setReceipt(null);
                  setUnresolved(false);
                  setError("");
                } catch (e) {
                  setUnresolved(true);
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
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
                    disabled={busy || !ready}
                    onClick={async () => {
                      try {
                        await remove(i.variant_id);
                        setError("");
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            {!cart.length ? (
              <div className="empty-state">
                <p>
                  {ready
                    ? "Your bag is empty. Add products to start a new order."
                    : "Loading your saved bag…"}
                </p>
                <button className="navchip mt-3" onClick={onClose}>
                  Explore the collection
                </button>
              </div>
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
                  saved order. Pending checkout details are held temporarily in
                  this tab until the saved order is recovered.
                </p>
                <button
                  className="btn w-full"
                  disabled={
                    busy ||
                    unresolved ||
                    !ready ||
                    reviewRequired ||
                    !available ||
                    fee == null
                  }
                >
                  {busy ? "Saving order…" : "Place order · Pay on delivery"}
                </button>
              </form>
            )}
          </>
        )}
        <p className="mt-3" role="alert">
          {error || cartError}
        </p>
        {reviewRequired && !receipt && !unresolved && (
          <section role="status">
            <p>
              This bag was saved by an earlier checkout version. Review its
              items and confirm that you intend to place a new order.
            </p>
            <button
              className="navchip mt-3"
              disabled={busy || !ready}
              onClick={async () => {
                try {
                  await review(cartVersion);
                  setError("");
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Use this reviewed bag for a new order
            </button>
          </section>
        )}
        {unresolved && (
          <section role="status">
            <p>
              Your earlier checkout must be resolved before another order can be
              placed.
            </p>
            <button
              className="btn mt-3"
              disabled={busy}
              onClick={resolveCheckout}
            >
              Recover previous checkout
            </button>
          </section>
        )}
      </div>
    </dialog>
  );
}
