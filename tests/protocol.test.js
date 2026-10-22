import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/api.js";
import { database } from "./adapter.js";
import { checkout } from "../src/checkout.js";
import { api } from "../src/api.js";
import {
  CHECKOUT_PROTOCOL_HEADER,
  CHECKOUT_PROTOCOL_VERSION,
} from "../shared/checkout-protocol.js";
const origin = "https://store.test";
const payload = {
  name: "Synthetic",
  phone: "+96170000000",
  address: "Synthetic only",
  region: "beirut",
  channel: "cod",
  expected_total_cents: 100,
  items: [{ variant_id: "v", qty: 1 }],
};
function setup() {
  const env = { DB: database() };
  env.DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Synthetic','Tops','','/p.jpg',100,1); INSERT INTO variants VALUES ('v','p','M','Ivory',10); UPDATE regions SET fee_cents=0 WHERE id='beirut'",
  );
  return env;
}
function request(path, body, key, protocol) {
  return new Request(origin + "/api" + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(protocol === undefined
        ? {}
        : { [CHECKOUT_PROTOCOL_HEADER]: protocol }),
    },
    body: JSON.stringify(body),
  });
}
const post = (
  e,
  key = crypto.randomUUID(),
  protocol = CHECKOUT_PROTOCOL_VERSION,
  body = payload,
) => handle(request("/orders", body, key, protocol), e);
function evidence(e) {
  return Object.fromEntries(
    [
      "products",
      "variants",
      "regions",
      "orders",
      "order_items",
      "rate_limits",
      "retired_order_keys",
      "sessions",
      "audit",
    ].map((t) => [
      t,
      e.DB.sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(),
    ]),
  );
}
test("new legacy and unsupported protocol submissions reject before every database write, including expiry and admission counters", async () => {
  const e = setup();
  await post(e);
  e.DB.sqlite.exec("UPDATE orders SET reservation_expires_at=0");
  const before = evidence(e);
  const prepare = e.DB.prepare,
    batch = e.DB.batch;
  let writes = 0;
  e.DB.prepare = (sql) => {
    const s = prepare(sql),
      run = s.run;
    s.run = async () => {
      writes++;
      return run();
    };
    return s;
  };
  e.DB.batch = async (s) => {
    writes++;
    return batch(s);
  };
  for (const version of [undefined, "", "1", "3", "02", "2, 1"]) {
    const r = await handle(
      request("/orders", payload, crypto.randomUUID(), version),
      e,
    );
    assert.equal(r.status, 409);
    const data = await r.json();
    assert.equal(data.code, "CHECKOUT_UPGRADE_REQUIRED");
    assert.equal(data.required_protocol, CHECKOUT_PROTOCOL_VERSION);
    assert.match(data.error, /Reload this page/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(evidence(e), before);
  }
  assert.equal(writes, 0);
});
test("upgrade-required response is non-mutating even with missing key or malformed request body", async () => {
  const e = setup(),
    before = evidence(e);
  const r = await handle(
    new Request(origin + "/api/orders", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "text/plain" },
      body: "not-json",
    }),
    e,
  );
  assert.equal((await r.json()).code, "CHECKOUT_UPGRADE_REQUIRED");
  assert.deepEqual(evidence(e), before);
});
test("current protocol creates an order and preserves normal validation and inventory guards", async () => {
  const e = setup(),
    r = await post(e);
  assert.equal(r.status, 201);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    9,
  );
  const rejected = await post(
    e,
    crypto.randomUUID(),
    CHECKOUT_PROTOCOL_VERSION,
    { ...payload, expected_total_cents: 1 },
  );
  assert.equal(rejected.status, 409);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    9,
  );
});
test("existing R1 keys recover and replay without protocol header while changed payload never mutates stock", async () => {
  const e = setup(),
    key = crypto.randomUUID();
  const first = await (await post(e, key)).json();
  e.DB.sqlite.exec("UPDATE orders SET status='confirmed'");
  const before = evidence(e);
  const replay = await handle(request("/orders", payload, key), e);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).reference, first.reference);
  const altered = await handle(
    request(
      "/orders",
      { ...payload, items: [{ variant_id: "v", qty: 2 }] },
      key,
      "1",
    ),
    e,
  );
  assert.equal(altered.status, 409);
  assert.deepEqual(evidence(e), before);
  const recover = await handle(request("/orders/recover", { key }), e);
  assert.equal(recover.status, 200);
  const receipt = (await recover.json()).receipt;
  assert.equal(receipt.reference, first.reference);
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.phone, undefined);
  assert.equal(receipt.address, undefined);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    9,
  );
});
test("expired legacy saved-key retry still returns cancelled receipt and releases stock exactly once", async () => {
  const e = setup(),
    key = crypto.randomUUID();
  await post(e, key);
  e.DB.sqlite.exec("UPDATE orders SET reservation_expires_at=0");
  for (let i = 0; i < 2; i++) {
    const r = await handle(request("/orders", payload, key), e);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "cancelled");
    assert.equal(
      e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
      10,
    );
  }
});
test("mixed-version confirmed first order rejects a legacy fresh-key replay with no second order or stock reservation", async () => {
  const e = setup(),
    original = crypto.randomUUID();
  await post(e, original);
  e.DB.sqlite.exec("UPDATE orders SET status='confirmed'");
  const before = evidence(e);
  const staleR1 = await handle(
    request("/orders", payload, crypto.randomUUID()),
    e,
  );
  assert.equal((await staleR1.json()).code, "CHECKOUT_UPGRADE_REQUIRED");
  assert.deepEqual(evidence(e), before);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
});
test("header-free recovery retires missing legacy attempts; protocol declaration cannot resurrect them", async () => {
  const e = setup(),
    key = crypto.randomUUID();
  const recovery = await handle(request("/orders/recover", { key }), e);
  assert.deepEqual(await recovery.json(), { not_created: true });
  assert.equal((await post(e, key)).status, 409);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 0);
  assert.equal(
    e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    10,
  );
});
function memory() {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
test("an outdated tab receives reload guidance and keeps its key until safe recovery retires the rejected attempt", async () => {
  const e = setup(),
    originalFetch = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    const headers = new Headers({ Origin: origin, ...options.headers });
    // Simulate the unmodified older client's absent protocol declaration.
    headers.delete(CHECKOUT_PROTOCOL_HEADER);
    return handle(new Request(origin + path, { ...options, headers }), e);
  };
  try {
    const c = checkout({
      storage: memory(),
      tabStorage: memory(),
      lock: (_, fn) => fn(),
      request: api,
    });
    await c.cart.add({ variant_id: "v" });
    await assert.rejects(
      c.submit(payload, c.cart.read().version),
      /Reload this page/,
    );
    const key = c.pending();
    assert.ok(key);
    await assert.rejects(
      c.submit(payload, c.cart.read().version),
      /previous checkout/,
    );
    assert.equal(await c.recover(), null);
    assert.equal(c.pending(), null);
    assert.equal(
      e.DB.sqlite
        .prepare("SELECT idempotency_key FROM retired_order_keys")
        .get().idempotency_key,
      key,
    );
    assert.equal(
      e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n,
      0,
    );
    assert.equal(
      e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
      10,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("versioned cart client sends current protocol with bound snapshot and unchanged idempotency behavior", async () => {
  const e = setup();
  let captured;
  const c = checkout({
    storage: memory(),
    tabStorage: memory(),
    lock: (_, fn) => fn(),
    request: async (path, options) => {
      captured = options;
      const r = await handle(
        new Request(origin + "/api" + path, {
          ...options,
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...options.headers,
          },
        }),
        e,
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data;
    },
  });
  await c.cart.add({ variant_id: "v" });
  await c.submit(payload, c.cart.read().version);
  assert.equal(
    captured.headers[CHECKOUT_PROTOCOL_HEADER],
    CHECKOUT_PROTOCOL_VERSION,
  );
  assert.equal(captured.headers["Idempotency-Key"], c.pending());
  assert.equal(c.cart.read().attempt.phase, "consumed");
  await assert.rejects(c.submit(payload, c.cart.read().version));
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
});
