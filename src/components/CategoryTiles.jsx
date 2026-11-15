import React from "react";
import { categoryGroups, inCollection } from "../../shared/categories.js";

// Only public catalog images; the neutral fallback makes no merchandise claim.
export default function CategoryTiles({
  products,
  group,
  hideEmpty = false,
  className = "",
}) {
  const groups = group
    ? categoryGroups.filter((g) => g.slug === group)
    : categoryGroups;
  const activeProducts = products.filter(
    (p) => p.active !== false && p.active !== 0,
  );
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      tiles: g.categories
        .map((category) => ({
          category,
          product: activeProducts.find((p) => inCollection(p, category.slug)),
        }))
        .filter(({ product }) => !hideEmpty || product),
    }))
    .filter((g) => g.tiles.length > 0);

  if (visibleGroups.length === 0) return null;

  return (
    <div className={`category-sections ${className}`.trim()}>
      {visibleGroups.map((g) => (
        <section key={g.slug} aria-label={g.label}>
          <div className="collection-heading">
            <h2>{g.label}</h2>
            <a href={`/category/${g.slug}`}>
              Shop all {g.label.toLowerCase()} →
            </a>
          </div>
          <div className="category-tiles">
            {g.tiles.map(({ category: c, product }) => (
              <a
                className="category-tile"
                href={`/category/${c.slug}`}
                key={c.slug}
              >
                {product?.image ? (
                  <img
                    src={product.image}
                    alt=""
                    loading="lazy"
                    width="400"
                    height="500"
                  />
                ) : (
                  <span className="category-placeholder" aria-hidden="true">
                    <span>CL</span>
                  </span>
                )}
                <span className="category-tile-label">
                  {c.label}
                  <span aria-hidden="true">↗</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
