# API v1 (same-origin /api)

Money: integer USD cents. All mutations require JSON and an exact Origin match. Admin endpoints require the server session cookie. All responses use no-store. No customer credentials, admin hashes or session tokens are returned in JSON.

| Route           | Method | Contract                                                                                                                        |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| /catalog        | GET    | Active products with sizes and variant IDs/colors/stock; regions with fee_cents or null; whatsapp_enabled                       |
| /orders         | POST   | Idempotency-Key UUID header; name, phone, address, region, channel cod/whatsapp, items [{variant_id,qty}], expected_total_cents |
| /admin/login    | POST   | password; sets one-hour Secure HttpOnly cookie                                                                                  |
| /admin/session  | GET    | Authenticated session probe                                                                                                     |
| /admin/logout   | POST   | Revokes cookie/session                                                                                                          |
| /admin/orders   | GET    | Most recent 100 orders with customer delivery information, authenticated only                                                   |
| /admin/orders   | PATCH  | id, status; pending→confirmed/cancelled; confirmed→dispatched/cancelled; dispatched→delivered; terminal states stay terminal    |
| /admin/products | PUT    | id, title, category, description, image, price_cents, active, variants [{id,size,color,stock,expected_stock}]                   |
| /admin/regions  | PUT    | id, fee_cents (null disables checkout, integer configures fee)                                                                  |

Order response: reference, status, subtotal_cents, delivery_cents, total_cents, snapshot items and optional whatsapp_url. WhatsApp contains order reference, itemized size/color/quantity, delivery and total. No customer personal information is encoded in that link. Opening WhatsApp does not imply that the customer sent the message. A server-persisted order is pending even if WhatsApp is never sent.

An identical retry returns the same receipt without reserving stock again. Different input under an existing key returns 409. Refresh catalog and review after 409; never silently accept changed prices. Invalid inputs 400, unauthorized 401, origin mismatch 403, unavailable stock/fee/state 409, oversized body 413, unsupported content type 415, rate limit 429, missing runtime configuration 503.

Existing variant stock edits require expected_stock from the last catalog snapshot; concurrent reservations cause the entire edit to roll back with 409. New variants omit expected_stock.
