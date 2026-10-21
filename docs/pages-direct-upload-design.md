# Historical Direct Upload and checkpoint design — retired

The custom Pages Direct Upload transport, SigV4 R2 checkpoint adapter, hosted
qualification collector and consume-before-execution authority model are retired
from PR #4's active release path. Their source, tests, review findings and evidence
remain recoverable in Git history at:

- Commit: `a3aaa098f7e9a6501bc910f7513a0fedff38cd03`
- Tree: `03463977d1fe90b4b17e88fadbf70f9d84bfca9c`
- Historical offline CI: `39546937883` (341 tests passed).

Those offline tests did not establish hosted API compatibility, an authenticated
external authority adapter or permanent checkpoint retention. No hosted
qualification or Production deployment was authorized by that package. Historical
success must not be presented as live transport qualification.

The Owner subsequently approved, for this closed code-only release, one protected
workflow execution and one pinned Wrangler 4.150.0 deployment invocation, accepting
Wrangler's internal `UNKNOWN_ERROR` retries. This can produce multiple
creation requests and deployments. The workflow must reject unexpected or multiple
new deployments during independent reconciliation, and must never rerun or invoke
the deployment CLI again after uncertainty.

This explicitly replaces the former strict single-POST and unreceived-checkpoint
consumption requirements for this release. It does not establish exactly-once
server processing. The former need for a separate authoritative qualification
budget is no longer on the recommended release path; do not provision checkpoint
buckets, credentials, D1 tables or services for it.

See [the current guarded deployment and rollback procedure](production-deployment.md).
Deployment remains unconditionally blocked pending independent review and separate
Owner approval for installation, enablement and execution. This historical pointer
provides no permission to run any removed implementation from an earlier commit.
