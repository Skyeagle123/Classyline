# Pages Direct Upload transport — offline architecture, not deployment readiness

Status: **BLOCKED FOR LIVE USE**. Reviewed against the Cloudflare Pages OpenAPI
operations and versioned upstream source on 2026-10-20. No HTTP client is added,
no upload JWT is requested, and no upload/deployment request is made by this
package. Both unconditional workflow deployment blocks remain unchanged.

This document proposes a replacement for the **network transport**, not for the
approved application, Cloudflare project, authentication policy or database.
The executable design model exists only inside `ops/direct-upload-design.test.mjs`;
it has no HTTP adapter, credential loading, CLI entry point or workflow wiring.
Its mocked success is not evidence of a working Cloudflare uploader.

## Fixed trust boundary

Use the exact identities in [the release runbook](production-deployment.md):
application `b64e078ee6ecfc5f4e124fe6d68129164f521b8a`, tree
`123889f9fd27b3f0b2138ea057efa2e762a231b1`, account
`4bfa1a9c849c3da50520f7a4bcccccab`, project `classyline2`, Production branch
`main`, Production `DB` UUID `10c800b1-ddf7-427b-8354-9cf8529782b6`, private R2
`PRODUCT_IMAGES` bucket `classyline-storefront-production-images`.

Do not accept source/project/environment/shell inputs from dispatch callers.
Preserve Owner/repository numeric identity, main-only initial dispatch, protected
environment, approved CI, exact rollback identity, release freeze and no competing
deployments. Keep the existing workflow blocked until a separately reviewed
implementation and Owner authorization explicitly permit a replacement.

## Meaning of strict no-retry

The client may issue **at most one deployment-creation HTTP POST per authorized
release**. Zero is correct if preparation or preflight fails. A timeout, reset,
truncated response, 3xx, 408, 409, 429, 5xx or unknown error consumes the attempt.
Never resend it, even when subsequent history initially shows no deployment.
Never describe a timeout as proof that Cloudflare did not receive the request.

For a conservative contract, each asset-upload batch, check-missing POST and
upsert-hashes POST also has a single-use operation ID. No automatic retry, token
refresh-and-resend, redirect following or process restart/re-entry is allowed.
Different predeclared asset batches are different requests, not retries. All are
sequential. GET reconciliation uses explicitly bounded new read observations;
it must never call an upload or creation function.

This is an HTTP **no-resubmission** property, not a guarantee of exactly-once
Cloudflare server processing, TCP packet delivery or atomic global deployment
locking. No documented idempotency key is assumed for Pages deployment creation.

## Proposed modules and build provenance

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Offline preparer | Verify source/tree, compile static assets and Functions, validate complete file set and routing, produce hashes | Read deployment credentials or make Cloudflare requests |
| Fixed request planner | Produce an allowlisted ordered plan and operation IDs, immutable asset batches and multipart files | Accept arbitrary URLs, paths, source refs, extra bindings or shell commands |
| Single-request HTTPS adapter | One native HTTPS request per operation, bounded response/time/size, sanitized result | Retry, follow redirects, inherit proxy/retry middleware or log raw responses |
| Release coordinator | Persist attempt intent, preflight, single creation, read-only reconciliation | Reset a consumed attempt, auto rollback, restore data or run migrations |
| Evidence writer | Publish allowlisted hashes, IDs, statuses and observed/accepted distinction | Save tokens, JWTs, environment dumps, raw HTTP bodies or database contents |

1. In a fresh isolated checkout verify the exact SHA/tree and complete clean
   tracked/untracked state. Reject unexpected Wrangler/environment overrides.
   Keep locked dependency installation with scripts disabled, pinned Wrangler
   4.150.0 for **offline compilation only**, reviewed action SHAs and Node 24.
   A real transport revision must pin/review an exact Node patch and binary
   provenance instead of treating moving `24` as an audited HTTP implementation.
2. Perform accepted repository build/security checks. Inventory sorted normalized
   relative paths; reject symlinks, traversal, duplicates, case/encoding collisions,
   unexpected files and files absent from the approved inventory. Re-enumerate and
   rehash the complete file set immediately before upload, including ignored output.
3. Use a supported offline Pages Functions compilation command to serialize the
   exact `_worker.bundle`, rather than hashing one build and rebuilding during
   upload. Wrangler 4.150.0 `pages functions build --outfile` writes the serialized
   bundle; `--outdir` alone is not the multipart upload file. Exact command/options,
   compatibility and output semantics must be validated before choosing the client.
   No build command is executed as part of this design-only package.
4. Parse the bundle as multipart. Verify main-module metadata, complete module
   names/content types, module bytes, runtime compatibility and no binding/resource
   override. Keep project-managed Production bindings/secrets; do not embed secret
   values or accidentally replace them using bundle metadata. Preserve Functions
   file-path routing semantics and exact `_routes.json` `/api/*` coverage; include
   the generated routing-config part where required. Reject duplicate form fields.
