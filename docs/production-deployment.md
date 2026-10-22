# ClassyLine V2 Production release preparation

> Recovery update: the installed controller failed before checkout in run
> `39814798811` because its arm was `True`. The current arm was independently
> read back as exact `false`. For the narrowly scoped local recovery package,
> see [v2-release-recovery.md](v2-release-recovery.md). The original preparation
> evidence below is historical; its two-run dispatch fence is superseded only by
> the reviewed three-run recovery predicate, not by a general retry permission.

**Draft preparation only: no merge, workflow dispatch, deployment, environment
change, credential operation or D1/R2 write is authorized by this package.**

The Owner reports `CLASSYLINE_RELEASE_ARMED=true`. The installed workflow and this
candidate have no unconditional source blocker. Keep this candidate off main
until an independently reviewed installation is authorized AND the effective arm
is verified disabled. A draft PR is a review boundary, not an execution lock.

## Fixed source, CI and rollback identities

| Role | Exact identity |
| --- | --- |
| Starting main / squash merge of PR #8 | `35f0f8b69b168d363dba15646c220d64e5606454` |
| Accepted application source to check out and deploy | `45ac09182cca5cc989fbae1c967c6e7e849e63c3` |
| Accepted application tree | `6457416153e4aba803424d13a75db7d9e418adbc` |
| Accepted application CI | `39725797281`, attempt 1, SUCCESS, 150/150 |
| CI checkout commit from job logs | `3a18df71e4f0e7808389f739b0c7081b7f89e464` |
| Prior successful release dispatch | `39629341749`, attempt 1, controller `492fb4a963f9a0c9a8a24cf783a47cbe44ae7586` |
| Current Production application / rollback source | `b64e078ee6ecfc5f4e124fe6d68129164f521b8a` |
| Current Production / rollback deployment | `05c1e186-a17a-4a37-b1e1-c3be59cffd11` |
| Repository / ID | `Skyeagle123/Classyline` / `1096008352` |
| Owner / ID | `Skyeagle123` / `125151458` |
| Cloudflare account | `4bfa1a9c849c3da50520f7a4bcccccab` |
| Pages project / ID | `classyline2` / `25d5c0d3-f248-4d69-b5a3-feacfcb66dec` |
| Production D1 / DB | `classyline-storefront-production-d1` / `10c800b1-ddf7-427b-8354-9cf8529782b6` |
| Production R2 / PRODUCT_IMAGES | `classyline-storefront-production-images` |
| Preview D1 / DB | `classyline-storefront-staging-d1` / `ce1d28f3-f20b-485d-9799-619a7fc52ade` |
| Preview R2 / PRODUCT_IMAGES | `classyline-storefront-preview-images` |
| Accepted protected V2 Preview | `edd284ff-88f9-4da4-855c-3b57afe0e65b` |
| Runtime | Compatibility date `2025-11-13`, empty flags, Default placement |
| Toolchain | Node `24.19.0`, Wrangler `4.150.0` |

The accepted source, CI checkout and squash merge are three different commits
with the **same tree**. CI is a `pull_request` run on `feat/storefront-v2-option2`,
not the earlier application's push run. The controller verifies the fixed CI run,
its sole successful job and job source/attempt, all three commit trees, the tested
merge parents and the squash parent. GitHub logs establish the fixed CI checkout;
API tree validation establishes byte identity without relabelling the squash SHA
as the application SHA. The app checkout remains the accepted `45ac091...` commit.
The separately checked-out controller is the future dispatch commit, not the app.

V2 changes no backend, dependencies or migrations relative to the deployed
`b64e078...` application. Production migrations 0001-0003 remain in place; no
migration, initialization, product import or inventory rewrite is part of release.
Existing products, images, inventory, sessions and orders must be preserved.
Current live record counts were not queried by this preparation.

## Authenticated read-only preparation evidence

On 22 October 2026, GitHub confirmed the exact starting main and accepted source
share tree `645741...`; PR #8 is squash-merged. Approved CI is successful at the
accepted source and attempt. Cloudflare readback confirmed the canonical
Production and rollback deployment above are terminal SUCCESS, Functions are
present, automatic Production builds are disabled, and Production/Preview D1/R2
bindings and compatibility settings match the table.

