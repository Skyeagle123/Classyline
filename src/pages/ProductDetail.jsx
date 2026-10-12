import React from "react";
import { loadProducts } from "../utils.js";
import { money } from "../api.js";
import { useCart } from "../store.jsx";
export default function ProductDetail({ id }) {
  const { add, ready, error: cartError } = useCart();
  const [p, setP] = React.useState(null),
    [selected, setSelected] = React.useState(""),
    [msg, setMsg] = React.useState(""),
    [adding, setAdding] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setP(null);
    setSelected("");
    loadProducts()
      .then((all) => {
        if (live) {
          setP(all.find((x) => x.id === id));
          setMsg("");
        }
      })
      .catch((e) => live && setMsg(e.message));
    return () => {
      live = false;
    };
  }, [id]);
  if (!p)
    return (
      <main className="page" role="status">
        {msg || "Loading product…"}
      </main>
    );
  const v = p.variants.find((x) => x.id === selected);
  return (
    <main className="page grid md:grid-cols-2 gap-8">
      <img
        src={p.image}
        alt={p.title}
        className="w-full aspect-[4/5] object-cover rounded-xl"
      />
      <section className="space-y-5">
        <a href="/">← Collection</a>
        <p className="eyebrow">{p.category}</p>
        <h1 className="text-4xl">{p.title}</h1>
        <p>{money(p.price_cents)}</p>
        <p>{p.description}</p>
        <fieldset>
          <legend className="mb-3">Choose your size and color</legend>
          <div className="flex flex-wrap gap-2">
            {p.variants.map((x) => (
              <button
                key={x.id}
                disabled={!x.stock}
                aria-pressed={x.id === selected}
                className="navchip"
                onClick={() => setSelected(x.id)}
              >
                {x.size} / {x.color}
                {!x.stock ? " — sold out" : ""}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          className="btn"
          disabled={!v?.stock || !ready || adding}
          onClick={async () => {
            setAdding(true);
            try {
              await add({ variant_id: v.id });
              setMsg("Added to your bag");
            } catch (e) {
              setMsg(e.message);
            } finally {
              setAdding(false);
            }
          }}
        >
          {adding ? "Adding…" : "Add to bag"}
        </button>
        <p role="status">{cartError || msg}</p>
        <p className="text-sm">
          Cash on Delivery · Delivery throughout Lebanon. The regional delivery
          fee is shown at checkout.
        </p>
      </section>
    </main>
  );
}
