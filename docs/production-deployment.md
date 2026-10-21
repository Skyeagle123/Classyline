# ClassyLine closed Production release — preparation only

Status: **BLOCKED FOR DEPLOYMENT**. This PR does not authorize installation,
dispatch, credential provisioning, configuration changes or deployment.

## Fixed release identities

| Item | Expected identity |
| --- | --- |
| Repository / numeric ID | `Skyeagle123/Classyline` / `1096008352` |
| Owner / numeric ID | `Skyeagle123` / `125151458` |
| Application SHA | `b64e078ee6ecfc5f4e124fe6d68129164f521b8a` |
| Application tree | `123889f9fd27b3f0b2138ea057efa2e762a231b1` |
| Accepted application CI | `39297195087`, attempt 1, successful push validation |
| Production baseline SHA | `393ff88e76dcca226de7f83e148554699e85ca01` |
| Production baseline deployment | `5824179f-af77-4a18-9a23-ab22019e8ccc` |
| Cloudflare account | `4bfa1a9c849c3da50520f7a4bcccccab` |
| Pages project / ID | `classyline2` / `25d5c0d3-f248-4d69-b5a3-feacfcb66dec` |
| Production D1 / binding | `classyline-storefront-production-d1` / `DB` |
| Production D1 UUID | `10c800b1-ddf7-427b-8354-9cf8529782b6` |
| Production R2 / binding | `classyline-storefront-production-images` / `PRODUCT_IMAGES` |
| Preview D1 UUID | `ce1d28f3-f20b-485d-9799-619a7fc52ade` |
| Preview R2 | `classyline-storefront-preview-images` |

The application is checked out separately from the workflow. No application
commit, dependency lock or migration is changed by this PR.

## Deployment transport and remaining blocker

Wrangler **4.150.0** retries the Pages deployment-creation POST when Cloudflare
returns `ApiErrorCodes.UNKNOWN_ERROR`. `MAX_DEPLOYMENT_ATTEMPTS` is 3. One CLI
invocation therefore does not establish one deployment-creation request.

Version-specific evidence:

- [Deployment POST retry loop](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/api/pages/deploy.ts)
- [Retry constants](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/pages/constants.ts)
- [CLI status handling](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/pages/deploy.ts)

The installed version's `pages deploy --help`, implementation and documentation
review established no supported switch to disable that POST retry loop. The CLI
can also return normally when final deployment status is unknown, so exit code
zero is insufficient acceptance evidence.

Stock Wrangler deployment is no longer invoked. The replacement Direct Upload
module uses official APIs and one native HTTP request per operation; local fault
servers verify no resubmission. Wrangler 4.150.0 remains an offline compiler only.

Both unconditional blocks remain: first-step `exit 1` and literal
`NO_RETRY_TRANSPORT_VERIFIED = false`. A third boundary supplies the literal
`checkpoint: async () => false`. Inputs, environment variables or secrets cannot
enable them. The new R2 adapter is connected only in offline integration tests.

Local exclusive/fsynced attempt consumption survives demonstrated process kills,
including a kill after the creation POST reached a mock server. It does not prove
persistence after destruction of an ephemeral Actions runner. Deployment remains
BLOCKED pending independent review, hosted checkpoint qualification, resolution
of the stronger Owner uncertainty policy and separate installation/activation
authorization.

See [the implemented transport and proof boundaries](pages-direct-upload-design.md).
No hosted upload or deployment test has been performed by this package.

## Implemented acceptance controls (inactive behind all three blocks)

- Manual dispatch only; no release inputs; exact repository/Owner names and IDs,
  main ref, initial actor and triggering actor checks; run attempt must be 1.
- Reviewed immutable official action commits, Node 24.19.0, locked dependencies,
  explicit Wrangler version check, exact application SHA/tree, clean checkout,
  and no root Wrangler or local environment overrides.
- Approved CI run and job identity/success checks; tests, security check, audit,
  static build, Functions build and `/api/*` routing validation.
- A second first-dispatch check across the fixed-release workflow's entire retained
  dispatch history: exactly one dispatch and the current run ID and commit must
  match. A new controller commit does not reset this gate.
- Exact account/project, Git source, disabled automatic Production builds,
  baseline and successful rollback source/status; Production and Preview D1/R2
  identities, runtime date/flags/placement and encrypted Admin-secret presence.
- Paginated bounded Production history inspection rejects queued, running or
  unknown-state deployments and any existing Production attempt for this
  application SHA. Final main, canonical baseline, configuration and history
  reads occur immediately before the one creation POST.
