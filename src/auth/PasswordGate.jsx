// Legacy client-side authorization is retired. Admin uses /api/admin/session.
export default function PasswordGate() {
  throw new Error("Use the server-authenticated Admin page");
}
