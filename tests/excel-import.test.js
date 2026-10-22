import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import { parseWorkbook, createWorkbook, MAX_FILE_BYTES } from "../src/excel.js";
import { HEADERS, validateRows, exportRows } from "../shared/catalog-import.js";
import { handle } from "../server/api.js";
import { digest } from "../server/security.js";
import { database } from "./adapter.js";
import { inCollection } from "../src/catalog.js";
import {
  CHECKOUT_PROTOCOL_HEADER,
  CHECKOUT_PROTOCOL_VERSION,
} from "../shared/checkout-protocol.js";
import { build } from "esbuild";
import { createRequire } from "node:module";
const row = (over = {}) => ({
  ...Object.fromEntries(HEADERS.map((h) => [h, ""])),
  SKU: "TEST-001",
  "Product Name": "SYNTHETIC TEST Shirt",
  Category: "Tops",
  Collection: "New In",
  "Price USD": "38",
  Size: "Free Size",
  Color: "Blue",
  Stock: "3",
  "Image Filename or URL": "cl-shirt-001.jpg",
  Description: "Synthetic local fixture",
  Status: "Draft",
  ...over,
});
const origin = "https://synthetic.test";
function req(path, method = "GET", data, token = "test-session", other = {}) {
  return new Request(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Cookie: "__Host-cl_session=" + token } : {}),
      ...other,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
async function env() {
  const DB = database();
  DB.sqlite
    .prepare("INSERT INTO sessions VALUES (?,?)")
    .run(await digest("test-session"), Math.floor(Date.now() / 1000) + 3600);
  return { DB };
}
async function preview(e, rows) {
  const r = await handle(req("/admin/catalog/preview", "POST", { rows }), e);
  assert.equal(r.status, 200);
  return r.json();
}
const submit = (e, rows, ticket, confirm_changes = true) =>
  handle(
    req("/admin/catalog/import", "POST", { rows, ticket, confirm_changes }),
    e,
  );
async function create(e, rows = [row()]) {
  const p = await preview(e, rows);
  const r = await submit(e, rows, p.ticket);
  assert.equal(r.status, 200);
  return r.json();
}
const count = (e, table) =>
  e.DB.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