All 21 Production history records were retrieved across three complete pages.
Five records showed queued/idle stage placeholders, including the PR #8 squash
commit, but individual deployment readbacks confirmed `is_skipped=true` for all
five. There was no active non-skipped Production deployment. Recheck these
point-in-time facts before installation and again in the release window.

The only retained manual dispatch was the prior successful release `39629341749`.
The V2 refusal fence permits exactly that fixed historical run PLUS the current
new run, with exactly two unique IDs and complete reported inventory. It verifies
the previous run's controller SHA, workflow path, main branch, event, attempt,
Owner and successful completion; the new run must match current run ID/controller
SHA. Missing, altered, duplicated, truncated or additional history fails closed.
Changing the controller commit cannot reset a failed or uncertain V2 dispatch.
Do not delete history, rename the workflow or change the allowlist to bypass it.

## Release arm and protected environment

The Owner's `true` arm report is evidence of an installation hazard, not permission
to dispatch. The GitHub Plugin rejects the environment and repository-variable
read endpoints; saved protections, secret presence and effective inherited arm
were not independently API-verified in this preparation. Earlier Owner evidence
identifies the `classyline-production` environment, reviewer `Skyeagle123`, allowed
self-review, administrator bypass disabled, main-only deployment branch and the
`CLOUDFLARE_API_TOKEN` environment secret name. Do not inspect secret values.

Before any separately authorized merge, the Owner or an authorized supported
GitHub interface must:

1. Inspect repository Settings -> Secrets and variables -> Actions -> Variables
   and Settings -> Environments -> classyline-production -> Environment variables.
2. Set the environment arm to exact `false` (or remove every applicable true arm),
   read back the saved value, and verify repository inheritance cannot enable it.
   An empty environment variable list alone is insufficient. This is a personal
   User-owned repository; organization inheritance is not applicable unless the
   repository is transferred, which would invalidate fixed identity controls.
3. Read back required reviewer, main-only branch protection, no admin bypass and
   the environment secret NAME. Capture only credential-free evidence.

Configuration changes need separate Owner authorization and are not performed
here. There is no new arm variable in this branch. Both runtime checks still
require exact string `true` and reject absent, empty, false and malformed values.

## Preserved release safeguards

- Manual-only dispatch, fixed repository/Owner numeric IDs, main-only ref, initial
  and triggering Owner identity, attempt 1 and protected environment approval.
- Minimal contents/actions read permissions; immutable full-SHA supporting Actions;
  checkout credentials not persisted; concurrency group `classyline2-production`
  with no cancellation of an in-progress run.
- Exact app SHA/tree, clean source, locked `npm ci --ignore-scripts`, pinned
  Wrangler 4.150.0 and rejection of local deployment overrides. Static and
  Functions builds run before the Cloudflare token enters the deployment step.
- Credential-free SHA-256 inventory of tracked app/controller source, static output
  and Functions validation build. Evidence separately records the accepted source,
  its tree, CI checkout, squash merge and actual controller commit. Exact inventory,
  sizes and hashes are reverified immediately before upload.
- Canonical baseline and successful rollback identity, disabled automatic builds,
  Production and Preview bindings, runtime and encrypted Admin-secret presence.
- Complete Pages history with all five observed `result_info` fields required as
  safe integers; `per_page=10`, maximum ten pages/100 records, stable mathematically
  consistent totals, exact page counts and unique IDs. No short-page fallback.
- Competing/unknown non-skipped deployments and any existing V2 Production attempt
  refused. Main, baseline, rollback, configuration, history and inputs rechecked
  immediately before the single CLI invocation.
- Independent final acceptance requires exactly one new deployment, exact source,
  canonical terminal SUCCESS, Functions, runtime, clean metadata and exact deployed
  D1/R2 maps, followed by complete history and canonical revalidation. Additional
  completed, failed or skipped deployments prevent acceptance too.

An external freeze of main updates and all deployment operators remains mandatory.
GitHub concurrency and sequential API reads are not a Cloudflare-wide atomic lock.
A later delayed deployment requires investigation, never another invocation.

## One invocation and uncertainty policy

