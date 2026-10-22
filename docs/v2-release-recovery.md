# V2 pre-deployment gate recovery — implementation review boundary

This local package does not authorize publication, installation, dispatch, rerun,
rollback or deployment. Keep `CLASSYLINE_RELEASE_ARMED=false`. The only exception
is the specifically reviewed pre-deployment failure below; future failures do not
become eligible automatically. Never delete runs, rename the workflow or reset
counters to obtain another opportunity.

## Fixed baseline and retained evidence

| Role | Identity |
| --- | --- |
| Installed controller / preparation parent | `cddb2e8303df17b78d1880e73f311547ea333dc0` |
| Installed tree | `c5d0d4ba5281660d00c5924511d0639885a3d875` |
| Previous successful dispatch | `39629341749`, number 1, attempt 1 |
| Failed V2 dispatch | `39814798811`, number 2, attempt 1 |
| Failed job | `119950374894`, `deploy` |
| Application / tree | `45ac09182cca5cc989fbae1c967c6e7e849e63c3` / `6457416153e4aba803424d13a75db7d9e418adbc` |
| Accepted application CI | `39725797281`, attempt 1, SUCCESS |
| Production / rollback | `05c1e186-a17a-4a37-b1e1-c3be59cffd11`, source `b64e078ee6ecfc5f4e124fe6d68129164f521b8a` |
| Workflow ID / protected environment ID | `391522489` / `24902198946` |
| Original log SHA-256 | `b48a0342e34036759e3196050941baa2b39b9243b0db5ef80c62ebaace4dc54f` |
| Original log Git blob / bytes | `071fce850fcf330ef2efd4c9e969793f67852872` / 4574 |

`ops/fixtures/recovery-39814798811.log` is the complete original UTF-8 job log,
including its BOM. It records uppercase `True`, failure at the exact lowercase
arm comparison and no execution of the checkout/build/deployment steps.
`recovery-history.json` records credential-free original run/job identities for
offline tests. The runtime does not trust that JSON fixture: it requires live
GitHub history, run details and the original attempt-specific jobs, plus exact
authenticated Git-blob readback of the archived log. It does not depend on the
14-day Actions artifact retention window. If live history becomes unavailable,
the archive alone cannot authorize a release.

## Narrow controller change

Both embedded copies of `verifyRecovery()` must remain byte-identical. The first
runs in the existing CI/identity step, before checkout and before the CF-token
step. The second completes before the final Cloudflare revalidation. The final
order is recovery history, main/source checks, Cloudflare project/configuration
and canonical baseline, rollback readback, complete deployment history and
competitor checks, final main/source checks, then the only Wrangler invocation.
No recovery API preparation follows the final Cloudflare revalidation. This
restores the narrow pre-upload boundary; it does not create a cross-service lock.
The second copy uses GitHub authentication only for GitHub reads; it never sends
the Cloudflare token to GitHub. APIs use GET, bounded deadlines and redirect
rejection. No raw API bodies or credentials are saved as release evidence.

The exact set is `{39629341749, 39814798811, current run}`: three unique complete
records, not a count-only exception. Both inventory and individually fetched run
details must match fixed workflow/repository/actor IDs, triggering actor, main,
source/tree, attempt and conclusion. Missing/extra/truncated/contradictory records
fail closed. The failed attempt must contain its exact single job and all 13
expected steps, including failed arm gate and skipped deployment stage. Any
executed, missing or unexplained step/job blocks recovery.

The current run must be number **3**, attempt **1**, Owner-initiated, in progress
on main, with the executing workflow SHA equal to its controller SHA. Its commit
tree must match the run record. The supported eventual installation is a reviewed
squash commit with sole parent `cddb2e8...`; a regular two-parent merge or unrelated
main change is deliberately refused. Review the exact installation identity
before arming. No user-controlled SHA or dispatch inputs are introduced.

Original and current environment review records must each show one Owner approval
for the exact protected environment, with administrator bypass disabled. Saved
reviewer/branch/secret protections must still be independently verified: an
approval record does not prove all future configuration remains unchanged.

## Single-use outcome and limits

Dispatch number 3 consumes the recovery opportunity even if it fails before any
API call, is cancelled waiting for approval, or never invokes Wrangler. Run number
4 and attempts greater than 1 are refused even if someone deletes another run.
The exact historical set is independently required; run number alone authorizes
nothing. No cancellation, CLI error, timeout, unknown deployment result or missing
evidence creates another exception.

There is one Wrangler 4.150.0 CLI invocation, no wrapper retry. Owner-accepted
Wrangler internal retries can issue more than one deployment-creation HTTP
request; this package does not claim single-POST or exactly-once server processing.
Existing read-only reconciliation and final canonical/binding/Functions SUCCESS
verification remain unchanged. Multiple or unexpected deployments block final
acceptance; an uncertain CLI outcome cannot be accepted automatically.

GitHub concurrency does not lock independent Cloudflare operators. Maintain the
Owner deployment/main freeze and disabled automatic Production builds. Readback
checks narrow the race but are not a cross-service atomic lock. Repository admins
can delete historical evidence or alter workflows; preservation is an operational
requirement, and missing required evidence blocks this controller rather than
silently reconstructing permission. No new durable checkpoint service is needed
under the accepted one-workflow/one-CLI policy.

## Validation and separately authorized next stages

Run `node --test ops/*.test.mjs` and the existing isolated-YAML syntax validator
under Node 24.19.0. Integrated tests execute both actual workflow guard bodies and
the actual release body with all API/process boundaries mocked. Native process
tests use a temporary fake `npx`, not installed Wrangler. No live deployment or R2
test is required for this recovery change. Do not repeat application/Preview tests.

The exact publication branch prepared for later authorization is
`phase/storefront-v2-release-recovery`. The credential-free offline workflow adds
only this branch to both its push allowlist and job-level ref predicate; the five
existing branches remain. It has `contents: read`, no protected environment or
secret references, and runs `node --test ops/*.test.mjs`, including the actual
recovery guard and transport-body tests. No publication or dispatch occurs here.
New faults change D1/R2 bindings, canonical Production, a competing deployment,
main or source during the final recovery guard. They must yield zero mocked CLI
invocations. In-memory mutation controls restore the unsafe old ordering and
reproduce its one mocked invocation, proving the regressions detect the finding.

After independent review, separately authorize publication and credential-free
hosted CI for the exact recovery revision. Then separately review installation
while the effective arm is false and automatic builds remain disabled. Require an
explicit new Owner release authorization, reviewed controller identity, protected
approval and a frozen release window before a future exact lowercase `true` arm.
No such actions are authorized or performed by this local preparation.

After any future invocation failure or uncertainty: stop, disarm through a
separately authorized action, preserve run/evidence, reconcile history read-only
and obtain independent review. Do not rerun, restore a database, down-migrate,
correct inventory or invoke Wrangler again. Any rollback requires its own valid
authorization and preserves D1/R2 customer records.
