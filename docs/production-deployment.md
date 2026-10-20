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
`NO_RETRY_TRANSPORT_VERIFIED = false`. A third boundary refuses the missing durable
remote checkpoint. Inputs, environment variables or secrets cannot enable them.

Local exclusive/fsynced attempt consumption survives demonstrated process kills,
including a kill after the creation POST reached a mock server. It does not prove
persistence after destruction of an ephemeral Actions runner. Deployment remains
BLOCKED pending a reviewed cross-runner checkpoint implementation, independent
Astra acceptance and separate installation/activation authorization.

See [the implemented transport and proof boundaries](pages-direct-upload-design.md).
No hosted upload or deployment test has been performed by this package.

## Implemented acceptance controls (inactive behind both blocks)

- Manual dispatch only; no release inputs; exact repository/Owner names and IDs,
  main ref, initial actor and triggering actor checks; run attempt must be 1.
- Reviewed immutable official action commits, Node 24.19.0, locked dependencies,
  explicit Wrangler version check, exact application SHA/tree, clean checkout,
  and no root Wrangler or local environment overrides.
- Approved CI run and job identity/success checks; tests, security check, audit,
  static build, Functions build and `/api/*` routing validation.
- A second first-dispatch check scoped to the **reviewed workflow commit** using
  `head_sha`: exactly one dispatch and the current run ID must match.
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
Pages permission is account-wide, not a verified project-only boundary. Provision
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

The `head_sha` dispatch gate permits one dispatch per reviewed control commit.
Any attempted dispatch, including an unarmed or preflight-failed run, is retained
in Actions history. A repeat dispatch of that same control commit must fail. A
new reviewed control commit and explicit Owner approval are required to reset
this gate; never delete run history to make a check pass. Reruns are always denied.

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

The corrected workflow suite has 82 cases, including the two independent-review
counterexamples (incorrect deployment bindings despite correct project settings;
a second completed deployment appearing only in final history). It also checks
missing/extra/unverifiable deployment bindings, final canonical drift and that no
failure produces final acceptance evidence. The separate 26-case Direct Upload
design suite tests abstract operation budgets and uncertainty handling with
fake I/O only. It does not test an HTTP client, multipart/hash compatibility or
real Cloudflare behavior. Passing these suites is not deployment authorization.

The manual-only workflow has not been dispatched. Application CI `39297195087`
is accepted evidence for the unchanged application; it is not CI validation of
this remediation commit. New hosted workflow execution remains unverified and
unauthorized. Review readiness does not mean deployment readiness.

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
