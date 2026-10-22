import React from "react";
import { categoryGroups, inCollection } from "../../shared/categories.js";

// Only public catalog images; the neutral fallback makes no merchandise claim.
export default function CategoryTiles({ products, group }) {
  const groups = group
    ? categoryGroups.filter((g) => g.slug === group)
    : categoryGroups;
  return (
    <div className="category-sections">
      {groups.map((g) => (
        <section key={g.slug} aria-label={g.label}>
          <div className="collection-heading">
            <h2>{g.label}</h2>
            <a href={`/category/${g.slug}`}>
              Shop all {g.label.toLowerCase()} →
            </a>
          </div>
          <div className="category-tiles">
            {g.categories.map((c) => {
              const product = products.find(
                (p) =>
                  p.active !== false &&
                  p.active !== 0 &&
                  inCollection(p, c.slug),
              );
              return (
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
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
