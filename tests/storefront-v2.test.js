import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { unzipSync, strFromU8 } from "fflate";
import {
  clothing,
  accessories,
  collections,
  categoryGroups,
  CATEGORIES,
  inCollection,
  collectionLabel,
  pieceCount,
} from "../shared/categories.js";
import {
  variantOptions,
  resolveVariant,
  swatchColor,
} from "../src/variants.js";
import { validateRows, exportRows } from "../shared/catalog-import.js";
import { parseWorkbook, createWorkbook } from "../src/excel.js";
import { database } from "./adapter.js";
import { handle } from "../server/api.js";
import { digest } from "../server/security.js";

const bundled = await build({
  stdin: {
    contents: `import React from 'react';
import Renderer from 'react-test-renderer'; import {renderToStaticMarkup as render} from 'react-dom/server';
import Navigation from './src/components/ShopNavigation.jsx'; import Tiles from './src/components/CategoryTiles.jsx';
import {ProductView} from './src/pages/ProductDetail.jsx'; export {React, Renderer, render, Navigation, Tiles, ProductView};`,
    resolveDir: process.cwd(),
    loader: "jsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["react", "react-dom/server", "react-test-renderer"],
});
const compiled = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports,
);
const { React, Renderer, render, Navigation, Tiles, ProductView } =
  compiled.exports;
const { act } = Renderer;
const variants = [
  {
    id: "EXACT-MULTIWORD-M",
    color: "Light Blue / White Stripes",
    size: "M",
    stock: 1,
  },
  {
    id: "EXACT-MULTIWORD-L",
    color: "Light Blue / White Stripes",
    size: "L",
    stock: 0,
  },
  { id: "EXACT-RED-L", color: "Red", size: "L", stock: 2 },
  { id: "EXACT-RED-FREE", color: "Red", size: "Free Size", stock: 1 },
  { id: "EXACT-IVORY-NONE", color: "Ivory", size: "No Size", stock: 1 },
  { id: "EXACT-BLACK-8", color: "Black", size: "8", stock: 0 },
];
const product = {
  id: "V2-LOCAL",
  title: "Local synthetic fixture",
  category: "Shirts",
  description: "Offline only",
  active: 1,
  image: "/products/cl-shirt-001.jpg",
  price_cents: 3800,
  variants,
};

