import { ATTEMPT_KEY, cartItems, sharedCart, validKey } from "./cart.js";
const PAYLOAD = "CL_CHECKOUT_PAYLOAD_V1";
export function checkout({
  storage,
  tabStorage,
  request,
  lock,
  cart = sharedCart({ storage, lock }),
  newKey = () => crypto.randomUUID(),
}) {
  let resolvedKey = null;
  const pending = () => cart.read()?.attempt?.key || cart.marker();
  async function call(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await request(path, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  function removeMarker(key) {
    const marker = cart.marker();
    if (marker && marker !== key)
      throw new Error("Checkout changed; recover it first.");
    storage.removeItem(ATTEMPT_KEY);
    if (cart.marker())
      throw new Error("Saved checkout could not be cleared safely.");
  }
  function consume(tx) {
    const s = tx.state,
      a = s.attempt;
    if (a.phase === "consumed") return;
    const submitted = new Set(a.lines.map((i) => i.id));
    // Additions have distinct lot IDs, including new quantities of the same variant.
    tx.write({
      ...s,
      lines: s.lines.filter((i) => !submitted.has(i.id)),
      attempt: { ...a, phase: "consumed" },
    });
  }
  return {
    cart,
    pending,
    snapshot() {
      const key = pending(),
        raw = tabStorage.getItem(PAYLOAD);
      if (!key || !raw) return null;
      try {
        const saved = JSON.parse(raw);
        return saved.key === key ? JSON.parse(saved.body) : null;
      } catch {
        return null;
      }
    },
    submit(payload, version) {
      return cart.exclusive(async (tx) => {
        if (tx.state.attempt)
          throw new Error(
            "Recover the previous checkout before submitting another order.",
          );
        tx.requireVersion(version);
        if (tx.state.reviewRequired)
          throw new Error(
            "Review this recovered bag and confirm that it is a new order.",
          );
        const items = cartItems(tx.state.lines);
        if (
          !items.length ||
          JSON.stringify(payload.items) !== JSON.stringify(items)
        )
          throw new Error("Review the current bag before ordering.");
        const key = newKey(),
          body = JSON.stringify(payload);
        if (!validKey(key))
          throw new Error("Unable to create a secure checkout key.");
        const saved = JSON.stringify({ key, body, cartVersion: version });
        tabStorage.setItem(PAYLOAD, saved);
        if (tabStorage.getItem(PAYLOAD) !== saved)
          throw new Error("Checkout could not be saved safely.");
        tx.write({
          ...tx.state,
          attempt: {
            key,
            cartVersion: version,
            lines: tx.state.lines,
            phase: "pending",
            legacy: false,
          },
        });
        // A partial marker write leaves the authoritative journal pending and blocks replacement.
        storage.setItem(ATTEMPT_KEY, key);
        if (cart.marker() !== key)
          throw new Error("Checkout could not be saved safely.");
        const result = await call("/orders", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body,
        });
        if (!result?.reference)
          throw new Error("Checkout is still unresolved.");
        consume(tx);
        resolvedKey = key;
        tabStorage.removeItem(PAYLOAD);
        return result;
      });
    },
    recover() {
      return cart.exclusive(async (tx) => {
        const a = tx.state.attempt;
        if (!a) {
          resolvedKey = null;
          tabStorage.removeItem(PAYLOAD);
          return null;
        }
        const result = await call("/orders/recover", {
          method: "POST",
          body: JSON.stringify({ key: a.key }),
        });
        if (!result.receipt?.reference && result.not_created !== true)
          throw new Error("Checkout is still unresolved.");
        if (result.receipt?.reference) {
          consume(tx);
          resolvedKey = a.key;
          tabStorage.removeItem(PAYLOAD);
          return result.receipt;
        }
        if (a.phase === "consumed")
          throw new Error(
            "Saved order could not be verified. Do not place a replacement.",
          );
        tabStorage.removeItem(PAYLOAD);
        removeMarker(a.key);
        tx.write({ ...tx.state, attempt: null });
        resolvedKey = null;
        return null;
      });
    },
    acknowledge() {
      return cart.exclusive((tx) => {
        const a = tx.state.attempt;
        if (!a || a.key !== resolvedKey || a.phase !== "consumed")
          throw new Error("Checkout changed in another tab; recover it first.");
        tabStorage.removeItem(PAYLOAD);
        removeMarker(a.key);
        // Consumption already committed with the receipt. Acknowledgement never clears items.
        tx.write({ ...tx.state, attempt: null });
        resolvedKey = null;
      });
    },
  };
}
