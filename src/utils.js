import { api } from "./api.js";
export async function loadProducts() {
  return (await api("/catalog")).products;
}
