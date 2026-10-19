# Controlled Production release preparation

Prepared 2026-10-19. This is a runbook, not authorization to merge, deploy, change configuration, enable checkout, or clean up data. The release includes the storefront API, Admin, checkout, inventory/reservations, Excel and image storage; it is not an image-only release.

## Identity and retained evidence

- Repository: `Skyeagle123/Classyline`; Pages project: `classyline2`.
- Cloudflare account: `4bfa1a9c849c3da50520f7a4bcccccab`.
- Accepted Preview source: `f7b31c942cb21c012b2ffa67c85a4ac277341a88`.
- Accepted source tree: `e08d2c3252907b72e6406c370bbdb300751bb421`.
- Accepted Preview deployment: `331b7b24-d54c-4df6-aa60-9ffddd30ae0b`, `https://331b7b24.classyline2.pages.dev`.
- Current Production: branch `main`, source `393ff88e76dcca226de7f83e148554699e85ca01`, deployment `5824179f-af77-4a18-9a23-ab22019e8ccc`.
- Narrow correction branch: `fix/image-processing-limit-messages`; PR base: `fix/mobile-collection-layout`, not `main`. The final release SHA must be the reviewed correction commit (or a separately reviewed release successor), with successful CI at that exact identity. The old Preview SHA is not evidence that the correction has been deployed.
- Reuse accepted CI, 134 repository tests, 20 workerd probes, protected Preview, uploads, Draft persistence, Excel preview, checkout replay, last-unit concurrency and normal 30-minute expiry. Do not create more synthetic records to repeat them.

## Resource evidence and operational controls

One bounded historical GraphQL request in this preparation phase covered 2026-10-19 16:25–17:25 UTC (19:25–20:25 Beirut), script `pages-worker--9110480-preview`, requesting CPU P50/P99, memory P50/P99 and invocation/error counts. It returned an empty dataset. Earlier scoped logs also yielded no matching events. This is missing telemetry, not a measurement of zero CPU, memory or errors. No new upload or load test was run.

Observed runtime: Standard usage model, compatibility date `2025-11-13`, empty compatibility flags. No custom `limits.cpu_ms` was returned by the project or script settings. The documented Paid default is 30,000 ms CPU, but an explicit numeric effective limit was not returned by the API. Retain the Owner-confirmed Paid-plan evidence; billing read access is unavailable through the current OAuth scope. Do not treat the browser's 30-second upload timeout as a server CPU deadline.

Cloudflare's memory limit is 128 MB per isolate, shared by concurrent invocations. Available memory percentiles are sampled isolate values, not guaranteed per-upload peak measurements. Source limits and successful near-limit uploads do not establish peak usage or worst-case headroom.

Required initial operating envelope, subject to Owner acceptance before activation:

