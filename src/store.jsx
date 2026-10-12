import React from "react";
import {
  ATTEMPT_KEY,
  CART_EVENT,
  CART_KEY,
  LEGACY_CART_KEY,
  cartItems,
  sharedCart,
} from "./cart.js";
const Ctx = React.createContext(null);
export function CartProvider({ children }) {
  const coordinator = React.useMemo(
    () =>
      sharedCart({
        storage: {
          getItem: (k) => localStorage.getItem(k),
          setItem: (k, v) => localStorage.setItem(k, v),
          removeItem: (k) => localStorage.removeItem(k),
        },
        lock: navigator.locks
          ? (name, fn) => navigator.locks.request(name, fn)
          : null,
        notify: () => window.dispatchEvent(new Event(CART_EVENT)),
      }),
    [],
  );
  const [state, setState] = React.useState(null),
    [error, setError] = React.useState("");
  React.useEffect(() => {
    let live = true;
    const sync = () =>
      coordinator
        .refresh()
        .then((s) => {
          if (live) {
            setState(s);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    const storageChanged = (e) => {
      if (
        e.key === null ||
        [CART_KEY, ATTEMPT_KEY, LEGACY_CART_KEY].includes(e.key)
      )
        sync();
    };
    window.addEventListener("storage", storageChanged);
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("focus", sync);
    sync();
    return () => {
      live = false;
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, [coordinator]);
  async function mutate(fn) {
    try {
      const s = await fn();
      setState(s);
      setError("");
      return s;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }
  const cart = state ? cartItems(state.lines) : [];
  return (
    <Ctx.Provider
      value={{
        cart,
        coordinator,
        cartVersion: state?.version,
        reviewRequired: state?.reviewRequired,
        ready: !!state && !error,
        error,
        add: (item) => mutate(() => coordinator.add(item)),
        remove: (id) => mutate(() => coordinator.remove(id)),
        review: (version) => mutate(() => coordinator.review(version)),
        count: cart.reduce((n, i) => n + i.qty, 0),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
export function useCart() {
  return React.useContext(Ctx);
}
