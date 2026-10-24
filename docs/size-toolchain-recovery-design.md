# Size release toolchain remediation and replacement-controller design

Status: offline review candidate only. No publication, Environment write, arm
change, dispatch, deployment, rollback or application-data operation is authorized.
Keep CLASSYLINE_RELEASE_ARMED=false. The consumed workflows are unchanged.

## Verified baseline and consumed opportunity

- Repository: Skyeagle123/Classyline.
- Installed main: e08316796a14476712bcf0f79f6606c62c7bc294.
- Installed tree: 97f29ba8066225d323531154b4227f3168794609.
- Sole parent/application source: 00b25b282d66818632a2d214e7a52ffbd0f8a1cb.
- Previous application tree: 823de98f6faa7fcb65ea980f771f1c7318561694.
- Production/rollback: 9974ad77-a81d-40dc-8281-789d0d0c1284, source
  0ce95a706a88c63a914c25b142d4fc6878de66d8.
- Consumed workflow: .github/workflows/classyline-production-size-update.yml,
  workflow ID 394632411; run 40070135911, job 120801596986, run 1/attempt 1.
- The failure was npm audit after 206 application tests and security checks.
  Transport preparation and deployment invocation were skipped. Preserve the
  complete normalized log and exact step receipt under ops/size-release-recovery/evidence.
  Live GitHub run/job/approval/log evidence must continue to match the archive.
  The archive never substitutes for inaccessible or changed live evidence.

## Selected toolchain correction

Upstream tarballs 4.150.0, 4.151.0 and current latest 4.152.0 were inspected with
registry integrity checks. All contain bundled Undici 7.29.1. Upgrading to these
versions does not resolve GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472 or
GHSA-xjj6-f33q-929c. npm audit fix --force suggests an unreviewed downgrade and
must not be used. Do not lower audit severity, omit development dependencies,
ignore advisory IDs, or remove the audit from the release path.

Retain exact Wrangler 4.150.0 and Miniflare 5.20261006.2-beta. Pin Undici 7.30.1
directly as development tooling and override Miniflare's Undici dependency to
that exact version. Only the root lock entry and Undici entry change; no other
locked package is upgraded. Runtime application dependencies are unchanged.

ops/size-toolchain/manifest.json pins the upstream Undici archive integrity and
SHA-256, all 210 package-file SHA-256 values, all 112 original bundled-module
boundaries/hashes, the original Wrangler CLI hash and prepared CLI hash, and the
unchanged reviewed guard libraries. These are reviewed source data, not values
discovered from the network during preparation.

The deterministic preparation removes each of the 112 bundled Undici module
implementations and routes its CommonJS entry through the reviewed runtime
binding to the corresponding absolute, verified Undici 7.30.1 file. Bare Undici
imports are not used in the replacement wrappers. Old bundled implementation
bytes and old version markers are absent from the prepared CLI. All dependency
files are checked before modification; unknown, missing, extra, altered or
symlinked files fail closed. No arbitrary source text, URL, version or gate path
is accepted from Environment variables. Preparation is idempotent and checks the
complete reconstructed CLI hash. A private original copy is retained only as
data for reconstruction; it is never a CLI entry point in the reviewed path.

The unchanged original pre-send gate insertion is applied as part of the same
reconstruction, using a fixed relative module path. It retains the exclusive,
fsynced pre-send journal, non-idempotent POST, zero redirects, deployment-create
attempt limit of one and timeout. The patched artifact is path-independent:

- Original CLI SHA-256:
  71da1f9bcf69a9f56c4ff4f68e71315365d03db8ea11207577b47a8e1a0a1064.
- Prepared CLI SHA-256:
  ccc8700cb7712503437d1a662e266b10399cdcdeea3850a61d8706f29622f2bd.
- Undici 7.30.1 tarball SHA-256:
  c98bd3881137c11341e8be8d2ec509ebf973b6f8b36d0a4c6d2afcda15e0d712.

build:functions prepares and verifies the toolchain before running the local
Functions compiler. No lifecycle install hook or network access is used for
patching. A future controller must prepare before any Wrangler command and
repeat complete input/CLI verification immediately before its sole spawn.
Do not invoke the original CLI copy or rerun the consumed release controller.

## Round 2: execution binding and the Node runtime

