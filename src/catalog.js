export const collections = [
  { slug: "new-in", label: "New In" },
  { slug: "dresses", label: "Dresses" },
  { slug: "tops", label: "Tops" },
  { slug: "sets", label: "Sets" },
  { slug: "jackets", label: "Jackets" },
  { slug: "sale", label: "Sale" },
];
// Collections are explicit owner metadata; no inferred arrival or discount claims.
export function inCollection(product, slug) {
  if (
    product.collections?.some(
      (c) =>
        String(c).trim().toLowerCase().replaceAll(" ", "-") ===
        (slug === "new" ? "new-in" : slug),
    )
  )
    return true;
  const value = String(product.category || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-");
  return value === (slug === "new" ? "new-in" : slug);
}
export function collectionLabel(slug) {
  return (
    collections.find((c) => c.slug === slug)?.label ||
    (slug === "new" ? "New In" : slug)
  );
}
export function newProduct() {
  return {
    id: "",
    title: "",
    category: "Tops",
    description: "",
    image: "",
    price_cents: 0,
    active: true,
    variants: [],
  };
}
export function editProduct(p) {
  return {
    ...p,
    active: Boolean(p.active),
    variants: p.variants.map((v) => ({ ...v, expected_stock: v.stock })),
  };
}
export function productPayload(p) {
  if (!p.id.trim() || !p.title.trim() || !p.variants.length)
    throw new Error(
      "Add a product ID, title and at least one size/color variant.",
    );
  if (!Number.isSafeInteger(p.price_cents) || p.price_cents < 0)
    throw new Error("Enter a valid price in USD cents.");
  if (new Set(p.variants.map((v) => v.id)).size !== p.variants.length)
    throw new Error("Variant IDs must be unique.");
  for (const v of p.variants) {
    if (
      !v.id.trim() ||
      !v.size.trim() ||
      !v.color.trim() ||
      !Number.isSafeInteger(v.stock) ||
      v.stock < 0
    )
      throw new Error(
        "Each variant needs an ID, size, color and non-negative whole stock count.",
      );
  }
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    description: p.description,
    image: p.image,
    price_cents: p.price_cents,
    active: p.active,
    variants: p.variants.map(({ id, size, color, stock, expected_stock }) => ({
      id,
      size,
      color,
      stock,
      expected_stock,
    })),
  };
}
