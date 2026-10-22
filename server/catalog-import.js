import { validateRows, exportRows } from "../shared/catalog-import.js";
import { digest, equal } from "./security.js";
export class ImportFailure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const reject = (status, msg) => {
  throw new ImportFailure(status, msg);
};
// Stable JSON built by SQLite itself, also evaluated inside the write transaction.
const SNAPSHOT = `SELECT json_object(
 'matches',(SELECT count(*) FROM products WHERE id=? COLLATE NOCASE),
 'product',json((SELECT json_object('id',id,'title',title,'category',category,'description',description,'image',image,'price_cents',price_cents,'active',active) FROM products WHERE id=? COLLATE NOCASE)),
 'variants',json((SELECT json_group_array(json_object('id',id,'size',size,'color',color,'stock',stock)) FROM (SELECT id,size,color,stock FROM variants WHERE product_id=? ORDER BY id))),
 'collections',json((SELECT json_group_array(collection) FROM (SELECT collection FROM product_collections WHERE product_id=? ORDER BY collection)))) AS snapshot`;
function snapshotExpression(idExpression) {
  return SNAPSHOT.replaceAll("?", idExpression).replace(/ AS snapshot$/, "");
}
async function readSnapshots(db, ids) {
  const sql = `SELECT j.value AS id, (${snapshotExpression("j.value")}) AS snapshot FROM json_each(?) j`;
  return new Map(
    (await db.prepare(sql).bind(JSON.stringify(ids)).all()).results.map((r) => [
      r.id,
      r.snapshot,
    ]),
  );
}
async function mac(session, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(session),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function adminCatalog(db) {
  const products = (
    await db.prepare("SELECT * FROM products ORDER BY id").all()
  ).results;
  const variants = (
    await db.prepare("SELECT * FROM variants ORDER BY id").all()
  ).results;
  const tags = (
    await db
      .prepare("SELECT * FROM product_collections ORDER BY collection")
      .all()
  ).results;
  return products.map((p) => ({
    ...p,
    variants: variants.filter((v) => v.product_id === p.id),
    collections: tags
      .filter((t) => t.product_id === p.id)
      .map((t) => t.collection),
  }));
}
async function plan(db, rows) {
  let reports;
  try {
    reports = validateRows(rows);
  } catch (e) {
    reject(400, e.message);
  }
  const snapshots = [],
    operations = [];
  const current = await readSnapshots(
    db,
    reports.filter((r) => !r.errors.length).map((r) => r.product.id),
  );
  for (const row of reports) {
    if (row.errors.length) continue;
    const raw = current.get(row.product.id),
      before = JSON.parse(raw);
    snapshots.push({ id: row.product.id, hash: await digest(raw) });
    if (
      before.matches > 1 ||
      (before.product && before.product.id !== row.product.id)
    ) {
      row.errors.push(
        "SKU differs only by case or is ambiguous; use the exact existing SKU.",
      );
      continue;
    }
    const incoming = [];
    for (const v of row.product.variants) {
      const old = before.variants.find(
        (x) => x.size === v.size && x.color === v.color,
      );
      incoming.push({
        ...v,
        id:
          old?.id ||
          "cli-" +
            (
              await digest(JSON.stringify([row.product.id, v.size, v.color]))
            ).slice(0, 40),
      });
      if (old && old.stock !== v.stock)
        row.warnings.push(
          `${v.size} / ${v.color}: stock ${old.stock} → ${v.stock}. This changes available stock, excluding pending reservations.`,
        );
    }
    const retained = before.variants.filter(
      (x) => !incoming.some((v) => v.id === x.id),
    );
    if (retained.length)
      row.warnings.push(
        `${retained.length} existing variant(s) omitted from Excel will be retained. Variant removal is not supported.`,
      );
    const after = {
      ...row.product,
      variants: [...incoming, ...retained].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
    };
    const oldComparable = before.product
      ? {
          ...before.product,
          collections: before.collections,
          variants: before.variants,
        }
      : null;
    // Compare fields explicitly rather than object property insertion order.
    const same =
      oldComparable &&
      [
        "id",
        "title",
        "category",
        "description",
        "image",
        "price_cents",
        "active",
        "collections",
      ].every(
        (k) => JSON.stringify(oldComparable[k]) === JSON.stringify(after[k]),
      ) &&
      JSON.stringify(
        oldComparable.variants.map((v) => [v.id, v.size, v.color, v.stock]),
      ) ===
        JSON.stringify(
          after.variants.map((v) => [v.id, v.size, v.color, v.stock]),
        );
    row.action = !before.product ? "created" : same ? "unchanged" : "updated";
    row.before = oldComparable;
    row.after = after;
    operations.push({ before: raw, after, action: row.action });
  }
  const summary = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  for (const r of reports) {
    if (r.errors.length) summary.rejected++;
    else summary[r.action]++;
  }
  return {
    reports,
    snapshots,
    operations,
    summary,
    hash: await digest(JSON.stringify(reports.map((r) => r.product))),
  };
}
export async function previewImport(db, rows, session, now) {
  const p = await plan(db, rows);
  const payload = JSON.stringify({
    version: 1,
    id: crypto.randomUUID(),
    expires: now + 600,
    hash: p.hash,
    snapshots: p.snapshots,
  });
  return {
    rows: p.reports,
    summary: p.summary,
    can_import: !p.summary.rejected,
    ticket: p.summary.rejected
      ? null
      : { payload, mac: await mac(session, payload) },
  };
}
export async function confirmImport(db, input, session, now) {
  const t = input.ticket;
  if (
    !t ||
    typeof t.payload !== "string" ||
    t.payload.length > 15000 ||
    !equal(t.mac, await mac(session, t.payload))
  )
    reject(400, "Invalid preview confirmation. Preview again.");
  let signed;
  try {
    signed = JSON.parse(t.payload);
  } catch {
    reject(400, "Invalid preview confirmation.");
  }
  const p = await plan(db, input.rows);
  if (signed.version !== 1 || signed.hash !== p.hash || p.summary.rejected)
    reject(409, "Import rows changed or invalid. Preview again.");
  const previous = await db
    .prepare("SELECT request_hash,summary FROM catalog_imports WHERE id=?")
    .bind(signed.id)
    .first();
  if (previous) {
    if (previous.request_hash !== signed.hash)
      reject(409, "Import identity conflict.");
    return { summary: JSON.parse(previous.summary), replayed: true };
  }
  if (
    signed.expires < now ||
    signed.expires > now + 600 ||
    JSON.stringify(signed.snapshots) !== JSON.stringify(p.snapshots)
  )
    reject(409, "Preview expired or catalog/stock changed. Preview again.");
  if (input.confirm_changes !== true)
    reject(400, "Explicit confirmation of all changes is required.");
  const statements = [];
  // Write the receipt in the SAME transaction; concurrent/repeated confirms cannot apply twice.
  statements.push(
    db
      .prepare("INSERT INTO catalog_imports VALUES (?,?,?,?)")
      .bind(signed.id, signed.hash, JSON.stringify(p.summary), now),
  );
  // Check ALL expected snapshots before ANY product changes, including unchanged rows.
  // JSON-bound bulk statements keep the whole invocation well below the Free D1 query limit.
  const expected = JSON.stringify(
    p.operations.map((op) => ({ id: op.after.id, snapshot: op.before })),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO products(id,title,category,description,image,price_cents,active) SELECT ?, '', '', '', '', -1, 0 WHERE EXISTS (SELECT 1 FROM json_each(?) j WHERE (${snapshotExpression("json_extract(j.value,'$.id')")}) IS NOT json_extract(j.value,'$.snapshot'))`,
      )
      .bind("guard-" + crypto.randomUUID(), expected),
  );
  const changed = JSON.stringify(
    p.operations
      .filter((op) => op.action !== "unchanged")
      .map((op) => op.after),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO products(id,title,category,description,image,price_cents,active)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.category'),json_extract(value,'$.description'),json_extract(value,'$.image'),json_extract(value,'$.price_cents'),json_extract(value,'$.active') FROM json_each(?) WHERE 1
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,description=excluded.description,image=excluded.image,price_cents=excluded.price_cents,active=excluded.active`,
      )
      .bind(changed),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO variants(id,product_id,size,color,stock)
    SELECT json_extract(v.value,'$.id'),json_extract(p.value,'$.id'),json_extract(v.value,'$.size'),json_extract(v.value,'$.color'),json_extract(v.value,'$.stock') FROM json_each(?) p JOIN json_each(json_extract(p.value,'$.variants')) v WHERE 1
    ON CONFLICT(id) DO UPDATE SET stock=CASE WHEN variants.product_id=excluded.product_id AND variants.size=excluded.size AND variants.color=excluded.color THEN excluded.stock ELSE -1 END`,
      )
      .bind(changed),
  );
  statements.push(
    db
      .prepare(
        "DELETE FROM product_collections WHERE product_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))",
      )
      .bind(changed),
  );
  statements.push(
    db
      .prepare(
        "INSERT INTO product_collections SELECT json_extract(p.value,'$.id'),c.value FROM json_each(?) p JOIN json_each(json_extract(p.value,'$.collections')) c",
      )
      .bind(changed),
  );
  statements.push(
    db
      .prepare("INSERT INTO audit VALUES (?,?,?,?)")
      .bind(crypto.randomUUID(), "catalog.import", signed.id, now),
  );
  try {
    await db.batch(statements);
  } catch {
    const saved = await db
      .prepare("SELECT request_hash,summary FROM catalog_imports WHERE id=?")
      .bind(signed.id)
      .first();
    if (saved?.request_hash === signed.hash)
      return { summary: JSON.parse(saved.summary), replayed: true };
    reject(
      409,
      "Nothing imported: catalog/stock changed or a write conflicted. Preview again.",
    );
  }
  return { summary: p.summary, replayed: false };
}
export async function exportCatalog(db) {
  return exportRows(await adminCatalog(db));
}