runtime.cjs runs at the very beginning of the prepared CLI, before Miniflare
or other Wrangler third-party imports. It requires exactly Node 24.22.1 with
built-in Undici 7.30.1. It revalidates all pinned package bytes, canonical paths,
guard hashes and the prepared CLI digest. For every one of the 112 module paths,
resolution from both the actual CLI and Miniflare must point to the verified
root package. Nested packages, symlinks, missing files and altered bytes
fail closed. Each replacement wrapper repeats execution verification and loads
only the approved absolute file; it cannot fall back to another installation.
This protects both preparation and the actual execution path, including changes
introduced after preparation. The trusted checkout and process itself must
remain immutable during the release window; this is not a sandbox against an
operator who can replace the reviewed bootstrap or Node executable.

Node 24.19.0 contains built-in Undici 7.29.0; an npm override cannot fix it.
Its global fetch accepted an incorrect mixed-case SRI digest in the independent
review. Global fetch is reachable in the old controller's GitHub/Cloudflare GET
guards and may be used by tooling, so treating it as unreachable is not valid.
The new qualification instead pins the official Node 24.22.1 security release,
whose bundled Undici is 7.30.1. Official provenance:
https://nodejs.org/en/blog/release/v24.22.1
https://nodejs.org/dist/v24.22.1/SHASUMS256.txt
Linux x64 archive SHA-256:
6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6.
Both built-in and package fetch receive local SRI and excessive-content-encoding
regressions. The future controller MUST pin this exact patched runtime, verify
both versions before any network access, and clear unsafe runtime/CLI overrides.
Existing consumed Production workflows are unchanged and must never be reused.
The legacy syntax validator accepts both historical 24.19.0 and reviewed
24.22.1 for syntax checks only; that does not authorize the older runtime for
the new qualification or future recovery execution.

## Automatic credential-free qualification

The sole intended publication branch is
phase/storefront-size-toolchain-remediation. size-toolchain-offline.yml admits
only pushes to that branch and same-repository PRs from that branch to main,
with an explicit relevant-path list. It has contents:read only, SHA-pinned
Actions, Node 24.22.1, npm ci with lifecycle scripts disabled, no protected
Environment, no release credentials, no manual trigger and no deployment step.
Its runner prepares the exact CLI, executes the fixed test-file inventory,
requires exact test counts with zero failures/skips/cancellations/todos, runs
syntax/security scans and full npm audit (zero findings), and builds with all
network connections blocked. Missing files or incomplete TAP evidence fail.
The unchanged historical tests use the original CLI only in their isolated
mock boundaries; new tests exercise the corrected actual transport and runtime.
Workflow-condition regressions evaluate the checked-in condition and verify
branch/path inclusion and rejection. Actual GitHub triggering remains pending
separately authorized publication; offline validation must not be described as
a hosted CI run. Publication still requires disabled automatic Production builds
and explicit Preview exclusion for this exact branch.

## Validation boundaries

Application tests and size regressions run against unchanged business code.
Static and Functions builds are run with a validation-only preload rejecting
HTTP, HTTPS, fetch, TLS, TCP and UDP connections before socket creation. That
preload is never a Production dependency or a bypass for a controller check.
Actual prepared Wrangler transport tests compile the CLI in memory, never run
its entry point, and substitute only a loopback dispatcher. They exercise the
fixed external fetch implementation, success, UNKNOWN_ERROR, lost response,
timeout, cancellation, 421, redirect and malformed responses. A second and third
dispatch must remain blocked. A mutation control shows ungated fixed Undici
still replays a 421 POST, so the ledger remains necessary after the upgrade.

Historical controller regressions are run separately against the immutable
original CLI as an isolated regression baseline. They do not qualify the new
transport; the new actual-transport tests do that. No test may call a live
Cloudflare deployment-create boundary. Run full npm audit, application tests,
size tests, security scans, syntax checks and offline security tests before
publication is considered. Hosted Chromium for the new source remains pending.

## Replacement controller: separately reviewed second package

This candidate implements toolchain remediation and the immutable consumed-run
verifier. It contains NO replacement executable Production workflow. The next
package must implement and independently qualify the design below before
installation or a new release authorization; this document is not an installed
controller or permission to deploy.

