import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./adapter.js";
import { handle } from "../server/api.js";
test("0002 rollback rehearsal rejects incompatible parent writes without loss; compatible roll-forward recovers exact orders and retired keys", async () => {
  const DB = database();
  DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Synthetic','Tops','','/p.jpg',100,1); INSERT INTO variants VALUES ('v','p','M','Ivory',5); UPDATE regions SET fee_cents=0 WHERE id='beirut'",
  );
  const request = (path, data, key) =>
    new Request("https://store.test/api" + path, {
      method: "POST",
      headers: {
        Origin: "https://store.test",
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(data),
    });
  const key = crypto.randomUUID(),
    retired = crypto.randomUUID(),
    payload = {
      name: "Synthetic",
      phone: "+96170000000",
      address: "Synthetic only",
      region: "beirut",
      channel: "cod",
      items: [{ variant_id: "v", qty: 1 }],
      expected_total_cents: 100,
    };
  const first = await handle(request("/orders", payload, key), { DB });
  assert.equal(first.status, 201);
  const receipt = await first.json();
  await handle(request("/orders/recover", { key: retired }), { DB });
  const evidence = () => ({
    orders: DB.sqlite.prepare("SELECT * FROM orders").all(),
    items: DB.sqlite.prepare("SELECT * FROM order_items").all(),
    retired: DB.sqlite.prepare("SELECT * FROM retired_order_keys").all(),
    variants: DB.sqlite.prepare("SELECT * FROM variants").all(),
  });
  const before = evidence();
  // Exact insert shape used by the 7175 parent, before reservation_expires_at existed.
  assert.throws(
    () =>
      DB.sqlite
        .prepare(
          "INSERT INTO orders(id,reference,idempotency_key,request_hash,customer_name,phone,address,region_id,delivery_cents,subtotal_cents,channel,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          "incompatible",
          "CL-INCOMPATIBLE",
          crypto.randomUUID(),
          "hash",
          "Synthetic",
          "+447700900123",
          "Synthetic",
          "beirut",
          0,
          100,
          "cod",
          Math.floor(Date.now() / 1000),
        ),
    /Reservation deadline required/,
  );
  assert.deepEqual(evidence(), before);
  // Safe recovery keeps schema 0002 and restores a compatible application.
  const recovered = await (
    await handle(request("/orders/recover", { key }), { DB })
  ).json();
  assert.equal(recovered.receipt.reference, receipt.reference);
  assert.equal(
    (await handle(request("/orders", payload, key), { DB })).status,
    200,
  );
  assert.equal(
    (await handle(request("/orders", payload, retired), { DB })).status,
    409,
  );
  assert.deepEqual(evidence().orders, before.orders);
  assert.deepEqual(evidence().items, before.items);
  assert.deepEqual(evidence().variants, before.variants);
  assert.ok(evidence().retired.some((i) => i.idempotency_key === retired));
  assert.equal(
    DB.sqlite.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(DB.sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
});
