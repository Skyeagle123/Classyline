# Single-use size recovery controller — offline review candidate

No installation or release is authorized by this package. Keep the arm false.
The Production workflow's source-review gate remains false pending independent
Astra review; changing that gate requires a separately reviewed exact candidate.

## Provenance

The direct-child installation parent is exactly
7d978f3ab539efb89a4cd5a2c44abe87775c4451, tree
75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8, sole parent
e08316796a14476712bcf0f79f6606c62c7bc294. This is the source actually built and
labelled in deployment metadata. The accepted business application remains
00b25b282d66818632a2d214e7a52ffbd0f8a1cb, tree
823de98f6faa7fcb65ea980f771f1c7318561694. src/, functions/, tests/ and migrations/
are byte-identical between those two commits. No old-source checkout is silently
overlaid with a new toolchain. The secure source pins Node 24.22.1, built-in and
external Undici 7.30.1, all package integrity hashes and the reviewed prepared
Wrangler CLI ccc8700cb7712503437d1a662e266b10399cdcdeea3850a61d8706f29622f2bd.

The new workflow is classyline-production-size-recovery.yml. The consumed
size-update, V2.1 and V2 workflows remain unchanged. Run 40070135911 and its live
job log must match the immutable failed-release receipt on initial and final
GitHub verification. No archive fallback permits inaccessible live evidence.
All five historical manual dispatches plus exactly one new run must exist.
Run number and attempt must both be 1. Owner, repository, main, workflow identity,
sole-parent installation, accepted historical application CI, secure PR #19 CI,
protected Owner approval and no bypass remain mandatory.

## History authorization

Original pinned Production and Preview history is unchanged. reviewed-skips.json
contains seven independently read supplementary identities: two Production
installation records (ceba0a45… and 8744f0c2…) and five Preview publication records,
including b2e4b50a… and d541923f…. Current inventory is 33 Production / 77 Preview.
These counts are observations, not a hard-coded release allowance.

After final publication and installation, the Owner must explicitly review all
new skipped records. Prepare compact UTF-8 JSON with exactly:

    {"version":2,"repository":"Skyeagle123/Classyline","controller_sha":"<installed SHA>","controller_tree":"<installed tree>","records":[...]}

Each record has exactly id, project_id, project_name, environment, branch, commit,
created_on. All seven mandatory identities must match reviewed-skips.json.
Include one future Production installation skip, bound to the exact installed
SHA and main branch. Additional Preview records are allowed only for the exact
phase/storefront-size-release-recovery branch, explicitly listed with exact
UUID/source/timestamp. A new browser-qualification Preview record is also
admitted only on phase/storefront-size-browser-qualification, with commit exactly
equal to protected BROWSER_HARNESS_SHA and an additional harness_tree field exactly
equal to protected BROWSER_HARNESS_TREE. The GitHub browser guard independently
verifies that commit/tree. Both protected browser identities are frozen during
history verification. Existing mandatory records retain their original schema.
No wildcard allowance is used. No live history is converted into authorization by the
controller. No other Production additions are admitted before creation.

Protected variables use a new CLASSYLINE_RECOVERY_ namespace:
CONTROLLER_SHA, CONTROLLER_TREE, BROWSER_RUN_ID, BROWSER_HARNESS_SHA,
BROWSER_HARNESS_TREE, BROWSER_ARTIFACT_ID, BROWSER_ARTIFACT_DIGEST,
INSTALL_SKIPPED_ID, SKIPS_MANIFEST and SKIPS_SHA256. The digest is sha256: plus
SHA-256 over the exact compact JSON bytes. Do not configure them during offline
preparation. Missing, altered, duplicate, unknown or omitted records fail closed.
All five stages of each supplementary skip must be idle, never started/ended.
Original known skip stages are also checked. Manifest inputs and complete history
JSON contents are frozen through preflight, final pre-create and acceptance.
Pagination requires all pages, stable metadata, exact counts and unique IDs.

## Browser and review gates

Historical 45-case browser evidence qualifies the earlier business source only.
A fresh credential-free size-isolated-browser run must qualify secure source
7d978f3… / tree75ca0…. Do not relabel an older receipt. In addition to existing
successful steps and artifact digest, the live browser job must emit exactly one
CLASSYLINE_BROWSER_RECEIPT= JSON line with application_sha/application_tree above,
tests:45, passed:45, screenshots:39, external_forwarded:0,
static_api_requests:0, mutations:0. The protected browser harness/run/artifact
identities must be independently reviewed against screenshots, summary and
network evidence. This package does not modify or execute the browser harness.

The proposed publication branch is phase/storefront-size-release-recovery.
size-recovery-offline.yml admits only that branch's pushes and same-repository
PRs to main for explicit paths. It uses read-only permissions, pinned Actions,
locked no-script installs, complete fixed-count tests, zero-vulnerability full
audit, scans and network-denied builds. No protected Environment, secret or
manual trigger is attached to this qualification workflow.

## Attempt and acceptance

Production execution is manual-only, Owner-only, main-only, protected by
classyline-production and strict lowercase true arm. Before future authorization,
Owner evidence must verify required reviewer Skyeagle123, administrator bypass
disabled, main-only Environment policy and false arm. Establish a main/configuration/
operator freeze. The job validates its approval record and bypass flag. It cannot
prove absence of a human competing operator; the operational freeze is mandatory.

The build pins the secure source; source, controller and output inventories are
hashed and rechecked before invocation. The sole prepared CLI spawn receives an
allowlisted environment without GitHub token, Node overrides or API URL overrides.
The actual prepared runtime revalidates package paths/hashes before imports.
The immutable exclusive fsynced create journal is claimed before the one outgoing
non-idempotent POST. Transport redirection and automatic replay remain blocked,
including 421, timeout, lost response, UNKNOWN_ERROR and cancellation. A consumed
attempt is never retried. No second CLI spawn or wrapper replay is permitted.
The client bound does not guarantee server-side exactly-once processing after a
lost response. Uncertainty requires read-only investigation and STOP.

CLI exit success is insufficient. Require one exact new canonical Production
SUCCESS deployment with Functions, clean secure-source metadata, exact deployment
and project D1/R2, WhatsApp 96178719771, Admin secret types and runtime settings.
Complete histories must reconcile and main remain unchanged. Rollback remains
9974ad77-a81d-40dc-8281-789d0d0c1284; rollback requires separate Owner authorization.

The workflow records canonical_verified:true, accepted:false and
disarming_verified:false even on canonical success. It cannot write the arm or
claim independent disarming. Owner must return CLASSYLINE_RELEASE_ARMED=false
on every outcome, including cancellation. Independently use the unchanged
ops/size-release/verify-disarmed.mjs or authenticated Owner evidence, recheck
canonical state/history/main, and only then issue a RELEASED acceptance report.
No automatic rollback, stock adjustment, catalog request, schema migration,
order recovery, reimport, D1/R2 write or secret change is included.
