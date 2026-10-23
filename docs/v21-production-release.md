# V2.1 Production activation proposal

Local activation proposal only. No publication, installation, dispatch, environment change or deployment is authorized by this package. The installed controller at main `54c5a3ac9cf11e1aa5aca762220c7267289702e0` still has both unconditional blockers; only this uncommitted proposal removes them. Keep the effective `CLASSYLINE_RELEASE_ARMED=false` throughout preparation. Its current live GitHub value has not been independently read through this task's supported API.

## Exact release and baseline

| Item | Fixed identity |
| --- | --- |
| Installed main / required activation parent | `54c5a3ac9cf11e1aa5aca762220c7267289702e0` |
| Installed disabled controller tree | `b70af086ce0dd3b24a38b7acc228d15fb0f31ffc` |
| Approved application checkout | `0ce95a706a88c63a914c25b142d4fc6878de66d8` |
| Accepted CI head | `9ce02cce69d5774df46c7555543a7f95262c8507`, same application tree |
| Approved application tree | `8266d7f79405fca39374298b4695687b225de4c7` |
| Accepted CI | `39851191294`, attempt 1, SUCCESS, 173 tests |
| Actual PR test checkout | `4f1770c12451aed3495f66e3990e399016249ada`, same application tree |
| Accepted squash main | `0ce95a706a88c63a914c25b142d4fc6878de66d8`, same application tree |
| Previous successful Production/rollback | `9f36717b-a93f-410b-858a-4e9c0e4314fe` |
| Rollback application | `45ac09182cca5cc989fbae1c967c6e7e849e63c3` |
| Cloudflare account/project | `4bfa1a9c849c3da50520f7a4bcccccab` / `classyline2` |
| Production D1 | `DB` -> `10c800b1-ddf7-427b-8354-9cf8529782b6` |
| Production R2 | `PRODUCT_IMAGES` -> `classyline-storefront-production-images` |
| Preview D1/R2 | `ce1d28f3-f20b-485d-9799-619a7fc52ade` / `classyline-storefront-preview-images` |

Authenticated readback during preparation: canonical Production above is deploy/SUCCESS, Functions present, automatic Production builds false, exact isolated Production/Preview bindings, compatibility date 2025-11-13, no flags, standard usage model, both encrypted Admin secret names present. WHATSAPP_NUMBER is absent in both environments. The rollback deployment is retrievable with the correct source and own D1/R2 bindings. Fresh readback on 2026-10-23 reports 26 unique Production history records over three pages (10/10/6), no unskipped active competitor, and the same canonical Production. The additional main-merge Git-push record is skipped; skipped queued/idle entries are not running builds. The known skipped squash record is also present in list responses with the exact stage metadata required by the new guard. Evidence is a point-in-time observation, not a promise of future state. No application endpoint or D1/R2 data API was called.

## Separate release controller

The existing `.github/workflows/classyline-production-manual.yml`, its tests, retained failure log and three historical dispatches are unchanged. Do not rerun it for V2.1.

Installed fixed workflow: `.github/workflows/classyline-production-v21.yml`. No release inputs are accepted. Owner `Skyeagle123` and numeric repository/Owner IDs, main, workflow SHA/ref and attempt 1 are checked by workflow conditions and API verification. The protected environment is `classyline-production`, ID 24902198946. Its Owner approval and no-bypass evidence are required. Environment protection/branch settings still need a fresh pre-installation readback or Owner evidence; YAML alone cannot prove them.

The installed workflow remains disabled by its first-step exit and `RELEASE_IMPLEMENTATION_REVIEWED=false`. This local proposal removes that obsolete step and sets the review constant to true as proposed source for independent review; it does not change installed GitHub code. Both exact lowercase runtime arm checks remain. The proposal could deploy only after separately reviewed publication/installation, explicit Owner release authorization, a true effective arm and protected Owner approval. Keep the real arm false; never dispatch the installed disabled workflow as a test because that consumes run number 1.

The only permitted future V2.1 dispatch is run number 1, attempt 1, with an exact singleton inventory matching the current run. All three previous workflow runs must remain present with exact source/tree, actor, workflow and terminal conclusion: 39629341749/SUCCESS, 39814798811/FAILURE and 39838839195/SUCCESS. The failed original attempt's 13-step inventory and permanent log digest remain mandatory. A run number alone is not authorization. Failure, cancellation or uncertainty consumes the opportunity; no automatic new exception, rerun, workflow rename or history deletion is allowed. Numeric workflow ID for the new file is resolved through its fixed API path after installation and must match the run records; it is not accepted as a user input.

