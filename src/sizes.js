// Comparison keys affect presentation only; callers retain exact stored labels.
const standardSizes = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
];
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function sizeKey(value) {
  const label = value.trim().toUpperCase().replace(/\s+/g, " ");
  const standard = standardSizes.indexOf(label);
  if (standard !== -1) return { group: 0, rank: standard, label };
  const alias = /^(X{2,6})L$/.exec(label);
  if (alias) return { group: 0, rank: 4 + alias[1].length, label };
  const numeric = /^(\d+(?:\.\d+)?)Y?$/.exec(label);
  if (numeric) return { group: 1, rank: 0, label, numeric: numeric[1] };
  if (label === "FREE SIZE") return { group: 3, rank: 0, label };
  return { group: 2, rank: 0, label };
}

// Compare non-negative decimal labels exactly, without floating-point rounding.
function compareNumericLabels(a, b) {
  const [aWhole, aFraction = ""] = a.split(".");
  const [bWhole, bFraction = ""] = b.split(".");
  const aw = aWhole.replace(/^0+(?=\d)/, "");
  const bw = bWhole.replace(/^0+(?=\d)/, "");
  const whole = aw.length - bw.length || compareText(aw, bw);
  if (whole) return whole;
  const width = Math.max(aFraction.length, bFraction.length);
  return compareText(
    aFraction.padEnd(width, "0"),
    bFraction.padEnd(width, "0"),
  );
}

export function compareSizes(a, b) {
  const ak = sizeKey(a),
    bk = sizeKey(b);
  return (
    ak.group - bk.group ||
    ak.rank - bk.rank ||
    (ak.group === 1 ? compareNumericLabels(ak.numeric, bk.numeric) : 0) ||
    compareText(ak.label, bk.label) ||
    compareText(a, b)
  );
}

// Never sort an input array in place or merge differently spelled size options.
export function sortSizes(sizes) {
  return [...sizes].sort(compareSizes);
}