test("one taxonomy exposes all 16 clothing and five nested accessory categories", () => {
  assert.equal(clothing.length, 16);
  assert.equal(accessories.length, 5);
  assert.deepEqual(
    categoryGroups.map((g) => g.label),
    ["Clothing", "Accessories"],
  );
  for (const c of [...clothing, ...accessories]) {
    assert(CATEGORIES.includes(c.label));
    assert(inCollection({ category: c.label }, c.slug));
    assert.equal(collectionLabel(c.slug), c.label);
  }
  assert.equal(
    new Set(collections.map((c) => c.slug)).size,
    collections.length,
  );
});
test("Shop All, groups and explicit New In/Sale tags preserve existing metadata", () => {
  assert(inCollection({ category: "Custom existing label" }, "shop-all"));
  assert(inCollection({ category: "Jeans" }, "clothing"));
  assert(inCollection({ category: "Scarves" }, "accessories"));
  assert(!inCollection({ category: "Scarves" }, "clothing"));
  assert(
    inCollection(
      { category: "Tops", collections: ["New In", "Sale"] },
      "new-in",
    ),
  );
  assert(
    inCollection({ category: "Tops", collections: ["New In", "Sale"] }, "sale"),
  );
  assert(!inCollection({ category: "Tops", badge: "sale" }, "sale"));
  const legacy = { category: "Pajamas" };
  assert(inCollection(legacy, "pajamas-sleepwear"));
  assert(inCollection(legacy, "pajamas"));
  assert.equal(legacy.category, "Pajamas");
  assert.equal(pieceCount(1), "1 piece");
  assert.equal(pieceCount(2), "2 pieces");
});
test("tiles use eligible public images and neutral fallbacks; draft image is never selected", () => {
  const html = render(
    React.createElement(Tiles, {
      group: "accessories",
      products: [
        {
          ...product,
          category: "Scarves",
          active: 0,
          image: "/api/product-images/private-draft.png",
        },
        {
          ...product,
          category: "Socks",
          active: 1,
          image: "/products/authorized.jpg",
        },
      ],
    }),
  );
  assert(!html.includes("private-draft"));
  assert(html.includes("/products/authorized.jpg"));
  assert(html.includes('class="category-placeholder"'));
  assert(html.includes("Hair Accessories"));
});
test("navigation disclosure has independent New In/Shop/Sale and keyboard/mobile close behavior", () => {
  const handlers = new Map(),
    previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  globalThis.window = globalThis.document = {
    addEventListener: (n, f) => handlers.set(n, f),
    removeEventListener: (n) => handlers.delete(n),
  };
  let view,
    focused = false;
  try {
    act(() => {
      view = Renderer.create(React.createElement(Navigation), {
        createNodeMock: (el) =>
          el.type === "button"
            ? {
                focus: () => {
                  focused = true;
                },
              }
            : { contains: () => false },
      });
    });
    const nav = view.root.findByType("nav"),
      button = view.root.findByType("button");
    const direct = view.toJSON().children;
    assert.deepEqual(
      direct.slice(0, 3).map((el) => el.children[0]),
      ["New In", "Shop ", "Sale"],
    );
    assert.equal(button.props["aria-expanded"], false);
    assert.equal(
      view.root.findByProps({ className: "shop-panel" }).props.hidden,
      true,
    );
    act(() => button.props.onClick());
    assert.equal(button.props["aria-expanded"], true);
    assert(handlers.has("pointerdown"));
    act(() => nav.props.onKeyDown({ key: "Escape", stopPropagation() {} }));
    assert(focused);
    assert.equal(button.props["aria-expanded"], false);
    act(() => button.props.onClick());
    act(() =>
      view.root.findByProps({ href: "/category/scarves" }).props.onClick(),
    );
    assert.equal(button.props["aria-expanded"], false);
    act(() => button.props.onClick());
    act(() => handlers.get("pointerdown")({ target: {} }));
    assert.equal(button.props["aria-expanded"], false);
    act(() => button.props.onClick());
    act(() => handlers.get("popstate")());
    assert.equal(button.props["aria-expanded"], false);
    act(() => button.props.onClick());
    act(() =>
      nav.props.onBlur({
        relatedTarget: {},
        currentTarget: { contains: () => false },
      }),
    );
    assert.equal(button.props["aria-expanded"], false);
  } finally {
    if (view) act(() => view.unmount());
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
test("variant identities preserve exact multiword colors, existing sizes and ambiguous combinations fail closed", () => {
  assert.equal(
    variantOptions(variants).colors[0],
    "Light Blue / White Stripes",
  );
  assert.equal(
    resolveVariant(variants, "Light Blue / White Stripes", "M").id,
    "EXACT-MULTIWORD-M",
  );
  assert.equal(resolveVariant(variants, "Light Blue", "M"), null);
  assert.equal(
    resolveVariant(variants, "Light Blue / White Stripes", "L"),
    null,
  );
  assert.equal(resolveVariant(variants, "Red", "M"), null);
  assert.equal(
    resolveVariant(
      [...variants, { ...variants[0], id: "duplicate" }],
      variants[0].color,
      "M",
    ),
    null,
  );
  assert.equal(swatchColor("Light Blue / White Stripes"), null);
  for (const size of [
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "Free Size",
    "No Size",
    "8",
    "XXS",
  ])
    assert.equal(
      resolveVariant(
        [{ id: `stored-${size}`, color: "Other / Multi Word", size, stock: 1 }],
        "Other / Multi Word",
        size,
      ).id,
      `stored-${size}`,
    );
});
test("mounted independent controls disable impossible sizes and send only the exact chosen variant to cart", async () => {
  const added = [],
    before = JSON.stringify(product);
  function Fixture() {
    const [selected, setSelected] = React.useState(""),
      [msg, setMsg] = React.useState(""),
      [adding, setAdding] = React.useState(false);
    return React.createElement(ProductView, {
      p: product,
      selected,
      setSelected,
      msg,
      setMsg,
      adding,
      setAdding,
      add: async (x) => added.push(x),
      ready: true,
    });
  }
  let view;
  act(() => {
    view = Renderer.create(React.createElement(Fixture));
  });
  const find = (name) => view.root.findByProps({ "aria-label": name });
  const bag = () =>
    view.root.findAllByType("button").find((b) => b.props.className === "btn");
  try {
    assert(bag().props.disabled);
    assert(find("Size: M").props.disabled);
    assert(find("Color: Black").props.disabled);
    act(() => find("Color: Light Blue / White Stripes").props.onClick());
    assert.equal(find("Size: M").props.disabled, false);
    assert(find("Size: L").props.disabled);
    act(() => find("Size: M").props.onClick());
    await act(async () => {
      await bag().props.onClick();
    });
    assert.deepEqual(added, [{ variant_id: "EXACT-MULTIWORD-M" }]);
    act(() => find("Color: Red").props.onClick());
    assert(bag().props.disabled, "Changing to incompatible color clears size");
    act(() => find("Size: Free Size").props.onClick());
    await act(async () => {
      await bag().props.onClick();
    });
    act(() => find("Color: Ivory").props.onClick());
    assert(find("Size: Free Size").props.disabled);
    act(() => find("Size: No Size").props.onClick());
    await act(async () => {
      await bag().props.onClick();
    });
    assert.deepEqual(added.slice(1), [
      { variant_id: "EXACT-RED-FREE" },
      { variant_id: "EXACT-IVORY-NONE" },
    ]);
    assert.equal(JSON.stringify(product), before);
  } finally {
    act(() => view.unmount());
  }
});
test("out-of-stock and display-only products cannot be added", () => {
  for (const p of [
    { ...product, variants: variants.map((v) => ({ ...v, stock: 0 })) },
    { ...product, display_only: true },
  ]) {
    const html = render(
      React.createElement(ProductView, {
        p,
        selected: variants[0].id,
        ready: true,
      }),
    );
    assert.match(html, /class="btn" disabled=""/);
    if (!p.display_only) assert.match(html, /This piece is sold out/);
  }
});
const row = (category, i = 0) => ({
  SKU: `V2-EXCEL-${i}`,
  "Product Name": "Local synthetic fixture",
  Category: category,
  Collection: "New In",
  "Price USD": "38.00",
  Size: "Free Size | No Size",
  Color: "Light Blue / White Stripes | Red",
  Stock: "1 | 0",
  "Image Filename or URL": "/products/existing.jpg",
  Description: "Local test only",
  Status: "Draft",
});
test("every expanded and legacy category round-trips through the actual Excel contract", () => {
  for (const category of CATEGORIES) {
    const parsed = parseWorkbook(createWorkbook([row(category)]));
    const validated = validateRows(parsed)[0];
    assert.deepEqual(validated.errors, [], category);
    const p = validated.product;
    assert.equal(p.category, category);
    assert.equal(p.active, 0);
    assert.equal(
      exportRows([
        {
          ...p,
          variants: p.variants.map((v, i) => ({ ...v, id: `keep-${i}` })),
        },
      ])[0].Category,
      category,
    );
    assert.deepEqual(
      p.variants.map((v) => v.color),
      ["Light Blue / White Stripes", "Red"],
    );
  }
});
test("Excel category validation uses a named range with all labels, never a truncated inline list", () => {
  const parts = unzipSync(createWorkbook());
  const book = strFromU8(parts["xl/workbook.xml"]),
    data = strFromU8(parts["xl/worksheets/sheet1.xml"]);
  assert(book.includes(`Categories!$A$1:$A$${CATEGORIES.length}`));
  assert(book.includes('state="hidden"'));
  assert(data.includes("<formula1>ClassyLineCategories</formula1>"));
  const labels = strFromU8(parts["xl/worksheets/sheet3.xml"]);
  assert(labels.includes("Pajamas &amp; Sleepwear"));
  assert(labels.includes("Hair Accessories"));
  assert(validateRows([row("Invented category")])[0].errors.length);
});
test("per-product Excel variant limit remains 20, not silently split", () => {
  const r = row("Jeans");
  r.Size = Array.from({ length: 21 }, (_, i) => `size-${i}`).join(" | ");
  r.Color = Array(21).fill("Blue").join(" | ");
  r.Stock = Array(21).fill("1").join(" | ");
  assert(validateRows([r])[0].errors.some((e) => e.includes("1–20")));
});
const origin = "https://offline-v2.test";
const request = (path, method = "GET", data, auth = true) =>
  new Request(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(auth ? { Cookie: "__Host-cl_session=v2-offline" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
test("expanded categories persist via authenticated API and preview-confirm-export without inventory or privacy changes", async () => {
  const DB = database(),
    env = { DB };
  try {
    DB.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?)")
      .run(await digest("v2-offline"), Math.floor(Date.now() / 1000) + 3600);
    DB.sqlite.exec(
      "INSERT INTO products VALUES ('KEEP','Existing Jeans','Jeans','','/products/keep.jpg',1800,1); INSERT INTO variants VALUES ('KEEP-V','KEEP','8','Blue',7)",
    );
    for (const [i, category] of CATEGORIES.entries()) {
      const p = {
        ...product,
        id: `V2-${i}`,
        active: false,
        category,
        variants: [
          { id: `V2-V-${i}`, size: "No Size", color: "Ivory", stock: 0 },
        ],
      };
      assert.equal(
        (await handle(request("/admin/products", "PUT", p), env)).status,
        200,
        category,
      );
    }
    const r = row("Scarves"),
      preview = await handle(
        request("/admin/catalog/preview", "POST", { rows: [r] }),
        env,
      );
    assert.equal(preview.status, 200);
    const ticket = await preview.json();
    assert.equal(
      DB.sqlite.prepare("SELECT count(*) n FROM products WHERE id=?").get(r.SKU)
        .n,
      0,
    );
    assert.equal(
      (
        await handle(
          request("/admin/catalog/import", "POST", {
            rows: [r],
            ticket: ticket.ticket,
            confirm_changes: true,
          }),
          env,
        )
      ).status,
      200,
    );
    const exported = await (
      await handle(request("/admin/catalog/export"), env)
    ).json();
    assert(
      exported.rows.some(
        (r) =>
          r.SKU === "V2-EXCEL-0" &&
          r.Category === "Scarves" &&
          r.Status === "Draft",
      ),
    );
    const catalog = await (
      await handle(request("/catalog", "GET", undefined, false), env)
    ).json();
    assert.deepEqual(
      catalog.products.map((p) => p.id),
      ["KEEP"],
    );
    assert.equal(
      DB.sqlite.prepare("SELECT stock FROM variants WHERE id='KEEP-V'").get()
        .stock,
      7,
    );
    assert.equal(DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 0);
    assert.equal(
      (await handle(request("/admin/catalog", "GET", undefined, false), env))
        .status,
      401,
    );
  } finally {
    DB.sqlite.close();
  }
});
test("responsive navigation and product columns retain mobile touch and desktop layout constraints", () => {
  const css = readFileSync(
    new URL("../src/index.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.shop-panel\[hidden\]\s*\{\s*display: none/);
  assert.match(css, /max-height: 65dvh/);
  assert.match(css, /overflow-y: auto/);
  assert.match(
    css,
    /\.product-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(
    css,
    /min-width: 640px[\s\S]*?\.product-grid\s*\{\s*grid-template-columns: repeat\(2/,
  );
  assert.match(
    css,
    /min-width: 900px[\s\S]*?\.product-grid\s*\{\s*grid-template-columns: repeat\(3/,
  );
});
