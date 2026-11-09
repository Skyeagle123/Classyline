import React from "react";
import { loadProducts } from "../utils.js";
import { money } from "../api.js";
import { useCart } from "../store.jsx";
import { variantOptions, resolveVariant, swatchColor } from "../variants.js";
import { previewNotice } from "../preview-product.js";
export default function ProductDetail({ id }) {
  const { add, ready, error: cartError } = useCart();
  const [p, setP] = React.useState(null),
    [selected, setSelected] = React.useState(""),
    [msg, setMsg] = React.useState(""),
    [loading, setLoading] = React.useState(true),
    [adding, setAdding] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setP(null);
    setLoading(true);
    setSelected("");
    loadProducts()
      .then((all) => {
        if (live) {
          setP(all.find((x) => x.id === id));
          setMsg("");
        }
      })
      .catch((e) => live && setMsg(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id]);
  if (!p)
    return (
      <main className="page" role="status">
        {msg ||
          (loading ? "Loading product…" : "This product is not available.")}
        {!loading && (
          <a className="navchip ml-3" href="/">
            Back to collection
          </a>
        )}
      </main>
    );
  return (
    <ProductView
      key={p.id}
      {...{
        p,
        selected,
        setSelected,
        msg,
        setMsg,
        adding,
        setAdding,
        add,
        ready,
        cartError,
      }}
    />
  );
}

export function ProductView({
  p,
  selected,
  setSelected,
  msg,
  setMsg,
  adding,
  setAdding,
  add,
  ready,
  cartError,
}) {
  const initial = p.variants.find((x) => x.id === selected);
  const [color, setColor] = React.useState(initial?.color || "");
  const [size, setSize] = React.useState(initial?.size || "");
  const options = variantOptions(p.variants);
  const v = resolveVariant(p.variants, color, size);
  const choose = (nextColor, nextSize) => {
    setColor(nextColor);
    setSize(nextSize);
    setSelected(resolveVariant(p.variants, nextColor, nextSize)?.id || "");
    setMsg("");
  };
  return (
    <main className="page product-detail grid md:grid-cols-2 gap-8">
      <img
        src={p.image}
        alt={p.title}
        width="640"
        height="800"
        className="w-full aspect-[4/5] object-contain bg-[#f6f1e8] rounded-xl"
      />
      <section className="space-y-5">
        <a href="/">← Collection</a>
        <p className="eyebrow">{p.category}</p>
        <h1 className="text-4xl">{p.title}</h1>
        <p>{money(p.price_cents)}</p>
        <p>{p.description}</p>
        {p.display_only && <p role="status">{previewNotice}</p>}
        {p.sku && <p className="muted text-sm">SKU: {p.sku}</p>}
        <fieldset>
          <legend className="mb-3">
            Color{color ? `: ${color}` : " — choose a color"}
          </legend>
          <div className="variant-options">
            {options.colors.map((name) => (
              <button
                type="button"
                key={name}
                className="navchip color-option"
                aria-label={`Color: ${name}`}
                aria-pressed={name === color}
                disabled={
                  !p.variants.some((x) => x.color === name && x.stock > 0)
                }
                onClick={() =>
                  choose(
                    name,
                    resolveVariant(p.variants, name, size) ? size : "",
                  )
                }
              >
                <span
                  className="color-swatch"
                  style={{ backgroundColor: swatchColor(name) || "#b8a79a" }}
                  aria-hidden="true"
                />
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3">
            Size{size ? `: ${size}` : " — choose a size"}
          </legend>
          {!color && (
            <p className="muted text-sm">
              Choose a color to see available sizes.
            </p>
          )}
          <div className="variant-options">
            {options.sizes.map((name) => (
              <button
                type="button"
                key={name}
                className="navchip"
                aria-label={`Size: ${name}`}
                aria-pressed={name === size}
                disabled={!resolveVariant(p.variants, color, name)}
                onClick={() => choose(color, name)}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        {!p.variants.some((x) => x.stock > 0) && (
          <p role="status">This piece is sold out.</p>
        )}
        <p className="muted text-sm">
          {v
            ? `${v.size} / ${v.color} selected`
            : "Select an available size and color to add this piece."}
        </p>
        <button
          className="btn"
          disabled={p.display_only || !v || !ready || adding}
          onClick={async () => {
            if (p.display_only || !v || !ready || adding) return;
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
          {p.display_only
            ? "Ordering unavailable in preview"
            : adding
              ? "Adding…"
              : "Add to bag"}
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
