# Relay factory run learnings and improvement ledger

Status: living Mission Control hardening ledger
Source incident: [Relay first factory run](./relay-first-factory-run.md)
Boundary: improve Mission Control only; never rewrite or resume the closed Relay qualification run

## What the run taught us

- A completed process is not a successful Attempt, a completed verifier is not a verified candidate, and a verified candidate is not an accepted WorkOrder.
- Execution state, verification verdict, acceptance gate, and terminal ownership must be stored and displayed as separate dimensions.
- Requirements may be disproven only by checks that actually ran against the candidate. Missing tools, unavailable dependencies, timeouts, and blocked prerequisites mean not evaluated.
- Verification is a dependency graph, not an unordered command list. A failed setup check must causally block downstream typecheck/build/health checks.
- Dependency readiness must be admitted before consuming the execution timeout. Exact package-manager identity, lockfile, local runtime, and cache availability are part of the environment contract.
- Every spawned verifier or executor must own and terminate its complete process tree.
- Retry never rewrites producer history. It creates a new identity bound to the exact candidate, contract, revision, and original producer lineage.
- Historical lease IDs are provenance only. They never confer live authority.
- Factory-owned execution context must not become candidate source. Injected skill files caused the worker to reject its own candidate as dirty.
- Error summaries are product data. A failure counter with `lastError: null`, or a generic “inspect evidence” message, is not operable.
- Pause, drain, stop, and cancel are different operations. Drain must refuse claims without aborting active work.
- Project or mission membership is too broad for progress accounting. A Factory Run needs explicit immutable WorkOrder membership.
- The first major run needs a single operator summary for current WorkOrder truth; reconstructing state across Tasks, Attempts, receipts, and evidence is unacceptable.

## UI and UX improvements

| Improvement | State after this pass | Remaining proof/work |
|---|---|---|
| Show Attempt execution and verifier verdict separately | Implemented locally | Browser-qualify all terminal combinations against real seeded data. |
| Mark stored RUNNING Attempts stale when lease/runtime ownership is absent | Implemented locally | Add automatic reconciliation and historical taskless Attempt presentation. |
| Scope the task board to the selected WorkOrder | Implemented in the current worktree | Qualify deep links and refresh behavior end to end. |
| Surface current revision approval and next governed action | Implemented in the current worktree | Prove stale revisions never outrank the current revision. |
| Unified WorkOrder progress summary | Open | Show task counts, active Attempt, lease health, candidate, verdict, gate, blocker, dependencies, and next action together. |
| Factory Run progress page | Open | Use explicit membership; show total/accepted/remaining, frontier, blockers, latest verdict, and critical path. |
| Historical evidence comparison | Open | Compare immutable receipts by revision, subject, producer, verifier, and applicability. |
| Error and recovery affordances | Partial | Drive actions from machine reason codes; never offer retry when revision/subject authority is stale. |

## Backend and orchestration improvements

| Improvement | State after this pass | Remaining proof/work |
|---|---|---|
| Canonical status vocabulary across engine, persistence, and UI | Implemented locally for verification and Attempt projection | Implement the aggregate terminal outcome classifier. |
| Check dependency DAG and causal blocking | Implemented locally | Add larger real-repository qualification contracts. |
| Bounded verifier process-tree cleanup | Implemented and regression-tested | Run host qualification outside nested sandbox boundaries. |
| Fast exact pnpm/Corepack admission | Partial | Add deterministic package-level offline-store completeness inspection. |
| Immutable exact-candidate verification continuation | Implemented in current changes | Complete generation-based compare-and-swap coverage. |
| Original producer lineage for independence | Implemented in current changes | Qualify long chains and migration of older taskless Attempts. |
| Worker drain versus stop | Implemented and regression-tested | Add crash/restart and final-report race integration tests. |
| Candidate cleanliness after factory context injection | Implemented and regression-tested | Generalize factory-owned ephemeral context registration if more files are introduced. |
| Failure-cause preservation | Improved | Standardize machine reason code, owner, remediation, and causal entity IDs on every terminal branch. |
| Factory Run membership aggregate | Open | Add schema, immutable membership snapshot, scoped queries, and reconciliation. |
| Acceptance-bound downstream dispatch | Open | Add typed dependencies and exact accepted-revision checks. |
| Evidence immutability enforcement | Partial | Prevent historical envelope mutation and add supersession/applicability records. |

## Testing and qualification improvements

- Keep fast unit coverage for every status and verdict combination.
- Run timeout tests with a child and grandchild and assert both PIDs are gone; run them twice to catch race behavior.
- Test missing verifier separately from a verifier that ran without adequate evidence: the former is `BLOCKED`, the latter is `NOT_VERIFIED`.
- Test every dependency edge by advancing and superseding the exact predecessor revision.
- Test crash points between process exit, output drain, evidence persistence, Attempt terminalization, parent projection, and run reconciliation.
- Treat environment-required qualifications as explicit skips with a named reason. Never make an unsafe fallback merely to turn a skipped test green.
- Fab native containment must be qualified on an unsandboxed macOS host; nested Codex sandbox execution is expected to reject `sandbox-exec`.
- Browser verification must cover refresh, direct WorkOrder links, stale Attempt presentation, error states, and accessibility—not just component snapshots.

## Product and operating-process improvements

- Start future factory pilots with one small vertical-slice WorkOrder and an explicit environment admission report before fleet dispatch.
- Freeze the run membership and dependency graph before approval.
- Require machine-readable terminal ownership and next action for every failure.
- Do not dispatch dependents from candidate existence, execution completion, or verifier completion; use exact-revision acceptance.
- Preserve failed candidates, verifier mirrors, evidence, and audit history as immutable incident material.
- Publish an operator checklist for pause, drain, stop, cancel, retry, supersede, and recovery.
- Do not expand product scope while the golden path cannot explain its own current state and recovery action.

## Open hardening sequence

1. Implement first-class Factory Run membership and progress aggregation.
2. Implement acceptance-bound typed dependencies and dispatch admission.
3. Implement the canonical terminal outcome classifier and idempotent cross-entity reconciliation.
4. Complete WorkOrder progress and historical evidence UX.
5. Add package-level offline cache admission and host qualification.
6. Run a new, bounded greenfield factory qualification. Do not reuse or alter the Relay incident run.
