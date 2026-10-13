// Owner-approved merchandise display. This record is NOT persisted inventory.
export const previewProduct = {
  id: "CL-SHIRT-001",
  sku: "CL-SHIRT-001",
  title: "Blue Striped Oversized Shirt",
  category: "Tops",
  collections: ["tops", "new-in"],
  description: "Oversized shirt in light blue and white stripes. Free Size.",
  image: "/products/cl-shirt-001.jpg",
  price: 38,
  price_cents: 3800,
  sizes: ["Free Size"],
  display_only: true,
  variants: [
    {
      id: "CL-SHIRT-001-FREE-BLUE",
      size: "Free Size",
      color: "Light Blue / White Stripes",
      stock: 3,
    },
  ],
};
export const previewNotice =
  "Preview display only. Owner-reported stock: 3 pieces. Ordering is unavailable until the persistent catalog is configured; stock is not live-verified.";

export function isStorefrontPreview(hostname) {
  return (
    hostname === "phase-storefront-cod-whatsapp.classyline2.pages.dev" ||
    hostname === "phase-storefront-cod-whatsap.classyline2.pages.dev" ||
    /^[a-f0-9]{8}\.classyline2\.pages\.dev$/.test(hostname)
  );
}

export async function customerProducts(hostname, fetchCatalog) {
  if (!isStorefrontPreview(hostname)) return (await fetchCatalog()).products;
  let products;
  try {
    products = (await fetchCatalog()).products;
  } catch (error) {
    if (error.code !== "CATALOG_UNCONFIGURED") throw error;
    // The labelled display record remains viewable without a DB binding.
    return [structuredClone(previewProduct)];
  }
  // Once the persistent catalog serves, it alone decides visibility (including drafts).
  return products;
}
