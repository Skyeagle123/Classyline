// Exact stored values are identities: never split names or synthesize an ID.
export function variantOptions(variants) {
  return {
    colors: [...new Set(variants.map((v) => v.color))],
    sizes: [...new Set(variants.map((v) => v.size))],
  };
}
export function resolveVariant(variants, color, size) {
  if (!color || !size) return null;
  const matching = variants.filter((v) => v.color === color && v.size === size);
  return matching.length === 1 && matching[0].stock > 0 ? matching[0] : null;
}
const swatches = {
  black: "#241e1b",
  white: "#fff",
  ivory: "#f6f1e8",
  blue: "#52719a",
  red: "#a23c43",
  pink: "#c9a39b",
  green: "#66775b",
  beige: "#d7c2a3",
  brown: "#78583f",
  grey: "#999",
  gray: "#999",
  navy: "#27394e",
};
export const swatchColor = (color) =>
  swatches[String(color).toLowerCase()] || null;
