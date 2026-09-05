# Canonical pre-publication verification

Phase 3 extends the existing Factory lifecycle. Fab remains an execution-only harness. Current policy-v2 draft-first subjects remain readable, with their original v1 digest; new candidates use an additive v2 Git subject before publication.

The v2 subject binds the WorkOrder revision and verification contract, source Attempt, internal/provider repository, frozen source commit, candidate commit/tree, canonical raw Git diff digest and frozen base/head refs. The server derives authority from admitted records. It pauses the same implementation Attempt at `AWAITING_VERIFICATION`, persists candidate artifacts and schedules the existing separate Verification Factory. Neither reconnect nor approval reruns the builder.

The verifier recomputes exact base ancestry, candidate tree and raw diff before and after checks. Existing verification-authority rules still apply. Shared current-verification evaluation selects the newest candidate and newest exact verifier before examining outcomes. Pre-publication evidence eligibility is separate from acceptance; it may support human review but cannot make unpublished software accepted.

The existing human-review continuation binds the source Attempt to the separate verifier's receipt and exact subject. Human resolution retains that verifier's identity. Claim and publication authorization recheck current WorkOrder, runtime, lease, latest evidence, approval and exact candidate. No builder receipt is fabricated. Existing permits govern publication.

After publication, the server persists a separate immutable binding from the verified subject to the consumed permit, human decision and actual PR. It never edits the subject digest. Acceptance still requires the connected GitHub App's current exact PR/head projection; moved, closed, stale or absent provider evidence blocks acceptance. Ambiguous publication must be reconciled by exact remote identity before any write is replayed.

Required regressions cover field substitution, a stale/newer failed verifier, cross-Attempt evidence, approval and lease expiry, pre-publication verification without acceptance, immutable publication identity, PR drift, duplicate reports and pause/reconnect without a new builder execution. Qualification uses synthetic records until an explicit non-production deployment and controlled repository are provided.

Dependency preparation uses an empty HOME, disabled user/global configuration, disabled lifecycle scripts and pnpm hooks, frozen offline resolution, and no inherited credentials. Dependency-bearing repositories require the operator to configure `MISSION_CONTROL_FACTORY_PNPM_STORE_DIR` as an absolute path to a prewarmed store outside the candidate worktree. Missing cached packages fail closed; preparation does not fetch them. Candidate authority rejection bypasses preparation entirely and emits canonical blocking policy evidence, ending that candidate rather than offering an infrastructure retry.

Provider mutations recheck the active canonical lease, cancellation and the original consumed permit after asynchronous preparation and immediately before Git push or PR creation. Transport cancellation cannot prove that an already dispatched write did not happen; recovery therefore remains read-only and records an unknown outcome until exact provider evidence reconciles it.
