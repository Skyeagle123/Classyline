# Pages Direct Upload — implemented offline transport, live execution blocked

Status: **BLOCKED FOR LIVE USE AND INSTALLATION** pending independent Astra review,
durable runner-loss attempt consumption and the separately authorized installation
controls. Both original unconditional workflow blocks remain. A third boundary,
`checkpoint: async () => false`, prevents upload when remote durability is absent.

## Implemented package

- `ops/pages-direct-upload.mjs`: fixed release identities, static content-key and
  manifest preparation, Functions validation, frozen deterministic deployment body,
  native single-request HTTP(S), fsynced exclusive local attempt journal, asset
  staging, one creation POST and GET-only reconciliation interface.
- `ops/pages-release-artifacts.mjs`: exact application HEAD/tree/cleanliness checks,
  locked BLAKE3 2.1.5 loading, offline payload preparation, complete static inventory
  revalidation and Functions/routing byte hashes. It has no upload entry point.
- `ops/pages-direct-upload.test.mjs`: actual loopback HTTP fault servers and
  independent child-process interruption/restart tests, plus packaging checks.
- The manual workflow checks out its own exact controller commit separately from
  the immutable approved application. It compiles the exact serialized Functions
  bundle using pinned Wrangler **only offline**, prepares the body, and integrates
  `DirectUpload.stageAndCreate` behind all hard stops. Stock `pages deploy` is gone.
  Existing independent deployment/history/canonical/binding checks remain.

The fixed application is `b64e078ee6ecfc5f4e124fe6d68129164f521b8a`, tree
`123889f9fd27b3f0b2138ea057efa2e762a231b1`. Account, project, branch, database,
bucket and compatibility are constants. Dispatch accepts no release inputs.

## Official request contract

All live addresses would be fixed under `https://api.cloudflare.com/client/v4`.
No Cloudflare credentials from the Plugin are used by this transport.

| Order | Request | Credential / body |
| --- | --- | --- |
| 1 | Read-only project/main/baseline/history preflight | Separate account/GitHub tokens |
| 2 | GET `/accounts/{account}/pages/projects/classyline2/upload-token` | Account token; short-lived upload JWT returned |
| 3 | POST `/pages/assets/check-missing` once | JWT; planned content keys |
| 4 | POST `/pages/assets/upload` once per sequential frozen batch | JWT; base64 bytes, content key and MIME metadata |
| 5 | POST `/pages/assets/upsert-hashes` once | JWT; exact content keys |
| 6 | Repeat full read-only preflight and rehash complete input inventory | Stop on any drift |
| 7 | POST `/accounts/{account}/pages/projects/classyline2/deployments` at most once | Account token; frozen manifest, bundle and routes multipart |
| 8 | Bounded GET history/detail/project/main/rollback reconciliation | No application endpoints or data writes |

Any asset failure stops before creation. No JWT refresh-and-resend, SDK, retry
middleware, automatic redirect or second creation is present. A creation timeout,
reset, 3xx, non-200 response, oversized/truncated/malformed body or missing ID is
uncertain. Only read observations are allowed afterward; matching observed code
does not convert uncertainty into automatic acceptance.

The native adapter constructs one `ClientRequest`, uses `agent:false`, normal TLS
validation, an absolute deadline and a bounded response. It uses no proxy agent,
fetch middleware or custom endpoint. HTTP loopback is admitted only for local
fault injection; the production default is fixed HTTPS. This proves client HTTP
no-resubmission under tested faults, not exactly-once Cloudflare processing or
absence of network intermediaries. Node is pinned to 24.19.0 in the workflow.

## Static assets and Functions provenance

- Inventory rejects symlinks, unsafe/colliding names, unknown MIME extensions,
  unsupported build overrides and excess counts/sizes. Conservative package caps
  are 20,000 files, 25 MiB per file, 128 MiB total, 36 MiB serialized asset batches
  and 64 MiB deployment multipart. These are client caps, not Cloudflare promises.
