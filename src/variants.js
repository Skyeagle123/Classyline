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
  "light blue": "#a8c7df",
  cream: "#fff2d5",
  teal: "#287e80",
  "olive green": "#6b7040",
  "light grey": "#d3d3d3",
  "light gray": "#d3d3d3",
  "navy blue": "#27394e",
  magenta: "#b52682",
  burgundy: "#7c263b",
  bordeaux: "#7c263b",
  "charcoal grey": "#45474b",
  "charcoal gray": "#45474b",
  "chocolate brown": "#664133",
  "cream beige": "#e7d8ba",
  "emerald green": "#227354",
  "rose pink": "#d28fa4",
  "washed blue": "#809bb4",
};
export function swatchColor(color) {
  const key = String(color).toLowerCase();
  return Object.hasOwn(swatches, key) ? swatches[key] : null;
}
