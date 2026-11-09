import React from "react";
import ProductCard from "../components/ProductCard.jsx";
import { loadProducts } from "../utils.js";
import CategoryTiles from "../components/CategoryTiles.jsx";

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
        <img
          className="hero-cover"
          src="/classyline-facebook-cover.webp"
          alt="ClassyLine Women's Fashion — Everyday Elegance. A woman in a cream outfit beside a rack of clothing. Delivery throughout Lebanon and cash on delivery."
          width="2056"
          height="765"
          fetchPriority="high"
        />
        <div className="hero-content">
          <h1>
            Find your next favourite.
            <br />
            Wear it your way.
          </h1>
          <p>Sets, pyjamas, robes and everyday looks chosen for comfort and style.</p>
          <a className="btn mt-6" href="#collection">
            Shop the collection ↗
          </a>
          <div className="collection-links primary-collection-links">
            <a href="/category/new-in">New In ↗</a>
            <a href="/shop">Shop ↗</a>
            <a href="/category/sale">Sale ↗</a>
          </div>
        </div>
      </section>
      <div className="page">
        <CategoryTiles products={products} />
      </div>
      <main id="collection" className="max-w-7xl mx-auto px-4 py-6">
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
