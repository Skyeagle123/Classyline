// Single taxonomy for navigation, the Admin editor and Excel contracts.
// Legacy category labels remain valid; classification is never written implicitly.
export const clothing = [
  ["dresses", "Dresses"],
  ["sets", "Sets"],
  ["pajamas-sleepwear", "Pajamas & Sleepwear"],
  ["cotton-underwear", "Cotton & Underwear"],
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
export const cottonUnderwear = ["Men", "Women", "Boys", "Girls"].map((name) => ({
  slug: `cotton-underwear-${name.toLowerCase()}`,
  label: `Cotton & Underwear — ${name}`,
  shortLabel: name,
}));
export const categoryGroups = [
  { slug: "clothing", label: "Clothing", categories: clothing },
  { slug: "accessories", label: "Accessories", categories: accessories },
];
export const collections = [
  { slug: "new-in", label: "New In" },
  ...clothing,
  ...cottonUnderwear,
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
  "cotton-&-underwear": "cotton-underwear",
};
export function categorySlug(value) {
  const key = slug(value);
  return Object.hasOwn(aliases, key)
    ? aliases[key]
    : collections.find((category) => slug(category.label) === key)?.slug || key;
}
export function inCollection(product, value) {
  const key = categorySlug(value);
  if (key === "shop-all") return true;
  if (key === "cotton-underwear" &&
      cottonUnderwear.some((category) => inCollection(product, category.slug)))
    return true;
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
