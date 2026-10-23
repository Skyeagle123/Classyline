# Size ordering protected update — offline review candidate

Installation, arm changes and release require separate Owner authorization and Astra review.
The consumed V2.1/V2 workflows are unchanged and must never be rerun.

Application SHA: 00b25b282d66818632a2d214e7a52ffbd0f8a1cb; tree: 823de98f6faa7fcb65ea980f771f1c7318561694.
Accepted CI: 40019223658 attempt 1, tested merge 9ccc89b0c5507b5ca98b00328c72f0391522400f with equal tree. It did not run directly on the squash SHA.
Production and rollback: 9974ad77-a81d-40dc-8281-789d0d0c1284, source 0ce95a706a88c63a914c25b142d4fc6878de66d8.

## Installation and evidence gates

The new controller must be installed as a separately reviewed sole direct child of application SHA.
Qualify Package A on its reviewed unmerged branch first. Do not merge A before B: that advances main and invalidates B's direct-child pin. Any base drift requires fresh review, never automatic rebasing or relaxed ancestry.
Controller application checkout remains fixed even when its own installation advances main.
Owner must separately approve an operational main/deployment freeze and one release window.
Required Environment: classyline-production, Owner Skyeagle123, no admin bypass, main only.
Keep CLASSYLINE_RELEASE_ARMED=false until the separately authorized window.

Before arming, independently review Package A's 45 cases, 39 screenshots, summary.json and network.json, exact app identity, zero external forwarding and zero static-server APIs. Synthetic qualification is not live checkout.
The reviewed artifact receipt must be supplied using protected non-secret Environment variables:

- CLASSYLINE_SIZE_CONTROLLER_SHA / CLASSYLINE_SIZE_CONTROLLER_TREE: exact installed controller, reviewed after squash.
- CLASSYLINE_SIZE_BROWSER_RUN_ID / CLASSYLINE_SIZE_BROWSER_HARNESS_SHA / CLASSYLINE_SIZE_BROWSER_HARNESS_TREE.
- CLASSYLINE_SIZE_BROWSER_ARTIFACT_ID / CLASSYLINE_SIZE_BROWSER_ARTIFACT_DIGEST (sha256: plus 64 lowercase hex).
- CLASSYLINE_SIZE_INSTALL_SKIPPED_ID: exact reviewed, never-started installation record.

Missing/mismatching pins block execution. The controller verifies actual run, jobs, steps, artifact digest and exact harness commit; independent artifact content review remains mandatory.
All three V2 dispatches and consumed V2.1 run 40005672896 remain mandatory historical evidence.
Complete baseline histories are pinned: 31 Production and 72 Preview. Only the reviewed installation skip may be added before creation. Unknown history drift blocks and requires new review.
Current source skip e346342b-626e-4d1b-962c-b688f24e2bab and earlier mandatory skips must remain never-started.
Both histories use strict pagination metadata, counts, uniqueness and stable totals. Shared concurrency supplements the Owner/operator freeze; it cannot lock external operators.
Automatic Production remains disabled. Both new publication branches are outside current Preview allowlist.

## Creation bound

Wrangler 4.150.0 CLI original SHA-256: 71da1f9bcf69a9f56c4ff4f68e71315365d03db8ea11207577b47a8e1a0a1064.
Lockfiles/dependencies are unchanged. An isolated workspace transform rejects any different CLI bytes, reduces the deployment loop to one, and wraps the exact create request's Undici dispatcher.
An exclusive mode-0600 journal is fsynced before handing the POST to transport; its directory is fsynced too. It is never removed. Further dispatches, including HTTP 421 fetch retries, fail before transport. Redirects are forbidden and POST is non-idempotent. A bounded timeout applies.
This guarantees at most one create dispatch; it cannot promise server success or exactly-once delivery. Asset uploads retain tool behavior, but deployment creation cannot retry.
CLI is invoked once with a whitelisted environment. Raw tool output is discarded. Timeout/cancellation kills the process group; all subsequent reconciliation is read-only, never replay.
If a runner is destroyed, its local journal is not durable across runners. Run-number/attempt/singleton historical guards prohibit another run. Missing evidence requires manual investigation.

## Preservation, acceptance and disarming

No migrations, data restore, stock change, imports, checkout/recovery/Admin submissions or automatic rollback.
Production D1: 10c800b1-ddf7-427b-8354-9cf8529782b6. R2: classyline-storefront-production-images.
Preview remains isolated. WhatsApp must be exactly 96178719771 in project and deployment. Both Admin secret names/types must exist; masked APIs cannot prove secret bytes and no secret rewrite is performed.
Source/controller/dist/Functions check-output inventories are hashed and reverified before CLI. Deployment-specific bindings, Functions, clean source metadata, runtime, canonical success, unchanged main and exactly one fresh Production record are required. Both full histories are checked afterwards.
accepted-deployment.json records canonical deployment acceptance only, explicitly disarming_verified:false. It is not a RELEASED verdict.
Owner must return the arm to lowercase false promptly after every outcome. The workflow cannot write variables or attest disarming after cancellation.
Independent readback: node ops/size-release/verify-disarmed.mjs using authenticated Owner GH_TOKEN read access. It uses GET only and checks false, reviewer, no bypass and main-only policy. Access denial is UNVERIFIED; fresh authenticated Owner evidence then requires independent review.
Only report RELEASED after disarming evidence and final main/history readback.
Failure, unknown outcomes or drift mean STOP; no rerun, replay or automatic rollback. Rollback to the pinned deployment needs new explicit Owner authorization and must not restore D1/R2.
Do not use live /api/catalog or Admin order GET as a read-only check: they can expire reservations and write data.

## Offline checks

node --test ops/*.test.mjs ops/size-release/*.test.mjs
node ops/validate-offline-workflows.mjs
node --check ops/size-release/create-gate.cjs
npm test; npm run security:check; npm run build; npm run build:functions

Toolchain tests expose pinned patched Wrangler internals only in memory; CLI entry point never runs. All transport is synthetic or loopback. Test timeouts, lost responses, UNKNOWN_ERROR, cancellation, 421, redirects, malformed replies, persistence and competing histories.
Hosted CI, Package A Chromium, Environment readback, installation identity and release authorization remain pending.
