import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { database } from "./adapter.js";
import { handle } from "../server/api.js";
import { passwordHash } from "../server/security.js";
import { expirePendingOrders, normalizePhone } from "../server/checkout.js";
import { checkout } from "../src/checkout.js";
const origin = "https://store.test";
const req = (path, data, extra = {}) =>
  new Request(origin + "/api" + path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: JSON.stringify(data),
  });
const payload = {
  name: "Synthetic Customer",
  phone: "+96170000000",
  address: "Synthetic street",
  region: "beirut",
  channel: "cod",
  expected_total_cents: 4900,
  items: [{ variant_id: "v", qty: 1 }],
};
function setup() {
  const e = { DB: database(), WHATSAPP_NUMBER: "96170000000" };
  e.DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Shirt','Tops','','/shirt.jpg',4600,1); INSERT INTO variants VALUES ('v','p','M','Ivory',5); UPDATE regions SET fee_cents=300 WHERE id='beirut'",
  );
  return e;
}
const post = (e, p = payload, key = crypto.randomUUID(), ip = "192.0.2.1") =>
  handle(
    req("/orders", p, { "Idempotency-Key": key, "cf-connecting-ip": ip }),
    e,
  );
const recover = (e, key) => handle(req("/orders/recover", { key }), e);
const stock = (e) =>
  e.DB.sqlite.prepare("SELECT stock FROM variants").get().stock;
