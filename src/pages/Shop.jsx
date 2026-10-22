import React from "react";
import CategoryTiles from "../components/CategoryTiles.jsx";
import { loadProducts } from "../utils.js";
import { categoryGroups } from "../../shared/categories.js";
export default function Shop({ group }) {
  const [products, setProducts] = React.useState([]),
    [error, setError] = React.useState("");
  React.useEffect(() => {
    let live = true;
    loadProducts()
      .then((all) => live && setProducts(all))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  const category = categoryGroups.find((g) => g.slug === group);
  if (group && !category)
    return (
      <main className="page">
        <h1>Collection not found</h1>
        <a href="/shop">Browse Shop</a>
      </main>
    );
  return (
    <main className="page">
      <p className="eyebrow">THE CLASSYLINE EDIT</p>
      <h1 className="shop-title">{category?.label || "Shop"}</h1>
      <p>Find your next everyday piece.</p>
      <a className="navchip my-4" href="/category/shop-all">
        Shop All
      </a>
      {error && <p role="status">{error}</p>}
      <CategoryTiles products={products} group={group} />
    </main>
  );
}