- Main must remain at the dispatch commit throughout. Concurrency group
  `classyline2-production` does not cancel an in-progress deployment.
- Independent bounded post-deployment GETs verify one new deployment, successful
  deploy stage, canonical Production identity, SHA, clean metadata, Functions,
  URL, runtime, preserved Preview configuration and retained rollback. D1/R2 maps
  are checked directly on the returned deployment AND final canonical snapshot:
  exactly `DB` with the approved Production UUID and `PRODUCT_IMAGES` with the
  approved Production bucket. Missing, extra, renamed, mismatched or unverifiable
  deployment bindings are rejected even when project settings remain correct.
- Final complete history reconciliation requires the new deployment ID set to
  equal exactly the accepted deployment, rejecting completed/failed/skipped
  competitors too. Missing baseline history and duplicate IDs fail closed. The
  workflow rereads canonical identity, terminal success, bindings and project
  configuration after that reconciliation. External operator freeze remains
  necessary because separate API reads cannot provide an atomic global lock.
- Creation failures/timeouts still lead only to read-only history inspection. Unknown
  status, extra deployments, drift or a nonzero/uncertain creation outcome fail closed.
  There is no workflow rerun, second invocation, automatic rollback or data restore.

GitHub concurrency is not an account-wide Cloudflare lock. The Owner must freeze
main pushes/merges and all competing deployment operators during the release
window. Rechecking state narrows races; it cannot replace that freeze.

## Provenance and secret handling

The token is referenced only by the final preflight/deployment/verification step.
Before that step, no Cloudflare credential is passed to dependency installation,
builds, tests or hashing. Checkout credentials are not persisted. The Direct Upload adapter is not passed the GitHub API credential. Raw HTTP
responses and upload JWTs are never printed or uploaded; structured evidence
contains allowlisted data.

The evidence artifact retains source SHA/tree, workflow commit, run ID/attempt,
Node/Wrangler versions, SHA-256 hashes of tracked source, static output and the
Functions validation build, plus preflight, invocation outcome and observed/final
deployment identities. The token, response bodies, environment dumps, debug logs
and private database records are excluded. Retention is 14 days; approved release
operators must download and preserve the evidence before expiry. Artifact upload
failure is a failed release record and needs manual review.

`observed-deployment.json` reports a seen deployment, not acceptance.
`observed-verification.json` explicitly records `accepted: false`, even when the
observed deployed code matches but creation status is uncertain. Only after every
identity, Functions, deployment/project binding, history, canonical, rollback,
freeze and creation-certainty check passes is `accepted-deployment.json` written with
`accepted: true`. The old ambiguous `verified-deployment.json` is not generated.

The separate Functions validation build remains validation evidence. The new
Direct Upload provenance additionally hashes the exact serialized bundle, routing
and frozen multipart body sent by the transport; it performs no upload-time rebuild.

Use only an account-scoped **Cloudflare Pages Edit / Pages Write** token. No D1,
R2 data-write, Access, billing, DNS or token-administration grants are required.
Pages permission is account-wide, not a verified project-only boundary. This
paragraph describes the Pages token only. The disabled R2 adapter would require
separate bucket-scoped S3 credentials for the dedicated checkpoint bucket, with
no product-image access or authority to change retention configuration. No such
credentials are provisioned or consumed by the committed workflow. Provision
the short-lived token privately through the Owner's own browser, never through
chat, tool outputs or committed files. Revoke it in Cloudflare after completion
or failure and delete the GitHub environment secret; deleting the secret alone
does not revoke the token.

## Safe installation sequence — each mutation needs separate authorization

1. Independently review the exact corrected PR SHA/tree and offline validation.
   Resolve the retry blocker before approving a deployment-capable revision.
2. Under separate authorization, freeze main/merges/other deployers, disable
   Cloudflare automatic Production branch deployments and independently read back
   the setting. Drain/inspect queued builds and verify the baseline is unchanged.
   A gate inside Actions cannot prevent a Git-triggered deployment at merge time.
3. Configure `classyline-production`: Owner-only required reviewer, `main`-only
   deployment branch restriction and no administrator bypass. If the Owner both
   dispatches and approves, self-review prevention must not make approval
   impossible. This is explicit Owner approval, not two-person approval.
4. Install only the exact reviewed PR changes on main with a separately authorized
   workflow-only update. Prefix the installation commit `[CF-Pages-Skip]` as an
   additional guard; do not rely on the prefix instead of the disabled-build gate.
   Verify no Cloudflare deployment started and record the new control commit.
