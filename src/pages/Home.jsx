import React from "react";
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
        className="max-w-7xl mx-auto px-4 py-6"
      >
        <section className="w-full">
          <div className="collection-heading">
            <h2>The collection</h2>
          </div>
          <p role="status">
            {error ||
              (loading
                ? "Loading collection…"
                : !products.length
                  ? "No products to show yet."
                  : `${products.length} ${products.length === 1 ? "piece" : "pieces"}`)}
          </p>
          {!loading && !error && !products.length && (
            <div className="empty-state">
              <h3>The collection is on its way</h3>
              <p>Please check back for available pieces.</p>
            </div>
          )}
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
