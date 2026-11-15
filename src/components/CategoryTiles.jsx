import React from "react";
import { categoryGroups, inCollection } from "../../shared/categories.js";

export default function CategoryTiles({ products, group }) {
  const groups = group
    ? categoryGroups.filter((g) => g.slug === group)
    : categoryGroups;
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      tiles: g.categories.flatMap((category) => {
        const product = products.find(
          (p) =>
            p.active !== false &&
            p.active !== 0 &&
            p.image &&
            inCollection(p, category.slug),
        );
        return product ? [{ category, image: product.image }] : [];
      }),
    }))
    .filter((g) => g.tiles.length > 0);
  return (
    <div className="category-sections">
      {visibleGroups.map((g) => (
        <section key={g.slug} aria-label={g.label}>
          <div className="collection-heading">
            <h2>{g.label}</h2>
            <a href={`/category/${g.slug}`}>
              Shop all {g.label.toLowerCase()} →
            </a>
          </div>
          <div className="category-tiles">
            {g.tiles.map(({ category: c, image }) => (
              <a
                className="category-tile"
                href={`/category/${c.slug}`}
                key={c.slug}
              >
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  width="400"
                  height="500"
                />
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
