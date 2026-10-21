# Pages Direct Upload — implemented offline transport, live execution blocked

Status: **BLOCKED FOR LIVE USE AND INSTALLATION** pending independent Astra review,
hosted checkpoint qualification, the unresolved stronger Owner uncertainty policy
and separately authorized installation controls. Both original workflow blocks remain. A third boundary,
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
- `ops/pages-r2-fixed-transport.mjs`: shared signer/native HTTP implementation with
  separate fixed Production and qualification wrappers; no generic target factory.
- `ops/pages-r2-qualification.mjs`: isolated checkpoint-only qualification
  orchestration and a fixed hosted entry; authority/review gates block live execution.
- `ops/pages-qualification-collector.mjs`: fixed authenticated native HTTPS GET
  collector with bounded requests, schemas, timeouts and credential-safe failures.
- `ops/pages-qualification-budget.mjs`: consume-before-execution transaction
  contract and non-resumable request grant. No hosted authority adapter exists.
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

**Supported guarantee: at most one Pages deployment-creation POST across runners,
conditional on atomic R2 claims and permanent checkpoint retention.** Each Pages
POST requires a positively acknowledged claim and exact readback from that same
execution. Atomic create admits at most one such claimant; retention prevents
replacement runners from reclaiming. That claimant's transport sends at most one
creation POST. This does not promise eventual success or exactly-once server
processing. A consumed claim can result in zero Pages POSTs.

**Unreceived claim is not a duplicate deployment:** if a checkpoint PUT never
reaches R2, the original execution sends zero Pages POSTs. After filesystem loss,
a replacement may successfully claim and send the first POST; a third claimant is
denied. The integrated loopback regression counts Pages POSTs as **0 → 1 → 1**,
separately from checkpoint PUT counts. A delayed acknowledgement of a committed
claim blocks replacements while the original waits. Cancellation leaves that
retained claim consumed even when the original never posts.

**Stricter Owner policy remains unresolved and is not waived:** an uncertain
checkpoint claim must permanently consume authorization even if no request ever
reached R2. R2 alone cannot record a request it never receives. The supported
Pages at-most-once guarantee does not satisfy that separate authorization policy.
The current process and retained journal refuse reuse; a fresh absent-key claim
demonstrates the policy gap, not a second Pages POST. All deployment blocks remain
until the Owner separately resolves this policy and hosted qualification succeeds.
No negative read or operator inference authorizes a retry. Retained first-dispatch
history is defense in depth, not atomic single-use protection or a substitute for
permanent retention; do not delete it or rename the workflow to bypass it.

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
Next: independently review the adapter, qualification harness and fault tests;
resolve the stronger uncertainty policy separately before deployment. Separately
authorize isolated checkpoint-only hosted qualification. Preserve both
original workflow hard stops and `checkpoint: async () => false` until that evidence
exists. No existing permission or deployment authorization silently covers the
new storage or credentials.

## Isolated checkpoint-only qualification harness

`ops/pages-r2-qualification.mjs` is prepared for independent review, **not live
execution**. `runHostedQualification()` now validates an explicit fixed-purpose
Owner arm, local credentials and a native configuration collector, then requires
a durable budget grant before any HTTP request. It has no caller-supplied store,
grant, endpoint or verified flag. `HOSTED_QUALIFICATION_ENABLED = false` and
`AUTHORITY_TRANSPORT_VERIFIED = false` independently preserve the live boundary.
The authority adapter remains unimplemented and fail-closed. There is no CLI,
credential discovery or Pages request. Ordinary public harness construction still
requires loopback; only the private hosted context selects fixed R2 HTTPS. Never
remove these gates as an operational workaround. An arm string is a deliberate
operator check, not cryptographic proof of Owner approval or a new authorization.

| Target or budget | Fixed value |
| --- | --- |
| Account | `4bfa1a9c849c3da50520f7a4bcccccab` |
| Dedicated test bucket | `classyline-checkpoint-qualification` |
| Dedicated test key | `qualification/pr4/af06e616de69ce9c2a0d086ba0f9da43db4ff12e/claim.json` |
| S3 requests | At most 3 conditional PUTs and 1 exact GET |
| Created objects | At most 1, retained indefinitely; no cleanup/delete/overwrite |
| Pages, D1 or product-image requests | 0 |
| Configuration reads | At most 10 allowlisted GETs, before/after claims |

The future authorized procedure is: read back the exact bucket, one enabled
Indefinite lock covering the key, no lifecycle rules, and the actual S3 token's
single bucket-scoped Allow permission. Launch two conditional creates with
different fixed contender bodies. Require exactly one complete `200` and one
`412`, verify the winner's quoted MD5 ETag and exact authenticated GET bytes, then
require a third conditional PUT to return `412`. Recheck permission/retention
evidence. Any uncertainty stops without retry, resume, cleanup or inferred success.
An already consumed key cannot qualify again and must not be automatically rotated.

