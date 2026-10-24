# Secure-source size ordering isolated qualification

This candidate qualifies secure application SHA
7d978f3ab539efb89a4cd5a2c44abe87775c4451 and tree
75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8. It is based on installed main
98ffb3ef2dad7940fbcbbcb83cb08221a96905a4 / tree
cf1ea56b97ac8bd8ac367aefc9b6d5900e66d84e. It does not qualify the old
00b25b2 source by relabelling historical browser evidence.

The harness is carried forward from the exact published PR #17 tree
b10e3a77f4cc2483f154788026155fe7fffa4252. Synthetic fixtures, bounded cart,
Order method and size readiness checks, strict option ordering, variant IDs,
quantities, availability and the 45 actual browser cases are preserved.

## Scope and isolation

The application is a separate clean checkout. The harness never imports or
executes the installed Production recovery workflow. Its source-review gate
remains literal false. No business application, size sorter, dependency,
migration, consumed release controller or release-arm configuration changes.

Test 15 cases at each width 360, 768 and 1363, height 900. The eight size
families cover XXS through 6XL, mixed-case adults, numeric children, 4Y through
16Y, mixed Y/y, distinct 4/4Y/4y identities, No Size/One Size/Free Size and mixed
formats. Exact DOM order, cart IDs, quantities, color-dependent availability,
public WhatsApp/COD controls and responsive overflow checks remain mandatory.
Capture 39 screenshots: five UI views and eight size fixtures per viewport.

HTTP and WebSocket interception is installed before page creation. Only
loopback static assets are forwarded. Catalog and images are synthetic.
Functions are compiled offline but never served. No live Preview or Production
request, checkout, recovery, Admin mutation, import or upload is permitted.
Negative browser probes are explicitly expected intercepted failures; they are
never forwarded submissions. Unexpected blocked traffic still fails safety.

## Automatic credential-free CI

The exact existing qualification branch is
phase/storefront-size-browser-qualification. Only its pushes and same-repository
PRs targeting main are admitted. Actions are immutable SHA-pinned, permission is
contents:read, checkouts do not persist credentials, Node is exactly 24.22.1
with built-in Undici 7.30.1. Application, browser, legacy and validation packages
are installed from separate unchanged lockfiles with lifecycle scripts disabled.
There is no Production Environment, deployment credential, manual trigger or
deployment operation.

The offline runner revalidates source SHA/tree and clean checkout, prepares and
verifies the accepted secure Wrangler/Undici paths and hashes, then requires:

- 167 current harness tests, including 25 source/result/CI and 31 YAML security regressions.
- 70 legacy browser harness tests; these are executed again, not assumed covered.
- 206 application tests and 33 focused size-ordering tests.
- Exact TAP counts, zero failures, skipped, cancelled or todo tests.
- Full zero-vulnerability audits for all four installed dependency scopes.
- YAML, Bash, JavaScript, credential and injection checks.
- Static and Functions builds with all build-time network connections denied.

The fixed accepted source supplies the toolchain preparation and network-denial
code. Syntax parsing uses only the browser-owned patched validation path below. No deployment transport can be exercised by these builds. The workflow's
build step also checks that built static output and offline evidence exist and
that application sources remain clean. All offline logs are retained under the
single browser artifact's offline/ directory.

## Browser receipt

After all 45 real browser cases pass, the harness reads back summary.json and
network.json and validates exact case names, viewport metadata, all 39 screenshot
names/PNG dimensions, interception order, loopback-only allowed requests, no
unexpected blocked requests or sockets, and zero API requests at the server.
Only then may it emit exactly one line:

    CLASSYLINE_BROWSER_RECEIPT={"application_sha":"7d978f3ab539efb89a4cd5a2c44abe87775c4451","application_tree":"75ca0d92b7cc9dec2dd2cb669c08be84c5c2c4c8","tests":45,"passed":45,"screenshots":39,"external_forwarded":0,"static_api_requests":0,"mutations":0}

