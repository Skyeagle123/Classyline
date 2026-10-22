import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { handle } from "../server/api.js";
import { database } from "./adapter.js";
import { validWhatsAppNumber } from "../server/checkout.js";
import { swatchColor, resolveVariant } from "../src/variants.js";
import {
  CHECKOUT_PROTOCOL_HEADER,
  CHECKOUT_PROTOCOL_VERSION,
} from "../shared/checkout-protocol.js";

const number = "96178719771";
const origin = "https://v21-offline.invalid";
const payload = {
  name: "Synthetic customer",
  phone: "+96170000000",
  address: "Synthetic private address",
  region: "beirut",
  channel: "whatsapp",
  expected_total_cents: 4000,
  items: [{ variant_id: "v", qty: 1 }],
};
function env(value) {
  const DB = database();
  DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Synthetic shirt','Tops','','/synthetic.jpg',3800,1); INSERT INTO variants VALUES ('v','p','Free Size','Light Blue',3); UPDATE regions SET fee_cents=200 WHERE id='beirut'",
  );
  return { DB, ...(value === undefined ? {} : { WHATSAPP_NUMBER: value }) };
}
function request(path, method = "GET", body, headers = {}) {
  return new Request(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      [CHECKOUT_PROTOCOL_HEADER]: CHECKOUT_PROTOCOL_VERSION,
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const post = (e, body = payload, key = crypto.randomUUID(), headers = {}) =>
  handle(
    request("/orders", "POST", body, { "Idempotency-Key": key, ...headers }),
    e,
  );
const scalar = (e, sql) => e.DB.sqlite.prepare(sql).get();
const invalid = [
  undefined,
  null,
  "",
  "+96178719771",
  "961 78 719 771",
  "96178719771\n",
  "96178719771\r\n",
  "96178719771 ",
  " 96178719771",
  "096178719771",
  "1234567",
  "1".repeat(16),
  "96178719771?x=1",
  "javascript:alert(1)",
  96178719771,
  true,
  ["96178719771"],
  { toString: () => number },
];
for (const [i, value] of invalid.entries())
  test(`invalid WhatsApp configuration ${i}: hidden/refused, COD independently persists`, async () => {
    const e = env(value);
    try {
      assert.equal(validWhatsAppNumber(value), false);
      assert.equal(
        (await (await handle(request("/catalog"), e)).json()).whatsapp_enabled,
        false,
      );
      assert.equal((await post(e)).status, 503);
      assert.equal(scalar(e, "SELECT count(*) n FROM orders").n, 0);
      assert.equal(scalar(e, "SELECT stock FROM variants").stock, 3);
      const cod = await post(e, { ...payload, channel: "cod" });
      assert.equal(cod.status, 201);
      assert.equal((await cod.json()).whatsapp_url, undefined);
      assert.equal(
        scalar(e, "SELECT channel,status FROM orders").channel,
        "cod",
      );
    } finally {
      e.DB.sqlite.close();
    }
  });
test("configured WhatsApp saves one pending order, uses saved details, and recovers without duplicate stock reservation", async () => {
  const e = env(number),
    key = crypto.randomUUID();
  try {
    assert.equal(
      (await (await handle(request("/catalog"), e)).json()).whatsapp_enabled,
      true,
    );
    const response = await post(e, payload, key);
    assert.equal(response.status, 201);
    const receipt = await response.json();
    const link = new URL(receipt.whatsapp_url),
      message = link.searchParams.get("text");
    assert.equal(link.origin, "https://wa.me");
    assert.equal(link.pathname, "/" + number);
    for (const text of [
      receipt.reference,
      "Synthetic shirt",
      "Free Size",
      "Light Blue",
      "x1",
      "$38.00",
      "Delivery: $2.00",
      "Total: $40.00",
      "Cash on Delivery",
    ])
      assert(message.includes(text), text);
    assert(!message.includes(payload.name));
    assert(!message.includes(payload.address));
    assert(!message.includes(payload.phone));
    assert.equal(
      scalar(e, "SELECT status,channel FROM orders").status,
      "pending",
    );
    assert.equal(scalar(e, "SELECT channel FROM orders").channel, "whatsapp");
    e.DB.sqlite.exec(
      "UPDATE products SET title='Changed catalog title',price_cents=5000",
    );
    const comparable = ({ items, ...r }) => ({
      ...r,
      items: items.map(({ title, size, color, unit_cents, qty }) => ({
        title,
        size,
        color,
        unit_cents,
        qty,
      })),
    });
    const retry = await post(e, payload, key);
    assert.equal(retry.status, 200);
    assert.deepEqual(comparable(await retry.json()), comparable(receipt));
    const recovery = await handle(
      request("/orders/recover", "POST", { key }),
      e,
    );
    assert.equal(recovery.status, 200);
    assert.deepEqual(
      comparable((await recovery.json()).receipt),
      comparable(receipt),
    );
    assert.equal(scalar(e, "SELECT count(*) n FROM orders").n, 1);
    assert.equal(scalar(e, "SELECT stock FROM variants").stock, 2);
    assert.equal(scalar(e, "SELECT status FROM orders").status, "pending");
  } finally {
    e.DB.sqlite.close();
  }
});
test("valid WhatsApp configuration does not remove COD and cross-origin order requests still fail", async () => {
  const e = env(number);
  try {
    assert.equal(
      (
        await post(e, payload, crypto.randomUUID(), {
          Origin: "https://other.invalid",
        })
      ).status,
      403,
    );
    assert.equal(scalar(e, "SELECT count(*) n FROM orders").n, 0);
    assert.equal((await post(e, { ...payload, channel: "cod" })).status, 201);
    assert.equal(scalar(e, "SELECT channel,status FROM orders").channel, "cod");
    assert.equal(scalar(e, "SELECT status FROM orders").status, "pending");
  } finally {
    e.DB.sqlite.close();
  }
});
const colors = {
  Red: "#a23c43",
  "Light Blue": "#a8c7df",
  Cream: "#fff2d5",
  Teal: "#287e80",
  "Olive Green": "#6b7040",
  "Light Grey": "#d3d3d3",
  "Navy Blue": "#27394e",
  Magenta: "#b52682",
  Burgundy: "#7c263b",
  Bordeaux: "#7c263b",
  Beige: "#d7c2a3",
  Black: "#241e1b",
  "Charcoal Grey": "#45474b",
  "Chocolate Brown": "#664133",
  "Cream Beige": "#e7d8ba",
  "Emerald Green": "#227354",
  Ivory: "#f6f1e8",
  Pink: "#c9a39b",
  "Rose Pink": "#d28fa4",
  "Washed Blue": "#809bb4",
  White: "#fff",
};
test("all 21 recognized current catalog labels map to fixed CSS colors without modifying variant identities", () => {
  for (const [color, hex] of Object.entries(colors)) {
    assert.equal(swatchColor(color), hex);
    assert.equal(swatchColor(color.toUpperCase()), hex);
    const variant = { id: "stored-" + color, color, size: "No Size", stock: 1 };
    assert.equal(resolveVariant([variant], color, "No Size"), variant);
    assert.deepEqual(variant, {
      id: "stored-" + color,
      color,
      size: "No Size",
      stock: 1,
    });
    assert.equal(
      resolveVariant([{ ...variant, stock: 0 }], color, "No Size"),
      null,
    );
  }
  for (const unknown of [
    "Eashed Blue",
    "Light Blue / White Stripes",
    "constructor",
    "__proto__",
    "red; background:url(https://evil.invalid)",
    "<script>bad</script>",
  ])
    assert.equal(swatchColor(unknown), null);
});
const bundled = await build({
  stdin: {
    contents: `import React from 'react'; import Renderer from 'react-test-renderer'; import {renderToStaticMarkup as render} from 'react-dom/server'; import {ProductView} from './src/pages/ProductDetail.jsx'; export {React,Renderer,render,ProductView};`,
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
const { React, Renderer, render, ProductView } = compiled.exports;
function product() {
  return {
    id: "local",
    title: "Synthetic",
    category: "Tops",
    image: "/local.png",
    price_cents: 3800,
    variants: [
      { id: "light", color: "Cream", size: "Free Size", stock: 1 },
      { id: "unknown", color: "Eashed Blue", size: "No Size", stock: 1 },
      { id: "out", color: "Red", size: "M", stock: 0 },
    ],
  };
}
const props = {
  p: product(),
  selected: "",
  setSelected: () => {},
  msg: "",
  setMsg: () => {},
  adding: false,
  setAdding: () => {},
  add: async () => {},
  ready: true,
  cartError: "",
};
test("rendered color buttons always show a safe circle, including unknown labels and light colors", () => {
  const html = render(React.createElement(ProductView, props));
  assert.match(html, /background-color:#fff2d5/);
  assert.match(html, /background-color:#b8a79a/);
  assert.equal((html.match(/class="color-swatch"/g) || []).length, 3);
  assert.match(html, /aria-label="Color: Eashed Blue" aria-pressed="false"/);
  assert.match(
    html,
    /aria-label="Color: Red" aria-pressed="false" disabled=""/,
  );
});
test("mounted color/size selection retains accessible pressed state and only adds the exact available variant", async () => {
  const added = [];
  function Fixture() {
    const [selected, setSelected] = React.useState("");
    return React.createElement(ProductView, {
      ...props,
      selected,
      setSelected,
      add: async (item) => added.push(item),
    });
  }
  let view;
  await Renderer.act(async () => {
    view = Renderer.create(React.createElement(Fixture));
  });
  const button = (label) =>
    view.root
      .findAllByType("button")
      .find((b) => b.props["aria-label"] === label);
  assert.equal(button("Color: Red").props.disabled, true);
  await Renderer.act(async () => button("Color: Cream").props.onClick());
  assert.equal(button("Color: Cream").props["aria-pressed"], true);
  assert.equal(button("Size: No Size").props.disabled, true);
  await Renderer.act(async () => button("Size: Free Size").props.onClick());
  const add = view.root
    .findAllByType("button")
    .find((b) => b.children.includes("Add to bag"));
  await Renderer.act(async () => add.props.onClick());
  assert.deepEqual(added, [{ variant_id: "light" }]);
  await Renderer.act(async () => button("Color: Eashed Blue").props.onClick());
  assert.equal(button("Size: Free Size").props.disabled, true);
  assert.equal(button("Size: No Size").props.disabled, false);
  await Renderer.act(async () => view.unmount());
});
