import test from "node:test";
import assert from "node:assert/strict";
import {
  sharedCart,
  cartItems,
  CART_KEY,
  LEGACY_CART_KEY,
  ATTEMPT_KEY,
} from "../src/cart.js";
import { checkout } from "../src/checkout.js";
import { handle } from "../server/api.js";
import { database } from "./adapter.js";
function memory() {
  const values = new Map();
  return {
    values,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
function mutex() {
  let tail = Promise.resolve();
  return (name, fn) => {
    assert.equal(name, "classyline-checkout");
    const p = tail.then(fn);
    tail = p.catch(() => {});
    return p;
  };
}
function harness() {
  const storage = memory(),
    lock = mutex(),
    DB = database();
  DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Synthetic','Tops','','/p.jpg',100,1); INSERT INTO variants VALUES ('v','p','M','Ivory',20); INSERT INTO variants VALUES ('w','p','L','Rose',20); UPDATE regions SET fee_cents=0 WHERE id='beirut'",
  );
  let lose = false,
    calls = 0;
  const request = async (path, options) => {
    const r = await handle(
      new Request("https://store.test/api" + path, {
        ...options,
        headers: {
          Origin: "https://store.test",
          "Content-Type": "application/json",
          ...options.headers,
        },
      }),
      { DB },
    );
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    if (path === "/orders") {
      calls++;
      if (lose) throw new Error("Synthetic lost response");
    }
    return result;
  };
  function tab(options = {}) {
    const cart = sharedCart({ storage, lock });
    const c = checkout({
      storage,
      lock,
      tabStorage: memory(),
      cart,
      request,
      ...options,
    });
    return c;
  }
  const payload = (c) => ({
    name: "Synthetic",
    phone: "+96170000000",
    address: "Synthetic only",
    region: "beirut",
    channel: "cod",
    items: cartItems(c.cart.read().lines),
    expected_total_cents: cartItems(c.cart.read().lines).reduce(
      (n, i) => n + i.qty * 100,
      0,
    ),
  });
  return {
    storage,
    lock,
    DB,
    tab,
    payload,
    lose: (v) => {
      lose = v;
    },
    calls: () => calls,
  };
}
test("confirmed first order cannot be duplicated by a stale second tab; deliberate Add starts a new cart", async () => {
  const h = harness(),
    a = h.tab(),
    b = h.tab();
  await a.cart.add({ variant_id: "v" });
  const oldVersion = b.cart.read().version,
    oldPayload = h.payload(b);
  await a.submit(h.payload(a), oldVersion);
  h.DB.sqlite.exec("UPDATE orders SET status='confirmed'");
  await a.acknowledge();
  await assert.rejects(b.submit(oldPayload, oldVersion), /bag changed/);
  await assert.rejects(
    b.submit(oldPayload, b.cart.read().version),
    /current bag/,
  );
  assert.equal(h.calls(), 1);
  assert.equal(h.DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
  assert.deepEqual(cartItems(b.cart.read().lines), []);
  await b.cart.add({ variant_id: "v" });
  await b.submit(h.payload(b), b.cart.read().version);
  assert.equal(h.calls(), 2);
});
test("receipt close/add/reopen preserves new products and same-variant additions through repeated recovery and acknowledgement", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  await a.submit(h.payload(a), a.cart.read().version);
  await a.cart.add({ variant_id: "w" });
  await a.cart.add({ variant_id: "v" });
  const before = a.cart.read().lines;
  const reopened = h.tab();
  await reopened.recover();
  await reopened.recover();
  await reopened.acknowledge();
  assert.deepEqual(reopened.cart.read().lines, before);
  assert.equal(h.calls(), 1);
});
test("lost response consumes only original lot IDs after cross-tab additions", async () => {
  const h = harness(),
    a = h.tab(),
    b = h.tab();
  await a.cart.add({ variant_id: "v" });
  const version = a.cart.read().version;
  h.lose(true);
  await assert.rejects(a.submit(h.payload(a), version));
  await b.cart.add({ variant_id: "v" });
  await b.cart.add({ variant_id: "w" });
  const newLots = b.cart
    .read()
    .lines.filter(
      (i) => !b.cart.read().attempt.lines.some((s) => s.id === i.id),
    );
  await b.recover();
  assert.deepEqual(b.cart.read().lines, newLots);
  assert.deepEqual(cartItems(newLots), [
    { variant_id: "v", qty: 1 },
    { variant_id: "w", qty: 1 },
  ]);
  await b.acknowledge();
  assert.deepEqual(b.cart.read().lines, newLots);
});
test("remove/re-add while unresolved creates new lots that old receipt cannot consume", async () => {
  const h = harness(),
    a = h.tab(),
    b = h.tab();
  await a.cart.add({ variant_id: "v" });
  h.lose(true);
  await assert.rejects(a.submit(h.payload(a), a.cart.read().version));
  await b.cart.remove("v");
  await b.cart.add({ variant_id: "v" });
  const newLot = b.cart.read().lines[0];
  await b.recover();
  assert.deepEqual(b.cart.read().lines, [newLot]);
});
test("cart edits and delayed receipt share the checkout lock", async () => {
  const h = harness();
  let release, entered;
  const atRequest = new Promise((r) => {
    entered = r;
  });
  const delayed = new Promise((r) => {
    release = r;
  });
  const a = h.tab({
      request: async () => {
        entered();
        await delayed;
        return { reference: "CL-SYNTHETIC", status: "pending" };
      },
    }),
    b = h.tab();
  await a.cart.add({ variant_id: "v" });
  const submitting = a.submit(h.payload(a), a.cart.read().version);
  await atRequest;
  const adding = b.cart.add({ variant_id: "w" });
  assert.equal(b.cart.read().lines.length, 1);
  release();
  await submitting;
  await adding;
  assert.deepEqual(cartItems(b.cart.read().lines), [
    { variant_id: "w", qty: 1 },
  ]);
});
test("parallel cart writers reconcile storage; stale version or altered snapshot fails before network", async () => {
  const h = harness(),
    a = h.tab(),
    b = h.tab();
  await Promise.all([
    a.cart.add({ variant_id: "v" }),
    b.cart.add({ variant_id: "w" }),
  ]);
  assert.deepEqual(cartItems(a.cart.read().lines), [
    { variant_id: "v", qty: 1 },
    { variant_id: "w", qty: 1 },
  ]);
  const version = a.cart.read().version,
    p = h.payload(a);
  await b.cart.add({ variant_id: "v" });
  await assert.rejects(a.submit(p, version), /bag changed/);
  await assert.rejects(a.submit(p, a.cart.read().version), /current bag/);
  await assert.rejects(a.submit(h.payload(a)), /bag changed/);
  assert.equal(h.calls(), 0);
});
test("receipt consumption write failure keeps original key; recovery consumes once and preserves additions", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  const set = h.storage.setItem;
  h.storage.setItem = (k, v) => {
    if (k === CART_KEY && JSON.parse(v).attempt?.phase === "consumed")
      throw new Error("Synthetic quota");
    set(k, v);
  };
  await assert.rejects(a.submit(h.payload(a), a.cart.read().version), /quota/);
  const key = a.pending();
  assert.equal(a.cart.read().attempt.phase, "pending");
  h.storage.setItem = set;
  await a.cart.add({ variant_id: "w" });
  await a.recover();
  await a.recover();
  assert.equal(a.pending(), key);
  assert.deepEqual(cartItems(a.cart.read().lines), [
    { variant_id: "w", qty: 1 },
  ]);
  assert.equal(h.calls(), 1);
});
test("acknowledgement failure between marker removal and journal write remains recoverable without clearing new items", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  await a.submit(h.payload(a), a.cart.read().version);
  await a.cart.add({ variant_id: "w" });
  const key = a.pending(),
    set = h.storage.setItem;
  h.storage.setItem = (k, v) => {
    if (k === CART_KEY && JSON.parse(v).attempt === null)
      throw new Error("Synthetic quota");
    set(k, v);
  };
  await assert.rejects(a.acknowledge(), /quota/);
  assert.equal(h.storage.getItem(ATTEMPT_KEY), null);
  assert.equal(a.pending(), key);
  h.storage.setItem = set;
  const b = h.tab();
  await b.recover();
  await b.acknowledge();
  assert.deepEqual(cartItems(b.cart.read().lines), [
    { variant_id: "w", qty: 1 },
  ]);
  assert.equal(h.calls(), 1);
});
test("stale acknowledgement cannot affect a newer attempt or its new items", async () => {
  const h = harness(),
    a = h.tab(),
    b = h.tab();
  await a.cart.add({ variant_id: "v" });
  await a.submit(h.payload(a), a.cart.read().version);
  await b.recover();
  await b.acknowledge();
  h.DB.sqlite.exec("UPDATE orders SET status='confirmed'");
  await b.cart.add({ variant_id: "w" });
  await b.submit(h.payload(b), b.cart.read().version);
  const before = b.cart.read();
  await assert.rejects(a.acknowledge(), /changed/);
  assert.deepEqual(b.cart.read(), before);
});
test("R1 legacy key recovery retains unknown cart contents and requires version-bound explicit new-order review", async () => {
  const h = harness(),
    key = crypto.randomUUID();
  h.storage.setItem(
    LEGACY_CART_KEY,
    JSON.stringify([{ variant_id: "v", qty: 1 }]),
  );
  h.storage.setItem(ATTEMPT_KEY, key);
  const a = h.tab({
    request: async () => ({
      receipt: { reference: "CL-LEGACY", status: "confirmed" },
    }),
  });
  await a.recover();
  assert.equal(a.cart.read().attempt.legacy, true);
  assert.deepEqual(cartItems(a.cart.read().lines), [
    { variant_id: "v", qty: 1 },
  ]);
  await a.acknowledge();
  const b = h.tab();
  await assert.rejects(
    b.submit(h.payload(b), b.cart.read().version),
    /new order/,
  );
  const oldVersion = b.cart.read().version;
  await a.cart.add({ variant_id: "w" });
  await assert.rejects(b.cart.review(oldVersion), /bag changed/);
  await b.cart.review(b.cart.read().version);
  assert.equal(b.cart.read().reviewRequired, false);
  await b.submit(h.payload(b), b.cart.read().version);
});
test("cancelled recovered receipt consumes only its snapshot; another order requires deliberate fresh Add", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  h.lose(true);
  const oldPayload = h.payload(a),
    oldVersion = a.cart.read().version;
  await assert.rejects(a.submit(oldPayload, oldVersion));
  h.DB.sqlite.exec("UPDATE orders SET reservation_expires_at=0");
  const result = await a.recover();
  assert.equal(result.status, "cancelled");
  await a.acknowledge();
  await assert.rejects(a.submit(oldPayload, a.cart.read().version));
  assert.equal(h.calls(), 1);
  assert.equal(
    h.DB.sqlite.prepare("SELECT stock FROM variants WHERE id='v'").get().stock,
    20,
  );
});
test("malformed shared state, lost journal, unsupported locks and read failures fail closed", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  const p = h.payload(a),
    version = a.cart.read().version;
  h.storage.removeItem(CART_KEY);
  await assert.rejects(a.submit(p, version), /safely/);
  h.storage.setItem(CART_KEY, "{");
  await assert.rejects(a.cart.add({ variant_id: "w" }), /safely/);
  const noLock = sharedCart({ storage: memory(), lock: null });
  await assert.rejects(noLock.add({ variant_id: "v" }), /Web Locks/);
  const denied = sharedCart({
    storage: {
      getItem() {
        throw new Error("Synthetic denied");
      },
    },
    lock: mutex(),
  });
  await assert.rejects(denied.refresh(), /denied/);
  assert.equal(h.calls(), 0);
});
test("shared journal contains snapshot/version/consumption only, never customer payload", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  h.lose(true);
  await assert.rejects(a.submit(h.payload(a), a.cart.read().version));
  const saved = h.storage.getItem(CART_KEY);
  assert.equal(saved.includes("Synthetic only"), false);
  assert.equal(saved.includes("+961"), false);
  assert.equal(saved.includes("customer"), false);
  const bound = a.cart.read().attempt;
  assert.deepEqual(cartItems(bound.lines), [{ variant_id: "v", qty: 1 }]);
  await a.recover();
  assert.equal(a.cart.read().attempt.phase, "consumed");
  assert.equal(a.cart.read().attempt.cartVersion, bound.cartVersion);
});