5. Record SHA-256 for every module, the exact serialized bundle, routing files,
   headers/redirect files, static asset bytes, manifest and final upload body.
   Multipart boundaries may vary between compiler invocations. Do not claim two
   independently generated bundles are byte-identical without evidence. Compile
   once, freeze and upload those bytes; compare module/route inventories across
   clean builds for reproducibility. If canonical multipart serialization is
   introduced, it needs its own parser/round-trip tests and source review.
6. Produce a sorted, canonical JSON release manifest containing source/tree,
   control commit, accepted CI, tool/runtime identities and per-file hashes. No
   token is present. Bind the release-intent journal to its SHA-256, not just to
   self-reported commit metadata.

The asset-store key is **not** the provenance SHA-256. Wrangler 4.150.0 delegates
to a hash helper using `BLAKE3(base64(file bytes) + extensionWithoutDot)`, hex
truncated to 32 characters. It is extension-sensitive. Preserve both the required
Pages content key and an independent full SHA-256. Do not import an internal
helper as if it were a stable public client API: `@cloudflare/deploy-helpers`
explicitly describes itself as internal. Before implementation, select a reviewed
pinned hash implementation, prove vectors against the accepted Wrangler version,
check MIME/extension handling and detect collisions/inconsistent duplicate keys.

## API request plan (design only)

All URLs are fixed under `https://api.cloudflare.com/client/v4`. Authentication
scope is the approved account. Upload JWTs are short-lived secrets, distinct from
the account API token, and never enter artifacts. Each response requires HTTP
success, valid bounded JSON and the expected result shape.

| Order | Method and path | Auth / payload | Failure action |
| --- | --- | --- | --- |
| 1 | GET project, baseline deployment, main ref and paginated Production history | Pages-read capability of temporary Pages Write token; GitHub reads use separate token | Stop before uploads if baseline, freeze, bindings, runtime or history differ |
| 2 | GET `/accounts/{account}/pages/projects/classyline2/upload-token` | Account token; expect `result.jwt` | Stop; do not refresh-and-replay |
| 3 | POST `/pages/assets/check-missing` | Upload JWT; `{hashes:[...]}` | Stop; result must be a subset of the planned keys |
| 4 | POST `/pages/assets/upload` for each frozen missing-asset batch | Upload JWT; array of `{key,value,metadata:{contentType},base64:true}` | Stop on any uncertainty; never create deployment after an incomplete batch |
| 5 | POST `/pages/assets/upsert-hashes` | Upload JWT; `{hashes:[...]}` | Stop if not confirmed; no retry/best-effort suppression |
| 6 | Repeat bounded read-only final preflight | Rehash artifacts, exact baseline/main/config, no active/queued or candidate attempt | Stop; staged asset bytes do not authorize deployment |
| 7 | POST `/accounts/{account}/pages/projects/classyline2/deployments` **once** | Account token; frozen multipart below | Consume attempt before dispatch; uncertainty permits GETs only |
| 8 | GET deployment/history/project/main/rollback for bounded reconciliation | Account/GitHub tokens; no application endpoints | Reject ambiguity or drift; do not re-upload or automatically roll back |

Asset payload/batch bounds must be explicit before implementation. Current
versioned Wrangler source uses 20,000 default assets, 25 MiB per asset and 40 MiB
raw-data upload buckets; these are source observations, not a complete JSON/base64
request-size guarantee. The proposed client should use a conservative serialized
JSON byte cap and one batch at a time. Confirm account/API limits and JWT claims;
fail closed rather than silently expanding limits or splitting a sent batch.

Creation multipart contains the canonical static `manifest`, exact `_worker.bundle`
bytes, `_routes.json`, applicable `_headers`/`_redirects` and Functions routing
configuration. Set branch `main`, `commit_hash` to the fixed approved SHA and
`commit_dirty` to string `false`. Do not include `_worker.js` simultaneously with
`_worker.bundle`. Cloudflare's API specifies a 25 MiB bundle limit. No
`wrangler_config_hash` is invented for a configuration file that does not exist.
`commit_hash` is metadata, not source provenance. A Git-backed creation request
uses branch HEAD and is not the proposed exact-artifact Direct Upload operation.

Asset staging may leave unreferenced Pages asset-store bytes when preparation
fails. This is not an application R2/D1 write or product publication, but it is a
Cloudflare mutation requiring future explicit authorization. No cleanup API or
destructive recovery is assumed.

## Client-library decision and proof boundary

Preferred candidate: a tiny adapter around `node:https.request` using one fresh
non-pooled agent (`agent: false`), normal certificate/hostname validation, fixed
host/path/method, explicit content length and immutable body, a total deadline
that destroys the request, and a bounded response accumulator. Handle 3xx as
failure without consulting `Location`. Do not attach retry callbacks, refresh
middleware, proxy agents, custom TLS bypasses or environment-selected endpoints.
Remove proxy/debug/Node preload settings from the future deployment process.