async function session(e) {
  e.ADMIN_PASSWORD_SALT = "synthetic-salt";
  e.ADMIN_PASSWORD_HASH = await passwordHash(
    "synthetic-only-password",
    e.ADMIN_PASSWORD_SALT,
  );
  const r = await handle(
    req("/admin/login", { password: "synthetic-only-password" }),
    e,
  );
  return r.headers.get("set-cookie").split(";")[0];
}
test("30-minute expiry restores stock exactly once and old key returns cancelled receipt", async () => {
  const e = setup(),
    key = crypto.randomUUID();
  await post(e, payload, key);
  const o = e.DB.sqlite.prepare("SELECT * FROM orders").get();
  assert.equal(o.reservation_expires_at - o.created_at, 1800);
  await expirePendingOrders(e.DB, o.reservation_expires_at - 1);
  assert.equal(stock(e), 4);
  await expirePendingOrders(e.DB, o.reservation_expires_at);
  assert.equal(stock(e), 5);
  await expirePendingOrders(e.DB, o.reservation_expires_at + 1);
  assert.equal(stock(e), 5);
  const r = await (await post(e, payload, key)).json();
  assert.equal(r.status, "cancelled");
  assert.equal(r.cancellation_reason, "expired");
  assert.equal(stock(e), 5);
});
test("catalog and order submission release overdue reservations on demand", async () => {
  const e = setup();
  await post(e);
  e.DB.sqlite.exec("UPDATE orders SET reservation_expires_at=0");
  await handle(new Request(origin + "/api/catalog"), e);
  assert.equal(stock(e), 5);
  assert.equal((await post(e)).status, 201);
  assert.equal(stock(e), 4);
});
test("confirmed reservations are not expired and cannot restore twice through cancellation", async () => {
  const e = setup();
  await post(e);
  e.DB.sqlite.exec(
    "UPDATE orders SET status='confirmed'; UPDATE orders SET reservation_expires_at=0",
  );
  await expirePendingOrders(e.DB, Math.floor(Date.now() / 1000));
  assert.equal(stock(e), 4);
  e.DB.sqlite.exec(
    "UPDATE orders SET status='cancelled'; UPDATE orders SET status='cancelled'",
  );
  assert.equal(stock(e), 5);
});
test("late confirmation is rejected even after expiry sweep race", async () => {
  const e = setup(),
    c = await session(e);
  await post(e);
  const id = e.DB.sqlite.prepare("SELECT id FROM orders").get().id;
  const old = e.DB.prepare;
  e.DB.prepare = (sql) => {
    if (sql.startsWith("UPDATE orders SET status=?"))
      e.DB.sqlite.exec("UPDATE orders SET reservation_expires_at=0");
    return old(sql);
  };
  const r = await handle(
    new Request(origin + "/api/admin/orders", {
      method: "PATCH",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: c,
      },
      body: JSON.stringify({ id, status: "confirmed" }),
    }),
    e,
  );
  assert.equal(r.status, 409);
  await expirePendingOrders(e.DB, Math.floor(Date.now() / 1000));
  assert.equal(stock(e), 5);
});
test("phone admission is transactional across rotating IPs and concurrent checkouts", async () => {
  const e = setup();
  const results = await Promise.all([
    post(e, payload, crypto.randomUUID(), "192.0.2.1"),
    post(
      e,
      { ...payload, phone: "70 000 000" },
      crypto.randomUUID(),
      "192.0.2.2",
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(stock(e), 4);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
});
test("phone rate limit follows canonical phone even across different IPs", async () => {
  const e = setup();
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await post(
          e,
          { ...payload, region: "south" },
          crypto.randomUUID(),
          "192.0.2." + i,
        )
      ).status,
      409,
    );
  assert.equal(
    (
      await post(
        e,
        { ...payload, phone: "70 000 000" },
        crypto.randomUUID(),
        "192.0.2.9",
      )
    ).status,
    429,
  );
  assert.equal(stock(e), 5);
});
test("store-wide admission rate cannot be bypassed by rotating phone and IP", async () => {
  const e = setup(),
    now = Math.floor(Date.now() / 1000);
  e.DB.sqlite
    .prepare("INSERT INTO rate_limits VALUES (?,100,?)")
    .run("order-global", now + 900);
  assert.equal(
    (
      await post(
        e,
        { ...payload, phone: "+447700900123" },
        crypto.randomUUID(),
        "192.0.2.99",
      )
    ).status,
    429,
  );
  assert.equal(stock(e), 5);
});
test("legacy pending orders acquire deadlines without deleting order evidence", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_storefront.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    "INSERT INTO products VALUES ('p','Shirt','Tops','','/shirt.jpg',4600,1); INSERT INTO variants VALUES ('v','p','M','Ivory',2); UPDATE regions SET fee_cents=300 WHERE id='beirut'; INSERT INTO orders VALUES ('o','CL-SYNTHETIC','k','h','Synthetic','+96170000000','Synthetic','beirut',300,4600,'cod','pending',100); INSERT INTO order_items VALUES ('o','v','Shirt','M','Ivory',4600,1)",
  );
  db.exec(
    readFileSync(
      new URL("../migrations/0002_checkout_recovery.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    db.prepare("SELECT reservation_expires_at FROM orders").get()
      .reservation_expires_at,
    1900,
  );
  db.exec(
    "UPDATE orders SET status='cancelled',cancellation_reason='expired' WHERE reservation_expires_at<=1900",
  );
  assert.equal(db.prepare("SELECT stock FROM variants").get().stock, 2);
  assert.equal(db.prepare("SELECT count(*) n FROM order_items").get().n, 1);
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
});
test("authenticated admin reads immutable line snapshots, anonymous access is denied", async () => {
  const e = setup(),
    c = await session(e);
  await post(e);
  e.DB.sqlite.exec("UPDATE products SET title='Changed',price_cents=9999");
  assert.equal(
    (await handle(new Request(origin + "/api/admin/orders"), e)).status,
    401,
  );
  const r = await handle(
    new Request(origin + "/api/admin/orders", { headers: { Cookie: c } }),
    e,
  );
  assert.equal(r.headers.get("cache-control"), "no-store");
  const o = (await r.json()).orders[0];
  assert.deepEqual(
    o.items.map(({ title, size, color, unit_cents, qty }) => ({
      title,
      size,
      color,
      unit_cents,
      qty,
    })),
    [{ title: "Shirt", size: "M", color: "Ivory", unit_cents: 4600, qty: 1 }],
  );
});
test("phone syntax normalizes supported local/international formats and rejects digit-free input", () => {
  for (const v of [
    "70 000 000",
    "+961 (70) 000-000",
    "0096170000000",
    " +96170 000 000 ",
  ])
    assert.equal(normalizePhone(v), "+96170000000");
  assert.equal(normalizePhone("03 123 456"), "+9613123456");
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  for (const v of [
    "-------",
    "       ",
    "()()()()",
    "+",
    "123",
    "00000000",
    "+961123456789",
    "+1234567890123456",
    "+96170abc000000",
    "70\n000000",
    42,
  ])
    assert.equal(normalizePhone(v), null, v);
});
test("invalid phone cannot create order or reserve stock", async () => {
  const e = setup();
  assert.equal((await post(e, { ...payload, phone: "-------" })).status, 400);
  assert.equal(stock(e), 5);
});
test("recovery returns saved receipt without personal information or new reservation", async () => {
  const e = setup(),
    key = crypto.randomUUID();
  const first = await (await post(e, payload, key)).json();
  const recovered = await (await recover(e, key)).json();
  assert.equal(recovered.receipt.reference, first.reference);
  assert.equal(stock(e), 4);
  assert.equal(JSON.stringify(recovered).includes("Synthetic street"), false);
  assert.equal(JSON.stringify(recovered).includes("Synthetic Customer"), false);
});
test("recovery retires missing key; a delayed original submission can never commit", async () => {
  const e = setup(),
    key = crypto.randomUUID();
  assert.deepEqual(await (await recover(e, key)).json(), { not_created: true });
  assert.equal((await post(e, payload, key)).status, 409);
  assert.equal(stock(e), 5);
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 0);
});
test("recovery racing an already-validated submission rejects its final atomic insert", async () => {
  const e = setup(),
    key = crypto.randomUUID(),
    original = e.DB.batch;
  let first = true;
  e.DB.batch = async (s) => {
    if (first) {
      first = false;
      assert.deepEqual(await (await recover(e, key)).json(), {
        not_created: true,
      });
    }
    return original(s);
  };
  assert.equal((await post(e, payload, key)).status, 409);
  assert.equal(stock(e), 5);
});
test("recovery is same-origin, UUID bounded and rate-limited", async () => {
  const e = setup();
  assert.equal(
    (
      await handle(
        req(
          "/orders/recover",
          { key: crypto.randomUUID() },
          { Origin: "https://evil.test" },
        ),
        e,
      )
    ).status,
    403,
  );
  assert.equal((await recover(e, "short")).status, 400);
  e.DB.sqlite
    .prepare("INSERT INTO rate_limits VALUES (?,30,?)")
    .run(
      "recover:" +
        (await (await import("../server/security.js")).digest("local")),
      Math.floor(Date.now() / 1000) + 900,
    );
  assert.equal((await recover(e, crypto.randomUUID())).status, 429);
});
function memory() {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    m,
  };
}
function mutex() {
  let queue = Promise.resolve();
  return (_, fn) => {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  };
}
test("lost response survives reload: recover original receipt before allowing replacement", async () => {
  const e = setup(),
    storage = memory(),
    tabStorage = memory(),
    lock = mutex();
  let lost = true;
  const request = async (path, o) => {
    const r = await handle(
      new Request(origin + "/api" + path, {
        ...o,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...o.headers,
        },
      }),
      e,
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    if (path === "/orders" && lost) {
      lost = false;
      throw new Error("Synthetic response lost");
    }
    return data;
  };
  const a = checkout({ storage, tabStorage, lock, request });
  await assert.rejects(a.submit(payload));
  assert.equal(stock(e), 4);
  assert.equal(
    JSON.stringify([...storage.m]).includes("Synthetic Customer"),
    false,
  );
  const b = checkout({ storage, tabStorage, lock, request });
  assert.deepEqual(b.snapshot(), payload);
  await assert.rejects(b.submit(payload));
  const receipt = await b.recover();
  assert.match(receipt.reference, /^CL-/);
  assert.equal(stock(e), 4);
  await assert.rejects(b.submit(payload));
  assert.equal(tabStorage.m.size, 0);
  await b.acknowledge();
  assert.equal(storage.m.size, 0);
});
test("never-arrived request is retired on reload before replacement", async () => {
  const e = setup(),
    storage = memory(),
    tabStorage = memory(),
    lock = mutex();
  const a = checkout({
    storage,
    tabStorage,
    lock,
    request: async () => {
      throw new Error("Synthetic offline");
    },
  });
  await assert.rejects(a.submit(payload));
  const key = a.pending();
  const b = checkout({
    storage,
    tabStorage,
    lock,
    request: async (path, o) =>
      (await handle(req(path, JSON.parse(o.body)), e)).json(),
  });
  assert.equal(await b.recover(), null);
  assert.equal(b.pending(), null);
  assert.equal((await post(e, payload, key)).status, 409);
  assert.equal(stock(e), 5);
});
test("cross-tab lock prevents simultaneous duplicate submissions", async () => {
  const storage = memory(),
    lock = mutex();
  let calls = 0;
  const args = {
    storage,
    lock,
    request: async () => {
      calls++;
      return { reference: "CL-SYNTHETIC" };
    },
  };
  const a = checkout({ ...args, tabStorage: memory() }),
    b = checkout({ ...args, tabStorage: memory() });
  const r = await Promise.allSettled([a.submit(payload), b.submit(payload)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(calls, 1);
});
test("storage failure and unavailable cross-tab locks fail closed before network", async () => {
  let calls = 0;
  const request = async () => {
    calls++;
  };
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota");
    },
    removeItem: () => {},
  };
  await assert.rejects(
    checkout({ storage, tabStorage: memory(), lock: mutex(), request }).submit(
      payload,
    ),
  );
  await assert.rejects(
    checkout({
      storage: memory(),
      tabStorage: memory(),
      lock: null,
      request,
    }).submit(payload),
  );
  assert.equal(calls, 0);
});
test("recovery network failure keeps durable key and blocks replacement", async () => {
  const storage = memory(),
    tabStorage = memory(),
    lock = mutex(),
    c = checkout({
      storage,
      tabStorage,
      lock,
      request: async () => {
        throw new Error("Synthetic offline");
      },
    });
  await assert.rejects(c.submit(payload));
  const key = c.pending();
  await assert.rejects(c.recover());
  assert.equal(c.pending(), key);
  await assert.rejects(c.submit(payload));
});