test("actual owner template: exact headers, row values, missing image blocks import", () => {
  const rows = parseWorkbook(
    readFileSync(
      new URL("./fixtures/owner-catalog-template.xlsx", import.meta.url),
    ),
  );
  assert.equal(rows[0].SKU, "CL-SHIRT-001");
  assert.equal(rows[0]["Price USD"], "38");
  assert.equal(rows[0].Status, "Draft");
  assert.equal(rows[0].Collection, "New In");
  assert.ok(validateRows(rows)[0].errors.some((e) => /image/i.test(e)));
});
test("export roundtrip preserves multi-variant and dangerous text as literal strings", () => {
  const source = row({
    "Product Name": '=HYPERLINK("https://invalid.test")',
    Description: "@SUM(A1:A2)",
    Size: "M | L",
    Color: "Blue | White",
    Stock: "2 | 0",
  });
  const bytes = createWorkbook([source]);
  const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
  assert.doesNotMatch(xml, /<f[ >]/);
  assert.match(xml, /t="inlineStr"/);
  const parsed = parseWorkbook(bytes);
  for (const h of HEADERS) assert.equal(parsed[0][h], source[h]);
  assert.equal(validateRows(parsed)[0].errors.length, 0);
  const p = validateRows(parsed)[0].product;
  p.variants = p.variants.map((v, i) => ({ ...v, id: "v" + i }));
  assert.deepEqual(exportRows([p])[0].Size, "M | L");
});
function changedXML(change) {
  const parts = unzipSync(createWorkbook([row()]));
  parts["xl/worksheets/sheet1.xml"] = strToU8(
    change(strFromU8(parts["xl/worksheets/sheet1.xml"])),
  );
  return zipSync(parts);
}
test("formula cells are reported per row, not evaluated from cached values", () => {
  const bytes = changedXML((s) =>
    s.replace(
      '<c r="E2" s="3" t="n"><v>38</v></c>',
      '<c r="E2"><f>1+37</f><v>38</v></c>',
    ),
  );
  const parsed = parseWorkbook(bytes);
  assert.deepEqual(parsed[0]._errors, ["E2"]);
  assert.ok(validateRows(parsed)[0].errors.length);
});
test("file/expanded limits, malformed archive, macros, DTD, headers and excess rows rejected", () => {
  assert.throws(
    () => parseWorkbook(new Uint8Array(MAX_FILE_BYTES + 1)),
    /1 MiB/,
  );
  assert.throws(() => parseWorkbook(new Uint8Array(30)), /damaged/);
  const parts = unzipSync(createWorkbook([row()]));
  parts["xl/vbaProject.bin"] = new Uint8Array(1);
  assert.throws(() => parseWorkbook(zipSync(parts)), /macros/);
  delete parts["xl/vbaProject.bin"];
  parts["huge.xml"] = strToU8("a".repeat(2 * 1024 * 1024 + 1));
  assert.throws(() => parseWorkbook(zipSync(parts)), /Expanded/);
  assert.throws(
    () =>
      parseWorkbook(
        changedXML((s) =>
          s.replace(
            "<worksheet",
            '<!DOCTYPE worksheet [<!ENTITY x "bad">]><worksheet',
          ),
        ),
      ),
    /entities/,
  );
  assert.throws(
    () => parseWorkbook(changedXML((s) => s.replace(">SKU<", ">Wrong<"))),
    /headers/,
  );
  assert.throws(
    () =>
      parseWorkbook(
        createWorkbook(
          Array.from({ length: 51 }, (_, i) => row({ SKU: "TEST-" + i })),
        ),
      ),
    /50/,
  );
});
test("blank rows skipped, physical row numbers retained, corrupted XML rejected", () => {
  const parsed = parseWorkbook(
    changedXML((s) =>
      s.replaceAll('r="2"', 'r="10"').replaceAll(/([A-K])2"/g, '$110"'),
    ),
  );
  assert.equal(validateRows(parsed)[0].row, 10);
  assert.throws(
    () =>
      parseWorkbook(changedXML((s) => s.replace("</sheetData>", "</broken>"))),
    /XML|mismatch/i,
  );
});
test("duplicate SKUs are rejected case-insensitively on every duplicate row", () => {
  const r = validateRows([row(), row({ SKU: "test-001" })]);
  assert.ok(r.every((r) => r.errors.includes("Duplicate SKU.")));
});
test("strict price, status, variants, categories and image input validation", () => {
  for (const bad of [
    { "Price USD": "1.001" },
    { "Price USD": "1e2" },
    { Stock: "-1" },
    { Stock: "1.5" },
    { Size: "M | L" },
    { Status: "active" },
    { Category: "Invented" },
    { Collection: "Sale | Sale" },
    { "Image Filename or URL": "javascript:alert(1)" },
    { "Image Filename or URL": "//invalid.test/x.jpg" },
    { "Image Filename or URL": "/products/../x.jpg" },
    { "Image Filename or URL": "https://user:pass@invalid.test/x.jpg" },
  ])
    assert.ok(validateRows([row(bad)])[0].errors.length, JSON.stringify(bad));
});
test("all catalog import/export endpoints enforce auth, expiry and same origin", async () => {
  const e = await env();
  for (const [path, method, data] of [
    ["/admin/catalog", "GET"],
    ["/admin/catalog/export", "GET"],
    ["/admin/catalog/preview", "POST", { rows: [row()] }],
    ["/admin/catalog/import", "POST", { rows: [row()] }],
  ]) {
    assert.equal((await handle(req(path, method, data, null), e)).status, 401);
    assert.equal(
      (await handle(req(path, method, data, "forged"), e)).status,
      401,
    );
  }
  assert.equal(
    (
      await handle(
        req(
          "/admin/catalog/preview",
          "POST",
          { rows: [row()] },
          "test-session",
          { Origin: "https://evil.test" },
        ),
        e,
      )
    ).status,
    403,
  );
  e.DB.sqlite.exec("UPDATE sessions SET expires_at=0");
  assert.equal((await handle(req("/admin/catalog"), e)).status, 401);
});
test("preview performs no catalog writes; invalid row blocks entire import", async () => {
  const e = await env(),
    rows = [row(), row({ SKU: "BAD", Stock: "-3" })],
    p = await preview(e, rows);
  assert.equal(p.can_import, false);
  assert.equal(p.summary.rejected, 1);
  assert.equal(p.ticket, null);
  assert.equal(count(e, "products"), 0);
  assert.equal(count(e, "catalog_imports"), 0);
  assert.equal((await submit(e, rows, p.ticket)).status, 400);
  assert.equal(count(e, "products"), 0);
});
test("atomic create persists collection/draft, export includes drafts but public catalog excludes them", async () => {
  const e = await env();
  const result = await create(e);
  assert.deepEqual(result.summary, {
    created: 1,
    updated: 0,
    unchanged: 0,
    rejected: 0,
  });
  const pub = await (await handle(req("/catalog"), e)).json();
  assert.deepEqual(pub.products, []);
  const all = await (await handle(req("/admin/catalog"), e)).json();
  assert.equal(all.products[0].active, 0);
  assert.deepEqual(all.products[0].collections, ["New In"]);
  assert.equal(inCollection(all.products[0], "new-in"), true);
  const exported = await (await handle(req("/admin/catalog/export"), e)).json();
  assert.equal(exported.rows[0].Status, "Draft");
  assert.equal(exported.rows[0].Stock, "3");
});
test("update preserves variant IDs/omitted variants and reports unchanged export roundtrip", async () => {
  const e = await env();
  await create(e, [
    row({ Size: "M | L", Color: "Blue | Blue", Stock: "3 | 2" }),
  ]);
  let exported = (await (await handle(req("/admin/catalog/export"), e)).json())
    .rows;
  const unchanged = await create(e, exported);
  assert.equal(unchanged.summary.unchanged, 1);
  const ids = e.DB.sqlite
    .prepare("SELECT id FROM variants ORDER BY id")
    .all()
    .map((v) => v.id);
  const rows = [
      row({
        Size: "M",
        Stock: "4",
        "Product Name": "SYNTHETIC TEST updated",
        Status: "Active",
      }),
    ],
    p = await preview(e, rows);
  assert.ok(p.rows[0].warnings.some((w) => /retained/.test(w)));
  assert.ok(p.rows[0].warnings.some((w) => /stock 3 → 4/.test(w)));
  assert.equal((await submit(e, rows, p.ticket)).status, 200);
  assert.deepEqual(
    e.DB.sqlite
      .prepare("SELECT id FROM variants ORDER BY id")
      .all()
      .map((v) => v.id),
    ids,
  );
  assert.equal(
    (await (await handle(req("/catalog"), e)).json()).products.length,
    1,
  );
});
test("no confirmation, tampered payload/ticket and another session cannot write", async () => {
  const e = await env(),
    rows = [row()],
    p = await preview(e, rows);
  assert.equal((await submit(e, rows, p.ticket, false)).status, 400);
  assert.equal((await submit(e, [row({ Stock: "9" })], p.ticket)).status, 409);
  assert.equal(
    (await submit(e, rows, { ...p.ticket, mac: "0".repeat(64) })).status,
    400,
  );
  e.DB.sqlite
    .prepare("INSERT INTO sessions VALUES (?,?)")
    .run(await digest("other-session"), Math.floor(Date.now() / 1000) + 3600);
  assert.equal(
    (
      await handle(
        req(
          "/admin/catalog/import",
          "POST",
          { rows, ticket: p.ticket, confirm_changes: true },
          "other-session",
        ),
        e,
      )
    ).status,
    400,
  );
  assert.equal(count(e, "products"), 0);
});
test("catalog/stock change after preview requires fresh review and makes no import writes", async () => {
  for (const sql of [
    "UPDATE variants SET stock=2",
    "UPDATE products SET title='Changed'",
    "INSERT INTO product_collections VALUES ('TEST-001','Sale')",
  ]) {
    const e = await env();
    await create(e);
    const rows = [row({ Stock: "5" })],
      p = await preview(e, rows),
      n = count(e, "catalog_imports");
    e.DB.sqlite.exec(sql);
    assert.equal((await submit(e, rows, p.ticket)).status, 409);
    assert.equal(count(e, "catalog_imports"), n);
  }
});
test("transaction race rolls back all products, stock, collections, audit and receipt", async () => {
  const e = await env();
  await create(e);
  const rows = [row({ Stock: "9" }), row({ SKU: "NEW-002" })],
    p = await preview(e, rows);
  const before = count(e, "audit"),
    original = e.DB.batch;
  e.DB.batch = async (statements) => {
    e.DB.sqlite.exec("UPDATE variants SET stock=1");
    return original(statements);
  };
  assert.equal((await submit(e, rows, p.ticket)).status, 409);
  assert.equal(count(e, "products"), 1);
  assert.equal(count(e, "audit"), before);
  assert.equal(count(e, "catalog_imports"), 1);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    1,
  );
});
test("late write failure rolls back earlier successful writes in the batch", async () => {
  const e = await env(),
    rows = [row(), row({ SKU: "TEST-002" })],
    p = await preview(e, rows);
  e.DB.sqlite.exec(
    "CREATE TRIGGER test_failure BEFORE INSERT ON products WHEN NEW.id='TEST-002' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
  );
  assert.equal((await submit(e, rows, p.ticket)).status, 409);
  for (const t of [
    "products",
    "variants",
    "product_collections",
    "catalog_imports",
    "audit",
  ])
    assert.equal(count(e, t), 0);
});
test("lost-response retry cannot reset stock after checkout-like reservation; concurrent confirms execute once", async () => {
  const e = await env(),
    rows = [row()],
    p = await preview(e, rows);
  const rs = await Promise.all([
    submit(e, rows, p.ticket),
    submit(e, rows, p.ticket),
  ]);
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(count(e, "catalog_imports"), 1);
  assert.equal(count(e, "audit"), 1);
  e.DB.sqlite.exec("UPDATE variants SET stock=1");
  const replay = await (await submit(e, rows, p.ticket)).json();
  assert.equal(replay.replayed, true);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    1,
  );
});
test("preview expiration and schema prerequisite fail closed", async () => {
  const e = await env(),
    rows = [row()],
    p = await preview(e, rows),
    original = Date.now;
  try {
    Date.now = () => original() + 601000;
    assert.equal((await submit(e, rows, p.ticket)).status, 409);
  } finally {
    Date.now = original;
  }
  e.DB.sqlite.exec(
    "DROP TABLE catalog_imports; DROP TABLE product_collections",
  );
  assert.equal(
    (await handle(req("/admin/catalog/preview", "POST", { rows }), e)).status,
    503,
  );
  assert.equal((await handle(req("/catalog"), e)).status, 200);
});
test("public successful empty catalog never reintroduces a draft through preview overlay", async () => {
  const { customerProducts } = await import("../src/preview-product.js");
  assert.deepEqual(
    await customerProducts("eca6ec52.classyline2.pages.dev", async () => ({
      products: [],
    })),
    [],
  );
  await assert.rejects(
    customerProducts("eca6ec52.classyline2.pages.dev", async () => {
      throw new Error("Transient database failure");
    }),
    /Transient/,
  );
  const missing = await (await handle(req("/catalog"), {})).json();
  assert.equal(missing.code, "CATALOG_UNCONFIGURED");
});
test("real local COD reservation and cancellation invalidate old import snapshots; export excludes customer data", async () => {
  const e = await env();
  await create(e, [row({ Status: "Active" })]);
  e.DB.sqlite.exec("UPDATE regions SET fee_cents=300 WHERE id='beirut'");
  const rows = [row({ Status: "Active", Stock: "9" })],
    p = await preview(e, rows);
  const id = e.DB.sqlite.prepare("SELECT id FROM variants").get().id;
  const order = await handle(
    req(
      "/orders",
      "POST",
      {
        name: "SYNTHETIC Customer",
        phone: "+96170000000",
        address: "Synthetic local address",
        region: "beirut",
        channel: "cod",
        items: [{ variant_id: id, qty: 1 }],
        expected_total_cents: 4100,
      },
      null,
      {
        "Idempotency-Key": crypto.randomUUID(),
        [CHECKOUT_PROTOCOL_HEADER]: CHECKOUT_PROTOCOL_VERSION,
      },
    ),
    e,
  );
  assert.equal(order.status, 201);
  assert.equal((await submit(e, rows, p.ticket)).status, 409);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    2,
  );
  const p2 = await preview(e, rows),
    o = e.DB.sqlite.prepare("SELECT id FROM orders").get();
  assert.equal(
    (
      await handle(
        req("/admin/orders", "PATCH", { id: o.id, status: "cancelled" }),
        e,
      )
    ).status,
    200,
  );
  assert.equal((await submit(e, rows, p2.ticket)).status, 409);
  const exported = JSON.stringify(
    await (await handle(req("/admin/catalog/export"), e)).json(),
  );
  assert.doesNotMatch(
    exported,
    /SYNTHETIC Customer|Synthetic local address|96170000000/,
  );
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    3,
  );
});
test("JSON API row/body limits and variant identity conflicts roll back", async () => {
  const e = await env();
  assert.equal(
    (
      await handle(
        req("/admin/catalog/preview", "POST", {
          rows: Array.from({ length: 51 }, (_, i) => row({ SKU: "TEST-" + i })),
        }),
        e,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handle(
        req("/admin/catalog/preview", "POST", {
          rows: [row({ Description: "a".repeat(100001) })],
        }),
        e,
      )
    ).status,
    413,
  );
  const rows = [row()],
    p = await preview(e, rows),
    id = p.rows[0].after.variants[0].id;
  e.DB.sqlite.exec(
    "INSERT INTO products VALUES ('OTHER','Synthetic other','Tops','','/other.jpg',100,0)",
  );
  e.DB.sqlite
    .prepare("INSERT INTO variants VALUES (?,?,?,?,?)")
    .run(id, "OTHER", "M", "Rose", 5);
  assert.equal((await submit(e, rows, p.ticket)).status, 409);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants WHERE id=?").get(id).stock,
    5,
  );
  assert.equal(count(e, "products"), 1);
  assert.equal(count(e, "catalog_imports"), 0);
});
test("Excel admin UI has labelled upload and safe initial confirmation state", async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {renderToStaticMarkup as render} from 'react-dom/server'; import Excel from './src/components/ExcelCatalog.jsx'; export {React,render,Excel};`,
      resolveDir: process.cwd(),
      loader: "jsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom/server"],
    logLevel: "silent",
  });
  const m = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(import.meta.url),
    m,
    m.exports,
  );
  const { React, render, Excel } = m.exports,
    html = render(React.createElement(Excel, { refresh: async () => {} }));
  for (const label of [
    "Download Excel template",
    "Export current catalog",
    "Upload completed XLSX",
    "No products change until you confirm",
  ])
    assert.ok(html.includes(label));
  assert.match(html, /accept=".xlsx"/);
  assert.doesNotMatch(html, /Confirm import to server/);
});
test("maximum 50-product/100-variant batch stays under Free D1 query budget and atomic", async () => {
  const e = await env();
  let queries = 0;
  const prepare = e.DB.prepare.bind(e.DB);
  e.DB.prepare = (sql) => {
    queries++;
    return prepare(sql);
  };
  const rows = Array.from({ length: 50 }, (_, i) =>
    row({
      SKU: "TEST-" + i,
      Size: "M | L",
      Color: "Blue | Blue",
      Stock: "3 | 2",
      Collection: "New In | Sale",
    }),
  );
  const p = await preview(e, rows);
  assert.ok(queries < 50);
  queries = 0;
  const result = await submit(e, rows, p.ticket);
  assert.equal(result.status, 200);
  assert.ok(queries < 50);
  assert.equal(count(e, "products"), 50);
  assert.equal(count(e, "variants"), 100);
  assert.equal(count(e, "product_collections"), 100);
});
