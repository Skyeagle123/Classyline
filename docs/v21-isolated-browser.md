# ClassyLine V2.1 isolated browser qualification

Preparation only. This package does not authorize publication, installation,
workflow dispatch or any Preview/Production deployment. Keep the existing
`CLASSYLINE_RELEASE_ARMED=false`; this workflow neither reads nor changes it.

## Exact application and separate harness

The application is checked out at `04feef6a48968e736d99a072efbf98750feb7bdf`,
tree `8fcdaf50e3e2a900c900d37d0f9ad3ecaa2a6ed7`. The separately checked-out
harness comes from the candidate head; its commit/tree are recorded independently.
The accepted application's `package-lock.json` is unchanged. Playwright 1.62.1
and YAML 2.8.2 use a separate tooling lockfile. Node is pinned to 24.19.0.

After independent review and separate publication authorization, the exact branch
`phase/storefront-v21-browser-qualification` can trigger credential-free push/PR
CI automatically. There is no manual dispatch, protected Production environment,
secret reference, deploy job, API token, DB/R2 binding or production arm. Existing
deployment workflows and histories remain byte-for-byte unchanged. Publication
must separately verify that Cloudflare automatic Preview policy excludes this
branch and automatic Production builds remain disabled; this task changes neither.

## Isolation boundary

The actual accepted Vite build is served by a static-only HTTP server bound to
127.0.0.1 on an ephemeral port. It has no Functions or database adapter. The server
rejects all API and mutating requests and verifies static bytes against an SHA-256
inventory. It never proxies a request. No live catalog snapshot or customer data
is used. Synthetic products, stock, regions, images and WhatsApp-option flags
follow the existing catalog response contract.

Each viewport gets a new browser context with empty storage, blocked service
workers and downloads disabled. Context HTTP and WebSocket routes are installed
before the first page is created. Only exact loopback GET /api/catalog and two
synthetic images are fulfilled. Ordinary static reads continue only to the
loopback static server. All external requests, unknown API paths, mutation
methods and WebSockets are blocked. An unexpected request fails qualification.
No browser APIRequestContext, upstream HTTP client or live application backend
is used. HTTP probes deliberately attempt forbidden requests, but interception
must abort them before transport; logs distinguish these probes from UI traffic.
Browser background network features are disabled where supported. The evidence
claim is zero forwarded external application requests, not an OS-level network
namespace or a claim about package-install traffic.

## Coverage and evidence

Seven browser cases run at each exact CSS viewport width: 360 (touch/mobile),
768 and 1363, height 900: 21 cases total. They cover navigation/tiles/routes/
refresh/images, keyboard focus/Escape, 21 recognized swatches plus the literal
unknown label `Eashed Blue`, borders, independent dimensions, out-of-stock
combinations, Free Size/No Size, exact cart variant ID, Add to Bag, COD/WhatsApp
visibility and absence behavior, approved contact links, and fail-closed API
probes. No form is submitted and no WhatsApp link is opened.

Artifacts retain browser engine/version, separate source/harness identities,
build/lockfile hashes, counts/failures, screenshots per viewport (home, menu,
Shop, product, bag, or failure), request decisions, local server requests and
the number of forwarded external application requests. Artifacts contain fixed
synthetic data only. A missing browser, failed case, timeout or installation error
fails the job and cannot trigger a deployment or retry. Evidence from completed
cases is retained; a failure before browser execution is not a visual PASS.

Run locally where official Chromium is already available:

```bash
npm ci --prefix ops/v21-browser --ignore-scripts --no-audit --no-fund
node --test ops/v21-browser/offline.test.mjs
# APPLICATION is a clean Git checkout of the fixed application SHA, with locked
# dependencies installed and npm run build completed. OUTPUT is outside it.
node ops/v21-browser/qualify.mjs "$APPLICATION" "$OUTPUT"
```

The offline tests exercise actual route policy, lifecycle ordering, static-server
boundaries and workflow structure. They do not prove Chromium rendering or hosted
CI compatibility. Hosted CI, anonymous Cloudflare Access and real checkout remain
separate qualifications. Never label this synthetic checkout-option test as a
successful live order. Do not run an old release controller or deploy to obtain
screenshots.
