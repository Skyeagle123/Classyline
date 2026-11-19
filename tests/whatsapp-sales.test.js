import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./adapter.js";
import { handle } from "../server/api.js";
import { digest } from "../server/security.js";

test("WhatsApp orders share catalog stock, preserve transaction prices, and restore sellable returns", async () => {
  const DB = database();
  const origin = "https://classyline.test";
  DB.sqlite.exec(`
    INSERT INTO products VALUES ('p','Pajama','Pajamas','','/p.jpg',2200,1);
    INSERT INTO variants VALUES ('s','p','S','Pink',3),('m','p','M','Pink',1);
  `);
  DB.sqlite
    .prepare("INSERT INTO sessions VALUES (?,unixepoch()+3600)")
    .run(await digest("session-test"));
  function call(path, method = "GET", data, authenticated = true) {
    return handle(
      new Request(origin + "/api" + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(authenticated
            ? { Cookie: "__Host-cl_session=session-test" }
            : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      { DB },
    );
  }
  const path = "/admin/whatsapp-sales";
  const order = {
    id: "whatsapp-test",
    customer_name: "Test Customer",
    phone: "70000000",
    address: "Test Address",
    delivery_charge_cents: 200,
    delivery_cost_cents: 300,
    items: [{ variant_id: "s", qty: 2, unit_cents: 2100 }],
  };
  const stock = () =>
    DB.sqlite.prepare("SELECT stock FROM variants WHERE id='s'").get().stock;
  assert.equal((await call(path, "GET", undefined, false)).status, 401);
  assert.equal((await call(path, "POST", order, false)).status, 401);
  assert.equal(
    (await call(path, "PUT", { variant_id: "s", cost_cents: 1100 })).status,
    200,
  );
  assert.equal((await call(path, "POST", order)).status, 201);
  assert.equal((await call(path, "POST", order)).status, 201);
  assert.equal(stock(), 1);
  const catalog = await (
    await call("/catalog", "GET", undefined, false)
  ).json();
  assert.equal(catalog.products[0].variants.find((v) => v.id === "s").stock, 1);
  assert.doesNotMatch(JSON.stringify(catalog), /cost_cents|Test Customer/);
  assert.equal(
    (await call(path, "POST", { ...order, customer_name: "Changed" })).status,
    409,
  );
  const conflict = {
    ...order,
    id: "too-many",
    items: [
      { variant_id: "s", qty: 1, unit_cents: 2200 },
      { variant_id: "m", qty: 2, unit_cents: 2200 },
    ],
  };
  assert.equal((await call(path, "POST", conflict)).status, 409);
  assert.equal(stock(), 1);
  assert.equal(
    (await call(path, "PUT", { variant_id: "s", cost_cents: 1500 })).status,
    200,
  );
  const { orders } = await (await call(path)).json();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].subtotal_cents, 4200);
  assert.equal(orders[0].purchase_cents, 2200);
  assert.equal(orders[0].items[0].variant_id, "s");
  const edit = {
    action: "edit",
    id: order.id,
    customer_name: "Updated Customer",
    phone: "71111111",
    address: "Updated Address",
    delivery_charge_cents: 500,
    delivery_cost_cents: 400,
    items: [{ variant_id: "m", qty: 1, unit_cents: 2500 }],
  };
  assert.equal((await call(path, "PATCH", edit)).status, 200);
  assert.equal(stock(), 3);
  assert.equal(
    DB.sqlite.prepare("SELECT stock FROM variants WHERE id='m'").get().stock,
    0,
  );
  const edited = (await (await call(path)).json()).orders[0];
  assert.equal(edited.customer_name, "Updated Customer");
  assert.equal(edited.phone, "+96171111111");
  assert.equal(edited.address, "Updated Address");
  assert.equal(edited.delivery_charge_cents, 500);
  assert.equal(edited.delivery_cost_cents, 400);
  assert.equal(edited.subtotal_cents, 2500);
  assert.equal(edited.items[0].variant_id, "m");
  assert.equal(edited.items[0].qty, 1);
  assert.equal(
    DB.sqlite
      .prepare("SELECT count(*) n FROM audit WHERE action='whatsapp_sale.edit'")
      .get().n,
    1,
  );
  assert.equal(
    (
      await call(path, "PATCH", {
        ...edit,
        items: [{ variant_id: "s", qty: 4, unit_cents: 1 }],
      })
    ).status,
    409,
  );
  assert.equal(stock(), 3);
  assert.equal(
    DB.sqlite.prepare("SELECT stock FROM variants WHERE id='m'").get().stock,
    0,
  );
  const advance = (id, from, status) =>
    call(path, "PATCH", { id, from, status });
  assert.equal(
    (await advance(order.id, "confirmed", "dispatched")).status,
    200,
  );
  assert.equal(
    (
      await call(path, "PATCH", {
        ...edit,
        items: [{ variant_id: "m", qty: 1, unit_cents: 2600 }],
      })
    ).status,
    200,
  );
  assert.equal((await advance(order.id, "dispatched", "returned")).status, 200);
  assert.equal((await advance(order.id, "dispatched", "returned")).status, 409);
  assert.equal(
    DB.sqlite.prepare("SELECT stock FROM variants WHERE id='m'").get().stock,
    1,
  );
  assert.equal((await call(path, "PATCH", edit)).status, 409);
  const delivered = { ...order, id: "delivered" };
  assert.equal((await call(path, "POST", delivered)).status, 201);
  assert.equal(
    (await advance(delivered.id, "confirmed", "dispatched")).status,
    200,
  );
  assert.equal(
    (await advance(delivered.id, "dispatched", "delivered")).status,
    200,
  );
  assert.equal(
    (await advance(delivered.id, "delivered", "collected")).status,
    200,
  );
  assert.equal(
    (await advance(delivered.id, "delivered", "collected")).status,
    409,
  );
  assert.equal(stock(), 1);
  const saved = await (await call(path)).json();
  assert.ok(saved.orders.find((o) => o.id === delivered.id).collected_at);
  const day = DB.sqlite
    .prepare("SELECT business_day FROM whatsapp_sales WHERE id = ?")
    .get(delivered.id).business_day;
  const report = await (await call(path + "?day=" + day)).json();
  assert.equal(report.summary.delivered_count, 1);
  assert.equal(report.summary.profit_cents, 1100);
  assert.equal(report.summary.outstanding_cents, 0);
  const products = await (
    await call(path + "?report=products&day=" + day)
  ).json();
  assert.equal(products.products.length, 1);
  assert.equal(products.products[0].unit_cents, 2100);
  assert.equal(products.products[0].cost_cents, 1500);
  assert.deepEqual(products.totals, {
    quantity: 2,
    sales_cents: 4200,
    known_cost_cents: 3000,
    known_profit_cents: 1200,
    missing_quantity: 0,
  });
});
