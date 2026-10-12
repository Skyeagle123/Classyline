const KEY = "CL_CHECKOUT_PENDING_V1";
const PAYLOAD = "CL_CHECKOUT_PAYLOAD_V1";
const validKey = (k) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    k,
  );
// Cross-tab durable key contains no customer data. Exact submission data lives only in this tab's session storage.
export function checkout({
  storage,
  tabStorage,
  request,
  lock,
  newKey = () => crypto.randomUUID(),
}) {
  let resolvedKey = null;
  function pending() {
    const key = storage.getItem(KEY);
    if (key && !validKey(key))
      throw new Error(
        "Saved checkout cannot be read. Do not submit a replacement order.",
      );
    return key;
  }
  async function exclusive(fn) {
    if (!lock)
      throw new Error("Secure checkout requires browser Web Locks support.");
    return lock("classyline-checkout", fn);
  }
  async function call(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await request(path, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  function clear(key) {
    if (pending() !== key)
      throw new Error("Checkout changed in another tab; recover it first.");
    storage.removeItem(KEY);
    tabStorage.removeItem(PAYLOAD);
  }
  return {
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
      } // A damaged tab snapshot must not prevent server recovery using the durable key.
    },
    submit(payload) {
      return exclusive(async () => {
        if (pending())
          throw new Error(
            "Recover the previous checkout before submitting another order.",
          );
        const key = newKey(),
          body = JSON.stringify(payload);
        tabStorage.setItem(PAYLOAD, JSON.stringify({ key, body }));
        storage.setItem(KEY, key);
        if (
          pending() !== key ||
          tabStorage.getItem(PAYLOAD) !== JSON.stringify({ key, body })
        )
          throw new Error("Checkout could not be saved safely.");
        // Any network/server error leaves the attempt intact. Recovery, never a new key, resolves uncertainty.
        const result = await call("/orders", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body,
        });
        resolvedKey = key;
        tabStorage.removeItem(PAYLOAD);
        return result;
      });
    },
    recover() {
      return exclusive(async () => {
        const key = pending();
        if (!key) {
          tabStorage.removeItem(PAYLOAD);
          return null;
        }
        const result = await call("/orders/recover", {
          method: "POST",
          body: JSON.stringify({ key }),
        });
        if (!result.receipt && result.not_created !== true)
          throw new Error("Checkout is still unresolved.");
        if (result.receipt) {
          resolvedKey = key;
          tabStorage.removeItem(PAYLOAD);
        } else clear(key);
        return result.receipt || null;
      });
    },
    acknowledge(beforeClear = () => {}) {
      return exclusive(async () => {
        if (!resolvedKey)
          throw new Error("Recover the saved order before continuing.");
        if (pending() !== resolvedKey)
          throw new Error("Checkout changed in another tab; recover it first.");
        beforeClear();
        clear(resolvedKey);
        resolvedKey = null;
      });
    },
  };
}
