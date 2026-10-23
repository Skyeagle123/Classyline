import React from "react";
import { money } from "../api.js";
import { variantOptions } from "../variants.js";
export default function ProductCard({ p }) {
  return (
    <article className="card product-card overflow-hidden">
      <a href={`/product/${encodeURIComponent(p.id)}`}>
        <img
          loading="lazy"
          width="640"
          height="800"
          src={p.image}
          alt={p.title}
          className="w-full aspect-[4/5] object-cover"
        />
        <div className="p-4">
          <p className="eyebrow">{p.category}</p>
          <h3 className="text-xl mt-1">{p.title}</h3>
          <p className="mt-2">{money(p.price_cents)}</p>
          <p className="text-sm mt-2">
            {p.display_only
              ? "Preview · ordering unavailable"
              : p.variants.some((v) => v.stock > 0)
                ? "Choose size & color"
                : "Sold out"}
          </p>
          <p className="muted text-sm mt-2">
            {variantOptions(p.variants).sizes.join(" · ")}
          </p>
        </div>
      </a>
    </article>
  );
}
