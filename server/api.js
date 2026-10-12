import { digest, passwordHash, equal, cookie } from "./security.js";
import { normalizePhone, expirePendingOrders } from "./checkout.js";
class Failure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new Failure(status, message);
};
const text = (v, max = 200) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\x00-\x1f]/.test(v)
  )
    fail(400, "Invalid text field");
  return v.trim();
};
const integer = (v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail(400, "Invalid number");
  return v;
};
const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const transitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["dispatched", "cancelled"],
  dispatched: ["delivered"],
  delivered: [],
  cancelled: [],
};
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "JSON required");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "JSON required");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 100000) {
      await reader.cancel();
      fail(413, "Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "JSON object required");
    return value;
  } catch {
    fail(400, "Invalid JSON");
  }
}
async function limit(db, key, max, now) {
  await db
    .prepare(
      "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END",
    )
    .bind(key, now + 900, now, now)
    .run();
  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .bind(key)
    .first();
  if (row.count > max) fail(429, "Please try again later");
}
async function admin(db, request, now) {
  const token = cookie(request);
  if (!token) fail(401, "Sign in required");
  const row = await db
    .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
    .bind(await digest(token))
    .first();
  if (!row || row.expires_at <= now) fail(401, "Sign in required");
}
function image(v) {
  const s = text(v, 2000);
  if (/^\/(?!\/)[^\s]*$/.test(s) || /^https:\/\/[^\s]+$/.test(s)) return s;
  fail(400, "Image must use HTTPS or a local path");
}
function product(raw) {
  return {
    id: text(raw.id, 80),
    title: text(raw.title),
    category: text(raw.category, 80),
    description: raw.description ? text(raw.description, 2000) : "",
    image: image(raw.image),
    price_cents: integer(raw.price_cents, 0, 100000000),
    active: raw.active === false ? 0 : 1,
    variants: (() => {
      if (
        !Array.isArray(raw.variants) ||
        !raw.variants.length ||
        raw.variants.length > 100
      )
        fail(400, "Variants required");
      return raw.variants.map((v) => ({
        id: text(v.id, 100),
        size: text(v.size, 40),
        color: text(v.color, 60),
        stock: integer(v.stock, 0, 1000000),
        expected_stock: v.expected_stock,
      }));
    })(),
  };
}
function receipt(order, items, number) {
  const result = {
    reference: order.reference,
    status: order.status,
    reservation_expires_at: order.reservation_expires_at,
    cancellation_reason: order.cancellation_reason || null,
    subtotal_cents: order.subtotal_cents,
    delivery_cents: order.delivery_cents,
    total_cents: order.subtotal_cents + order.delivery_cents,
    items,
  };
  if (/^[1-9]\d{7,14}$/.test(number || "")) {
    const message = [
      `ClassyLine order ${order.reference}`,
      ...items.map(
        (i) =>
          `${i.title} | ${i.size} | ${i.color} x${i.qty} — $${((i.unit_cents * i.qty) / 100).toFixed(2)}`,
      ),
      `Delivery: $${(order.delivery_cents / 100).toFixed(2)}`,
      `Total: $${(result.total_cents / 100).toFixed(2)} — Cash on Delivery`,
    ].join("\n");
    result.whatsapp_url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }
  return result;
}
export async function handle(request, env) {
  const db = env.DB,
    now = Math.floor(Date.now() / 1000),
    path = new URL(request.url).pathname,
    method = request.method;
  try {
    if (!db) fail(503, "Store service is awaiting configuration");
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
      fail(405, "Method not allowed");
    if (
      method !== "GET" &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      fail(403, "Same-origin request required");
    if (path === "/api/catalog" && method === "GET") {
      await expirePendingOrders(db, now);
      const products = (
        await db
          .prepare("SELECT * FROM products WHERE active=1 ORDER BY title")
          .all()
      ).results;
      const variants = (await db.prepare("SELECT * FROM variants").all())
        .results;
      return json({
        products: products.map((p) => ({
          ...p,
          price: p.price_cents / 100,
          sizes: [
            ...new Set(
              variants.filter((v) => v.product_id === p.id).map((v) => v.size),
            ),
          ],
          variants: variants.filter((v) => v.product_id === p.id),
        })),
        regions: (await db.prepare("SELECT * FROM regions ORDER BY name").all())
          .results,
        whatsapp_enabled: /^[1-9]\d{7,14}$/.test(env.WHATSAPP_NUMBER || ""),
      });
    }
    if (path === "/api/admin/login" && method === "POST") {
      if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_SALT)
        fail(503, "Admin authentication is awaiting configuration");
      const ip = request.headers.get("cf-connecting-ip") || "local";
      await limit(db, "login:" + (await digest(ip)), 5, now);
      const input = await body(request);
      const password = text(input.password, 256);
      if (
        !equal(
          await passwordHash(password, env.ADMIN_PASSWORD_SALT),
          env.ADMIN_PASSWORD_HASH,
        )
      )
        fail(401, "Invalid credentials");
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db
        .prepare("INSERT INTO sessions VALUES (?,?)")
        .bind(await digest(token), now + 3600)
        .run();
      return json({ ok: true }, 200, {
        "Set-Cookie": `__Host-cl_session=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`,
      });
    }
    if (path.startsWith("/api/admin/")) {
      await admin(db, request, now);
      if (path === "/api/admin/session" && method === "GET")
        return json({ ok: true });
      if (path === "/api/admin/logout" && method === "POST") {
        await db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .bind(await digest(cookie(request)))
          .run();
        return json({ ok: true }, 200, {
          "Set-Cookie":
            "__Host-cl_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
        });
      }
      if (path === "/api/admin/orders" && method === "GET") {
        await expirePendingOrders(db, now);
        const orders = (
          await db
            .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100")
            .all()
        ).results;
        const items = orders.length
          ? (
              await db
                .prepare(
                  `SELECT order_id,variant_id,title,size,color,unit_cents,qty FROM order_items WHERE order_id IN (${orders.map(() => "?").join(",")})`,
                )
                .bind(...orders.map((o) => o.id))
                .all()
            ).results
          : [];
        return json({
          orders: orders.map((o) => ({
            ...o,
            items: items.filter((i) => i.order_id === o.id),
          })),
        });
      }
      if (path === "/api/admin/products" && method === "PUT") {
        const p = product(await body(request));
        const statements = [
          db
            .prepare(
              "INSERT INTO products VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,description=excluded.description,image=excluded.image,price_cents=excluded.price_cents,active=excluded.active",
            )
            .bind(
              p.id,
              p.title,
              p.category,
              p.description,
              p.image,
              p.price_cents,
              p.active,
            ),
        ];
        for (const v of p.variants) {
          const old = await db
            .prepare("SELECT product_id,size,color FROM variants WHERE id=?")
            .bind(v.id)
            .first();
          if (
            old &&
            (old.product_id !== p.id ||
              old.size !== v.size ||
              old.color !== v.color)
          )
            fail(409, "Variant identity cannot change");
          statements.push(
            db
              .prepare(
                "INSERT INTO variants VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET stock=CASE WHEN variants.stock=? THEN excluded.stock ELSE -1 END",
              )
              .bind(
                v.id,
                p.id,
                v.size,
                v.color,
                v.stock,
                old ? integer(v.expected_stock, 0, 1000000) : -1,
              ),
          );
        }
        statements.push(
          db
            .prepare("INSERT INTO audit VALUES (?,?,?,?)")
            .bind(crypto.randomUUID(), "product.upsert", p.id, now),
        );
        try {
          await db.batch(statements);
        } catch {
          fail(409, "Stock changed; refresh the product before editing");
        }
        return json({ ok: true });
      }
      if (path === "/api/admin/regions" && method === "PUT") {
        const v = await body(request);
        const id = text(v.id, 80),
          fee =
            v.fee_cents === null ? null : integer(v.fee_cents, 0, 100000000);
        if (
          !(await db
            .prepare("SELECT id FROM regions WHERE id=?")
            .bind(id)
            .first())
        )
          fail(400, "Unknown region");
        await db.batch([
          db.prepare("UPDATE regions SET fee_cents=? WHERE id=?").bind(fee, id),
          db
            .prepare("INSERT INTO audit VALUES (?,?,?,?)")
            .bind(crypto.randomUUID(), "region.update", id, now),
        ]);
        return json({ ok: true });
      }
      if (path === "/api/admin/orders" && method === "PATCH") {
        await expirePendingOrders(db, now);
        const v = await body(request),
          id = text(v.id, 80);
        const old = await db
          .prepare("SELECT status FROM orders WHERE id=?")
          .bind(id)
          .first();
        if (!old || !transitions[old.status].includes(v.status))
          fail(409, "Invalid status transition");
        let result;
        try {
          result = await db
            .prepare(
              "UPDATE orders SET status=?,cancellation_reason=? WHERE id=? AND status=?",
            )
            .bind(
              v.status,
              v.status === "cancelled" ? "admin" : null,
              id,
              old.status,
            )
            .run();
        } catch {
          fail(409, "Reservation expired; refresh the order");
        }
        if (!result.meta.changes) fail(409, "Order changed; refresh");
        return json({ ok: true });
      }
    }
    if (path === "/api/orders/recover" && method === "POST") {
      const input = await body(request),
        key = text(input.key, 80);
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          key,
        )
      )
        fail(400, "Invalid order key");
      await limit(
        db,
        "recover:" +
          (await digest(request.headers.get("cf-connecting-ip") || "local")),
        30,
        now,
      );
      await expirePendingOrders(db, now);
      // Atomically retire a missing attempt before answering: a delayed original POST can never commit later.
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO retired_order_keys VALUES (?,?) ON CONFLICT(idempotency_key) DO NOTHING",
          )
          .bind(key, now),
        db.prepare("SELECT * FROM orders WHERE idempotency_key=?").bind(key),
      ]);
      const saved = results[1].results[0];
      if (!saved) return json({ not_created: true });
      const items = (
        await db
          .prepare(
            "SELECT title,size,color,unit_cents,qty FROM order_items WHERE order_id=?",
          )
          .bind(saved.id)
          .all()
      ).results;
      return json({ receipt: receipt(saved, items, env.WHATSAPP_NUMBER) });
    }
    if (path === "/api/orders" && method === "POST") {
      await expirePendingOrders(db, now);
      const input = await body(request);
      const key = text(request.headers.get("idempotency-key"), 80);
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          key,
        )
      )
        fail(400, "Invalid order key");
      const hash = await digest(JSON.stringify(input));
      const previous = await db
        .prepare("SELECT * FROM orders WHERE idempotency_key=?")
        .bind(key)
        .first();
      if (previous) {
        if (previous.request_hash !== hash) fail(409, "Order key already used");
        return json(
          receipt(
            previous,
            (
              await db
                .prepare(
                  "SELECT title,size,color,unit_cents,qty FROM order_items WHERE order_id=?",
                )
                .bind(previous.id)
                .all()
            ).results,
            env.WHATSAPP_NUMBER,
          ),
        );
      }
      if (
        await db
          .prepare(
            "SELECT idempotency_key FROM retired_order_keys WHERE idempotency_key=?",
          )
          .bind(key)
          .first()
      )
        fail(409, "Order attempt retired; review and submit a new order");
      await limit(
        db,
        "order:" +
          (await digest(request.headers.get("cf-connecting-ip") || "local")),
        15,
        now,
      );
      const name = text(input.name, 120),
        phone = normalizePhone(input.phone),
        address = text(input.address, 500),
        region = text(input.region, 80);
      if (!phone)
        fail(
          400,
          "Enter a valid Lebanese number or an international number starting with + or 00",
        );
      // Additional protection independent of IP. These limits are abuse controls, not confirmation.
      await limit(db, "order-phone:" + (await digest(phone)), 3, now);
      await limit(db, "order-global", 100, now);
      if (!["cod", "whatsapp"].includes(input.channel))
        fail(400, "Invalid channel");
      if (
        input.channel === "whatsapp" &&
        !/^[1-9]\d{7,14}$/.test(env.WHATSAPP_NUMBER || "")
      )
        fail(503, "WhatsApp is awaiting configuration");
      const delivery = await db
        .prepare("SELECT fee_cents FROM regions WHERE id=?")
        .bind(region)
        .first();
      if (!delivery || delivery.fee_cents === null)
        fail(409, "Delivery fee has not been configured for this region");
      if (
        !Array.isArray(input.items) ||
        input.items.length < 1 ||
        input.items.length > 30
      )
        fail(400, "Invalid cart");
      const ids = new Set(),
        items = [];
      for (const item of input.items) {
        const id = text(item.variant_id, 100);
        if (ids.has(id)) fail(400, "Duplicate variant");
        ids.add(id);
        const qty = integer(item.qty, 1, 20);
        const v = await db
          .prepare(
            "SELECT v.*,p.title,p.price_cents,p.active FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?",
          )
          .bind(id)
          .first();
        if (!v || !v.active || v.stock < qty)
          fail(409, "An item is unavailable");
        items.push({
          variant_id: id,
          title: v.title,
          size: v.size,
          color: v.color,
          unit_cents: v.price_cents,
          qty,
        });
      }
      const subtotal = items.reduce((s, i) => s + i.unit_cents * i.qty, 0);
      if (input.expected_total_cents !== subtotal + delivery.fee_cents)
        fail(409, "Prices changed; review your cart");
      const order = {
        id: crypto.randomUUID(),
        reference:
          "CL-" +
          crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase(),
        status: "pending",
        subtotal_cents: subtotal,
        delivery_cents: delivery.fee_cents,
        reservation_expires_at: now + 1800,
      };
      const statements = [
        db
          .prepare(
            "INSERT INTO orders(id,reference,idempotency_key,request_hash,customer_name,phone,address,region_id,delivery_cents,subtotal_cents,channel,created_at,reservation_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            order.id,
            order.reference,
            key,
            hash,
            name,
            phone,
            address,
            region,
            delivery.fee_cents,
            subtotal,
            input.channel,
            now,
            order.reservation_expires_at,
          ),
      ];
      for (const i of items)
        statements.push(
          db
            .prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)")
            .bind(
              order.id,
              i.variant_id,
              i.title,
              i.size,
              i.color,
              i.unit_cents,
              i.qty,
            ),
        );
      try {
        await db.batch(statements);
      } catch {
        fail(
          409,
          "Stock changed or order already submitted. Retry with the same order key",
        );
      }
      return json(receipt(order, items, env.WHATSAPP_NUMBER), 201);
    }
    fail(404, "Not found");
  } catch (e) {
    return json(
      { error: e instanceof Failure ? e.message : "Service unavailable" },
      e instanceof Failure ? e.status : 503,
    );
  }
}