- Asset keys follow versioned Wrangler source:
  `BLAKE3(base64(bytes) + extensionWithoutDot).hex.slice(0,32)`. The dependency is
  loaded only from the approved application's lock/install, exact version 2.1.5.
  Independent SHA-256 hashes are retained; collisions with differing SHA/MIME fail.
- The manifest maps `/relative/path` to a planned key. `_headers`, `_redirects`
  and `_routes.json` are multipart configuration parts, not ordinary assets.
- Offline compilation uses `pages functions build --outfile ... --output-config-path
  ... --build-output-directory dist --compatibility-date 2025-11-13`. The serialized
  `_worker.bundle` is frozen and uploaded unchanged; there is no upload-time rebuild.
- A real compiler fixture established the routing shape `/api/:path*`, mount `/api`,
  method `""`, module `api/[[path]].js:onRequest`, baseURL `/`. The validator requires
  that shape alongside `_routes.json` containing exactly `/api/*` and no exclusions.
- Bundle metadata may select the main module and approved compatibility only.
  Binding/resource overrides, missing/duplicate modules and unexpected types fail.
- Deterministic outer multipart serialization records its SHA-256 and byte count.
  The compiler itself uses random names/boundaries. No clean-build byte-identical
  bundle claim is made: compile once, freeze bytes, inventory modules and routes.
- Source, controller, static inventory, bundle, module, routing and final-body hashes
  are credential-free evidence. Complete base64 plans remain temporary and are not
  included in uploaded evidence artifacts.

## Attempt durability — the unresolved live blocker

`AttemptJournal.claim` creates a fixed release-keyed record with `O_EXCL`, writes
only allowlisted intent, fsyncs the file and containing directory, then returns.
Existing, partial or inaccessible records refuse all reuse. The record consumes
an entire attempt before any asset or creation request; it is never cleared.

Two independent process tests demonstrate retained-filesystem behavior: SIGKILL
immediately after journal sync, and SIGKILL after the mock server receives the
creation POST. A replacement process cannot claim the journal; total creation
requests remain one in the latter case.

**This does not establish runner-loss durability.** GitHub-hosted runner disks are
ephemeral. An Actions artifact uploaded by `always()` after execution is too late
to prove pre-POST persistence. The transport requires a successful durable external
checkpoint callback before any API request; the workflow deliberately supplies
`false`. Even a fresh runner without the local journal therefore sends zero
requests. No live remote checkpoint adapter is implemented or implicitly trusted.

A future revision must implement and independently validate an append-only,
single-use remote intent/receipt mechanism and restart refusal across replacement
runners. It must bind release SHA, control/run identity and payload hash, refuse
ambiguous checkpoint outcomes, and never reset authorization from absent/lagging
Cloudflare history. Any new permission or storage mutation requires separate Owner
approval. Do not remove the blocks as a substitute for this proof.

## Validation and remaining proof boundaries

The tests distinguish three layers:

1. Existing workflow regression tests use mocked read APIs/transport to exercise
   authorization, exact bindings, final history, canonical status and evidence order.
2. The original 26 design tests remain architecture models, not network proof.
3. The new transport suite uses a real local HTTP server to count actual requests
   on success, timeout, reset, 503, redirect, malformed/partial/oversized/ambiguous
   replies, asset failure and binding failures; child processes test crash reuse.
   It also compiles a synthetic Functions fixture with actual Wrangler 4.150.0 and
   round-trips exact multipart bytes. No application acceptance tests are repeated.

No hosted Cloudflare upload/JWT/deployment or Actions dispatch has occurred. Live
TLS/API compatibility, the exact candidate's new packaging run, cross-runner remote
checkpoint behavior, environment protections and operational release freeze remain
unverified. Local HTTP tests do not prove TLS/server compatibility. The approved
application's accepted CI/Preview evidence is retained rather than rerun.

Deployment-specific D1/R2 verification, complete final new-ID reconciliation and
successful canonical Production identity remain independent of upload metadata.
Creation response ID is additionally compared with the independently observed ID.
An external freeze is still required: sequential API reads cannot lock other
operators. Safe installation/recovery remains in `production-deployment.md`.

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