1. Publish the exact reviewed toolchain candidate only after separate Owner
   authorization and automatic credential-free CI. The review archive supplies
   its tree; the publication supplies its actual application commit SHA. Never
   substitute an invented SHA, a dirty checkout or a local overlay for provenance.
   Preserve src/, functions/, migrations, size ordering, variants and data.
2. Qualify that exact new application SHA/tree, both builds and the full audit,
   and run the isolated browser qualification against it. Keep previous browser
   evidence historical; do not relabel the old 00b25b2 receipt as a new-source run.
3. Prepare a distinct manual-only workflow, proposed path
   .github/workflows/classyline-production-size-recovery.yml. Pin the newly
   accepted application SHA/tree/CI and toolchain manifest/CLI hashes. Install it
   as one reviewed direct-child squash from the exact then-approved main. Pin
   that sole parent explicitly; do not reuse the consumed controller's 00b25b2
   parent pin. Bind protected controller SHA/tree to the actual installation.
4. Preserve Owner Skyeagle123/id 125151458, repository/id checks, main-only ref,
   workflow_dispatch only, contents:read/actions:read, immutable Action pins,
   protected classyline-production approval with bypass disabled, exact lowercase
   true arm, new workflow run number 1/attempt 1 and singleton inventory.
5. Preserve all three historical V2 runs and the consumed V2.1 run. Add
   verifyConsumedSizeAttempt before deployment eligibility and again in the
   final GitHub verification. The repository manual inventory during the new run
   must be exactly 39629341749, 39814798811, 39838839195, 40005672896,
   40070135911 and the one new current run. Missing, altered, truncated, duplicate,
   rerun or extra history fails closed. Never relax the old workflow to run 2.
6. Reconcile every Production and Preview page, stable pagination metadata,
   unique IDs, exact historical fields and complete record-content snapshots.
   Retain all original history, old installation skip ceba0a45-4aa1-4ccd-9b4e-a7eaf696a038,
   and all three previously reviewed Preview skips. Explicitly review every new
   publication/installation skip; require exact UUID, project, environment,
   branch, commit, created_on, clean github:push source, skipped flag and five
   never-started stages. Extend only exact reviewed branch names if needed.
   Never generate authorization from live history, accept unknown extras or
   merely increment a count. Bind the compact protected manifest/digest to the
   new installed controller and freeze it for the entire window.
7. Preserve Production D1 10c800b1-ddf7-427b-8354-9cf8529782b6 and R2
   classyline-storefront-production-images; Preview D1
   ce1d28f3-f20b-485d-9799-619a7fc52ade and R2
   classyline-storefront-preview-images must remain distinct. Verify WhatsApp
   96178719771 in project and accepted deployment; verify Admin secret bindings
   without exposing values, runtime settings, baseline and rollback identity.
   Keep automatic Production disabled and the publication branches excluded
   from automatic Preview. Do not use live /api/catalog to check data readiness.
8. Require an operational main/configuration/operator freeze. Immediately before
   the sole CLI spawn, reverify GitHub history/main/approval, source/toolchain,
   project/bindings, canonical baseline and complete histories. Clear unsafe CLI
   environment overrides. Persist intent before starting; use a fresh private
   exclusive pre-send journal. Verify the prepared CLI hash again. Permit only
   one CLI spawn and one client deployment-create dispatch. No wrapper replay.
9. On uncertainty, cancellation, timeout, UNKNOWN_ERROR, CLI error, journal drift
   or unexpected history, stop. Reconciliation is read-only. Server processing
   after a lost response is outside the client's exactly-once guarantee. Never
   infer that no deployment exists from a missing CLI response. No automatic
   replay, second dispatch, workflow rerun or rollback is permitted.
10. Accept only one new canonical Production deployment with exact new source,
    clean metadata, SUCCESS, Functions, exact deployment/project bindings and
    stable complete history/main. Require CLI success and valid journal proof.
    Return the arm to false after any outcome and verify independently using
    authenticated readback or explicit fresh Owner evidence. RELEASED remains
    pending independent disarming. A rollback requires separate Owner approval.

## Remaining gates

Independent Astra review of this candidate, separately authorized publication
and credential-free hosted CI, fresh-source Chromium, a second executable
controller package and its independent security/fault-injection review, exact
installation provenance and updated Owner-reviewed history manifest, fresh
protected settings/false-arm evidence, no competing operator/deployment, and a
new explicit one-time release authorization are all required. No such step is
performed by this offline remediation package.
