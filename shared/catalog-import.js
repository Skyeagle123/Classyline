export const HEADERS = [
  "SKU",
  "Product Name",
  "Category",
  "Collection",
  "Price USD",
  "Size",
  "Color",
  "Stock",
  "Image Filename or URL",
  "Description",
  "Status",
];
export const MAX_ROWS = 50;
export const CATEGORIES = [
  "New In",
  "Dresses",
  "Tops",
  "Sets",
  "Jackets",
  "Sale",
];
const clean = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
const validText = (v, max) => v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
export function imageReference(value) {
  const s = clean(value);
  if (!s || s.length > 1000 || /[\s\\<>"'\x00-\x1f]/.test(s))
    throw Error("Enter an image filename, /products/path or HTTPS URL.");
  if (/^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif)$/i.test(s))
    return "/products/" + s;
  if (
    /^\/products\/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp|avif)$/i.test(s) &&
    !s.includes("..")
  )
    return s;
  try {
    const u = new URL(s);
    if (u.protocol === "https:" && !u.username && !u.password && u.hostname)
      return u.href;
  } catch {}
  throw Error("Image must be a controlled /products/ path or HTTPS URL.");
}
export function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS)
    throw Error(`Upload 1–${MAX_ROWS} product rows.`);
  const seen = new Map();
  const result = rows.map((raw, i) => {
    const row = {
      row:
        Number.isSafeInteger(raw?._row) && raw._row >= 2 && raw._row <= 2000
          ? raw._row
          : i + 2,
      errors: [],
      warnings: [],
      product: null,
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      row.errors.push("Invalid row.");
      return row;
    }
    if (Array.isArray(raw._errors) && raw._errors.length)
      row.errors.push(
        "Formula or unsupported cell type: enter literal values.",
      );
    const get = (h) => clean(raw[h]);
    const id = get("SKU");
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id))
      row.errors.push("SKU: use 1–80 letters, digits, hyphens or underscores.");
    const key = id.toLowerCase();
    if (seen.has(key)) {
      row.errors.push("Duplicate SKU.");
      seen.get(key).errors.push("Duplicate SKU.");
    } else seen.set(key, row);
    const title = get("Product Name"),
      description = get("Description"),
      category = get("Category"),
      collection = get("Collection");
    if (!title || !validText(title, 200))
      row.errors.push("Product Name: required, maximum 200 characters.");
    if (!validText(description, 1000))
      row.errors.push(
        "Description: maximum 1000 characters, no control characters.",
      );
    if (!CATEGORIES.includes(category))
      row.errors.push("Choose a listed category.");
    const collections = collection
      ? collection.split("|").map((s) => s.trim())
      : [];
    if (
      collections.some((s) => !CATEGORIES.includes(s)) ||
      new Set(collections).size !== collections.length
    )
      row.errors.push(
        "Collection: use listed names separated by |, without duplicates.",
      );
    const price = get("Price USD");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(price) || Number(price) > 1000000)
      row.errors.push(
        "Price USD: non-negative number, maximum two decimals and 1000000.",
      );
    const price_cents = /^\d{1,7}(\.\d{1,2})?$/.test(price)
      ? Number(price.split(".")[0]) * 100 +
        Number((price.split(".")[1] || "").padEnd(2, "0"))
      : 0;
    const sizes = get("Size")
        .split("|")
        .map((s) => s.trim()),
      colors = get("Color")
        .split("|")
        .map((s) => s.trim()),
      stocks = get("Stock")
        .split("|")
        .map((s) => s.trim());
    if (
      sizes.length > 20 ||
      sizes.length !== colors.length ||
      sizes.length !== stocks.length ||
      sizes.some((s) => !s || !validText(s, 40)) ||
      colors.some((s) => !s || !validText(s, 60)) ||
      stocks.some((s) => !/^\d{1,7}$/.test(s) || Number(s) > 1000000)
    )
      row.errors.push(
        "Size, Color and Stock: 1–20 matched entries separated by |; stock must be a non-negative whole number up to 1000000.",
      );
    const variants = sizes.map((size, j) => ({
      size,
      color: colors[j],
      stock: Number(stocks[j]),
    }));
    if (
      new Set(variants.map((v) => JSON.stringify([v.size, v.color]))).size !==
      variants.length
    )
      row.errors.push("Duplicate size/color combination.");
    const status = get("Status");
    if (!["Active", "Draft"].includes(status))
      row.errors.push("Status: choose Active or Draft.");
    let image = "";
    try {
      image = imageReference(get("Image Filename or URL"));
    } catch (e) {
      row.errors.push(e.message);
    }
    if (image.startsWith("https:"))
      row.warnings.push(
        "External image: verify ownership and availability; visitors will contact this host.",
      );
    if (image.startsWith("/products/"))
      row.warnings.push(
        "Image reference only: the image file must already exist at this path; Excel does not upload images.",
      );
    row.product = {
      id,
      title,
      category,
      description,
      image,
      price_cents,
      active: status === "Active" ? 1 : 0,
      collections: collections.sort(),
      variants,
    };
    return row;
  });
  if (result.reduce((n, r) => n + (r.product?.variants.length || 0), 0) > 100)
    throw Error("Maximum 100 variants per import.");
  return result;
}
export function exportRows(products) {
  return products.map((p) =>
    Object.fromEntries(
      HEADERS.map((h, i) => [
        h,
        [
          p.id,
          p.title,
          p.category,
          (p.collections || []).join(" | "),
          (p.price_cents / 100).toFixed(2),
          p.variants.map((v) => v.size).join(" | "),
          p.variants.map((v) => v.color).join(" | "),
          p.variants.map((v) => v.stock).join(" | "),
          p.image,
          p.description,
          p.active ? "Active" : "Draft",
        ][i],
      ]),
    ),
  );
}
