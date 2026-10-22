import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { createRequire } from "node:module";
import {
  collections,
  inCollection,
  editProduct,
  productPayload,
} from "../src/catalog.js";
const fixtures = JSON.parse(
  await readFile(
    new URL("./fixtures/synthetic-catalog.json", import.meta.url),
    "utf8",
  ),
);
test("all six persisted collections match samples without invented badge fields", () => {
  for (const c of collections.filter((c) =>
    ["new-in", "dresses", "tops", "sets", "jackets", "sale"].includes(c.slug),
  ))
    assert.equal(fixtures.filter((p) => inCollection(p, c.slug)).length, 1);
  assert.equal(inCollection({ category: "New In" }, "new"), true);
  assert.equal(
    inCollection({ category: "Tops", badge: "new" }, "new-in"),
    false,
  );
});
test("synthetic samples are labelled, inactive and never assert a discount", () => {
  for (const p of fixtures) {
    assert.match(p.title, /SYNTHETIC SAMPLE/);
    assert.equal(p.active, false);
    assert.match(p.description, /Test fixture only/);
    assert.equal(p.compare_at_price, undefined);
  }
});
test("editing preserves stock snapshot for optimistic server checks", () => {
  const p = editProduct(fixtures[0]);
  p.variants[0].stock = 1;
  const result = productPayload(p);
  assert.equal(result.variants[0].expected_stock, 2);
  assert.equal(result.variants[0].stock, 1);
  assert.equal(fixtures[0].variants[0].stock, 2);
  assert.equal(result.customer_name, undefined);
});
test("product form rejects duplicate variants and fractional/negative stock", () => {
  const p = editProduct(fixtures[0]);
  p.variants.push({ ...p.variants[0] });
  assert.throws(() => productPayload(p), /unique/);
  p.variants.pop();
  for (const stock of [-1, 1.5]) {
    p.variants[0].stock = stock;
    assert.throws(() => productPayload(p), /stock/);
  }
});
test("rendered UI escapes merchandise text and exposes labelled structured controls", async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {renderToStaticMarkup as render} from 'react-dom/server'; import Card from './src/components/ProductCard.jsx'; import Editor from './src/components/ProductEditor.jsx'; import Filters from './src/components/Filters.jsx'; export {render,React,Card,Editor,Filters};`,
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
  const { render, React, Card, Editor, Filters } = compiled.exports;
  const card = render(
    React.createElement(Card, {
      p: { ...fixtures[0], title: "<img src=x onerror=alert(1)>" },
    }),
  );
  assert.match(card, /&lt;img/);
  assert.doesNotMatch(card, /<img src=x/);
  assert.match(card, /width="640"/);
  const editor = render(
    React.createElement(Editor, { catalog: { products: fixtures } }),
  );
  for (const label of [
    "Product ID",
    "Image URL or local path",
    "Price (USD cents)",
    "Add size/color variant",
  ])
    assert.ok(editor.includes(label));
  assert.match(editor, /type="file"/);
  assert.match(editor, /aria-label="Choose product image"/);
  assert.match(editor, /accept="image\/jpeg,image\/png"/);
  assert.match(editor, /Upload Image/);
  assert.match(editor, /Uploading does not save or publish/);
  const filters = render(
    React.createElement(Filters, {
      q: "",
      min: 0,
      max: 1000,
      cat: "all",
      size: "XXS",
      cats: ["all"],
      sizesAll: ["XXS", "Free Size"],
    }),
  );
  assert.match(filters, /aria-pressed="true"/);
  assert.match(filters, /Free Size/);
});
