# V2.1 Production release preparation

Preparation only. No publication, installation, dispatch, environment change or deployment is authorized by this package. Keep the effective `CLASSYLINE_RELEASE_ARMED=false` throughout preparation. Its current live GitHub value has not been independently read through this task's supported API.

## Exact release and baseline

| Item | Fixed identity |
| --- | --- |
| Current main before controller installation | `0ce95a706a88c63a914c25b142d4fc6878de66d8` |
| Approved application checkout | `9ce02cce69d5774df46c7555543a7f95262c8507` |
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

Authenticated readback during preparation: canonical Production above is deploy/SUCCESS, Functions present, automatic Production builds false, exact isolated Production/Preview bindings, compatibility date 2025-11-13, no flags, standard usage model, both encrypted Admin secret names present. WHATSAPP_NUMBER is absent in both environments. The rollback deployment is retrievable with the correct source and own D1/R2 bindings. History inventory is 25 deployments over three pages (10/10/5). Eight Git-push entries show queued/idle but are explicitly is_skipped=true; none is treated as a running build. Evidence is a point-in-time observation, not a promise of future state. No application endpoint or D1/R2 data API was called.

## Separate release controller

The existing `.github/workflows/classyline-production-manual.yml`, its tests, retained failure log and three historical dispatches are unchanged. Do not rerun it for V2.1.

New fixed workflow: `.github/workflows/classyline-production-v21.yml`. No release inputs are accepted. Owner `Skyeagle123` and numeric repository/Owner IDs, main, workflow SHA/ref and attempt 1 are checked by workflow conditions and API verification. The protected environment is `classyline-production`, ID 24902198946. Its Owner approval and no-bypass evidence are required. Environment protection/branch settings still need a fresh pre-installation readback or Owner evidence; YAML alone cannot prove them.

Two unconditional blockers remain: a first step exits 1, and the final script has `RELEASE_IMPLEMENTATION_REVIEWED=false` before any Cloudflare request or CLI invocation. Even an incorrectly inherited true arm cannot enable this preparation candidate. Future enablement requires separate independent review and authorization; never dispatch the disabled preparation workflow as a test because that consumes its run number.

The only permitted future V2.1 dispatch is run number 1, attempt 1, with an exact singleton inventory matching the current run. All three previous workflow runs must remain present with exact source/tree, actor, workflow and terminal conclusion: 39629341749/SUCCESS, 39814798811/FAILURE and 39838839195/SUCCESS. The failed original attempt's 13-step inventory and permanent log digest remain mandatory. A run number alone is not authorization. Failure, cancellation or uncertainty consumes the opportunity; no automatic new exception, rerun, workflow rename or history deletion is allowed. Numeric workflow ID for the new file is resolved through its fixed API path after installation and must match the run records; it is not accepted as a user input.

Both real initial/final guards check accepted application CI, all required successful CI steps, source/test-merge/squash tree equivalence and parent identities. The installation controller must be a reviewed direct-child squash commit of current main `0ce95a...`; main must remain that controller SHA through the release. The candidate does not yet have a published controller SHA or hosted controller CI. Those identities must be recorded after separate publication approval. Do not install this disabled candidate and later expect arbitrary follow-up main commits to pass the pinned parent check. Prefer reviewing final enablement on the same preparation branch before the single squash installation; if main changes, explicitly review a new controller baseline rather than relaxing its parent check.

The release uses Node 24.19.0, locked `npm ci --ignore-scripts`, Wrangler 4.150.0 and immutable action pins. It records source/controller SHA-256 plus exact static/Functions inventory, rejects overrides and symlinks, and rechecks inputs before upload. One global concurrency group `classyline2-production` covers the old/new workflows. This is not a lock against Cloudflare Git builds, another operator or another repository: maintain an external deployment/main freeze.

Final pre-upload order: complete V2.1 CI/history/approval/original-log verification; recheck main and source; revalidate Production/Preview configuration, canonical Production and rollback source/bindings/runtime; traverse complete deployment history; recheck main/source; save credential-free attempt evidence; invoke the fixed CLI at most once. No history guard is moved after the final Cloudflare validation. Residual read/write race windows cannot be eliminated through independent API reads, hence the operational freeze remains required.

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

1. Astra reviews this exact local package and disabled workflow.
2. Separately authorize publication to `phase/storefront-v21-production-release` and one draft PR. The new credential-free offline CI is automatic for that branch/PR and runs real controller tests with network/process boundaries mocked. It has no protected environment, secrets or dispatch operation. Do not publish now.
3. Verify hosted controller CI and review the exact final enablement delta before installation. Keep the arm false, automatic Production builds disabled, Production unchanged, no competitors and exact GitHub environment safeguards. Confirm no V2.1 workflow run exists. The final enabled installation commit must have the pinned sole parent.
4. Only a new explicit Owner release authorization can open a release window and permit the first V2.1 dispatch/Owner approval. No token creation, arm change or dispatch is part of preparation.
5. Reconcile and inspect all new deployment IDs after any outcome. Return the arm to false through separately authorized operation. Never rerun, replace the CLI or reset history after failure/uncertainty.

## Recovery and rollback

If no new deployment is active, leave the existing successful website alone. If a new release is active but fails acceptance, stop and request separately authorized Pages rollback to `9f36717b-a93f-410b-858a-4e9c0e4314fe`, after confirming its source, success, Functions, runtime and own Production D1/R2 bindings. This workflow intentionally has no automatic rollback.

Rollback changes application deployment selection only. Preserve all D1/R2 records, products, variants, stock, customer orders, images and delivery fees. No database export restoration or down migration. No migration is included in V2.1. Verify the selected rollback deployment's variable snapshot and actual checkout behavior separately; do not assume project variable settings were removed by code rollback. Any API-level emergency containment or settings change needs separate approval. Retain observed/attempt evidence; do not delete runs or failed deployments to retry.

## Offline evidence and limitations

Tests execute the actual embedded initial guard and final release logic with GET APIs and process boundaries mocked. Positive-path tests replace exactly the false review constant **only in temporary test source** to model a future reviewed activation; the real saved workflow remains false and its first-step unconditional exit remains. Separate tests execute both unchanged blockers. No fixture, test flag or import is available in the live workflow.

Mocked tests cannot prove hosted environment configuration, current GitHub variable inheritance, future Cloudflare API availability or future deployment success. No hosted controller CI has been run because this candidate is local/unpublished. The original accepted 173-test application CI is reused; unrelated application suites are not repeated.