The native metadata collector accepts an explicit API token privately and uses
normal verified TLS to `api.cloudflare.com`, without a proxy/SDK, redirects or
retries. Each GET has at most a 10-second deadline and 64 KiB response; the
collector permits at most ten requests, refuses reuse after any error and rejects
invalid UTF-8, non-200 responses, wrong content type, malformed envelopes, result
shape and pagination. There is a separate loopback-only test factory. No arbitrary
request headers, URL, account, bucket or endpoint option is accepted. Configuration
semantics are validated before writes and again afterward for these exact paths:

- GET `/accounts/{account}/r2/buckets/{test-bucket}`
- GET `/accounts/{account}/r2/buckets/{test-bucket}/lock`
- GET `/accounts/{account}/r2/buckets/{test-bucket}/lifecycle`
- GET `/accounts/{account}/tokens/{S3-access-key-id}`
- GET `/accounts/{account}/tokens/permission_groups`

The actual token ID is matched privately to the S3 access key; it is never audit
evidence. The permission-group ID must resolve to `Workers R2 Storage Bucket Item
Write` from authenticated readback. Exactly one Allow policy, one permission group
and resource `com.cloudflare.edge.r2.bucket.{account}_default_{test-bucket}: "*"`
are required. Broad account resources, extra grants, expiry, missing/ambiguous
readback and retention drift fail closed. No forbidden write is attempted to
"test" boundaries. The S3 credential cannot provide these management-API reads;
a separate least-privilege API token is necessary. The implemented collector and
its permission/retention validation have only been exercised with fake credentials
and loopback responses; actual API permissions and response compatibility remain
unverified. Fixture responses do not prove hosted configuration.

Only allowlisted fixed target identities, counts, state and SHA-256 evidence leave
the harness. Credentials, token IDs, signed headers and raw responses are excluded.
Offline evidence explicitly says `hosted_qualified: false`. Lock readback proves
only observed configuration, not perpetual retention: prohibit administrative lock
removal, lifecycle edits, key deletion/reset and credential broadening operationally.
No live resources or credentials were created and no hosted test was executed.

### Whole-budget consumption and the remaining authority blocker

The total authorization is **3 R2 conditional PUTs, 1 R2 GET, 10 metadata GETs and
one retained test object across all runners**, not a fresh allowance per instance.
`claimQualificationBudget()` first stores a consumed record under the permanent
`classyline/pr4/checkpoint-qualification/af06e616de69ce9c2a0d086ba0f9da43db4ff12e`
authorization key using a transaction. Only that execution's conclusive commit
acknowledgement creates a process-local grant. It is consumed before each request,
never refunded, and stopped on any qualification failure. There is no record-read
resume, counter reset, deletion or expiry. Replacement runners must fail before
the first metadata request, even if the preceding R2 PUTs never reached R2.

This is an **implemented conditional protocol, not a qualified hosted authority**.
The backend must atomically serialize get-if-absent plus insert, acknowledge only
durable commit, retain the record permanently and prevent rollback/reset or
unauthorized deletion. No local file, Actions artifact or ordinary in-memory Map
qualifies. Offline tests use a serialized copy-on-commit store to model this
contract. Lost acknowledgement or timeout returns no grant; a retained commit
denies replacements and unused allowance is burned. If the authority claim itself
never reaches the authority, no qualification request was permitted; a later
successful authority claim is not replay of an R2 request.

Cloudflare documents transactional strongly consistent Durable Object storage as
a possible primitive, but this package does not create a service, namespace,
retention control, RPC/authentication adapter or deployment for it. Git references
are rewritable and require separately proven uniqueness/protection/retention; no
Git ref adapter is implemented. Neither candidate is silently treated as verified.
`claimHostedQualificationBudget()` refuses all execution until an exact authoritative
backend and its identity, authentication, atomicity and retention are independently
qualified. It accepts no injected success flag or store from the hosted caller.

Thus the previous per-instance budget gap is closed **in the modeled integrated
path**, but cross-runner hosted enforcement remains BLOCKED. The stronger Owner
policy is not waived: a pre-send authoritative record can preserve an uncertain
R2 attempt, whereas R2 alone cannot preserve a request it never received. The
separate Production release remains unchanged and does not use this test grant.

The R2 native transport now admits exactly the lowercase signed header set and
rejects unknown names, case variants, arrays, CR/LF, incorrect signed-header lists
and inconsistent dates before I/O. SigV4 signing, fixed endpoints, exact bytes,
deadlines and response bounds remain in force. Normal TLS verification is explicit.

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
- [Transactional Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) (candidate primitive, not an installed authority)
- [Git reference API](https://docs.github.com/en/rest/git/refs) and [tag update/deletion restrictions](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) (not qualified as an authority)
- [Official SDK retry configuration](https://github.com/cloudflare/cloudflare-typescript#retries) (moving documentation, not a selected pinned SDK).
- [R2 credentials, S3 key identity and bucket-scoped resources](https://developers.cloudflare.com/r2/api/tokens/)
- [Bucket lock readback](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/locks/methods/get/)
- [Lifecycle readback](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/methods/get/)
- [Account token metadata](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/get/) and [permission groups](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/subresources/permission_groups/methods/list/)
