import { api } from "./api.js";
import { customerProducts } from "./preview-product.js";
export async function loadProducts() {
  return customerProducts(window.location.hostname, () => api("/catalog"));
}