Inspection of Node v24.19.0 `https.request` shows construction of a single
`ClientRequest`; `_http_client.js` constructs a fresh agent for `agent: false`.
This supports the proposed approach but does **not** audit an unimplemented
adapter, multipart serializer, pinned runner binary or network intermediaries.
Before enabling, review its complete dependency/runtime path and use a local
fault-injection server to count actual requests for resets, timeouts, redirects,
partial responses and 429/5xx responses. These are future tests, not performed
by the offline state model. No Cloudflare write is needed for that local proof.

The official Cloudflare TypeScript SDK defaults to two retries and documents
`maxRetries: 0`. It is an alternative only after pinning and auditing the exact
SDK version plus underlying HTTP/redirect behavior and prohibiting per-request
overrides. A configuration option alone is insufficient no-retry evidence.
Stock Wrangler's deploy/upload helpers are excluded: creation, missing-hash,
asset-upload and hash-upsert paths contain retry behavior. Offline compiler use
does not authorize calling those helpers.

## Attempt journal, uncertainty and reconciliation

The future coordinator must write a credential-free, durable intent record
**before** sending the creation request: application/tree, artifact-manifest hash,
control commit, Actions run/attempt, fixed project/environment, consumed operation
IDs and timestamp. No subsequent code path clears the latch. A process crash
between intent and request is treated as uncertain, even if no POST was sent.
Persist/archive intent before network dispatch; if durable evidence publication
fails, stop before creation. An in-memory boolean alone is not crash recovery.

Do not expose a resumable POST entry point. Actions initial-attempt and per-control
commit dispatch gates, retained run history, a release freeze and a scan for any
prior candidate Production attempt are additional controls. History can lag:
absence of a deployment never resets authorization. A new process must inspect
the journal/run history and refuse creation; read-only reconciliation is separate.
Do not delete run/deployment history to reset these gates. No service-wide atomic
lock is claimed; external operators and automatic builds must remain frozen.

After creation, enumerate bounded complete Production history. The complete new
ID set must contain exactly the accepted ID, including failed/skipped competing
attempts. Verify detail and final canonical Production identity, approved SHA,
`main`, clean metadata, successful terminal `deploy`, Functions, compatibility and
the deployment's own exact D1/R2 maps. Verify project configuration independently,
Preview isolation and the retained successful rollback source. Reconcile final
history again and reread canonical state after it. Reject duplicate/missing IDs,
truncated pagination, unknown status and any unverifiable field.

Separate `observed` evidence from `accepted`. Even a matching successful deployment
after an ambiguous creation response remains **manual-review required**, never an
automatic success or permission for another POST. Poll only read-only API routes
with bounded observations. Do not call catalog/order endpoints that expire orders.
Emergency rollback is a separately authorized Pages code rollback preserving all
D1/R2 records, not database restoration or down-migration.

## Verified versus unresolved

| Property | Evidence / status |
| --- | --- |
| Necessary API surfaces exist | VERIFIED in connected Cloudflare OpenAPI: upload-token, check-missing, assets/upload, upsert-hashes and multipart deployment creation |
| Complete static + Functions payload is representable | VERIFIED API fields and Wrangler serializer/build source; client compatibility not yet tested |
| Single logical creation / no resubmission after uncertainty | VERIFIED only in the offline contract model, not a live HTTP adapter |
| HTTP/library no-retry and no-redirect behavior end to end | BLOCKED: exact adapter, fixed runtime/serializer and request-count fault tests do not exist |
| Asset-key compatibility, complete MIME/routing/module parity | BLOCKED: vector/round-trip validation required before a real client |
| Reproducible builds and hashes of the exact transmitted bytes | BLOCKED: future preparer and serializer must establish this; existing validation-build hashes are insufficient |
| Durable crash-safe intent / resume refusal | BLOCKED: design specified, no durable implementation tested |
| Live Cloudflare compatibility / hosted resource safety | UNVERIFIED; no new hosted or write tests performed |
| Protected environment, installation freeze and automatic-build pause | Separate Owner-authorized prerequisites; not created or changed here |

The shortest next technical phase is a separately authorized offline-only adapter
and preparer implementation, actual local request-count tests, hash/module/routing
vectors and independent review. Retain both hard stops through that phase. Only
after those pass should the Owner consider bounded hosted validation and workflow
installation authorization. No present claim of deployment-transport readiness.

## Primary evidence

- [Pages deployment API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/)
- Cloudflare Plugin OpenAPI paths listed in the request-plan table, inspected 2026-10-20 (schema inspection only, no API writes).
- [Wrangler 4.150.0 upload path](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/pages/upload.ts)
- [Versioned asset hash](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/deploy-helpers/src/deploy/helpers/hash.ts)
- [Internal helper boundary](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/deploy-helpers/package.json)
- [Functions build serialization](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/pages/build.ts)
- [Worker bundle metadata](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/api/pages/create-worker-bundle-contents.ts)
- [Node v24.19.0 HTTPS](https://github.com/nodejs/node/blob/v24.19.0/lib/https.js) and [HTTP client](https://github.com/nodejs/node/blob/v24.19.0/lib/_http_client.js)
- [Official SDK retry configuration](https://github.com/cloudflare/cloudflare-typescript#retries) (moving documentation, not a selected pinned SDK).
