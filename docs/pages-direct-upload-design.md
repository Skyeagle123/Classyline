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
- `ops/pages-r2-checkpoint.mjs`: fixed-key conditional claim, native single-request
  SigV4 transport and exact readback. Integrated with the real preflight and upload
  transport in offline tests only; the production callback still returns `false`.
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

The Pages requests below use fixed addresses under
`https://api.cloudflare.com/client/v4`. The checkpoint uses the separate fixed
account R2 S3 hostname documented below. No Cloudflare credentials from the Plugin
are used by either transport.

| Order | Request | Credential / body |
| --- | --- | --- |
| 1 | Read-only project/main/baseline/history preflight | Separate account/GitHub tokens |
| 1a | Conditional checkpoint PUT, then exact GET readback | Separate bucket-scoped S3 credentials; before any Pages mutation |
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
requests. The new R2 adapter is implemented but is not wired to live execution or
qualified against hosted R2. Any new permission or storage mutation requires
separate Owner approval. Do not remove the blocks as a substitute for this proof.

### Cross-runner checkpoint qualification (2026-10-20)

**Qualified storage primitive; implemented adapter still BLOCKED for live use.** The official
[R2 consistency contract](https://developers.cloudflare.com/r2/reference/consistency/#conditional-writes)
and [S3 conditional-write contract](https://developers.cloudflare.com/r2/api/s3/extensions/#conditional-operations-in-putobject)
explicitly guarantee atomic `PutObject` with `If-None-Match: *`: concurrent claims
for one absent key have at most one successful writer; competitors receive `412`.
This supports the conditional-create algorithm. Offline mocks do not independently
prove hosted atomicity, credentials, bucket retention or wire compatibility.

The adapter fixes account `4bfa1a9c849c3da50520f7a4bcccccab`, proposed dedicated
private bucket `classyline-release-checkpoints` and permanent key
`pages/classyline2/production/b64e078ee6ecfc5f4e124fe6d68129164f521b8a/attempt.json`.
This bucket is separate from product images and has not been provisioned here.
The allowlisted body binds application SHA/tree, controller SHA, account, bucket,
key, plan hash and frozen deployment-body hash. Controller or payload changes do
not change the key. GitHub run identity remains in the separate workflow evidence.
One positively acknowledged conditional claim from the current execution is
required before any upload. Existing claims, denial, timeout, lost connection or
uncertain acknowledgement must stop without a deployment POST. Reading a matching
claim after restart never grants permission to resume. A negative read is also
not permission: Cloudflare documents that an earlier unknown write can still
commit after a `404`.

The adapter signs `If-None-Match: *`, the full body SHA-256 and `Content-MD5`
using SigV4 (`auto` region, `s3` service). It issues exactly one conditional PUT,
then only after a complete successful acknowledgement, one authenticated GET.
Only exact body bytes and the expected quoted single-part MD5 ETag grant a claim.
That ETag shape is a conservative hosted-compatibility assumption still requiring
qualification; a different representation fails closed. No HTTP retry, redirect,
SDK, credential logging, delete, overwrite or expiry operation is implemented.
Response bodies are bounded to 8 KiB and request deadlines to at most 20 seconds.
Evidence exposes only fixed identities, hashes, status and request counts.

**Unreceived-write limitation:** R2 cannot record a request it never receives.
After an uncertain failure, the current adapter and retained local journal refuse
replay. If that request never committed and all local context is destroyed, a new
standalone adapter could claim the absent key. A regression test demonstrates this
boundary rather than claiming a permanent tombstone exists. The workflow now
rejects any second dispatch of this fixed-release workflow across controller
commits, and rejects run attempts greater than one. Retained GitHub history is a
defense in depth, not an atomic remote checkpoint or proof against history deletion
or arbitrary process restart. No negative R2 read may authorize resubmission.
The stronger requirement that every uncertainty permanently blocks all future
execution remains unresolved without a trusted orchestration/retention boundary.

Claims must remain consumed forever, with no expiry, reset or automatic recovery.
An [indefinite bucket lock](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
can protect existing and future claim objects against overwrite, deletion and
lifecycle removal while allowing first creation. Runtime credentials must be
bucket-scoped and unable to edit lock configuration. Administrators can remove
locks, so this still depends on explicit administrative change control; it is not
administrator-proof immutability. Lost acknowledgement may consume an attempt
without deploying. The guarantee sought is at-most-once submission, not eventual
success or exactly-once server processing.

GitHub artifacts are supporting evidence, not atomic cross-run claim storage;
[deleting a run deletes its artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts#artifacts-from-deleted-workflow-runs).
Git refs were not qualified for the complete atomicity/retention contract.
Durable Objects transactional storage is another possible primitive but requires
an additional authenticated service and deployment.

No checkpoint bucket, lock or credentials have been created or verified.
Next: independently review the adapter and fault tests, resolve the unreceived-write
boundary, then
separately authorize isolated checkpoint-only hosted qualification. Preserve both
original workflow hard stops and `checkpoint: async () => false` until that evidence
exists. No existing permission or deployment authorization silently covers the
new storage or credentials.

## Validation and remaining proof boundaries

The tests distinguish four layers:

1. Existing workflow regression tests use mocked read APIs/transport to exercise
   authorization, exact bindings, final history, canonical status and evidence order.
2. The original 26 design tests remain architecture models, not network proof.
3. The new transport suite uses a real local HTTP server to count actual requests
   on success, timeout, reset, 503, redirect, malformed/partial/oversized/ambiguous
   replies, asset failure and binding failures; child processes test crash reuse.
   It also compiles a synthetic Functions fixture with actual Wrangler 4.150.0 and
   round-trips exact multipart bytes. No application acceptance tests are repeated.
4. The R2 suite reconstructs SigV4 independently from loopback HTTP bytes, models
   atomic create, and tests concurrent claims, denial, lost acknowledgements,
   malformed/partial/oversized responses, cancellation and SIGKILL. A replacement
   process with a new filesystem cannot reuse a committed remote claim. Integrated
   tests combine the actual workflow preflight, R2 adapter and Direct Upload client:
   one deployment POST on success; zero after denied/uncertain claims or preflight
   drift; no replay after an uncertain deployment response. The mock store models
   the documented contract; it does not empirically establish R2's implementation.

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
