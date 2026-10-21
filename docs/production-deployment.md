# ClassyLine closed Production release — preparation only

**DEPLOYMENT BLOCKED.** The Owner authorized simplifying PR #4, not installing,
merging, dispatching or deploying it. No credential provisioning, Cloudflare
configuration change or D1/R2 operation is authorized by this package.

## Installed controller and activation preparation

The Owner installed the reviewed disabled controller on `main` at
`d1f4b4fc55838e71bf2f4dcb9e0caadfb2a0d240`. Its tree
`c0be2b408ec17dc00004b2993bc9b7bb9066ab14` exactly matches reviewed PR #4.
This installation did not replace the baseline application deployment.

The activation-preparation candidate retains **both** unconditional review stops.
No gate change is necessary to prepare the real compatibility correction: the
authenticated Pages deployment-history endpoint rejects `per_page=100` with
HTTP 400 / error `8000024`, while `per_page=10` succeeds. The controller now
reads ten records per page and refuses histories exceeding ten complete pages
(100 records). It requires all five observed Pages `result_info` fields:
`page`, `per_page`, `count`, `total_count` and `total_pages`, as safe integers.
The page number and size must match the request; count must match both the returned
array and the expected remaining inventory. Positive totals must be mathematically
consistent and stable throughout each traversal. Duplicate IDs, short/truncated
pages, missing metadata and contradictory totals fail closed. Final inventory
must contain exactly the reported number of unique Production deployment IDs.
There is no short-page fallback, retry or partial-history acceptance.

Offline regressions inject invalid metadata and inventory faults into the real
workflow both before upload (zero CLI invocations) and during final reconciliation
(one invocation, no accepted-deployment evidence). They also cover later-page
competitors, page-boundary transitions and the ten-page bound. A release that
increases the inventory beyond 100 records is refused during reconciliation;
it is never permission to retry. Pagination is not a server-side snapshot or
cross-service lock: the existing operator freeze remains mandatory, and an API
response that is fully self-consistent but omits real records cannot be disproved
from pagination metadata alone. The offline CI workflow
also validates the dedicated `phase/production-activation-preparation` branch;
it receives no deployment credentials and cannot deploy.

Authenticated read-only preflight confirmed the fixed baseline deployment and
rollback candidate are successful, automatic Production builds are disabled,
and Production/Preview D1/R2 identities and runtime settings match this document.
The complete 16-entry Production history contained no active non-skipped build.
The installed-controller commit has a skipped Pages record; it is not an active
build or a replacement for the canonical baseline. No configuration was changed.

The GitHub Plugin does not expose the environment rules, secret metadata or
environment variable endpoints. Therefore the actual reviewer, self-review,
administrator-bypass and main-only branch settings, token-secret presence and
release-arm value remain **unverified** by this preparation package. Do not infer
them from workflow YAML or the environment name. Their saved state must be
verified before any later authorized enablement or release. Do not dispatch this
blocked workflow merely to test the environment: any attempted dispatch consumes
the one approved workflow execution operationally.

## Fixed release identities

| Item | Expected identity |
| --- | --- |
| Repository / numeric ID | `Skyeagle123/Classyline` / `1096008352` |
| Owner / numeric ID | `Skyeagle123` / `125151458` |
| Application SHA | `b64e078ee6ecfc5f4e124fe6d68129164f521b8a` |
| Application tree | `123889f9fd27b3f0b2138ea057efa2e762a231b1` |
| Approved application CI | `39297195087`, attempt 1, successful push validation |
| Production baseline SHA | `393ff88e76dcca226de7f83e148554699e85ca01` |
| Production baseline deployment | `5824179f-af77-4a18-9a23-ab22019e8ccc` |
| Cloudflare account | `4bfa1a9c849c3da50520f7a4bcccccab` |
| Pages project / ID | `classyline2` / `25d5c0d3-f248-4d69-b5a3-feacfcb66dec` |
| Production D1 / binding | `classyline-storefront-production-d1` / `DB` |
| Production D1 UUID | `10c800b1-ddf7-427b-8354-9cf8529782b6` |
| Production R2 / binding | `classyline-storefront-production-images` / `PRODUCT_IMAGES` |
| Preview D1 UUID | `ce1d28f3-f20b-485d-9799-619a7fc52ade` |
| Preview R2 | `classyline-storefront-preview-images` |
| Runtime | Compatibility date `2025-11-13`, empty flags, Default placement |
| Toolchain | Node `24.19.0`, Wrangler `4.150.0` |

The workflow checks out its own reviewed controller commit separately from the
fixed application. No application source, dependency lock or migration changes
are part of PR #4. The installed controller commit will differ from the legacy
application baseline; `main` must remain at that reviewed dispatch commit during
execution, while Cloudflare must still serve the baseline before deployment.

## Owner-approved policy change

For this **closed, code-only release only**, the Owner replaced the former strict
single-HTTP-POST and unreceived-checkpoint-consumption requirements with:

1. Exactly one Owner-approved workflow execution and one Wrangler **deployment**
   CLI invocation.
