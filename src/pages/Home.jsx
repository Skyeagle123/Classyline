import React from "react";
import Filters from "../components/Filters.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { loadProducts } from "../utils.js";
import { collections } from "../catalog.js";

export default function Home() {
  const [products, setProducts] = React.useState([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    loadProducts()
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const [q, setQ] = React.useState("");
  const [min, setMin] = React.useState(0);
  const [max, setMax] = React.useState(1000);
  const [cat, setCat] = React.useState("all");
  const [size, setSize] = React.useState("");

  const cats = React.useMemo(
    () => [
      "all",
      ...Array.from(new Set(products.map((p) => p.category || "Other"))),
    ],
    [products],
  );
  const sizesAll = [...new Set(products.flatMap((p) => p.sizes || []))];
  function resetFilters() {
    setQ("");
    setMin(0);
    setMax(1000);
    setCat("all");
    setSize("");
  }

  const list = products.filter(
    (p) =>
      (!q || p.title.toLowerCase().includes(q.toLowerCase())) &&
      p.price >= min &&
      p.price <= max &&
      (cat === "all" || p.category === cat) &&
      (!size || (p.sizes || []).includes(size)),
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">THE CLASSYLINE COLLECTION</p>
        <h1>
          Everyday pieces.
          <br />
          Your own expression.
        </h1>
        <p>
          Considered style, effortless comfort. Women’s fashion delivered
          throughout Lebanon.
        </p>
        <a className="btn mt-6" href="#collection">
          Explore the collection ↓
        </a>
        <div className="collection-links">
          {collections.map((c) => (
            <a key={c.slug} href={`/category/${c.slug}`}>
              {c.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
      <main
        id="collection"
        className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6"
      >
        <Filters
          {...{
            q,
            setQ,
            min,
            setMin,
            max,
            setMax,
            cat,
            setCat,
            size,
            setSize,
            cats,
            sizesAll,
          }}
        />
        <section className="lg:col-span-3">
          <div className="collection-heading">
            <h2>The collection</h2>
            <button className="navchip" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
          <p role="status">
            {error ||
              (loading
                ? "Loading collection…"
                : !list.length
                  ? "No products to show yet."
                  : `${list.length} pieces`)}
          </p>
          {!loading && !error && !list.length && (
            <div className="empty-state">
              <h3>
                {products.length
                  ? "A little room to explore"
                  : "The collection is on its way"}
              </h3>
              <p>
                {products.length
                  ? "Try another size or reset your filters to see all pieces."
                  : "Please check back for available pieces."}
              </p>
            </div>
          )}
          <div className="product-grid">
            {list.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