1. Owner-only Admin access; one active upload across all devices/tabs. Wait for confirmation before choosing another image. Existing limits remain 10 uploads/session and 20 globally per 15 minutes; these do not serialize uploads.
2. Prefer locally resized JPEG/PNG within the documented bounds. Do not raise JPEG memory, pixel, file-size or CPU limits as a workaround for rejection.
3. On timeout, cancellation or uncertain response, stop; inspect the retained image reference/object and audit evidence before an intentional retry. Do not automatically retry or delete an apparent orphan.
4. Use read-only Pages/Worker metrics/logs for the exact deployment or script: request/error counts, `exceededCpu`, `exceededMemory`, exceptions, upload 5xx/timeouts, CPU quantiles and memory trends where available. Record window, sampling and attribution limits. Do not enable logging, add instrumentation or buy resources under this package.
5. Any resource-limit error or repeated upload failure stops further uploads pending review. An authentication/privacy failure or inventory-integrity failure stops the release and triggers the pre-authorized containment/rollback procedure.
6. If historic telemetry remains unavailable, the Owner must explicitly accept the unmeasured resource margin and this sequential operating envelope, or separately authorize a narrowly scoped instrumented Preview validation. No additional upload is implied by this runbook. Reassess before multiple administrators or concurrent uploads are allowed.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [memory metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/), [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

## Mandatory release gates

| Gate                        | Required state before release                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source/build provenance     | Exact reviewed commit, clean checkout, lockfile unchanged, Node 24, pinned Wrangler 4.150.0, successful correction CI; record source tree, build commands, artifact SHA-256 manifest and deployment ID. No dirty-source label or metadata-only identity claim.                                                                                                       |
| Production identity         | Baseline still matches the deployment/source above; stop on drift.                                                                                                                                                                                                                                                                                                   |
| Production D1               | `DB` → `classyline-storefront-production-d1`, UUID `10c800b1-ddf7-427b-8354-9cf8529782b6`. Never staging D1.                                                                                                                                                                                                                                                         |
| Schema                      | Migrations 0001, 0002, 0003 already applied, in order; accepted quick_check/FK evidence and all six triggers retained. No new migration in this correction and no blind replay of existing SQL.                                                                                                                                                                      |
| Recovery                    | Protected initialized export `/home/samer/classyline-ops/production-initialized.sql` and Time Travel evidence retained. Before the authorized release, take a fresh export/bookmark if the database has changed; retain access permissions and record the restore point. Do not restore over live customer writes.                                                   |
| Production R2               | `PRODUCT_IMAGES` → `classyline-storefront-production-images`; public r2.dev disabled, no public custom domain. Never copy Preview objects or credentials.                                                                                                                                                                                                            |
| Authentication              | Encrypted `ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH` present; actual Production login still needs separate authorization. Source PBKDF2-SHA256: 100,000 iterations, 256 derived bits. Secret equivalence is not established by presence; never retrieve secret values.                                                                                          |
| Access                      | Production owner-only Allow/24h on `/admin`, `/admin/*`, `/api/admin`, `/api/admin/*`; Preview wildcard app unchanged. Inventory all custom/alternate hostnames and protect Admin on each; no Bypass/public override. Public storefront/catalog/active images must remain public.                                                                                    |
| Runtime                     | Date `2025-11-13`, no `no_strict_compression_checks`, Standard/Paid evidence, correct environment bindings, no unexpected root Wrangler config or overrides.                                                                                                                                                                                                         |
| Checkout hold               | All nine Production region fees remain NULL and the catalog stays empty (or separately approved Draft-only). NULL fees reject new order creation; zero is an intentional configured fee, not a disabled value. There is no independent checkout-enable flag in this source. Requests can still write rate-limit/expiry state; this is not a zero-write API shutdown. |
| Initial catalog             | Empty by default. No CSV fallback/import, Preview fixtures, synthetic product or inventory copied to Production. Any initial products, stock, price, images, active status and regional fees require explicit approval.                                                                                                                                              |
| Customer activation         | Separate authorization for regional fees and Active/in-stock catalog. Releasing code with NULL fees is not authorization to open sales. Confirm contact, delivery/returns terms, retention and optional `WHATSAPP_NUMBER` first.                                                                                                                                     |
| Deployment path             | Git integration warning remains a reliability issue. Use one separately authorized complete Wrangler upload if selected; do not rely on Git retries or merge-triggered deployment.                                                                                                                                                                                   |
| Resource/privacy conditions | Owner accepts the operating envelope and unresolved historic Access observation, or obtains additional evidence first. Current Access configuration and app privacy tests support conditional acceptance; the historic JSON response remains unexplained.                                                                                                            |

Useful read-only SQL at the release gate (not migration commands):

```sql
SELECT name, applied_at FROM d1_migrations ORDER BY id;
SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name;
SELECT (SELECT COUNT(*) FROM products) AS products,
       (SELECT COUNT(*) FROM variants) AS variants,
       (SELECT COUNT(*) FROM orders) AS orders;
SELECT id, fee_cents FROM regions ORDER BY id;
SELECT COUNT(*) AS synthetic_products FROM products WHERE id LIKE 'SYNTHETIC-PREVIEW%';
```

The six trigger names are `reserve_stock`, `restore_stock`, `validate_delivery`, `validate_item`, `reject_retired_order`, `reject_expired_confirmation`. Migration 0002 adds columns/indexes, normalizes phone data and initializes pending deadlines; it is not replay-safe. Code rollback does not undo migrations 0001–0003. The initialized Production database already passed their accepted integrity checks.

## Exact proposed release procedure — do not execute yet

1. Obtain approval naming the final reviewed release SHA, full storefront scope, one Production deployment, read-only smoke checks and the rollback/containment envelope. Obtain explicit acceptance of the resource/privacy limitations. Merge, catalog import, fee changes, Production application login or test writes are separate actions and must be named if desired.
2. Recheck the gates above using existing authenticated plugins and scoped read-only SQL. Record current Production deployment, D1/R2 identities and existing recovery evidence. Stop if checkout is already open or data/configuration differ from the approved state.
3. Keep this correction PR based on the accepted feature branch. Existing PRs into `main` include the broader release. Automatic Production deployment is currently enabled: merging into `main` is itself a possible activation. The shortest selected path is direct Wrangler from the approved commit without a merge. Do not both merge and manually deploy. Later Git reconciliation needs separate approval and a plan preventing duplicate activation.
4. In the already authenticated, approved execution environment, use a clean source worktree with no local Wrangler configuration (the operations config is outside this checkout). Substitute the exact approved 40-character SHA; do not substitute a moving branch. These commands are preparation for a future authorized release, not commands run in this package:

```bash
git fetch origin fix/image-processing-limit-messages
RELEASE_SHA='<exact-owner-approved-40-character-correction-sha>'
git worktree add --detach ../classyline-production-release "$RELEASE_SHA"
cd ../classyline-production-release
test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
test -z "$(git status --porcelain=v1)"
test -z "$(find . -maxdepth 1 -type f -name 'wrangler.*' -print)"
npm ci --ignore-scripts
npm run build
WRANGLER_SEND_METRICS=false npm run build:functions
test -f 'functions/api/[[path]].js'
test -f dist/_routes.json
test -f /tmp/classyline-functions-build/index.js
git rev-parse HEAD HEAD^{tree}
find dist -type f -print0 | sort -z | xargs -0 sha256sum > ../classyline-production-dist.sha256
sha256sum /tmp/classyline-functions-build/index.js > ../classyline-production-functions.sha256
test -z "$(git status --porcelain=v1)"
# Only after the separate Production authorization and all gates pass:
WRANGLER_SEND_METRICS=false npx --no-install wrangler pages deploy dist --project-name classyline2 --branch main --commit-hash "$RELEASE_SHA" --commit-dirty=false
```

Use the pinned local Wrangler. `pages deploy` compiles the source `functions/` and uploads the complete Pages release; the separate Functions build is a validation artifact, not a manual `_worker.js` substitute. Retain deployment output and build logs. The commit-hash flag is metadata, so prove the source checkout/tree and artifacts as well. Do not run a second deployment if the response is uncertain: retrieve the first deployment by ID/history.

5. Read back deployment SUCCESS, Production environment, exact commit, `uses_functions`, attached Production D1/R2, date/flags, URL and canonical Production identity. Stop before any product/fee activation if a field differs. Preserve the old deployment.
6. Bounded credential-free smoke checks after that authorization: public `/`, collection and product SPA navigation/refresh; Access redirects for the four Admin path patterns on each approved hostname; protected deployment aliases. Avoid application catalog/order GETs that can expire reservations unless explicitly authorized. No synthetic checkout/upload is implied. Production Admin sign-in and an initial real catalog need their own named authorization.
7. Observe resource/errors and retain read-only evidence during the initial operating window. Keep all fees NULL and the catalog empty until separately authorized customer activation.

## Rollback and recovery

- Before deployment, verify baseline `5824179f-af77-4a18-9a23-ab22019e8ccc` still exists and is eligible for rollback. Do not invoke rollback as a test.
- Proposed Pages rollback operation, ONLY under separately approved rollback authority:
  `POST /accounts/4bfa1a9c849c3da50520f7a4bcccccab/pages/projects/classyline2/deployments/5824179f-af77-4a18-9a23-ab22019e8ccc/rollback`.
- Rollback code/assets, not D1/R2. Never execute down-migrations, delete objects or restore the initialized SQL export over orders created after activation. Re-read bindings and Access after rollback; preserve all records and current recovery points.
- The old Production baseline is a legacy storefront, not a schema-compatible order-management application. It does not provide the new reservation-expiry/recovery/admin lifecycle. Returning to it is emergency frontend containment, not proof the live business can continue normally. Outstanding reservations/orders must be reconciled using approved tooling or a schema-compatible corrected release before normal sales resume.
- During the initial code-only release with an empty catalog/NULL fees, frontend rollback has a simpler data impact. After customer activation, stock/order preservation and draining/reconciliation are mandatory. If new admissions must be blocked, use a separately authorized edge/path containment action; do not assume removing a UI button blocks the API. This package changes neither Access nor edge settings.
- Triggers: auth/privacy bypass, oversell/stock corruption, repeated resource-limit/5xx failures, wrong environment bindings or deployment identity. Wrong bindings/identity stop activation immediately. Recovery of D1 to a historical point is a data-sensitive, separately approved incident action with a write freeze and export/reconciliation of intervening orders.

## Deferred Preview cleanup — no deletions authorized now

| Target                                                                                   | Retained state / later action                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SYNTHETIC-PREVIEW-72FE46BC` / variant `SYNTHETIC-PREVIEW-72FE46BC-V1`                   | Draft, stock 0; keep until audit closure. No hard delete needed.                                                                                                            |
| `SYNTHETIC-PREVIEW-331B7B24-CHECKOUT` / variant `SYNTHETIC-PREVIEW-331B7B24-CHECKOUT-V1` | Active only inside protected Preview, stock 1; later authorize Draft transition. Variant is referenced by retained order items: do not hard-delete it.                      |
| Order `c7b653aa-cd3a-40d9-8aa7-d1fdfb79d9f1` / `CL-5F3B1FC9CC27440B`                     | Cancelled by natural expiry; retain order/items/audit.                                                                                                                      |
| Order `6dd3e980-0ce1-4de5-b748-a4dffbe0d377` / `CL-2846B7136ECE480D`                     | Cancelled by authorized synthetic cleanup; retain order/items/audit.                                                                                                        |
| `products/images/v1/e5276360-9a79-481f-b09a-c794ff71f819.png`                            | 104 bytes, referenced by original Draft; retain until reference deliberately removed.                                                                                       |
| `products/images/v1/3c42d84b-eec5-41cb-81b3-49e6e16e5d1d.png`                            | 2,079,354 bytes, referenced by checkout fixture; retain until reference deliberately removed.                                                                               |
| `products/images/v1/810f10ce-69f1-406b-822a-1e4c713b793d.jpg`                            | 2,089,124 bytes, unreferenced private upload; eligible for a later specifically authorized deletion after rechecking all product references and closing evidence retention. |

All objects above belong only to `classyline-storefront-preview-images`; records belong only to staging D1 `ce1d28f3-f20b-485d-9799-619a7fc52ade`. The other existing object `products/images/v1/d2ef0b9e-127b-47cf-bdb6-f9166b284601.png` belongs to a separate Excel fixture and is outside this cleanup proposal. Do not use prefix-wide deletion or an age-only lifecycle rule. Session/rate-limit/audit/retired-key records must follow a separately reviewed retention policy, not broad test cleanup.

No fixtures may be copied to Production. Keep this manifest and accepted evidence after any later approved cleanup.