This exact schema matches the installed recovery controller's browser receipt
verifier. The sole size-isolated-browser-<run>-1 artifact retains screenshots,
summary, network, static inventory, harness SHA/tree, browser version and offline
proof. Missing artifacts are errors. Hosted Chromium has not run for this
candidate; only a later separately authorized publication can trigger it.

## Publication and release prerequisites

No publication, PR update, merge or workflow execution is authorized here.
PR #17 already exists, draft and unmerged; future authorization must account for
its exact branch/HEAD and prohibit force-push or branch-history rewriting.
Do not merge a browser package merely to create qualification evidence.
Review new hosted runs and artifacts independently, including screenshot and
network inspection. Explicitly review any resulting skipped Preview record with
its exact harness SHA/tree before adding it to a protected release manifest.
The recovery deployment gate, installation ancestry and future activation need
separate review and Owner authorization. Keep CLASSYLINE_RELEASE_ARMED=false.

## Browser-owned YAML security remediation

GHSA-48c2-rrv3-qjmp / CVE-2026-33532 affects YAML >=2.0.0 <2.8.3.
Pin exactly YAML 2.8.3 in the harness checkout's ops/size-browser,
ops/v21-browser and ops/offline-validation package manifests and lockfiles.
Only the YAML entries change; Playwright and all application dependencies remain
unchanged. The accepted application checkout is still the exact clean 7d978f3
source. Its historical validation-only package is never installed or used by this
workflow. The application root dependency scope is audited in full.

The reviewed YAML tarball is independently verified against registry SHA-512 SRI
and SHA-1 metadata. validation-policy.json also records its SHA-256 and all 233
packaged file SHA-256 hashes. Before launching tests, yaml-policy.mjs verifies all
three scope manifests, locks, registry URLs, SRI, exact installed package files,
regular/canonical paths and actual module resolution without executing the parser.
Missing, stale, nested, substituted or symlinked parser installations fail closed.
All three scopes and the application must have zero total audit vulnerabilities.
No audit suppression, omitted-development flag or forced dependency update is used.

The shared ops/validate-offline-workflows.mjs remains byte-identical to the secure
source and retains its historical exact YAML 2.8.2 assertion. The browser-owned
validate-syntax.mjs reads it from the verified secure application checkout,
requires source SHA-256
acb0805e7414b45a3e23488f5afa98cea612469cff2c3fe3f8d8f0a0ce49b9a0,
and permits one explicit transformation: its exact parser guard becomes 2.8.3.
The resulting complete source must hash to
b98d9f18125505dc3ba8d4a29c4aa3f13e464b01046f25c4758c2fdf4274dacc.
The wrapper writes this source to an exclusive temporary file, executes it with
the verified harness-owned parser scope, and removes the temporary file.
No assertion filtering, fallback, skipped source section, eval or code overlay
in the accepted application is used. Every original YAML, Bash, embedded JS,
Action pin, workflow-context, Production safeguard, offline-permission and
JavaScript check remains present and executes.

Before parsing, every workflow source and the complete workflow filename inventory
must match the explicitly reviewed SHA-256 map. The original Storefront workflow
hash check is retained inside the shared check body. Unknown, missing, altered or
symlinked workflows are rejected. Future intended workflow changes require a new
reviewed source inventory; the manifest is not generated from live source in CI.

All 70 legacy harness tests still execute; their only test correction is the
expected safe YAML dependency version. The 31 new YAML regressions cover stale
and unreviewed versions, lock/registry/integrity tampering, missing/nested/symlinked
packages, changed workflow inventories and source bodies, omitted syntax controls,
the exact one-line transformation and actual deeply nested YAML parsing in all
three scopes. Audit failure continues to stop the job before Chromium.

This remains a dedicated qualification-branch package. Historical workflows that
invoke the unchanged shared validator directly are not migrated by this candidate.
Do not merge its tooling lock changes into main without a separate compatibility
review. The installed recovery gate, source/ancestry pins and protected release
configuration remain unchanged. Hosted Chromium and its 45-case/39-screenshot
artifacts are pending separately authorized publication and independent review.
