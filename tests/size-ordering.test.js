import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { compareSizes, sortSizes } from "../src/sizes.js";
import { variantOptions, resolveVariant } from "../src/variants.js";

// Reproduce the three reported products' visible first-occurrence size order.
// Variant IDs below are synthetic; no live catalog or checkout is accessed.
const reportedProducts = [
  {
    id: "CL-FLARE-GIRLS-001",
    price_cents: 1000,
    title: "High-Waist Flared Pants — Girls",
    input: ["4", "16", "8", "14", "6", "12", "10"],
    expected: ["4", "6", "8", "10", "12", "14", "16"],
  },
  {
    id: "CL-FLARE-PLUS-001",
    price_cents: 1400,
    title: "High-Waist Flared Pants — Plus Sizes",
    input: ["5XL", "4XL", "2XL", "6XL", "3XL"],
    expected: ["2XL", "3XL", "4XL", "5XL", "6XL"],
  },
  {
    id: "CL-FLARE-REG-001",
    price_cents: 1200,
    title: "High-Waist Flared Pants — XS–XL",
    input: ["M", "L", "S", "XS", "XL"],
    expected: ["XS", "S", "M", "L", "XL"],
  },
];
const childrenWithY = {
  id: "synthetic-children-Y",
  price_cents: 1000,
  title: "Synthetic children ages with Y suffix",
  input: ["4Y", "16y", "8Y", "14y", "6Y", "12Y", "10y"],
  expected: ["4Y", "6Y", "8Y", "10y", "12Y", "14y", "16y"],
};
function product(fixture) {
  return {
    id: fixture.id,
    title: fixture.title,
    price_cents: fixture.price_cents,
    category: "Pants",
    description: "Offline sorting regression",
    image: "/synthetic.png",
    variants: ["Black", "Navy Blue"].flatMap((color, i) =>
      fixture.input.map((size, j) => ({
        id: `synthetic-${fixture.id}-${i}-${j}`,
        color,
        size,
        stock: 3,
      })),
    ),
  };
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const cases = [
  [
    "children ages with uppercase Y suffix",
    ["16Y", "4Y", "10Y", "6Y", "14Y", "8Y", "12Y"],
    ["4Y", "6Y", "8Y", "10Y", "12Y", "14Y", "16Y"],
  ],
  [
    "children ages with lowercase and uppercase suffixes preserve labels",
    ["16y", "4Y", "10y", "6Y", "14y", "8Y", "12Y"],
    ["4Y", "6Y", "8Y", "10y", "12Y", "14y", "16y"],
  ],
  [
    "numeric and Y age labels share numeric order but stay distinct",
    ["16y", "4Y", "10y", "4", "4y", "6Y", "8", "12Y", "14"],
    ["4", "4Y", "4y", "6Y", "8", "10y", "12Y", "14", "16y"],
  ],
  [
    "children ages mixed with standard and Free Size options",
    ["Free Size", "M", "4Y", "8", "S", "10Y", "XL", "6y"],
    ["S", "M", "XL", "4Y", "6y", "8", "10Y", "Free Size"],
  ],
  [
    "all standard sizes",
    ["6XL", "L", "XXS", "4XL", "XS", "XL", "S", "5XL", "M", "3XL", "2XL"],
    ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"],
  ],
  [
    "numeric clothing sizes",
    ["100", "42", "8", "36", "4", "10", "38"],
    ["4", "8", "10", "36", "38", "42", "100"],
  ],
  [
    "decimal sizes",
    ["10.5", "9.75", "9.5", "10", "0.5", "9.05"],
    ["0.5", "9.05", "9.5", "9.75", "10", "10.5"],
  ],
  [
    "large numeric sizes are exact",
    ["9007199254740993", "9007199254740992", "10000000000000000"],
    ["9007199254740992", "9007199254740993", "10000000000000000"],
  ],
  [
    "equivalent numeric labels stay distinct",
    ["2", "02", "2.0", "2.00"],
    ["02", "2", "2.0", "2.00"],
  ],
  [
    "standard aliases stay distinct",
    ["XXXL", "6XL", "XXL", "XL", "3XL", "XXXXXXL", "2XL"],
    ["XL", "2XL", "XXL", "3XL", "XXXL", "6XL", "XXXXXXL"],
  ],
  [
    "mixed formats and separate Free Size",
    ["Free Size", "38", "M", "10", "XS", "4", "2XL", "XL", "S"],
    ["XS", "S", "M", "XL", "2XL", "4", "10", "38", "Free Size"],
  ],
  [
    "case and whitespace only affect comparison",
    ["m", " XS ", "S", "M", "Free Size", "free size"],
    [" XS ", "S", "M", "m", "Free Size", "free size"],
  ],
  [
    "unrecognized labels are retained deterministically",
    [
      "Free Size",
      "No Size",
      "S/M",
      "constructor",
      "__proto__",
      "4-6",
      "10",
      "M",
    ],
    [
      "M",
      "10",
      "4-6",
      "constructor",
      "No Size",
      "S/M",
      "__proto__",
      "Free Size",
    ],
  ],
  ["Free Size alone", ["Free Size"], ["Free Size"]],
  ["empty list", [], []],
];
for (const [name, input, expected] of cases)
  test(`size comparator: ${name}`, () => {
    const original = [...input];
    freeze(input);
    assert.deepEqual(sortSizes(input), expected);
    assert.deepEqual(input, original);
    assert.deepEqual(sortSizes([...input].reverse()), expected);
  });
test("size comparator is reflexive, antisymmetric and transitive", () => {
  const values = [...new Set(cases.flatMap(([, input]) => input))];
  for (const a of values) {
    assert.equal(compareSizes(a, a), 0);
    for (const b of values) {
      assert.equal(
        Math.sign(compareSizes(a, b)) + Math.sign(compareSizes(b, a)),
        0,
      );
      for (const c of values)
        if (compareSizes(a, b) <= 0 && compareSizes(b, c) <= 0)
          assert(compareSizes(a, c) <= 0, `${a}, ${b}, ${c}`);
    }
  }
});
test("variant options keep exact label identities, colors and source objects", () => {
  const variants = freeze([
    { id: "one", size: "XXL", color: "Navy Blue", stock: 3 },
    { id: "two", size: "2XL", color: "Black", stock: 0 },
    { id: "three", size: "Free Size", color: "Navy Blue", stock: 2 },
    { id: "four", size: "XXL", color: "Black", stock: 1 },
  ]);
  const before = JSON.stringify(variants),
    options = variantOptions(variants);
  assert.deepEqual(options.colors, ["Navy Blue", "Black"]);
  assert.deepEqual(options.sizes, ["2XL", "XXL", "Free Size"]);
  assert.equal(resolveVariant(variants, "Black", "2XL"), null);
  assert.equal(resolveVariant(variants, "Black", "XXL"), variants[3]);
  assert.equal(JSON.stringify(variants), before);
});

const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import Renderer from 'react-test-renderer';
      import {renderToStaticMarkup as render} from 'react-dom/server';
      import {ProductView} from './src/pages/ProductDetail.jsx';
      import Card from './src/components/ProductCard.jsx';
      import Filters from './src/components/Filters.jsx';
      export {React,Renderer,render,ProductView,Card,Filters};`,
    resolveDir: process.cwd(),
    loader: "jsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["react", "react-test-renderer", "react-dom/server"],
});
const compiled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports,
);
const { React, Renderer, render, ProductView, Card, Filters } =
  compiled.exports;
const props = {
  selected: "",
  setSelected() {},
  msg: "",
  setMsg() {},
  adding: false,
  setAdding() {},
  add: async () => {},
  ready: true,
  cartError: "",
};
async function mount(p, additions) {
  function Fixture() {
    const [selected, setSelected] = React.useState("");
    return React.createElement(ProductView, {
      ...props,
      p,
      selected,
      setSelected,
      add: async (item) => additions.push(item),
    });
  }
  let view;
  await Renderer.act(async () => {
    view = Renderer.create(React.createElement(Fixture));
  });
  const buttons = () => view.root.findAllByType("button");
  return {
    view,
    buttons,
    option: (label) => buttons().find((b) => b.props["aria-label"] === label),
    sizes: () =>
      buttons().filter((b) => b.props["aria-label"]?.startsWith("Size: ")),
    add: () => buttons().find((b) => b.children.includes("Add to bag")),
    click: async (button) => {
      assert.equal(button.props.disabled, false);
      await Renderer.act(async () => button.props.onClick());
    },
  };
}
for (const fixture of [...reportedProducts, childrenWithY]) {
  test(`${fixture.id}: exact reported order corrected without changing variants`, () => {
    const p = freeze(product(fixture)),
      before = JSON.stringify(p);
    assert.deepEqual(variantOptions(p.variants).sizes, fixture.expected);
    assert.deepEqual(
      variantOptions([...p.variants].reverse()).sizes,
      fixture.expected,
    );
    assert.equal(JSON.stringify(p), before);
  });
  test(`${fixture.id}: product card presents the same ordered labels and price`, () => {
    const html = render(
      React.createElement(Card, { p: freeze(product(fixture)) }),
    );
    assert(html.includes(fixture.expected.join(" · ")));
    assert(html.includes(`$${(fixture.price_cents / 100).toFixed(2)}`));
    assert(html.includes(`/product/${fixture.id}`));
  });
  test(`${fixture.id}: mounted product sizes and both colors add exact variant IDs`, async () => {
    const p = freeze(product(fixture)),
      before = JSON.stringify(p),
      additions = [];
    const ui = await mount(p, additions);
    try {
      assert.deepEqual(
        ui.sizes().map((b) => b.children.join("")),
        fixture.expected,
      );
      assert(ui.sizes().every((b) => b.props.disabled));
      assert.equal(ui.add().props.disabled, true);
      const expected = [];
      for (const color of ["Black", "Navy Blue"]) {
        await ui.click(ui.option(`Color: ${color}`));
        assert(ui.sizes().every((b) => !b.props.disabled));
        for (const size of fixture.expected) {
          await ui.click(ui.option(`Size: ${size}`));
          assert.equal(ui.option(`Size: ${size}`).props["aria-pressed"], true);
          await ui.click(ui.add());
          expected.push({
            variant_id: p.variants.find(
              (v) => v.color === color && v.size === size,
            ).id,
          });
        }
      }
      assert.deepEqual(additions, expected);
      assert.equal(JSON.stringify(p), before);
    } finally {
      await Renderer.act(async () => ui.view.unmount());
    }
  });
}
test("color-dependent missing, sold-out and ambiguous sizes remain unavailable", async () => {
  const p = product(reportedProducts[2]);
  p.variants.find((v) => v.color === "Black" && v.size === "S").stock = 0;
  p.variants = p.variants.filter(
    (v) => !(v.color === "Navy Blue" && v.size === "XL"),
  );
  const navyM = p.variants.find(
    (v) => v.color === "Navy Blue" && v.size === "M",
  );
  p.variants.push({ ...navyM, id: "synthetic-ambiguous-M" });
  freeze(p);
  const before = JSON.stringify(p),
    additions = [],
    ui = await mount(p, additions);
  try {
    await ui.click(ui.option("Color: Black"));
    assert.equal(ui.option("Size: S").props.disabled, true);
    await ui.click(ui.option("Size: XL"));
    await ui.click(ui.add());
    await ui.click(ui.option("Color: Navy Blue"));
    assert.equal(ui.option("Size: XL").props.disabled, true);
    assert.equal(ui.option("Size: M").props.disabled, true);
    assert.equal(ui.add().props.disabled, true);
    assert(ui.sizes().every((b) => b.props["aria-pressed"] === false));
    await ui.click(ui.option("Size: S"));
    await ui.click(ui.add());
    assert.deepEqual(additions, [
      {
        variant_id: p.variants.find(
          (v) => v.color === "Black" && v.size === "XL",
        ).id,
      },
      {
        variant_id: p.variants.find(
          (v) => v.color === "Navy Blue" && v.size === "S",
        ).id,
      },
    ]);
    assert.equal(JSON.stringify(p), before);
  } finally {
    await Renderer.act(async () => ui.view.unmount());
  }
});
test("numeric, Y and y labels never substitute variant identity or availability", async () => {
  const p = product({
    id: "synthetic-exact-ages",
    title: "Synthetic exact age variants",
    price_cents: 1000,
    input: ["10y", "4Y", "4", "6Y", "4y", "16Y"],
  });
  p.variants.find((v) => v.color === "Black" && v.size === "4Y").stock = 0;
  p.variants = p.variants.filter(
    (v) => !(v.color === "Navy Blue" && v.size === "4y"),
  );
  freeze(p);
  const before = JSON.stringify(p),
    additions = [],
    ui = await mount(p, additions);
  try {
    assert.deepEqual(
      ui.sizes().map((b) => b.children.join("")),
      ["4", "4Y", "4y", "6Y", "10y", "16Y"],
    );
    await ui.click(ui.option("Color: Black"));
    assert.equal(ui.option("Size: 4Y").props.disabled, true);
    assert.equal(ui.option("Size: 4").props.disabled, false);
    await ui.click(ui.option("Size: 4y"));
    await ui.click(ui.add());
    await ui.click(ui.option("Color: Navy Blue"));
    assert.equal(ui.option("Size: 4y").props.disabled, true);
    assert.equal(ui.add().props.disabled, true);
    assert(ui.sizes().every((b) => b.props["aria-pressed"] === false));
    for (const size of ["4Y", "4"]) {
      await ui.click(ui.option(`Size: ${size}`));
      await ui.click(ui.add());
    }
    assert.deepEqual(
      additions,
      [
        ["Black", "4y"],
        ["Navy Blue", "4Y"],
        ["Navy Blue", "4"],
      ].map(([color, size]) => ({
        variant_id: p.variants.find((v) => v.color === color && v.size === size)
          .id,
      })),
    );
    assert.equal(JSON.stringify(p), before);
  } finally {
    await Renderer.act(async () => ui.view.unmount());
  }
});
test("mixed Free Size and standard options remain separately selectable", async () => {
  const p = freeze(
    product({
      id: "mixed",
      title: "Synthetic mixed sizes",
      price_cents: 1800,
      input: ["Free Size", "XL", "M", "38"],
      expected: ["M", "XL", "38", "Free Size"],
    }),
  );
  const additions = [],
    ui = await mount(p, additions);
  try {
    assert.deepEqual(
      ui.sizes().map((b) => b.children.join("")),
      ["M", "XL", "38", "Free Size"],
    );
    await ui.click(ui.option("Color: Black"));
    for (const size of ["Free Size", "M"]) {
      await ui.click(ui.option(`Size: ${size}`));
      await ui.click(ui.add());
    }
    assert.deepEqual(
      additions,
      ["Free Size", "M"].map((size) => ({
        variant_id: p.variants.find(
          (v) => v.color === "Black" && v.size === size,
        ).id,
      })),
    );
  } finally {
    await Renderer.act(async () => ui.view.unmount());
  }
});
test("retained size filter uses global sorting and preserves exact selection values", () => {
  const sizesAll = freeze(["Free Size", "XL", "10", "M", "4", "XS"]);
  const selected = [],
    view = Renderer.create(
      React.createElement(Filters, {
        q: "",
        min: 0,
        max: 1000,
        cat: "all",
        size: "10",
        cats: ["all"],
        sizesAll,
        setSize: (size) => selected.push(size),
      }),
    );
  try {
    const options = view.root.findAllByType("button");
    assert.deepEqual(
      options.map((b) => b.children.join("")),
      ["XS", "M", "XL", "4", "10", "Free Size"],
    );
    assert.equal(
      options.find((b) => b.children.includes("10")).props["aria-pressed"],
      true,
    );
    options.find((b) => b.children.includes("Free Size")).props.onClick();
    assert.deepEqual(selected, ["Free Size"]);
    assert.deepEqual(sizesAll, ["Free Size", "XL", "10", "M", "4", "XS"]);
  } finally {
    view.unmount();
  }
});
