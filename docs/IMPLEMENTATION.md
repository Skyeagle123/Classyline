# ClassyLine storefront development

Repository: Skyeagle123/Classyline. Development branch: phase/storefront-cod-whatsapp.
Verified starting main: 393ff88e76dcca226de7f83e148554699e85ca01.

## Audit

Baseline is a small React 18 / Vite 5 / Tailwind 3 SPA. No lockfile, backend, migrations, CI, deployment workflow, Wrangler configuration or AGENTS.md is tracked. Public CSV has four rows; product imagery and actual inventory need owner validation. Browser-local catalog overrides and password authorization are insecure. The existing WhatsApp number and Instagram handle are inconsistent with later brand context; neither is promoted into new runtime configuration.

Live URL returned HTTP 200 from Cloudflare on 2026-10-12. The Cloudflare Dashboard settings, production branch selection, build command, functions and bindings are not independently verified. Branch creation automatically showed a pending external check on the base commit; branch preview builds may run automatically. No production deployment, resource mutation or live data write is authorized or performed.

## Implementation milestones

1. Secure storage/API foundation: Pages Functions handler, SQLite-compatible D1 schema, server-side authentication, persisted products/variants/regions/orders, atomic stock reservation and cancellation, idempotent order creation, rate limits, bounded bodies, private order reads.
2. Shopping/admin experience: quiet editorial palette; mobile collection, variants, bag, customer form, region fee display, COD confirmation, itemized WhatsApp receipt; admin product JSON editor, fee editor, order statuses. Local storage contains variant IDs and quantities only, never authority or customer contact details.
3. Validation/operations: dependency updates and lockfile, SQLite-backed request tests, frontend security scan, build and branch-only CI without deployment commands; integration contract and release prerequisites.

## Configuration required before staging

- A separate non-production D1 binding named DB and migration application. No database was provisioned and no remote migration was run. Cost and account settings require explicit approval before infrastructure creation.
- Runtime ADMIN_PASSWORD_SALT and ADMIN_PASSWORD_HASH, never frontend variables or tracked files. PBKDF2-SHA256 uses 100,000 iterations to fit the Workers runtime ceiling; use a generated random admin password with at least 128 bits of entropy rather than a memorable password. Validate the hash and login in the actual Workers runtime before any release. Prefer an external identity provider/MFA for a later release.
- Runtime WHATSAPP_NUMBER in international digits; owner must confirm the business number. No default business number is assumed.
- Real products, HTTPS/local image paths, variant IDs, sizes/colors, stock and prices. No sample rows are silently imported or invented as live products. Images use managed external URLs or existing local assets; uploading files is an outstanding later admin milestone.
- Actual regional delivery rates. All initial rates are NULL, including throughout Lebanon; checkout is blocked for a region until its rate is explicitly configured. Zero is valid only when the owner intentionally configures it.
- Returns/exchange policy, delivery timing, merchant contact and customer data retention policy.
- Explicit production approval after security review, preview binding isolation verification, platform runtime tests and mobile/browser QA. No deployment automation is present in CI.

## Security and operational limits

Same-origin JSON writes + Secure/HttpOnly/SameSite=Strict session cookie. Sessions expire after one hour; logout revokes the session. Admin token hashes alone persist in DB. Failed login attempts are limited to five per 15 minutes per IP; orders to fifteen. Anonymous customers have no order-list or customer lookup endpoint. Public receipts omit address/phone/name. Customer records appear only in authenticated admin responses with no-store headers. Do not enable production read replicas without reviewing read consistency for sessions and inventory.

Rate limiting is basic IP-based protection, not full bot management; production edge abuse protection remains a staging requirement. Retention cleanup for expired sessions/rate limits and customer records requires a reviewed operational policy. Orders reserve stock immediately and cancellation restores it once; pending-order expiry and delivery failure/returns handling require owner decisions. Admin edits use existing variant IDs and optimistic expected_stock checks; omitted variants are retained; deleting a product uses active=false. The JSON editor is an initial admin milestone, not the final polished inventory workflow. Authentication passwords and contact fields are never logged.

DB transaction batch and CHECK(stock>=0) prevent overselling; triggers validate active product price/variant identity and region fee at transaction time. Server totals use integer USD cents and reject stale checkout totals. The adapter tests use real local SQLite, not a remote D1 deployment; Workers/Pages routing and production binding behavior still need staging verification.

## Future AI Commerce Agent compatibility

Stable product IDs and variant IDs, explicit USD cents, size/color/stock and active state. Store orders include stable UUID/reference, channel, status and snapshot lines. No agent repository was read or changed. No live agent/Meta/webhook/API integration is enabled. A later adapter must use its own scoped service authentication and idempotency contract; it must not reuse human admin cookies.
