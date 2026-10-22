import test from "node:test";
import assert from "node:assert/strict";
import {
  sharedCart,
  cartItems,
  CartActionError,
  CART_KEY,
} from "../src/cart.js";
import { cartReady, performCartAction } from "../src/cart-ui.js";
import { checkout } from "../src/checkout.js";
import { database } from "./adapter.js";
import { handle } from "../server/api.js";
function memory() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
function model(storage = memory(), lock = (_, fn) => fn()) {
  const coordinator = sharedCart({ storage, lock });
  const view = {
    state: null,
    actionError: "",
    fatalError: "",
    get ready() {
      return cartReady(this.state, this.fatalError);
    },
  };
  const act = (fn) =>
    performCartAction(coordinator, fn, {
      success: (s) => {
        view.state = s;
        view.actionError = "";
        view.fatalError = "";
      },
      actionError: (m) => {
        view.actionError = m;
      },
      fatalError: (m) => {
        view.fatalError = m;
      },
    });
  return { storage, coordinator, view, act };
}
test("21st-unit limit leaves Add, Remove and Checkout ready; removal and a fresh checkout work without reload", async () => {
  const m = model();
  for (let i = 0; i < 20; i++)
    await m.act(() => m.coordinator.add({ variant_id: "v" }));
  await assert.rejects(
    m.act(() => m.coordinator.add({ variant_id: "v" })),
    CartActionError,
  );
  assert.equal(m.view.ready, true);
  assert.match(m.view.actionError, /Remove some items/);
  assert.equal(m.view.fatalError, "");
  await m.act(() => m.coordinator.remove("v"));
  assert.equal(m.view.actionError, "");
  await m.act(() => m.coordinator.add({ variant_id: "v" }));
  const DB = database();
  DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Synthetic','Tops','','/p.jpg',100,1); INSERT INTO variants VALUES ('v','p','M','Ivory',2); UPDATE regions SET fee_cents=0 WHERE id='beirut'",
  );
  const c = checkout({
    storage: m.storage,
    tabStorage: memory(),
    cart: m.coordinator,
    request: async (path, options) => {
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
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data;
    },
  });
  const receipt = await c.submit(
    {
      name: "Synthetic",
      phone: "+96170000000",
      address: "Synthetic only",
      region: "beirut",
      channel: "cod",
      expected_total_cents: 100,
      items: cartItems(m.view.state.lines),
    },
    m.view.state.version,
  );
  assert.equal(receipt.status, "pending");
  assert.equal(DB.sqlite.prepare("SELECT count(*) n FROM orders").get().n, 1);
});
test("maximum-cart-size error preserves healthy state; Remove and subsequent Add clear it normally", async () => {
  const m = model();
  for (let i = 0; i < 30; i++)
    await m.act(() => m.coordinator.add({ variant_id: "v" + i }));
  await assert.rejects(
    m.act(() => m.coordinator.add({ variant_id: "v30" })),
    CartActionError,
  );
  assert.equal(m.view.ready, true);
  assert.match(m.view.actionError, /Remove an item/);
  assert.equal(cartItems(m.view.state.lines).length, 30);
  await m.act(() => m.coordinator.remove("v0"));
  await m.act(() => m.coordinator.add({ variant_id: "v30" }));
  assert.equal(m.view.actionError, "");
  assert.equal(m.view.fatalError, "");
  assert.equal(m.view.ready, true);
  assert.equal(cartItems(m.view.state.lines).length, 30);
});
test("quota/storage failures are fatal even when an older render state exists, and healthy reconciliation clears them", async () => {
  const m = model();
  await m.act(() => m.coordinator.add({ variant_id: "v" }));
  const set = m.storage.setItem;
  m.storage.setItem = () => {
    throw new Error("Synthetic quota");
  };
  await assert.rejects(
    m.act(() => m.coordinator.add({ variant_id: "w" })),
    /quota/,
  );
  assert.equal(m.view.ready, false);
  assert.equal(m.view.actionError, "");
  m.storage.setItem = set;
  await m.act(() => m.coordinator.refresh());
  assert.equal(m.view.ready, true);
  assert.equal(m.view.fatalError, "");
  assert.deepEqual(cartItems(m.view.state.lines), [
    { variant_id: "v", qty: 1 },
  ]);
});
test("missing locks and corrupted records remain fatal; ordinary error classification cannot bypass reconciliation", async () => {
  const noLock = model(memory(), null);
  await assert.rejects(
    noLock.act(() => noLock.coordinator.add({ variant_id: "v" })),
    /Web Locks/,
  );
  assert.equal(noLock.view.ready, false);
  const m = model();
  await m.act(() => m.coordinator.add({ variant_id: "v" }));
  m.storage.setItem(CART_KEY, "{");
  await assert.rejects(
    m.act(() => {
      throw new CartActionError("Synthetic ordinary limit");
    }),
    /safely/,
  );
  assert.equal(m.view.ready, false);
  assert.equal(m.view.actionError, "");
  assert.match(m.view.fatalError, /safely/);
});
test("locking and unexpected failure values fail closed rather than being mistaken for ordinary action errors", async () => {
  const m = model();
  await m.act(() => m.coordinator.add({ variant_id: "v" }));
  await assert.rejects(
    m.act(async () => {
      throw "Synthetic non-Error rejection";
    }),
  );
  assert.equal(m.view.ready, false);
  assert.match(m.view.fatalError, /could not be updated safely/);
  const rejected = model(memory(), async () => {
    throw new Error("Synthetic lock failure");
  });
  await assert.rejects(
    rejected.act(() => rejected.coordinator.refresh()),
    /lock failure/,
  );
  assert.equal(rejected.view.ready, false);
});