The existing Owner-approved Wrangler policy remains: one approved workflow
execution and one deployment CLI invocation, no wrapper retry or rerun after any
uncertain outcome. Wrangler 4.150.0's internal UNKNOWN_ERROR retries are accepted;
**one invocation is not one HTTP POST or exactly-once server processing**.
Read-only history reconciliation follows every outcome. Observation is not
acceptance: a nonzero/unknown CLI result never creates final acceptance evidence,
even when a matching deployment appears. Rollback needs separate authorization.

The future deployment command is fixed and is NOT run by this package:

```sh
npx --no-install wrangler pages deploy dist \
  --project-name classyline2 \
  --branch main \
  --commit-hash 45ac09182cca5cc989fbae1c967c6e7e849e63c3 \
  --commit-dirty=false
```

Run from the exact app root with `functions/` present. The Functions validation
build records reviewed inputs; it does not claim separate Wrangler packaging runs
produce identical multipart bytes. Tokens enter only the release/verification step
and the fixed child environment. No raw CLI output, API bodies, credentials or
customer records may enter logs or artifacts. Allowlisted evidence retention is
14 days; preserve it privately before expiry.

## Ordered installation and release boundary

1. Independently review this draft PR's exact SHA/tree and hosted offline CI.
2. Under separate authorization, disarm and read back the effective arm and saved
   environment protections. Freeze deployment operators and verify automatic
   Production builds remain disabled, with no active non-skipped deployment.
3. Separately authorize merging only the reviewed controller changes. Use
   `[CF-Pages-Skip]` as an additional guard, not a substitute for disabled builds.
   Verify canonical Production remains `05c1e186...` and record installed SHA.
4. Before release approval, verify current D1 integrity/recovery and R2 privacy,
   intended Access coverage and retention of existing products/inventory/orders
   using separately authorized read-only channels. Do not reset data, fees or
   catalog to satisfy assumptions from the original empty-catalog launch.
5. Separately authorize one code-only V2 release; arm only that window, dispatch
   once from the reviewed installed controller and approve that exact run. No
   new checkout, product, inventory or delivery-fee activation is implied.
6. Verify deployment evidence and bounded static/Access smoke checks. Preserve
   existing order/reservation behavior; catalog GET can expire reservations, so
   do not treat it as a side-effect-free smoke check. Disarm after the attempt.
   Credential revocation/removal requires its own authorized secure procedure.

The Pages token scope remains account Cloudflare Pages Edit for the fixed account;
it is not a project-only permission. Do not add D1/R2 data-write, Access, DNS,
billing or token-administration permissions. No token/secret is created, read or
changed in this preparation. Sequential Admin image uploads, no blind retry and
resource-error monitoring remain operational safeguards; peak CPU/memory are not
measured by offline tests. An empty catalog/NULL fees are not an API kill switch.

## Rollback and recovery

If acceptance fails, stop and inspect canonical identity and complete history.
Do not rerun, redispatch or replace the CLI invocation. A separately authorized
Pages code rollback may target **only** `05c1e186-a17a-4a37-b1e1-c3be59cffd11`,
reverified as terminal SUCCESS with source `b64e078...`. It retains the same backend
schema and preserves all Production D1/R2/customer records. Never restore an old
snapshot, run down-migrations, reset stock, delete images or replay customer orders
as part of code rollback. No automatic rollback is added by this PR.

## Targeted validation

The credential-free offline workflow admits `phase/storefront-v2-release-recovery`
in both its push allowlist and job predicate, preserving the five existing
branches; no dispatch is needed and no environment/token is used.
It executes actual extracted workflow scripts with API/CLI boundaries mocked,
including uncertainty, drift, binding, rollback, pagination and authorization
faults. Native tests use a fake local CLI for process-group cancellation and
single-invocation evidence. New tests reject incorrect source/CI/squash identities
and any history outside the exact successful historical run, failed pre-upload
V2 run and single current recovery dispatch. The final recovery guard completes
before the last Cloudflare baseline/configuration/history revalidation. Drift
injected during the guard must be rejected before any mocked CLI invocation.

The imported application CI workflow uses its accepted `@v4` references and is
unchanged. Syntax validation now covers all three workflows, locks that accepted
application CI file to its exact SHA-256, and continues requiring immutable full
SHA pins on release and offline-controller Actions. This does not change application
CI or weaken controller Action pins. Accepted application/Preview suites are not
rerun locally. Hosted PR-triggered application CI may run automatically.
