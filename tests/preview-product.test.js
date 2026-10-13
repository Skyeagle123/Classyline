import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { createRequire } from "node:module";
import {
  previewProduct as p,
  customerProducts,
  isStorefrontPreview,
} from "../src/preview-product.js";
import { inCollection } from "../src/catalog.js";
const host = "a87e27d8.classyline2.pages.dev";

test("original owner image is byte-identical to recovered photograph", async () => {
  const bytes = await readFile(
    new URL("../public/products/cl-shirt-001.jpg", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "879105baed1cf4675cc362103e371b14f92c2d94b710a5d7a1eb5e9677643e0d",
  );
});
test("owner merchandise price, SKU, variant and explicit collections", () => {
  assert.equal(p.id, "CL-SHIRT-001");
  assert.equal(p.price_cents, 3800);
  assert.deepEqual(p.variants[0], {
    id: "CL-SHIRT-001-FREE-BLUE",
    size: "Free Size",
    color: "Light Blue / White Stripes",
    stock: 3,
  });
  assert.equal(inCollection(p, "tops"), true);
  assert.equal(inCollection(p, "new-in"), true);
  assert.equal(inCollection(p, "sale"), false);
});
test("display fallback excluded from production root, custom domains and unrelated branches", async () => {
  for (const hostname of [
    "classyline2.pages.dev",
    "shop.example.com",
    "other.classyline2.pages.dev",
    "a87e27d8.classyline2.pages.dev.evil.test",
    "localhost",
  ]) {
    assert.equal(isStorefrontPreview(hostname), false);
    assert.deepEqual(
      await customerProducts(hostname, async () => ({ products: [] })),
      [],
    );
    await assert.rejects(
      customerProducts(hostname, async () => {
        throw new Error("DB unavailable");
      }),
      /DB unavailable/,
    );
  }
});
test("preview displays without D1, isolated per load and authoritative server record wins", async () => {
  const fail = async () => {
    throw Object.assign(new Error("DB unavailable"), {
      code: "CATALOG_UNCONFIGURED",
    });
  };
  const first = await customerProducts(host, fail);
  assert.equal(first[0].display_only, true);
  first[0].variants[0].stock = 100;
  assert.equal((await customerProducts(host, fail))[0].variants[0].stock, 3);
  assert.equal(
    isStorefrontPreview("phase-storefront-cod-whatsapp.classyline2.pages.dev"),
    true,
  );
  assert.equal(
    isStorefrontPreview("phase-storefront-cod-whatsap.classyline2.pages.dev"),
    true,
  );
  const persisted = {
    ...p,
    display_only: undefined,
    price_cents: 4000,
    variants: [],
  };
  assert.deepEqual(
    await customerProducts(host, async () => ({ products: [persisted] })),
    [persisted],
  );
});
test("rendered card and responsive detail show real image, price and disabled ordering", async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {renderToStaticMarkup as render} from 'react-dom/server'; import Card from './src/components/ProductCard.jsx'; import {ProductView} from './src/pages/ProductDetail.jsx'; export {React, render, Card, ProductView};`,
      resolveDir: process.cwd(),
      loader: "jsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom/server"],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports,
  );
  const { React, render, Card, ProductView } = compiled.exports;
  const card = render(React.createElement(Card, { p }));
  assert.match(card, /Blue Striped Oversized Shirt/);
  assert.match(card, /\$38\.00/);
  assert.match(card, /\/products\/cl-shirt-001.jpg/);
  assert.match(card, /Preview · ordering unavailable/);
  const detail = render(
    React.createElement(ProductView, {
      p,
      selected: p.variants[0].id,
      ready: true,
    }),
  );
  assert.match(detail, /md:grid-cols-2/);
  assert.match(detail, /Owner-reported stock: 3 pieces/);
  assert.match(detail, /stock is not live-verified/);
  assert.match(
    detail,
    /<button class="btn" disabled="">Ordering unavailable in preview/,
  );
  assert.match(detail, /Free Size/);
  assert.match(detail, /Light Blue \/ White Stripes/);
});
