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
| Show Attempt execution and verifier verdict separately | Qualified | Live browser evidence covers completed execution with verified, blocked, not-verified, and factory-failed verification history. |
| Mark stored RUNNING Attempts stale when lease/runtime ownership is absent | Qualified for deterministic reconciliation | Automate reconciliation scheduling for legacy taskless Attempts in a later milestone. |
| Scope the task board to the selected WorkOrder | Qualified | Deep links and refresh retained the selected synthetic WorkOrder. |
| Surface current revision approval and next governed action | Qualified | Accepted WorkOrders explicitly show that no further action is required. |
| Unified WorkOrder progress summary | Qualified | One backend projection supplies task, Attempt, candidate, verification, acceptance, dependency, blocker, and next-action truth. |
| Factory Run progress page | Qualified | Live browser evidence shows exactly three explicit members, 3 accepted, zero contamination, completed critical path, and empty frontier. |
| Historical evidence comparison | Qualified | Immutable rows compare candidate, producer, verifier, execution, verdict, terminal outcome, and evidence statuses. |
| Error and recovery affordances | Improved and qualified for represented states | Continue replacing generic legacy recovery text with machine reason-code actions. |

## Backend and orchestration improvements

| Improvement | State after this pass | Remaining proof/work |
|---|---|---|
| Canonical status vocabulary across engine, persistence, and UI | Qualified | Aggregate outcomes are centralized and verification detail remains separate. |
| Check dependency DAG and causal blocking | Qualified | Add larger real-repository qualification contracts only after the next workload is explicitly authorized. |
| Bounded verifier process-tree cleanup | Qualified | Native macOS Fab containment passed 39/39 outside the nested sandbox. |
| Fast exact pnpm/Corepack admission | Qualified to the strongest practical boundary | Exact pnpm version, lockfile, explicit external store, and offline frozen fetch are checked; pnpm does not expose a cheaper complete content-addressable inventory proof. |
| Immutable exact-candidate verification continuation | Qualified | Same candidate and producer lineage survived a distinct verifier retry with old evidence unchanged. |
| Original producer lineage for independence | Qualified for the synthetic chain | Migration of older taskless Attempts remains deferred. |
| Worker drain versus stop | Qualified | Claims stop during pause/drain; active work continues during drain; kill aborts and selected cancellation remains durable. |
| Candidate cleanliness after factory context injection | Qualified | Host-only skills are now limited to persistent workers and removed before candidate capture; remote result materialization stays clean. |
| Failure-cause preservation | Qualified for new lifecycle paths | Continue standardizing legacy terminal branches as they are touched. |
| Factory Run membership aggregate | Qualified | Immutable membership and dependency rows drive summaries and UI without broad project inference. |
| Acceptance-bound downstream dispatch | Qualified | Governed dependencies default to exact-revision `ACCEPTED_OUTPUT_REQUIRED`. |
| Evidence immutability enforcement | Qualified for append-only qualification and retry history | A repository-wide historical-envelope mutation API audit remains a future defense-in-depth task. |

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

## Remaining follow-up sequence

1. Automate scheduling of deterministic reconciliation for legacy taskless Attempts.
2. Extend machine reason-code recovery actions across untouched legacy terminal branches.
3. Audit historical evidence mutation APIs repository-wide and add explicit applicability/supersession records.
4. Run Docker-backed containment and the governed-context integration suite on a host with those explicit prerequisites.
5. Start no new product workload until the operator explicitly authorizes it.
