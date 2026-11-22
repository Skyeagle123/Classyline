import { digest } from "./security.js";
import { normalizePhone } from "./checkout.js";

export async function whatsappSales({
  db,
  method,
  request,
  now,
  url,
  body,
  text,
  integer,
  fail,
}) {
  if (method === "GET") {
    const day = url.searchParams.get("day");
    if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day))
      fail(400, "Invalid date");
    const offset = integer(
      Number(url.searchParams.get("offset") ?? 0),
      0,
      1000000,
    );
    if (url.searchParams.get("report") === "products") {
      const grouped = `
        SELECT i.variant_id, i.title, i.color, i.size, i.cost_cents, i.unit_cents,
          SUM(i.qty) AS quantity
        FROM whatsapp_sale_items i JOIN whatsapp_sales s ON s.id = i.sale_id
        WHERE s.status = 'delivered' AND (? IS NULL OR s.business_day = ?)
        GROUP BY i.variant_id, i.title, i.color, i.size, i.cost_cents, i.unit_cents`;
      const [rows, totals] = await db.batch([
        db
          .prepare(
            `SELECT sales.*, p.image FROM (${grouped}) AS sales
          LEFT JOIN variants v ON v.id = sales.variant_id
          LEFT JOIN products p ON p.id = v.product_id
          ORDER BY sales.title, sales.variant_id, sales.color, sales.size, sales.cost_cents, sales.unit_cents LIMIT 31 OFFSET ?`,
          )
          .bind(day, day, offset),
        db
          .prepare(
            `SELECT COALESCE(SUM(quantity), 0) AS quantity,
          COALESCE(SUM(unit_cents * quantity), 0) AS sales_cents,
          COALESCE(SUM(cost_cents * quantity), 0) AS known_cost_cents,
          COALESCE(SUM((unit_cents - cost_cents) * quantity), 0) AS known_profit_cents,
          COALESCE(SUM(CASE WHEN cost_cents IS NULL THEN quantity ELSE 0 END), 0) AS missing_quantity
          FROM (${grouped})`,
          )
          .bind(day, day),
      ]);
      return {
        products: rows.results.slice(0, 30),
        totals: totals.results[0],
        more: rows.results.length > 30,
      };
    }
    const rows = await db
      .prepare(
        `SELECT s.id, customer_name, phone, address, city, status, created_at, dispatched_at,
        delivered_at, collected_at, delivery_charge_cents, delivery_cost_cents,
        SUM(i.unit_cents * i.qty) AS subtotal_cents,
        CASE WHEN COUNT(i.cost_cents) = COUNT(*) THEN SUM(i.cost_cents * i.qty) END AS purchase_cents,
        json_group_array(json_object('variant_id', i.variant_id, 'title', i.title, 'size', i.size, 'color', i.color,
          'qty', i.qty, 'unit_cents', i.unit_cents)) AS items
       FROM whatsapp_sales s JOIN whatsapp_sale_items i ON i.sale_id = s.id
       WHERE (? IS NULL OR s.business_day = ?)
       GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC LIMIT 31 OFFSET ?`,
      )
      .bind(day, day, offset)
      .all();
    const summary =
      day &&
      (await db
        .prepare(
          `WITH delivered AS (
         SELECT s.id, s.collected_at, s.delivery_charge_cents, s.delivery_cost_cents,
           SUM(i.unit_cents * i.qty) AS subtotal,
           CASE WHEN COUNT(i.cost_cents) = COUNT(*) THEN SUM(i.cost_cents * i.qty) END AS purchase
         FROM whatsapp_sales s JOIN whatsapp_sale_items i ON i.sale_id = s.id
         WHERE s.business_day = ? AND s.status = 'delivered'
         GROUP BY s.id
       )
       SELECT COUNT(*) AS delivered_count, COUNT(*) - COUNT(purchase) AS missing_cost,
         COALESCE(SUM(subtotal),0) AS sales_cents, COALESCE(SUM(delivery_cost_cents),0) AS delivery_cents,
         COALESCE(SUM(subtotal + delivery_charge_cents - delivery_cost_cents - purchase),0) AS profit_cents,
         COALESCE(SUM(CASE WHEN collected_at IS NULL THEN subtotal + delivery_charge_cents END),0) AS outstanding_cents
       FROM delivered`,
        )
        .bind(day)
        .first());
    return {
      summary,
      orders: rows.results
        .slice(0, 30)
        .map((row) => ({ ...row, items: JSON.parse(row.items) })),
      more: rows.results.length > 30,
    };
  }

  const input = await body(request);
  if (method === "PUT") {
    if (input.action === "stock") {
      const variant = text(input.variant_id, 100);
      const stock = integer(input.stock, 0, 1000000);
      const expected = integer(input.expected_stock, 0, 1000000);
      const result = await db
        .prepare("UPDATE variants SET stock = ? WHERE id = ? AND stock = ?")
        .bind(stock, variant, expected)
        .run();
      if (!result.meta.changes)
        fail(409, "Stock changed. Refresh and try again.");
      await db
        .prepare("INSERT INTO audit VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), "inventory.stock_edit", variant, now)
        .run();
      return { ok: true };
    }
    const product = text(input.product_id, 100);
    const exists = await db
      .prepare("SELECT id FROM products WHERE id = ?")
      .bind(product)
      .first();
    if (!exists) fail(404, "Product not found");
    if (input.cost_cents === null) {
      await db
        .prepare("DELETE FROM product_purchase_costs WHERE product_id = ?")
        .bind(product)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO product_purchase_costs(product_id, cost_cents) VALUES (?,?)
         ON CONFLICT(product_id) DO UPDATE SET cost_cents = excluded.cost_cents`,
        )
        .bind(product, integer(input.cost_cents, 0, 100000000))
        .run();
    }
    return { ok: true };
  }

  function saleDetails(input) {
    const name = text(input.customer_name, 100);
    const phone = normalizePhone(input.phone);
    if (!phone) fail(400, "Invalid phone number");
    const address = text(input.address, 320);
    const city =
      input.city === undefined || input.city === ""
        ? null
        : text(input.city, 100);
    const charge = integer(input.delivery_charge_cents, 0, 100000000);
    const delivery = integer(input.delivery_cost_cents, 0, 100000000);
    if (
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 20
    )
      fail(400, "Choose between 1 and 20 different items");
    const items = input.items.map((item) => {
      if (!item || typeof item !== "object") fail(400, "Invalid item");
      return [
        text(item.variant_id, 100),
        integer(item.qty, 1, 20),
        integer(item.unit_cents, 0, 100000000),
      ];
    });
    if (new Set(items.map(([variant]) => variant)).size !== items.length)
      fail(400, "Combine quantities for the same size and color");
    return { name, phone, address, city, charge, delivery, items };
  }

  const id = text(input.id, 80);
  if (method === "PATCH") {
    if (input.action === "edit") {
      const current = await db
        .prepare(
          "SELECT status, collected_at, city FROM whatsapp_sales WHERE id = ?",
        )
        .bind(id)
        .first();
      if (!current) fail(404, "Order not found");
      if (
        current.collected_at !== null ||
        !["confirmed", "dispatched"].includes(current.status)
      )
        fail(409, "Only active orders can be edited before delivery");
      const { name, phone, address, city, charge, delivery, items } =
        saleDetails(input);
      const savedCity = input.city === undefined ? current.city : city;
      const hash = await digest(
        JSON.stringify([
          name,
          phone,
          address,
          charge,
          delivery,
          items,
          ...(savedCity ? [savedCity] : []),
        ]),
      );
      const oldItems = (
        await db
          .prepare(
            "SELECT variant_id, qty FROM whatsapp_sale_items WHERE sale_id = ?",
          )
          .bind(id)
          .all()
      ).results;
      const statements = [
        db
          .prepare(
            `UPDATE whatsapp_sales SET request_hash = ?, customer_name = ?, phone = ?, address = ?, city = ?,
              delivery_charge_cents = ?, delivery_cost_cents = ?
             WHERE id = ? AND status = ? AND collected_at IS NULL`,
          )
          .bind(
            hash,
            name,
            phone,
            address,
            savedCity,
            charge,
            delivery,
            id,
            current.status,
          ),
        ...oldItems.map(({ variant_id, qty }) =>
          db
            .prepare("UPDATE variants SET stock = stock + ? WHERE id = ?")
            .bind(qty, variant_id),
        ),
        db
          .prepare("DELETE FROM whatsapp_sale_items WHERE sale_id = ?")
          .bind(id),
        ...items.map(([variant, qty, price]) =>
          db
            .prepare(
              `INSERT INTO whatsapp_sale_items(sale_id, variant_id, title, size, color, unit_cents, cost_cents, qty)
               VALUES (?, ?, (SELECT p.title FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?),
                (SELECT size FROM variants WHERE id = ?), (SELECT color FROM variants WHERE id = ?), ?,
                (SELECT c.cost_cents FROM variants v JOIN product_purchase_costs c ON c.product_id = v.product_id WHERE v.id = ?), ?)`,
            )
            .bind(id, variant, variant, variant, variant, price, variant, qty),
        ),
        db
          .prepare("INSERT INTO audit VALUES (?,?,?,?)")
          .bind(crypto.randomUUID(), "whatsapp_sale.edit", id, now),
      ];
      try {
        const results = await db.batch(statements);
        if (!results[0].meta.changes)
          fail(409, "Order changed. Refresh before editing it again.");
      } catch (error) {
        if (error.status) throw error;
        if (/constraint/i.test(error.message))
          fail(
            409,
            "An item is unavailable or has insufficient stock. Refresh and try again.",
          );
        throw error;
      }
      return { ok: true };
    }
    const from = text(input.from, 24);
    const status = text(input.status, 24);
    const transitions = {
      confirmed: ["dispatched", "cancelled"],
      dispatched: ["delivered", "returned", "returned_damaged"],
      delivered: ["returned", "returned_damaged", "collected"],
    };
    if (
      !Object.hasOwn(transitions, from) ||
      !transitions[from].includes(status)
    )
      fail(400, "Invalid status transition");
    const result = await db
      .prepare(
        `UPDATE whatsapp_sales SET status = CASE WHEN ? = 'collected' THEN status ELSE ? END,
        dispatched_at = CASE WHEN ? = 'dispatched' THEN ? ELSE dispatched_at END,
        delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
        collected_at = CASE WHEN ? = 'collected' THEN ? ELSE collected_at END
       WHERE id = ? AND status = ? AND collected_at IS NULL`,
      )
      .bind(status, status, status, now, status, now, status, now, id, from)
      .run();
    if (!result.meta.changes)
      fail(409, "Order changed. Refresh to see its status.");
    return { ok: true };
  }

  const { name, phone, address, city, charge, delivery, items } =
    saleDetails(input);
  const hash = await digest(
    JSON.stringify([
      name,
      phone,
      address,
      charge,
      delivery,
      items,
      ...(city ? [city] : []),
    ]),
  );
  async function alreadySaved() {
    const existing = await db
      .prepare("SELECT request_hash FROM whatsapp_sales WHERE id = ?")
      .bind(id)
      .first();
    if (existing && existing.request_hash !== hash)
      fail(409, "This order number is already in use");
    return Boolean(existing);
  }
  if (await alreadySaved()) return { id };
  const statements = [
    db
      .prepare(
        `INSERT INTO whatsapp_sales(id, request_hash, customer_name, phone, address, city,
        delivery_charge_cents, delivery_cost_cents, created_at, business_day) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        hash,
        name,
        phone,
        address,
        city,
        charge,
        delivery,
        now,
        businessDay(now),
      ),
    ...items.map(([variant, qty, price]) =>
      db
        .prepare(
          `INSERT INTO whatsapp_sale_items(sale_id, variant_id, title, size, color, unit_cents, cost_cents, qty)
       VALUES (?, ?, (SELECT p.title FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?),
        (SELECT size FROM variants WHERE id = ?), (SELECT color FROM variants WHERE id = ?), ?,
        (SELECT c.cost_cents FROM variants v JOIN product_purchase_costs c ON c.product_id = v.product_id WHERE v.id = ?), ?)`,
        )
        .bind(id, variant, variant, variant, variant, price, variant, qty),
    ),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (await alreadySaved()) return { id };
    if (/constraint/i.test(error.message))
      fail(
        409,
        "An item is unavailable or has insufficient stock. Refresh stock before retrying.",
      );
    throw error;
  }
  return { id };
}

export async function whatsappCosts(db) {
  const { results } = await db
    .prepare("SELECT product_id, cost_cents FROM product_purchase_costs")
    .all();
  return { costs: results };
}

function businessDay(now) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Beirut",
  }).formatToParts(now * 1000);
  const date = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return [date.year, date.month, date.day].join("-");
}
