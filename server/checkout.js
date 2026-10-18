// Syntax validation, not proof that a telephone number is allocated or reachable.
export function normalizePhone(value) {
  if (typeof value === "string") value = value.replace(/^ +| +$/g, "");
  if (
    typeof value !== "string" ||
    value.length > 30 ||
    !/^\+?[0-9 ()-]+$/.test(value)
  )
    return null;
  let digits = value.replace(/[ ()-]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) {
    if (!/^(?:0[1-9]\d{6}|[1-9]\d{6,7})$/.test(digits)) return null;
    digits = "+961" + digits.replace(/^0/, "");
  }
  if (digits.startsWith("+961")) {
    const local = digits.slice(4).replace(/^0/, "");
    if (!/^[1-9]\d{6,7}$/.test(local)) return null;
    digits = "+961" + local;
  }
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
export async function expirePendingOrders(db, now) {
  // A conditional single statement and the existing restore_stock trigger form one transaction.
  await db
    .prepare(
      "UPDATE orders SET status='cancelled',cancellation_reason='expired' WHERE status='pending' AND reservation_expires_at<=?",
    )
    .bind(now)
    .run();
}