5. Keep `CLASSYLINE_RELEASE_ARMED` absent/false. Independently verify environment
   protections and Actions policy before secrets are provisioned. A workflow's
   environment name alone does not prove protection rules exist. Do not create a
   repository-level secret with the same name as the environment secret.
6. After the no-retry solution and source have separate approval, privately add
   environment secret `CLOUDFLARE_API_TOKEN`. The account ID is fixed in code.
   Reverify Production D1 integrity, empty catalog/variants/orders, all nine fees
   NULL, R2 privacy, Access coverage and recovery evidence read-only outside this
   workflow. Do not broaden the deployment token to query or modify customer data.
7. Arm the environment variable for the approved window, dispatch from main once,
   and approve the exact run. No customer/product/delivery activation is implied.
8. Review independent post-deployment evidence and Production isolation. Revoke
   the token, delete the environment secret, disarm and retain audit evidence.

No installation/configuration/credential steps above were executed by this PR.
An empty catalog and NULL delivery fees are not a complete API checkout kill switch.

## First dispatch, uncertainty and recovery

The dispatch-history gate permits only the first dispatch of this fixed-release workflow.
Any attempted dispatch, including an unarmed or preflight-failed run, is retained
in Actions history. A repeat dispatch must fail even after a new controller commit.
Never delete run history or rename the workflow to make this check pass. Reruns
are always denied. History is not an atomic R2 checkpoint and cannot guarantee
refusal if privileged operators delete it; preserve that administrative boundary.

After any uncertain result: stop; inspect deployment history and current canonical
identity before another action. A recorded Production attempt of the candidate
also blocks subsequent automatic attempts, even after rollback. No uncertainty is
interpreted as permission to re-upload.

If an accepted deployment fails release checks, emergency Pages rollback to
`5824179f-af77-4a18-9a23-ab22019e8ccc` requires the applicable separate Owner
authorization and exact successful baseline verification. Preserve Production
D1/R2. Do not restore SQL snapshots, run down-migrations, correct inventory or
delete objects. The baseline is the legacy static application: rollback is code
containment, not continued operation of the newer checkout backend. If customer
records exist, preserve them and reconcile under separate authorization.

## Offline validation and CI status

Run from this PR checkout:

```sh
node --test ops/production-workflow.test.mjs
node --test ops/direct-upload-design.test.mjs
```

The tests execute extracted workflow scripts with mocked GitHub/Cloudflare reads
and a mocked Direct Upload boundary. They cover immutable blocks, identity/CI,
dispatch history, baseline/rollback, bindings, unsafe flags, active builds,
artifact drift, Functions, source mismatch and uncertain responses. Tests exercise
acceptance logic behind a **test-only** substitution of the literal block; the
committed workflow keeps it false. No live credentials, API calls or deployment
are used. Bash/inline JavaScript syntax and YAML structure are also checked locally.

The corrected workflow suite has 83 cases, including the two independent-review
counterexamples (incorrect deployment bindings despite correct project settings;
a second completed deployment appearing only in final history). It also checks
missing/extra/unverifiable deployment bindings, final canonical drift and that no
failure produces final acceptance evidence. The separate 26-case Direct Upload
design suite tests abstract operation budgets and uncertainty handling with
fake I/O only. It does not test an HTTP client, multipart/hash compatibility or
real Cloudflare behavior. Passing these suites is not deployment authorization.

The manual Production workflow has not been dispatched. Application CI
`39297195087` is accepted evidence for the unchanged application; it is not CI
validation of this remediation commit. The separate, credential-free PR4 offline
validation workflow is authorized. Review readiness does not mean deployment readiness.

## Offline implementation validation

On 2026-10-20, Node 24.19.0 completed **150/150** offline tests:
82 workflow regressions, 26 architecture-model cases and 42 native transport,
packaging and process-interruption cases. YAML, Bash and JavaScript syntax checks
passed. These results are local evidence; no Actions dispatch or Cloudflare write
was performed.

The loopback server counted exactly one deployment-creation POST for success,
timeout, reset, 503, redirect, malformed/partial/oversized/ambiguous response and
post-deployment binding-rejection cases. Asset reset or an unplanned missing key
produced zero creation POSTs. After creation, all observed requests were GETs.
A killed child whose POST had reached the server was replaced by an independent
process: the retained journal prevented a second POST. Fresh-directory runner-loss
simulation with the unavailable remote checkpoint produced zero requests.

