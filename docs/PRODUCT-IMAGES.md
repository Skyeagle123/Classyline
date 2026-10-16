# Product Studio image uploads

Implementation only: no bucket, binding, upload, migration or deployment has been activated.

## Administrator workflow

In Product Studio, choose a JPEG or PNG from a phone or computer. Review the local preview and select **Upload Image**. The loading indicator continues until the authenticated server confirms storage. Only then is the image field replaced. Review and **Save product** separately. Upload never changes Draft/Active status, product identity, price, variants or stock. The manual image field remains available.

If upload fails, the previous image field remains unchanged. If the connection fails after storage but before acknowledgement, an unused object may remain. There is no automatic retry, object deletion or product publication. Retrying creates a new object. Replacing an image does not delete its predecessor.

Limits: 2 MiB compressed, 4096 pixels per side, 4 megapixels, still images only. The 2 MiB limit also applies after PNG normalization. PNG currently accepts non-interlaced 8-bit images; convert unsupported PNG/HEIC/animated formats before upload. JPEG is decoded for validation after sanitization. PNG chunks, checksums, decompression length and scanline filters are validated; validated scanlines are recompressed into a new, single zlib stream. The DEFLATE stream must end immediately before the four-byte Adler checksum: trailing junk, duplicate checksums, extra streams and truncated streams are rejected. The bounded streaming decoder stops at the final block, before unused input can accumulate. Original compressed bytes are never stored; PNG pixel values are unchanged. JPEG metadata is stripped except a minimal EXIF orientation tag and at most one fixed 12-byte Adobe APP14 color-transform header (version 100/101, zero flags, transform 0–2). Unknown, extended or private APP14 payloads are stripped; duplicate recognized Adobe headers are rejected. GPS, device, timestamp and thumbnail metadata are not retained.

## WebP security fallback and provenance

New WebP uploads are disabled at client selection, request MIME validation and server content validation, including WebP disguised as JPEG/PNG or octet-stream. Existing WebP catalog/Excel references and image delivery remain compatible; existing objects are not rewritten or removed. Convert new uploads to JPEG or PNG locally.

The removed dependency was `@jsquash/webp@1.5.0`, tarball `https://registry.npmjs.org/@jsquash/webp/-/webp-1.5.0.tgz`, integrity `sha512-KggLoj2MnRSfIqTeKe1EmbljTX2vuV7mh79k89PCL1pyqiDULcPM1L47twxXt0hkb68F70bXiL31MxsuoZtKFw==`.
Its installed decoder matched the lockfile-verified tarball. Decoder SHA-256: `30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344`. The embedded `version()` returned `65792` (`0x010100`, libwebp 1.1.0), predating the CVE-2023-4863 fix in libwebp 1.3.2. Upstream build source pinned `d2e245ea9e959a5a79e1db0ed2085206947e98f2`. npm audit did not report this embedded-code vulnerability.

At remediation, the published package still resolved to 1.5.0. No verified patched replacement was established, so the authorized fail-closed fallback was used. The dependency and `server/webp-codec.js` were removed. Tests guard their absence and reject malformed lossless WebP without invoking any decoder. There is no remaining application WebP binary version to claim. Re-enabling WebP requires a separately reviewed, reproducible patched binary, recorded integrity, embedded-version checks, malformed-lossless regressions and Pages runtime validation.

Cancel upload remains available while editing/saving controls are temporarily disabled. Timeout/cancel settles even when a transport ignores abort or a response body stalls. Late successes cannot replace the image field. An interrupted server operation may still finish and leave an orphan; cancellation is not a remote rollback. Retrying requires an explicit new Upload Image action.

## Future Cloudflare configuration — separate authorization required

