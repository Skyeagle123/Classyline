import React from "react";
const Ctx = React.createContext(null);
export function CartProvider({ children }) {
  const [cart, setCart] = React.useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem("CL_CART_V3") || "[]");
      return Array.isArray(value)
        ? value
            .filter(
              (x) =>
                typeof x.variant_id === "string" &&
                Number.isInteger(x.qty) &&
                x.qty > 0 &&
                x.qty <= 20,
            )
            .map(({ variant_id, qty }) => ({ variant_id, qty }))
        : [];
    } catch {
      return [];
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("CL_CART_V3", JSON.stringify(cart));
    } catch {}
  }, [cart]);
  const add = (item) =>
    setCart((c) => {
      const old = c.find((x) => x.variant_id === item.variant_id);
      return old
        ? c.map((x) => (x === old ? { ...x, qty: Math.min(20, x.qty + 1) } : x))
        : [...c, { ...item, qty: 1 }];
    });
  const remove = (id) => setCart((c) => c.filter((x) => x.variant_id !== id));
  const clear = () => setCart([]);
  return (
    <Ctx.Provider
      value={{
        cart,
        add,
        remove,
        clear,
        count: cart.reduce((n, x) => n + x.qty, 0),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
export function useCart() {
  return React.useContext(Ctx);
}