The actual pinned compiler fixture, not the application release, was compiled
and its serialized Functions bundle accepted and round-tripped. The exact
application packaging run is a future blocked workflow operation. No evidence
here establishes hosted API/TLS compatibility or remote checkpoint durability.


Run controller/design tests and native loopback fault tests with the approved
application's locked dependency installation available:

```bash
CLASSYLINE_TEST_APPLICATION=/absolute/path/to/locked-application \
  node --test ops/production-workflow.test.mjs ops/direct-upload-design.test.mjs \
  ops/pages-direct-upload.test.mjs
```

No deployment token is needed. Fault tests bind only 127.0.0.1. Compiler fixture
execution clears credentials and disables Wrangler metrics. A failed test is not
a reason to change the release identities or remove any deployment block.

## Recovery of PR4 offline CI

[Run 39493794751](https://github.com/Skyeagle123/Classyline/actions/runs/39493794751)
did start for `d8ed31eef6fb0d5a4fca0e304fceece9d49640ae`. Its `npm ci` step failed
with EUSAGE because this controller branch is based on the older Production tree
and has no root dependency lockfile. Node setup succeeded; tests were skipped.
This was a checkout/dependency-location defect, not unavailable Actions execution.

The first recovery push (`610e9666`, run `39498416906`) exposed a separate GitHub
workflow-expression error: `runner.temp` is unavailable in job-level `env`.
That run created no jobs. The parser directory now uses the supported
`github.workspace` context, and local validation explicitly rejects the invalid
job-level context. Generic YAML parsing alone does not validate GitHub's context
availability rules; the final hosted offline result must be checked as well.

The corrected offline workflow checks out its exact controller commit and the
fixed application SHA in separate directories. Only the application's existing
lockfile supplies Wrangler 4.150.0 and BLAKE3. A separate integrity-locked YAML
parser supports syntax validation without changing application dependencies.
Neither checkout persists Git credentials. The job has read-only contents
permission, no release environment and no Cloudflare secret or deployment step.

The current regression suite additionally validates complete manifest coverage,
per-path content keys, exact special-file bytes, and a real nonempty JavaScript
Functions entry distinct from metadata. Integrated tests extract the committed
workflow preflight callback and run it with the real native transport against
loopback HTTP. They cover drift before and after asset staging, D1/R2 mismatch,
competing deployments, invalid rollback, unavailable/denied/uncertain checkpoints,
and uncertain creation outcomes. Reconciliation is read-only; uncertain outcomes
remain failures even when a deployment is observed. Hosted API compatibility is
not established by these tests.

Run all relevant tests and syntax checks with Node 24.19.0:

```bash
CLASSYLINE_TEST_APPLICATION=/absolute/path/to/locked-application \
  node --test ops/*.test.mjs
CLASSYLINE_VALIDATION_TOOLS=/absolute/path/to/isolated-parser \
  node ops/validate-offline-workflows.mjs
```

See the [implemented checkpoint and remaining qualification gates](pages-direct-upload-design.md).
The R2 adapter is implemented and tested offline; its production callback remains
disabled. All three literal Production hard stops remain intact. Installing on
main also remains separately gated: the authenticated
recovery inspection found automatic Production deployments enabled and the exact
accepted baseline still canonical. A merge could start Cloudflare's automatic
build regardless of the manual workflow's hard stops. Do not install until the
Owner separately authorizes and verifies the installation freeze described above.

## R2 checkpoint implementation and qualification boundary

Node 24.19.0 completed **257/257** offline tests with zero failures or skips:
the existing 206 cases, one cross-controller dispatch regression, 40 R2 signing/
claim/fault cases and 10 real preflight/checkpoint/transport integration cases.
YAML (2 files), Bash (14 scripts), embedded JavaScript (4 scripts) and module
syntax (11 files) passed validation; all three deployment hard stops were checked.
These are local results. The exact published commit's Actions result must be
verified separately and recorded in PR #4 before review.

The fixed proposed bucket is `classyline-release-checkpoints`, separate from both
product-image buckets. The permanent release key, account and payload evidence are
specified in the Direct Upload design. The adapter permits one conditional PUT and
requires positive acknowledgement plus exact readback; an existing or uncertain
claim never grants permission to resume. No deletion, overwrite or expiry path
exists. Concurrent tests use different controller/payload identities at the same
key to ensure a changed build cannot bypass an already consumed release.

Hosted qualification must separately establish: the exact account/bucket and
bucket-scoped credential restrictions; an indefinite lock covering future and
existing claim objects; absence of a lifecycle path that removes claims; positive
and competing conditional-write behavior; SigV4/ETag/readback compatibility; and
operator controls against lock removal, object deletion or history deletion.
Bucket administrators can remove locks. This is retained administrative control,
not administrator-proof immutability. Any checkpoint-only hosted test needs new
explicit authorization and must not invoke Pages deployment or product storage.

The supported guarantee is **at most one Pages deployment-creation POST across
runners, conditional on atomic R2 claims and permanent checkpoint retention**.
A checkpoint PUT that never reaches R2 produces zero Pages POSTs. A replacement
can claim and produce the first POST, and a third attempt is denied: **0 → 1 → 1**.
Committed claims with delayed acknowledgements block replacements; cancellation
does not free the retained claim. No exactly-once server-processing claim is made.

The stronger Owner policy remains unresolved: an uncertain checkpoint claim must
permanently consume authorization even when it never reached R2 and local state
is lost. This package does not waive that policy or authorize another claim.
Retained first-dispatch history is defense in depth, not an atomic remote record.
All three deployment hard stops remain byte-for-byte unchanged. No live writes,
new credentials, workflow dispatch or configuration changes were performed.

The isolated qualification harness and its exact future request budget are in
[the checkpoint qualification procedure](pages-direct-upload-design.md#isolated-checkpoint-only-qualification-harness).
It is prepared and tested offline, not enabled for live execution. Independent
review is the next gate; hosted qualification and installation need separate
Owner authorization.

## Hosted qualification hardening — still blocked

The fixed hosted entry now validates the explicit qualification-only Owner arm,
credentials, native read-only collector and durable whole-budget grant. It does
not accept arbitrary accounts, buckets, keys, endpoints or a caller-provided
verified grant. A native HTTPS collector enforces fixed GET paths, authentication,
TLS, no redirects/retries, ten requests, bounded responses/deadlines and strict
envelope/result validation. Header validation rejects case variants, unknown
names, injection and incorrect SigV4 signed-header lists.

The external authority protocol consumes the entire allowance before any metadata
or R2 request. A conclusive atomic durable claim grants at most 3 PUTs, 1 object
GET and 10 metadata GETs in total; runner loss burns unused allowance. Integrated
offline tests cover concurrent claims, committed-but-lost acknowledgements,
replacement after unreceived R2 PUTs and denied/exhausted grants. They exercise
the actual collector, budget counters and R2 transport, but a modeled transaction
store is not proof of hosted persistence or retention.

**BLOCKED:** no authoritative hosted store, authenticated authority transport or
permanent retention control has been provisioned or verified. The hosted authority
function refuses execution, and both qualification gates remain false. Do not
substitute local files/artifacts or an injected boolean, remove gates, or infer
authorization from an absent R2 object. The stricter Owner policy remains unwaived.
All three Production workflow hard stops and application code remain unchanged.
No service deployment, namespace, resource, token or configuration was created.

This hardening revision passed **341/341** relevant offline tests on Node
24.19.0: the existing 306 cases plus 35 hardening regressions. Zero failures,
cancellations or skips. YAML (2 files), Bash (14 scripts), embedded JavaScript
(4 scripts), JavaScript modules (17 files), diff checks and all three Production
hard stops passed validation. The exact published commit's automatic offline CI
must be verified separately in PR #4. These results qualify neither a hosted
authority nor live R2 behavior and are not permission to dispatch or install.

## Checkpoint qualification preparation validation

On 2026-10-21, the complete relevant Node 24.19.0 offline suite passed **306/306**,
with zero failures, cancellations or skips: the existing 257 cases, three explicit
cross-runner POST-count regressions, one fixed-release identity regression and 45
isolated qualification cases. Syntax validation passed for 2 YAML files, 14 Bash
scripts, 4 embedded JavaScript scripts and 14 JavaScript modules; all three
deployment blocks remain intact. The Production workflow is byte-identical to
`af06e616de69ce9c2a0d086ba0f9da43db4ff12e`.

The new regressions execute the real workflow preflight, checkpoint and transport
against loopback servers. They count **0 → 1 → 1** Pages POSTs for an unreceived
claim/replacement/third attempt, one only from the original delayed claimant, and
zero after its cancellation. Retained mock bytes stay unchanged. This models the
required retention contract; it does not prove hosted retention or waive the
stricter Owner policy. The exact published commit's automatic offline Actions
result is recorded separately in PR #4; no manual workflow was dispatched.