Both real initial/final guards retain accepted application CI, successful CI steps, source/test-merge/squash tree equivalence and parent identities. Accepted CI 39851191294 tested 9ce02cce... / PR merge 4f1770c1..., whose tree exactly equals approved application checkout 0ce95a70.... The proposed deployment commit metadata therefore identifies 0ce95a70..., not the controller or CI head. Both controller-parent guards now require the exact installed baseline `54c5a3ac9cf11e1aa5aca762220c7267289702e0`. The future activation installation must be one reviewed direct-child squash of that baseline; main must remain the executing controller SHA throughout release. No controller SHA or hosted activation CI exists for this uncommitted proposal. If main drifts or an extra installation commit is introduced, stop and independently review a new exact parent pin; never remove the guard, accept multiple parents or reuse the application SHA as controller identity.

The release uses Node 24.19.0, locked `npm ci --ignore-scripts`, Wrangler 4.150.0 and immutable action pins. It records source/controller SHA-256 plus exact static/Functions inventory, rejects overrides and symlinks, and rechecks inputs before upload. One global concurrency group `classyline2-production` covers the old/new workflows. This is not a lock against Cloudflare Git builds, another operator or another repository: maintain an external deployment/main freeze.

Final pre-upload order: complete V2.1 CI/history/approval/original-log verification; recheck main and source; revalidate Production/Preview configuration, canonical Production and rollback source/bindings/runtime; traverse complete deployment history; recheck main/source; save credential-free attempt evidence; invoke the fixed CLI at most once. No history guard is moved after the final Cloudflare validation. Residual read/write race windows cannot be eliminated through independent API reads, hence the operational freeze remains required.

The approved squash source 0ce95a70... already has a Cloudflare Production Git-push record `104abcf0-b542-4ea5-b655-70abab5339ba`. Authenticated readback shows is_skipped=true, trigger github:push/main, clean exact source, latest queued/idle and all five stages idle with null start/end timestamps. The original blanket candidate-history check would falsely treat it as an upload attempt after switching the approved checkout to the squash SHA. The proposal requires exactly one occurrence of that exact never-started record, with project/environment/source/trigger/stage verification, in every complete history snapshot. The common history collector validates it before returning any snapshot, including post-CLI discovery after uncertainty; candidate-history checks also enforce it independently. Missing initial evidence, disappearance, duplicates or changed fields fail closed. A missing record after the CLI prevents acceptance and replay; it cannot retroactively undo the one invocation already made. Any other candidate record, any attempt under the CI-equivalent source 9ce02cce..., altered evidence, duplicate ID or newly started stage is rejected. This is not a retry exception: no prior Wrangler submission for the squash is accepted. The existing V2 dispatch history is untouched.

One CLI invocation is not one HTTP request. Wrangler's accepted internal UNKNOWN_ERROR retries may create multiple deployment records. No wrapper retry is permitted; final acceptance requires exactly one new deployment ID, canonical SUCCESS, exact source, Functions, own D1/R2/WhatsApp binding snapshot, runtime and unchanged rollback/configuration. Discovery is separate from accepted evidence. Uncertain CLI outcomes never become acceptance even if a deployment appears. Read-only reconciliation is bounded and is not another deployment attempt. Raw CLI output is discarded and debug-file logging disabled; no credential value belongs in evidence.

## WhatsApp activation contract — future authorization only

In Cloudflare Dashboard -> Workers & Pages -> classyline2 -> Settings -> Variables and Secrets, select Production and add one **plain-text** variable:

`WHATSAPP_NUMBER=96178719771`

Do not use a leading +, spaces, newline, numeric JSON value or a different destination. This is a public merchant destination, not a credential. Preserve all other variables, Admin secrets, Access policies and D1/R2 bindings. Do not mirror the setting into Preview without separate Preview authorization. The V2.1 release controller requires this exact type/value in both project Production configuration and the resulting deployment's own snapshot.

The application syntax validator intentionally accepts other canonical international numbers too; the fixed V2.1 release contract pins the Owner-approved destination. The controller, not a changed storefront API rule, enforces this release-specific exact value. COD remains independently available with absent/invalid WhatsApp configuration; invalid WhatsApp checkout fails closed. NULL regional fees still reject orders. No merchant fee/catalog approval is implied by this package.

Plan the binding with the separately approved V2.1 deployment; saving a setting alone is not proof that the existing deployment changed. Verify the new deployment-specific binding after deployment. Separate protected Preview qualification must cover mobile/desktop appearance, correct public link and configured checkout choices. Order tests require their own bounded Preview-only authorization. No real WhatsApp message is necessary.