test("pre-request marker persistence failure leaves recoverable journal and sends no order", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  const set = h.storage.setItem;
  h.storage.setItem = (k, v) => {
    if (k === ATTEMPT_KEY) throw new Error("Synthetic marker failure");
    set(k, v);
  };
  await assert.rejects(
    a.submit(h.payload(a), a.cart.read().version),
    /marker failure/,
  );
  const key = a.pending();
  assert.ok(key);
  assert.equal(h.calls(), 0);
  h.storage.setItem = set;
  await a.recover();
  assert.equal(a.pending(), null);
  assert.deepEqual(cartItems(a.cart.read().lines), [
    { variant_id: "v", qty: 1 },
  ]);
  assert.equal(
    h.DB.sqlite.prepare("SELECT idempotency_key FROM retired_order_keys").get()
      .idempotency_key,
    key,
  );
});
test("failed session-storage acknowledgement and failed marker deletion retain consumed attempt and new lots", async () => {
  const h = harness(),
    tabStorage = memory(),
    a = h.tab({ tabStorage });
  await a.cart.add({ variant_id: "v" });
  await a.submit(h.payload(a), a.cart.read().version);
  await a.cart.add({ variant_id: "w" });
  const before = a.cart.read(),
    remove = tabStorage.removeItem;
  tabStorage.removeItem = () => {
    throw new Error("Synthetic denied cleanup");
  };
  await assert.rejects(a.acknowledge(), /denied cleanup/);
  assert.deepEqual(a.cart.read(), before);
  tabStorage.removeItem = remove;
  const localRemove = h.storage.removeItem;
  h.storage.removeItem = () => {};
  await assert.rejects(a.acknowledge(), /cleared safely/);
  assert.deepEqual(a.cart.read(), before);
  h.storage.removeItem = localRemove;
  await a.acknowledge();
  assert.deepEqual(cartItems(a.cart.read().lines), [
    { variant_id: "w", qty: 1 },
  ]);
});
test("consumed attempt rejects contradictory missing receipt without unlocking or erasing new lots", async () => {
  const h = harness(),
    a = h.tab();
  await a.cart.add({ variant_id: "v" });
  await a.submit(h.payload(a), a.cart.read().version);
  await a.cart.add({ variant_id: "w" });
  const before = a.cart.read(),
    b = h.tab({ request: async () => ({ not_created: true }) });
  await assert.rejects(b.recover(), /could not be verified/);
  assert.deepEqual(b.cart.read(), before);
  await assert.rejects(
    b.submit(h.payload(b), b.cart.read().version),
    /previous checkout/,
  );
});
test("notifications announce shared versions and consumption without stale React state persistence", async () => {
  const h = harness();
  const seen = [];
  const cart = sharedCart({
    storage: h.storage,
    lock: h.lock,
    notify: () => seen.push(JSON.parse(h.storage.getItem(CART_KEY))),
  });
  await cart.add({ variant_id: "v" });
  const a = h.tab({ cart });
  await a.submit(h.payload(a), cart.read().version);
  await a.acknowledge();
  assert.ok(seen.some((s) => s.attempt?.phase === "pending"));
  assert.ok(
    seen.some((s) => s.attempt?.phase === "consumed" && !s.lines.length),
  );
  assert.equal(seen.at(-1).attempt, null);
  assert.equal(new Set(seen.map((s) => s.version)).size, seen.length);
});
