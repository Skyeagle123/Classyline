import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/api.js";
import { digest, passwordHash } from "../server/security.js";
import { database } from "./adapter.js";
const origin = "https://store.test";
const req = (path, method = "GET", data, extra = {}) =>
  new Request(origin + "/api" + path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
async function setup() {
  const DB = database();
  DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Linen Shirt','Tops','','/shirt.jpg',4600,1); INSERT INTO variants VALUES ('v','p','M','Ivory',2); UPDATE regions SET fee_cents=300 WHERE id='beirut'",
  );
  const env = {
    DB,
    WHATSAPP_NUMBER: "96170000000",
    ADMIN_PASSWORD_SALT: "test-only-salt",
    ADMIN_PASSWORD_HASH: await passwordHash(
      "test-only-password",
      "test-only-salt",
    ),
  };
  return env;
}
const order = {
  name: "Test Customer",
  phone: "+96170000000",
  address: "Test delivery street",
  region: "beirut",
  channel: "cod",
  expected_total_cents: 4900,
  items: [{ variant_id: "v", qty: 1 }],
};
const post = (env, data = order, key = crypto.randomUUID()) =>
  handle(req("/orders", "POST", data, { "Idempotency-Key": key }), env);
async function session(env) {
  const r = await handle(
    req("/admin/login", "POST", { password: "test-only-password" }),
    env,
  );
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
test("missing storage fails closed", async () =>
  assert.equal((await handle(req("/catalog"), {})).status, 503));
test("catalog uses persisted products without customer information", async () => {
  const e = await setup();
  await post(e);
  const r = await handle(req("/catalog"), e);
  const d = await r.json();
  assert.equal(d.products[0].variants[0].stock, 1);
  assert.equal(JSON.stringify(d).includes("Test Customer"), false);
});
test("COD stores order, reserves stock and returns safe receipt", async () => {
  const e = await setup();
  const r = await post(e);
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.total_cents, 4900);
  assert.match(d.reference, /^CL-/);
  assert.equal(d.phone, undefined);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    1,
  );
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
  assert.ok(decodeURIComponent(d.whatsapp_url).includes("Ivory"));
  assert.equal(
    decodeURIComponent(d.whatsapp_url).includes("Test delivery"),
    false,
  );
});
test("idempotent retry never reserves twice; key reuse rejects altered payload", async () => {
  const e = await setup(),
    key = crypto.randomUUID();
  const a = await (await post(e, order, key)).json(),
    b = await (await post(e, order, key)).json();
  assert.equal(a.reference, b.reference);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    1,
  );
  assert.equal((await post(e, { ...order, name: "Other" }, key)).status, 409);
});
test("prices cannot be overridden and unknown fees are rejected", async () => {
  const e = await setup();
  assert.equal(
    (await post(e, { ...order, expected_total_cents: 1 })).status,
    409,
  );
  assert.equal((await post(e, { ...order, region: "south" })).status, 409);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 0);
});
test("out of stock, duplicate and invalid quantity rejected", async () => {
  const e = await setup();
  for (const items of [
    [{ variant_id: "v", qty: 3 }],
    [{ variant_id: "v", qty: 0 }],
    [
      { variant_id: "v", qty: 1 },
      { variant_id: "v", qty: 1 },
    ],
    [{ variant_id: "none", qty: 1 }],
  ])
    assert.ok((await post(e, { ...order, items })).status >= 400);
});
test("transaction rolls back all order writes when concurrent stock changes", async () => {
  const e = await setup();
  const original = e.DB.batch;
  e.DB.batch = async (statements) => {
    e.DB.sqlite.exec("UPDATE variants SET stock=0");
    return original(statements);
  };
  assert.equal((await post(e)).status, 409);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 0);
  assert.equal(
    e.DB.sqlite.prepare("SELECT count(*) n FROM order_items").get().n,
    0,
  );
});
test("no-cookie admin and forged browser authorization denied", async () => {
  const e = await setup();
  assert.equal((await handle(req("/admin/orders"), e)).status, 401);
  assert.equal(
    (
      await handle(
        req("/admin/orders", "GET", undefined, {
          Cookie: "__Host-cl_session=forged",
        }),
        e,
      )
    ).status,
    401,
  );
});
test("login cookie is secure and session token stored only as hash; logout revokes it", async () => {
  const e = await setup();
  const r = await handle(
    req("/admin/login", "POST", { password: "test-only-password" }),
    e,
  );
  const header = r.headers.get("set-cookie");
  assert.match(header, /Secure; HttpOnly; SameSite=Strict/);
  const c = header.split(";")[0],
    raw = c.split("=")[1];
  assert.equal(
    e.DB.sqlite.prepare("SELECT token_hash FROM sessions").get().token_hash,
    await digest(raw),
  );
  assert.equal(
    (await handle(req("/admin/orders", "GET", undefined, { Cookie: c }), e))
      .status,
    200,
  );
  await handle(req("/admin/logout", "POST", {}, { Cookie: c }), e);
  assert.equal(
    (await handle(req("/admin/orders", "GET", undefined, { Cookie: c }), e))
      .status,
    401,
  );
});
test("cross-origin writes rejected", async () => {
  const e = await setup();
  assert.equal(
    (
      await handle(
        req("/orders", "POST", order, { Origin: "https://evil.test" }),
        e,
      )
    ).status,
    403,
  );
});
test("login fails closed and rate limited", async () => {
  const e = await setup();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await handle(req("/admin/login", "POST", { password: "bad" }), e))
        .status,
      401,
    );
  assert.equal(
    (await handle(req("/admin/login", "POST", { password: "bad" }), e)).status,
    429,
  );
  assert.equal(
    (
      await handle(req("/admin/login", "POST", { password: "bad" }), {
        DB: e.DB,
      })
    ).status,
    503,
  );
});
test("expiry enforced server-side", async () => {
  const e = await setup(),
    c = await session(e);
  e.DB.sqlite.exec("UPDATE sessions SET expires_at=0");
  assert.equal(
    (await handle(req("/admin/orders", "GET", undefined, { Cookie: c }), e))
      .status,
    401,
  );
});
test("cancellation restores stock once and illegal transitions rejected", async () => {
  const e = await setup(),
    c = await session(e);
  await post(e);
  const id = e.DB.sqlite.prepare("SELECT id FROM orders").get().id;
  assert.equal(
    (
      await handle(
        req(
          "/admin/orders",
          "PATCH",
          { id, status: "cancelled" },
          { Cookie: c },
        ),
        e,
      )
    ).status,
    200,
  );
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    2,
  );
  assert.equal(
    (
      await handle(
        req(
          "/admin/orders",
          "PATCH",
          { id, status: "cancelled" },
          { Cookie: c },
        ),
        e,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await handle(
        req(
          "/admin/orders",
          "PATCH",
          { id, status: "confirmed" },
          { Cookie: c },
        ),
        e,
      )
    ).status,
    409,
  );
});
test("server-side product and regional config persistence and image scheme validation", async () => {
  const e = await setup(),
    c = await session(e);
  const p = {
    id: "new",
    title: "Dress",
    category: "Dresses",
    price_cents: 4000,
    image: "/dress.jpg",
    variants: [{ id: "new-m", size: "M", color: "Rose", stock: 4 }],
  };
  assert.equal(
    (await handle(req("/admin/products", "PUT", p, { Cookie: c }), e)).status,
    200,
  );
  assert.equal(
    (
      await handle(
        req(
          "/admin/products",
          "PUT",
          { ...p, image: "javascript:alert(1)" },
          { Cookie: c },
        ),
        e,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handle(
        req(
          "/admin/regions",
          "PUT",
          { id: "south", fee_cents: 600 },
          { Cookie: c },
        ),
        e,
      )
    ).status,
    200,
  );
  assert.equal(
    e.DB.sqlite.prepare("SELECT fee_cents FROM regions WHERE id='south'").get()
      .fee_cents,
    600,
  );
});
test("JSON content type, malformed body and body limit enforced", async () => {
  const e = await setup();
  assert.equal(
    (
      await handle(
        req("/orders", "POST", order, { "Content-Type": "text/plain" }),
        e,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await handle(
        new Request(origin + "/api/orders", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{broken",
        }),
        e,
      )
    ).status,
    400,
  );
  assert.equal(
    (await handle(req("/orders", "POST", { junk: "a".repeat(100001) }), e))
      .status,
    413,
  );
});
test("transaction rejects intervening catalog and delivery changes", async () => {
  for (const sql of [
    "UPDATE products SET price_cents=5000",
    "UPDATE products SET active=0",
    "UPDATE regions SET fee_cents=400 WHERE id='beirut'",
  ]) {
    const e = await setup(),
      original = e.DB.batch;
    e.DB.batch = async (s) => {
      e.DB.sqlite.exec(sql);
      return original(s);
    };
    assert.equal((await post(e)).status, 409);
    assert.equal(
      e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n,
      0,
    );
  }
});
test("stale inventory editor cannot overwrite checkout reservations", async () => {
  const e = await setup(),
    c = await session(e);
  await post(e);
  const p = {
    id: "p",
    title: "Linen Shirt",
    category: "Tops",
    price_cents: 4600,
    image: "/shirt.jpg",
    variants: [
      { id: "v", size: "M", color: "Ivory", stock: 5, expected_stock: 2 },
    ],
  };
  assert.equal(
    (await handle(req("/admin/products", "PUT", p, { Cookie: c }), e)).status,
    409,
  );
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants WHERE id='v'").get().stock,
    1,
  );
  p.variants[0].expected_stock = 1;
  assert.equal(
    (await handle(req("/admin/products", "PUT", p, { Cookie: c }), e)).status,
    200,
  );
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants WHERE id='v'").get().stock,
    5,
  );
});