1. After independent Astra review, verify storefront ownership and an isolated, protected test environment. Use a dedicated private storefront image bucket; never bind an Agent bucket or another application's storage. No public writes, API credentials in the browser, r2.dev exposure, custom domain or DNS change is needed.
2. In **classyline2 → Settings → Bindings**, explicitly select **Preview** and bind that private bucket as **PRODUCT_IMAGES**. Verify Production's bindings remain unchanged. Preview bindings are shared by Preview deployments in this project, not scoped to one branch; restrict eligible branches before enabling them. Do not save a project-wide or ambiguous binding.
3. Keep the existing isolated **DB** and admin session/password configuration. This feature needs no new secrets or database schema changes. It uses existing `sessions` and `rate_limits` tables. No migrations were added.
4. Binding changes require a separately authorized Preview build. Verify Cloudflare Access on deployment URLs and branch aliases before testing. Root `classyline2.pages.dev` remains production. No deployment is authorized by this implementation.
5. Validate synthetic uploads and native mobile selection/orientation in a protected Preview, then test real R2 conditional puts, metadata, module startup and resource usage. Offline compilation is not proof of real Workers execution or quota compatibility.

## Storage and delivery boundary

- `POST /api/admin/product-images` uses the existing server-side administrator session and same-origin check, bounds streamed body bytes and checks actual content. Existing D1 counters limit attempts to 10/session and 20 globally per 15 minutes, including rejected file attempts. A missing DB, R2 binding or unconfirmed write fails closed.
- The server chooses UUIDv4 keys under `products/images/v1/`. Client filenames and object keys are never accepted. `put` uses `onlyIf: { etagDoesNotMatch: "*" }`; conflicts do not overwrite objects. R2 operations never list or delete objects.
- Returned references use `/api/product-images/<uuid>.<type>`. Only this strict namespace, expected content type, size and application-purpose metadata are deliverable. Arbitrary bucket objects are inaccessible.
- Public GET/HEAD delivery additionally requires an active product referencing the image. Draft and unused uploads require an administrator session and are served `private, no-store`. Unauthorized access returns 404. Public responses require revalidation on every use so deactivation is checked again; already downloaded bytes cannot be revoked.
- Responses include `nosniff`, restrictive CSP and same-origin resource policy. There is no cross-origin write or bucket URL. Existing static/HTTPS images remain compatible. Excel imports/exports preserve uploaded references and still preview/confirm before catalog writes. A reference is not an upload: missing objects return 404.
- Public catalog delivery requires a DB lookup and R2 read. Do not bypass the active-product check with an unconditional edge cache. No sensitive image metadata or underlying storage errors are logged or returned.

## Validation and operational limits

Offline tests use SQLite as a D1-shaped adapter and mocked R2 storage. The actual JPEG decoder runs in tests. WebP content and MIME spoofing are tested for rejection without storage writes. Mounted React tests run actual hooks, state updates and events using react-test-renderer; they cover product switching/reset, ordinary ID edits, cancellation, timeouts, late responses and unmount. These are simulated component tests, not a native browser. `npm run build:functions` compiles the Pages Functions bundle locally, without deploying; no WebP/WASM decoder is shipped.

Native Cloudflare D1/R2 transactions, conditional-write behavior, memory/CPU budgets, mobile browsers, CSP and authenticated Access sessions still require staging validation. Decoding and PNG recompression are bounded but can be CPU-intensive; measure worst-case accepted files against the existing Workers plan. A successful offline build does not establish that Free-plan CPU limits suffice. Do not upgrade billing automatically.

No automatic garbage collection exists. Replaced/orphan uploads consume storage until a separately reviewed cleanup process checks all product references and retention needs. Rate limits also cap accidental repeated uploads. Missing storage leaves manual image references usable and uploads unavailable.

## Charges and publication safety

Cloudflare's published R2 Standard pricing is $0.015/GB-month, $4.50/million Class A operations and $0.36/million Class B operations, with free Internet egress. Monthly free allowances are 10 GB-month storage, 1 million Class A and 10 million Class B operations, shared with the account. Available account capacity and billing eligibility were not inspected. Functions and D1 have their own quotas/costs; each delivery performs a catalog lookup and storage read. No resource or charge was created by this change. Any paid activation needs owner approval.

The implementation commit must start with `[CF-Pages-Skip]` to suppress automatic Cloudflare Pages builds. The feature branch is included in GitHub validation CI. Push only the existing feature branch with that prefix; it suppresses Pages deployment while GitHub validation still runs. No PR, merge or deployment before independent Astra review.

References:

- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://developers.cloudflare.com/pages/functions/module-support/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
- https://developers.cloudflare.com/r2/pricing/