Official references:
- https://developers.cloudflare.com/pages/functions/bindings/#environment-variables
- https://developers.cloudflare.com/pages/functions/wrangler-configuration/#environment-variables

## Installation and release boundaries

1. Astra reviews this exact local activation package, including removal of both source blockers, the new exact parent pin and unchanged runtime authorization gates.
2. After independent approval, separately authorize exact-tree publication to the dedicated branch `phase/storefront-v21-activation` and one draft PR from verified main. Inspect for an existing branch/PR before creating anything. This local proposal adds only that exact branch to both the push trigger and job-condition allowlists in `.github/workflows/v21-release-offline.yml`; the previously admitted `phase/storefront-v21-production-release` branch remains unchanged. The PR trigger stays limited to main and the existing six relevant file paths. Push/PR CI runs all offline release tests and syntax validation with `contents: read`, pinned Actions, no protected environment, no Production credentials and no deployment/manual-dispatch operation. No remote allowlist or branch is changed by this preparation. If automatic CI does not trigger after a later authorized publication, stop; do not dispatch or rename workflows to bypass it.
3. Verify hosted activation CI and exact candidate tree before separately authorized squash installation. Keep the effective arm false, automatic Production builds disabled, Production unchanged, no competitors and current GitHub environment safeguards verified. Confirm no V2.1 workflow run exists. The enabled installation commit must have sole parent 54c5a3ac.... Publication, merge, binding configuration and release dispatch are separate authorization boundaries.
4. Only a new explicit Owner release authorization can open a release window and permit the first V2.1 dispatch/Owner approval. No token creation, arm change or dispatch is part of preparation.
5. Reconcile and inspect all new deployment IDs after any outcome. Return the arm to false through separately authorized operation. Never rerun, replace the CLI or reset history after failure/uncertainty.

## Recovery and rollback

If no new deployment is active, leave the existing successful website alone. If a new release is active but fails acceptance, stop and request separately authorized Pages rollback to `9f36717b-a93f-410b-858a-4e9c0e4314fe`, after confirming its source, success, Functions, runtime and own Production D1/R2 bindings. This workflow intentionally has no automatic rollback.

Rollback changes application deployment selection only. Preserve all D1/R2 records, products, variants, stock, customer orders, images and delivery fees. No database export restoration or down migration. No migration is included in V2.1. Verify the selected rollback deployment's variable snapshot and actual checkout behavior separately; do not assume project variable settings were removed by code rollback. Any API-level emergency containment or settings change needs separate approval. Retain observed/attempt evidence; do not delete runs or failed deployments to retry.

## Offline evidence and limitations

Tests execute the actual local activation proposal: positive paths no longer replace a false review constant. Every API is mocked, the subprocess import is replaced with a fake child boundary, credentials are fake, and native process tests use a local fake npx. No live Wrangler or deployment request executes. Both shell and final JavaScript arm gates independently reject absent/false/True/whitespace values; stable exact true permits one mocked invocation only. A temporary negative test restores the review constant to false and proves fail-closed behavior. No fixture, test flag or mock import exists in the live workflow. The original V2 controller and all existing baseline files outside the documented activation scope remain unchanged.

Mocked tests cannot prove hosted environment configuration, current GitHub variable inheritance, future Cloudflare API availability or future deployment success. No hosted controller CI has been run because this candidate is local/unpublished. The original accepted 173-test application CI is reused; unrelated application suites are not repeated. Hosted activation CI has not run. Read-only configuration observations describe their timestamp only, and do not prove current environment protection rules or release-arm inheritance.

## Pinned-history remediation and regression contract

The reviewed candidate `21cec1dda9e66a0a17f655790a2370d0d36e8825` validated the named skipped record only if present. This local follow-up adds a mandatory singleton evidence check and retains its exact field validation. Default offline fixtures now include the real required record; pagination filler counts preserve the same boundary scenarios. The tests remove the entire record before the first snapshot, for all snapshots, at final pre-upload, during discovery and during final reconciliation. Pre-upload faults must produce zero mocked CLI invocations. A post-upload fault must produce one invocation, no final acceptance and no replay. The requested zero invocation count for a fault first observed after upload is temporally impossible; evidence must state the actual boundary rather than claiming it prevented a past invocation.

Two offline-only mutation controls prove that (1) restoring the original omission behavior admits an absent initial record, and (2) removing common history validation admits transient missing discovery evidence. They mutate temporary script strings and use fake API/process boundaries; they do not modify the executable workflow or invoke Wrangler. All prior malformed/duplicate record, pagination, drift, authorization, binding and uncertain-outcome regressions remain.
