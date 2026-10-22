// Single taxonomy for navigation, the Admin editor and Excel contracts.
// Legacy category labels remain valid; classification is never written implicitly.
export const clothing = [
  ["dresses", "Dresses"],
  ["sets", "Sets"],
  ["pajamas-sleepwear", "Pajamas & Sleepwear"],
  ["tops", "Tops"],
  ["shirts", "Shirts"],
  ["t-shirts", "T-Shirts"],
  ["pants", "Pants"],
  ["jeans", "Jeans"],
  ["shorts", "Shorts"],
  ["skirts", "Skirts"],
  ["hoodies", "Hoodies"],
  ["sweatshirts", "Sweatshirts"],
  ["knitwear", "Knitwear"],
  ["cardigans", "Cardigans"],
  ["jackets", "Jackets"],
  ["coats", "Coats"],
].map(([slug, label]) => ({ slug, label }));
export const accessories = [
  ["scarves", "Scarves"],
  ["socks", "Socks"],
  ["gloves", "Gloves"],
  ["hats", "Hats"],
  ["hair-accessories", "Hair Accessories"],
].map(([slug, label]) => ({ slug, label }));
export const categoryGroups = [
  { slug: "clothing", label: "Clothing", categories: clothing },
  { slug: "accessories", label: "Accessories", categories: accessories },
];
export const collections = [
  { slug: "new-in", label: "New In" },
  ...clothing,
  ...accessories,
  { slug: "sale", label: "Sale" },
];
export const CATEGORIES = [...collections.map((c) => c.label), "Pajamas"];
const slug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-");
const aliases = {
  new: "new-in",
  pajamas: "pajamas-sleepwear",
  "pajamas-&-sleepwear": "pajamas-sleepwear",
};
export function categorySlug(value) {
  const key = slug(value);
  return Object.hasOwn(aliases, key) ? aliases[key] : key;
}
export function inCollection(product, value) {
  const key = categorySlug(value);
  if (key === "shop-all") return true;
  const group = categoryGroups.find((g) => g.slug === key);
  if (group) return group.categories.some((c) => inCollection(product, c.slug));
  return (
    categorySlug(product.category) === key ||
    product.collections?.some((c) => categorySlug(c) === key) === true
  );
}
export function collectionLabel(value) {
  const key = categorySlug(value);
  return key === "shop-all"
    ? "Shop All"
    : [...collections, ...categoryGroups].find((c) => c.slug === key)?.label ||
        value;
}
export const pieceCount = (n) => `${n} ${n === 1 ? "piece" : "pieces"}`;
