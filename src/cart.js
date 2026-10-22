export const CART_KEY = "CL_CART_V4";
export const LEGACY_CART_KEY = "CL_CART_V3";
export const ATTEMPT_KEY = "CL_CHECKOUT_PENDING_V1";
export const CART_EVENT = "classyline-cart-changed";
export class CartActionError extends Error {}
export const validKey = (k) =>
  typeof k === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    k,
  );
const invalid = () => {
  throw new Error(
    "Saved bag cannot be read safely. Do not place a replacement order.",
  );
};
export function cartItems(lines) {
  const quantities = new Map();
  for (const line of lines)
    quantities.set(
      line.variant_id,
      (quantities.get(line.variant_id) || 0) + line.qty,
    );
  return [...quantities]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([variant_id, qty]) => ({ variant_id, qty }));
}
function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length > 600) invalid();
  const ids = new Set();
  for (const l of lines) {
    if (
      !l ||
      !validKey(l.id) ||
      ids.has(l.id) ||
      typeof l.variant_id !== "string" ||
      !l.variant_id.trim() ||
      l.variant_id.length > 100 ||
      /[\x00-\x1f]/.test(l.variant_id) ||
      !Number.isInteger(l.qty) ||
      l.qty < 1 ||
      l.qty > 20
    )
      invalid();
    ids.add(l.id);
  }
  const items = cartItems(lines);
  if (items.length > 30 || items.some((i) => i.qty > 20)) invalid();
}
function validate(s) {
  if (
    !s ||
    s.schema !== 1 ||
    !validKey(s.version) ||
    typeof s.reviewRequired !== "boolean"
  )
    invalid();
  validateLines(s.lines);
  if (s.attempt !== null) {
    const a = s.attempt;
    if (
      !a ||
      !validKey(a.key) ||
      !validKey(a.cartVersion) ||
      !["pending", "consumed"].includes(a.phase) ||
      typeof a.legacy !== "boolean"
    )
      invalid();
    validateLines(a.lines);
  }
  return s;
}
// One record holds the cart version, submission snapshot and consumption journal.
// React state never writes it back; all writers share the checkout Web Lock.
export function sharedCart({
  storage,
  lock,
  notify = () => {},
  newId = () => crypto.randomUUID(),
}) {
  let seen = false;
  function read() {
    const raw = storage.getItem(CART_KEY);
    if (!raw) {
      if (seen) invalid();
      return null;
    }
    let s;
    try {
      s = JSON.parse(raw);
    } catch {
      invalid();
    }
    seen = true;
    return validate(s);
  }
  function marker() {
    const key = storage.getItem(ATTEMPT_KEY);
    if (key && !validKey(key)) invalid();
    return key;
  }
  function persist(s) {
    validate(s);
    const raw = JSON.stringify(s);
    storage.setItem(CART_KEY, raw);
    if (storage.getItem(CART_KEY) !== raw) invalid();
    seen = true;
    // Notifications are advisory; storage/focus reconciliation remains authoritative.
    try {
      notify();
    } catch {
      /* a later refresh can update the UI */
    }
    return s;
  }
  async function exclusive(fn) {
    if (!lock)
      throw new Error("Secure checkout requires browser Web Locks support.");
    return lock("classyline-checkout", async () => {
      let state = read();
      const key = marker();
      if (!state) {
        const raw = storage.getItem(LEGACY_CART_KEY);
        let old = [];
        try {
          old = raw ? JSON.parse(raw) : [];
        } catch {
          invalid();
        }
        if (!Array.isArray(old)) invalid();
        state = persist({
          schema: 1,
          version: newId(),
          lines: old.map((i) => ({
            id: newId(),
            variant_id: i?.variant_id,
            qty: i?.qty,
          })),
          attempt: null,
          reviewRequired: false,
        });
        storage.removeItem(LEGACY_CART_KEY);
        if (storage.getItem(LEGACY_CART_KEY) !== null) invalid();
      }
      if (key && state.attempt && key !== state.attempt.key) invalid();
      if (key && !state.attempt) {
        state = persist({
          ...state,
          version: newId(),
          reviewRequired: true,
          attempt: {
            key,
            cartVersion: state.version,
            lines: [],
            phase: "pending",
            legacy: true,
          },
        });
      }
      const tx = {
        get state() {
          return state;
        },
        write(next) {
          state = persist({ ...next, version: newId() });
          return state;
        },
        requireVersion(version) {
          if (version !== state.version)
            throw new Error(
              "Your bag changed in another tab. Review the current bag before ordering.",
            );
        },
      };
      return fn(tx);
    });
  }
  return {
    read,
    marker,
    exclusive,
    refresh: () => exclusive((tx) => tx.state),
    add({ variant_id }) {
      return exclusive((tx) => {
        const count =
          cartItems(tx.state.lines).find((i) => i.variant_id === variant_id)
            ?.qty || 0;
        if (count >= 20)
          throw new CartActionError(
            "Maximum quantity is 20 per size and color. Remove some items to change your bag.",
          );
        if (!count && cartItems(tx.state.lines).length >= 30)
          throw new CartActionError(
            "Maximum bag size is 30 sizes and colors. Remove an item before adding another.",
          );
        return tx.write({
          ...tx.state,
          lines: [...tx.state.lines, { id: newId(), variant_id, qty: 1 }],
        });
      });
    },
    remove(variant_id) {
      return exclusive((tx) =>
        tx.write({
          ...tx.state,
          lines: tx.state.lines.filter((i) => i.variant_id !== variant_id),
        }),
      );
    },
    review(version) {
      return exclusive((tx) => {
        tx.requireVersion(version);
        if (tx.state.attempt)
          throw new Error("Resolve the earlier checkout first.");
        return tx.write({ ...tx.state, reviewRequired: false });
      });
    },
  };
}
