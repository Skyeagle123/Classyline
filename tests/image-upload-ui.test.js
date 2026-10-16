import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { UPLOAD_TIMEOUT_MS, uploadProductImage } from "../src/image-upload.js";

// Mount the real components and run hooks/effects/events. This is a simulated
// React renderer, not a native DOM/mobile-browser or live Cloudflare test.
const compiled = await build({
  stdin: {
    contents:
      "export {default as Editor} from './src/components/ProductEditor.jsx';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["react"],
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { Editor } = module.exports;
const products = JSON.parse(
  await readFile(
    new URL("./fixtures/synthetic-catalog.json", import.meta.url),
    "utf8",
  ),
);
const photo = new File([new Uint8Array([1, 2, 3])], "synthetic.png", {
  type: "image/png",
});
const reference =
  "/api/product-images/12345678-1234-4123-8123-123456789abc.png";
function button(root, text) {
  return root.findAllByType("button").find((n) => n.children.includes(text));
}
function field(root, label) {
  return root
    .findAllByType("label")
    .find((n) => n.children.includes(label))
    .findByType("input");
}
const formFieldset = (root) =>
  root.findAllByType("fieldset").find((n) => n.props.className === "space-y-4");
async function mount(t, existing = false) {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("Unexpected network request");
  });
  let serial = 0;
  t.mock.method(URL, "createObjectURL", () => `blob:synthetic-${++serial}`);
  t.mock.method(URL, "revokeObjectURL", () => {});
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(Editor, {
        catalog: { products },
        run: async (fn) => fn(),
        refresh: async () => {},
      }),
    );
  });
  t.after(async () => {
    await act(async () => renderer.unmount());
  });
  const root = renderer.root;
  if (existing)
    await act(async () =>
      root
        .findAllByType("select")[0]
        .props.onChange({ target: { value: products[0].id } }),
    );
  return { root, renderer };
}
async function choose(root) {
  await act(async () =>
    root
      .findByProps({ type: "file" })
      .props.onChange({ target: { files: [photo], value: "synthetic.png" } }),
  );
}
async function start(root) {
  let request;
  await act(async () => {
    request = button(root, "Upload Image").props.onClick();
  });
  return { request };
}

test("mounted editor retains selection during Product ID/title edits and resets only on intentional product switch", async (t) => {
  const { root } = await mount(t);
  await choose(root);
  const preview = root.findByProps({
    alt: "Selected product image — not uploaded yet",
  }).props.src;
  for (const [label, value] of [
    ["Product ID", "SKU-A"],
    ["Product ID", "SKU-B"],
    ["Product title", "Synthetic shirt"],
  ]) {
    await act(async () =>
      field(root, label).props.onChange({ target: { value } }),
    );
    assert.equal(
      root.findByProps({ alt: "Selected product image — not uploaded yet" })
        .props.src,
      preview,
    );
    assert.equal(button(root, "Upload Image").props.disabled, false);
  }
  await act(async () =>
    root
      .findAllByType("select")[0]
      .props.onChange({ target: { value: products[0].id } }),
  );
  assert.equal(
    root.findAllByProps({ alt: "Selected product image — not uploaded yet" })
      .length,
    0,
  );
  assert.equal(button(root, "Upload Image").props.disabled, true);
  await choose(root);
  await act(async () =>
    root.findAllByType("select")[0].props.onChange({ target: { value: "" } }),
  );
  assert.equal(button(root, "Upload Image").props.disabled, true);
});

test("mounted editor resets selected image after a successful intentional form save/reset", async (t) => {
  const { root } = await mount(t, true);
  await choose(root);
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(field(root, "Product ID").props.value, "");
  assert.equal(button(root, "Upload Image").props.disabled, true);
  assert.equal(
    root.findAllByProps({ alt: "Selected product image — not uploaded yet" })
      .length,
    0,
  );
});

test("mounted Cancel upload remains usable, restores editing and ignores late success; retry requires explicit action", async (t) => {
  const { root } = await mount(t, true);
  await choose(root);
  const original = field(root, "Image URL or local path").props.value;
  let finish,
    signal,
    calls = 0;
  t.mock.method(globalThis, "fetch", (_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { request } = await start(root);
  assert.equal(formFieldset(root).props.disabled, true);
  const cancel = button(root, "Cancel upload");
  for (let parent = cancel.parent; parent; parent = parent.parent)
    assert.ok(!(parent.type === "fieldset" && parent.props.disabled));
  await act(async () => {
    cancel.props.onClick();
    await request;
  });
  assert.equal(signal.aborted, true);
  assert.equal(formFieldset(root).props.disabled, false);
  assert.equal(field(root, "Image URL or local path").props.value, original);
  assert.match(
    root.findByProps({ role: "status" }).children.join(""),
    /cancelled.*not confirmed/,
  );
  await act(async () =>
    finish(Response.json({ image: reference }, { status: 201 })),
  );
  assert.equal(field(root, "Image URL or local path").props.value, original);
  assert.equal(calls, 1);
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ image: reference }, { status: 201 });
  });
  await act(async () => button(root, "Upload Image").props.onClick());
  assert.equal(field(root, "Image URL or local path").props.value, reference);
  assert.equal(calls, 2);
  assert.equal(root.findByProps({ type: "checkbox" }).props.checked, false);
});

test("mounted upload timeout restores editing and ignores delayed receipt body without retry", async (t) => {
  const { root } = await mount(t, true);
  await choose(root);
  const original = field(root, "Image URL or local path").props.value;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finish,
    signal,
    calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    signal = options.signal;
    return {
      ok: true,
      status: 201,
      json: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
  });
  const { request } = await start(root);
  await act(async () => {
    t.mock.timers.tick(UPLOAD_TIMEOUT_MS);
    await request;
  });
  assert.equal(signal.aborted, true);
  assert.equal(formFieldset(root).props.disabled, false);
  assert.match(
    root.findByProps({ role: "status" }).children.join(""),
    /timed out.*not confirmed/,
  );
  assert.equal(field(root, "Image URL or local path").props.value, original);
  await act(async () => finish({ image: reference }));
  assert.equal(field(root, "Image URL or local path").props.value, original);
  assert.equal(calls, 1);
  await act(async () =>
    field(root, "Product title").props.onChange({
      target: { value: "Can edit after timeout" },
    }),
  );
  assert.equal(
    field(root, "Product title").props.value,
    "Can edit after timeout",
  );
});

test("unmount aborts an in-flight upload; a pre-cancelled request never starts", async (t) => {
  const { root, renderer } = await mount(t, true);
  await choose(root);
  let signal,
    calls = 0;
  t.mock.method(globalThis, "fetch", (_url, options) => {
    signal = options.signal;
    calls++;
    return new Promise(() => {});
  });
  const { request } = await start(root);
  await act(async () => {
    renderer.unmount();
    await request;
  });
  assert.equal(signal.aborted, true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(uploadProductImage(photo, controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});