2. Acceptance of Wrangler 4.150.0's internal retries on `UNKNOWN_ERROR`, which can
   issue multiple deployment-creation POSTs and potentially create multiple
   deployments. The version's deployment loop permits three attempts.
3. No workflow rerun, replacement deployment invocation or wrapper retry after an
   uncertain result. Read-only history reconciliation is the only automatic
   response to uncertainty.
4. Fail-closed acceptance when unexpected or multiple new deployments appear.
   Rollback requires its separate Owner authorization.

**One CLI invocation does not mean one HTTP POST, one deployment, or exactly-once
server processing.** An exit code of zero alone does not establish acceptance.
Offline Functions compilation is a build operation, not another deployment
invocation. The former custom transport, SigV4 checkpoint and qualification
components are retired from the active release path; their evidence remains in
Git history. No hosted checkpoint test or new checkpoint resource is required for
this release path.

Version-specific and official references:

- [Wrangler 4.150.0 deployment retry loop](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/api/pages/deploy.ts)
- [Versioned retry constants](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/pages/constants.ts)
- [Versioned CLI status handling](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.150.0/packages/wrangler/src/pages/deploy.ts)
- [Pages Direct Upload through CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Existing Git projects and Functions upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## Guarded workflow

`.github/workflows/classyline-production-manual.yml` remains disabled by an
unconditional first-step `exit 1` and a second literal
`RELEASE_IMPLEMENTATION_REVIEWED = false` check. Passing tests, adding secrets or
arming an environment cannot enable deployment. Removing these review stops
requires a separately reviewed and authorized source change.

The guarded path retains:

- Manual `workflow_dispatch` only, no release inputs, exact repository/Owner names
  and numeric IDs, `main` ref, initial and triggering actors, and run attempt 1.
- Protected `classyline-production` environment, release arm absent/false by
  default, `contents: read` / `actions: read`, full-commit pinned supporting Actions,
  and concurrency group `classyline2-production` with no cancellation in progress.
- Approved CI identity and successful job checks, exact application SHA/tree,
  clean checkout, locked installation, exact Wrangler version and rejection of
  local deployment/environment overrides. Static assets and Pages Functions are
  built before credentials enter the deployment step.
- A first-dispatch refusal check covering the retained history of this fixed
  workflow. Only the current run ID and controller commit may appear. A new
  controller commit must not reset the release attempt.
- Exact project/account, disabled automatic Production Git builds, baseline and
  successful rollback source/status, Production and Preview D1/R2 identities,
  runtime date/flags/placement and encrypted Admin-secret presence.
- Bounded Production history reads rejecting queued, running and unknown states,
  plus any earlier Production attempt for the fixed application SHA. Main,
  canonical baseline, rollback, configuration, source/artifact and history checks
  are repeated immediately before the single deployment invocation.
- Independent post-deployment reads requiring one new deployment, exact SHA,
  successful terminal deploy stage, canonical Production identity, Functions,
  clean commit metadata, URL and runtime. Exact D1/R2 maps are validated directly
  on the deployment and final canonical snapshot, not inferred from project defaults.
- Final complete history reconciliation. Missing, duplicate or additional IDs,
  including completed/failed/skipped competitors, prevent acceptance. Canonical
  identity and configuration are reread after reconciliation.

GitHub concurrency and sequential API reads are not an account-wide atomic lock.
An Owner-controlled freeze of main updates and all other deployment operators is
still mandatory throughout the release window. Final history reconciliation is
point-in-time evidence; it cannot rule out a delayed Cloudflare operation appearing
later. Unexpected later deployments require read-only investigation and separately
authorized recovery, never another deployment invocation.

The fixed deployment command, from the approved application root, is:

```sh
npx --no-install wrangler pages deploy dist \
  --project-name classyline2 \
  --branch main \
  --commit-hash b64e078ee6ecfc5f4e124fe6d68129164f521b8a \
  --commit-dirty=false
```

It uses the fixed account, protected environment token and
`WRANGLER_SEND_METRICS=false`. The repository root includes `functions/`; running
from an assets-only directory would omit the intended Functions compilation.
The wrapper invokes this deployment command once, regardless of its outcome.

## Provenance and credentials

Record the application SHA/tree, controller SHA, run ID/attempt, Node/Wrangler
versions, approved CI and SHA-256 hashes of tracked source, static output and the
Functions validation build. Recheck those inputs before invoking Wrangler.
Require exact build-file inventory, size and hash equality, rejecting added,
omitted or duplicate records, symlinks and local deployment overrides.
Wrangler performs its supported upload/Functions packaging. Validation-build
hashes establish reviewed inputs; they are **not** a claim that a custom frozen
multipart body was transmitted or that a separate compiler run is byte-identical.

The Cloudflare token is exposed only to the deployment/verification step, never
installation, build or test steps. Checkout credentials are not persisted. Do
not pass the GitHub token to the Wrangler subprocess. Do not print or retain raw
CLI output, API responses, signed requests, environment dumps, debug logs, tokens
or customer records. Persist only allowlisted credential-free evidence.

Observed deployment evidence is not acceptance. Unknown/nonzero CLI outcomes,
missing or multiple deployments, failed final checks or partial evidence must not
create `accepted-deployment.json`. Matching source observed after an uncertain
outcome requires manual review; it is not permission to invoke Wrangler again.
Evidence artifacts are retained for 14 days; preserve them privately before
expiry. Missing artifact retention is an evidence gap requiring manual review.

The Pages deployment token needs **Account → Cloudflare Pages → Edit**, limited
to the intended account and a short expiration. That permission is account-wide,
not a verified project-only boundary; the reviewed workflow fixes the project.
Do not add D1/R2 data-write, Access-edit, DNS, billing or token-administration
permissions. Provision the token privately in GitHub environment secret
`CLOUDFLARE_API_TOKEN`, never in chat, tool output, a repository secret or a file.
Revoke it in Cloudflare after the release attempt and remove the environment
secret. Deleting the GitHub secret alone does not revoke the Cloudflare token.

## Safe installation and release sequence

Each mutation below requires separate Owner authorization; none is performed by
this preparation package.

1. Independently review the exact simplified PR SHA/tree and its offline CI. Keep
   both unconditional review stops until a separately reviewed enablement change.
2. Freeze main updates, merges and other deployment operators. Separately disable
   automatic Production Git builds, read back the setting, drain pending builds
   and verify the accepted baseline. Actions gates cannot stop Cloudflare's
   separate Git-triggered build when a workflow-only change reaches main.
3. Configure `classyline-production` with an Owner-only required reviewer,
   `main`-only deployment branch and no administrator bypass. If the Owner also
   dispatches, do not configure self-review prevention that makes approval
   impossible. This is explicit single-Owner approval, not two-person approval.
4. Install only the reviewed controller changes on main under separate approval.
   Use `[CF-Pages-Skip]` as an additional installation guard, never as a substitute
   for disabled automatic builds. Verify no deployment started and record the
   installed workflow commit. Keep automatic Production Git builds disabled while
   main's application is older than the manually deployed candidate.
5. Keep `CLASSYLINE_RELEASE_ARMED` absent/false until the release window is
   separately approved. Read back environment protections and provide the token
   privately. The environment's name in YAML does not prove protection exists.
6. Reverify Production D1 integrity/recovery, empty catalog/variants/orders, all
   nine delivery fees NULL, private R2 and intended Access coverage using existing
   authorized read-only channels. These data/Access gates are not implemented by
   broadening the Pages deployment token.
7. After independent review, authorized enablement and separate release approval,
   arm the window, dispatch once from the installed main commit and approve that
   exact run. No product, inventory, delivery-fee or customer checkout activation
   is implied. Sequential Admin uploads and resource-error monitoring remain
   closed-launch operating conditions.
8. Inspect final evidence and static/Access smoke results without application
   login or mutating endpoints. Disarm, revoke the token, remove its environment
   secret and preserve audit evidence, including any uncertainty or extra
   deployments. An empty catalog and NULL delivery fees are not a complete
   API-level checkout kill switch.

## Failure and rollback

Any attempted dispatch, including an unarmed or preflight-failed run, consumes the
single approved workflow execution operationally. Do not rerun, redispatch,
replace the runner, rename the workflow or delete run history to bypass the gate.
Retained GitHub history is an administrative refusal mechanism, not a cryptographic
or atomic cross-service single-use guarantee. Privileged history deletion or
concurrent external deployers are outside that guarantee and prohibited by the
release freeze.

After timeout, cancellation, abnormal exit, unknown status or multiple new
deployments: stop. Inspect canonical identity and history read-only. Do not
interpret absent or matching deployment evidence as permission to retry. Internal
Wrangler retries are accepted within the original invocation; the wrapper never
starts another deployment invocation.

Emergency rollback is Pages code rollback only, separately authorized, to
`5824179f-af77-4a18-9a23-ab22019e8ccc`, whose exact baseline SHA and successful
terminal status must still be verified. Preserve Production D1 and R2. Never
restore a database snapshot, run down-migrations, reset inventory or delete
objects as part of code rollback. The legacy baseline does not contain the newer
checkout backend; rollback is containment, not continuity of that backend. Any
customer records must be preserved and reconciled under separate authorization.

## Offline validation boundary

The credential-free PR4 validation workflow runs syntax checks and the relevant
controller tests. Extracted workflow scripts execute only against mocked APIs and
an intercepted CLI boundary. Test-only enablement does not change the committed
hard stops. Cases must cover one deployment invocation, uncertainty without replay,
multiple deployments, drift, binding mismatch, rollback failure, unauthorized
identity, absent arm and credential-safe evidence.

Application CI `39297195087` remains accepted evidence for the unchanged
application. Do not rerun unrelated application acceptance suites merely for this
controller simplification. Verify the exact new PR CI result independently; this
document does not claim a test count or hosted result before it exists. Offline
success is readiness for independent review, never installation or deployment
permission.
