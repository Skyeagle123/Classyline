import React from "react";
import { api, money } from "../api.js";
import ProductEditor from "../components/ProductEditor.jsx";
export default function Admin() {
  const [auth, setAuth] = React.useState(false),
    [password, setPassword] = React.useState(""),
    [msg, setMsg] = React.useState(""),
    [orders, setOrders] = React.useState([]),
    [catalog, setCatalog] = React.useState(null),
    [product, setProduct] = React.useState(""),
    [fees, setFees] = React.useState({});
  async function refresh() {
    const [o, c] = await Promise.all([api("/admin/orders"), api("/catalog")]);
    setOrders(o.orders);
    setCatalog(c);
  }
  React.useEffect(() => {
    api("/admin/session")
      .then(() => {
        setAuth(true);
        return refresh();
      })
      .catch(() => {});
  }, []);
  async function run(fn) {
    try {
      setMsg("");
      await fn();
      setMsg("Saved");
    } catch (e) {
      setMsg(e.message);
    }
  }
  if (!auth)
    return (
      <main className="page max-w-md">
        <h1 className="text-3xl mb-5">Admin sign in</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("/admin/login", {
                method: "POST",
                body: JSON.stringify({ password }),
              });
              setPassword("");
              setAuth(true);
              await refresh();
            });
          }}
        >
          <label>
            Password
            <input
              className="input my-3"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn">Sign in</button>
        </form>
        <p role="alert">{msg}</p>
      </main>
    );
  return (
    <main className="page space-y-6">
      <div className="flex justify-between">
        <h1 className="text-3xl">Store administration</h1>
        <button
          className="navchip"
          onClick={() =>
            run(async () => {
              await api("/admin/logout", { method: "POST", body: "{}" });
              setAuth(false);
              setOrders([]);
            })
          }
        >
          Sign out
        </button>
      </div>
      <p role="status">{msg}</p>
      <ProductEditor {...{ catalog, refresh, run }} />
      <details>
        <summary className="navchip">Advanced product JSON editor</summary>
        <section className="card p-5">
          <h2 className="text-2xl">Product editor</h2>
          <p>
            JSON format: id, title, category, description, image, price_cents,
            active, variants [{"{"}id, size, color, stock, expected_stock{"}"}].
            Prices and fees use USD cents. Existing variant identities stay
            fixed.
          </p>
          <select
            className="input my-3"
            defaultValue=""
            onChange={(e) =>
              setProduct(
                JSON.stringify(
                  (() => {
                    const p = catalog.products.find(
                      (p) => p.id === e.target.value,
                    );
                    return p
                      ? {
                          ...p,
                          variants: p.variants.map((v) => ({
                            ...v,
                            expected_stock: v.stock,
                          })),
                        }
                      : {};
                  })(),
                  null,
                  2,
                ),
              )
            }
          >
            <option value="">Choose existing product</option>
            {catalog?.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <label className="block">
            Product JSON
            <textarea
              className="input h-64 font-mono"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            />
          </label>
          <button
            className="btn mt-3"
            onClick={() =>
              run(async () => {
                await api("/admin/products", {
                  method: "PUT",
                  body: JSON.stringify(JSON.parse(product)),
                });
                await refresh();
              })
            }
          >
            Save product to server
          </button>
        </section>
      </details>
      <section className="card p-5">
        <h2 className="text-2xl">Regional delivery fees</h2>
        <p>
          No fee is assumed. Empty means checkout is unavailable for that
          region.
        </p>
        {catalog?.regions.map((r) => (
          <form
            key={r.id}
            className="flex flex-wrap gap-3 items-center my-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const value =
                  fees[r.id] ??
                  (r.fee_cents === null ? "" : String(r.fee_cents));
                await api("/admin/regions", {
                  method: "PUT",
                  body: JSON.stringify({
                    id: r.id,
                    fee_cents: value === "" ? null : Number(value),
                  }),
                });
                await refresh();
              });
            }}
          >
            <label>
              {r.name}
              <input
                aria-label={`${r.name} fee in USD cents`}
                className="input"
                type="number"
                min="0"
                step="1"
                value={fees[r.id] ?? (r.fee_cents === null ? "" : r.fee_cents)}
                onChange={(e) => setFees({ ...fees, [r.id]: e.target.value })}
              />
            </label>
            <button className="navchip">Save fee (USD cents)</button>
          </form>
        ))}
      </section>
      <section>
        <h2 className="text-2xl">Latest 100 orders</h2>
        <button className="navchip" onClick={() => run(refresh)}>
          Refresh
        </button>
        {orders.map((o) => (
          <article key={o.id} className="card p-4 my-3">
            <h3>
              {o.reference} · {o.status} ·{" "}
              {money(o.subtotal_cents + o.delivery_cents)}
            </h3>
            <p>
              {o.customer_name} · {o.phone}
            </p>
            <p>
              {o.address} · {o.region_id}
            </p>
            <ul className="my-3 space-y-2">
              {o.items.map((i) => (
                <li key={i.variant_id}>
                  {i.title} · {i.size} / {i.color} · Qty {i.qty} ·{" "}
                  {money(i.unit_cents)} each · {money(i.unit_cents * i.qty)}
                </li>
              ))}
            </ul>
            {o.cancellation_reason === "expired" && (
              <p>Pending reservation expired; stock released.</p>
            )}
            {o.status === "pending" && (
              <p>
                Awaiting merchant confirmation. Reserved until{" "}
                {new Date(o.reservation_expires_at * 1000).toLocaleString()}.
              </p>
            )}
            {o.channel === "whatsapp" && (
              <p>
                WhatsApp requested; opening a link does not verify that a
                message was sent.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {(
                {
                  pending: ["confirmed", "cancelled"],
                  confirmed: ["dispatched", "cancelled"],
                  dispatched: ["delivered"],
                }[o.status] || []
              ).map((status) => (
                <button
                  className="navchip"
                  key={status}
                  onClick={() =>
                    run(async () => {
                      await api("/admin/orders", {
                        method: "PATCH",
                        body: JSON.stringify({ id: o.id, status }),
                      });
                      await refresh();
                    })
                  }
                >
                  Mark {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
