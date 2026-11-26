import React from "react";
import ProductCard from "../components/ProductCard.jsx";
import { loadProducts } from "../utils.js";
import { inCollection, collectionLabel } from "../catalog.js";
import { pieceCount, cottonUnderwear } from "../../shared/categories.js";

const quickCategories = [
  ["pajamas-sleepwear", "Pajamas"],
  ["sets", "Sets"],
  ["tops", "Tops"],
  ["skirts", "Skirts"],
  ["dresses", "Dresses"],
  ["knitwear", "Knitwear"],
  ["hoodies", "Hoodies"],
];

export default function Category({ slug, quickShop = false }) {
  const [products, setProducts] = React.useState([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    setProducts([]);
    setError("");
    setLoading(true);
    loadProducts()
      .then((all) => {
        if (live)
          setProducts(
            all.filter(
              (p) =>
                inCollection(p, slug) ||
                (quickShop &&
                  slug === "skirts" &&
                  inCollection(p, "sets") &&
                  /\bskirts?\b/i.test(p.title)),
            ),
          );
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [slug, quickShop]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      {quickShop ? (
        <>
          <h1 className="shop-title mb-4">Shop by Category</h1>
          <nav aria-label="Shop by Category" className="flex flex-wrap gap-2">
            {quickCategories.map(([id, label]) => (
              <a
                key={id}
                href={`/shop-by-category/${id}`}
                className={`navchip ${id === slug ? "btn" : ""}`}
                aria-current={id === slug ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        </>
      ) : (
        <a href="/" className="eyebrow">
          ← All pieces
        </a>
      )}
      <div className="collection-heading">
        {quickShop ? (
          <h2>{collectionLabel(slug)}</h2>
        ) : (
          <h1>{collectionLabel(slug)}</h1>
        )}
        <p role="status">
          {error ||
            (loading ? "Loading collection…" : pieceCount(products.length))}
        </p>
      </div>
      {(slug === "cotton-underwear" ||
        cottonUnderwear.some((category) => category.slug === slug)) && (
        <nav aria-label="Cotton & Underwear sections" className="flex flex-wrap gap-2 mb-6">
          <a href="/category/cotton-underwear" className="navchip"
            aria-current={slug === "cotton-underwear" ? "page" : undefined}>All</a>
          {cottonUnderwear.map((category) => (
            <a key={category.slug} href={`/category/${category.slug}`} className="navchip"
              aria-current={slug === category.slug ? "page" : undefined}>
              {category.shortLabel}
            </a>
          ))}
        </nav>
      )}
      {!loading && !error && !products.length && (
        <div className="empty-state">
          <h2>More to discover soon</h2>
          <p>No pieces are available in this collection yet.</p>
          <a href="/" className="navchip mt-4">
            Explore all pieces
          </a>
        </div>
      )}
      <div className="product-grid">
        {products.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </main>
  );
}
