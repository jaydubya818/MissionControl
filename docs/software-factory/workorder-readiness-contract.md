# WorkOrder readiness contract

Baseline: `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`, fetched 2026-09-04.
Scope: capability convergence Phases 0–1 only; todo 059. Strategic plan and
historical evidence remain unchanged.

Repository readiness is a configuration observation, never WorkOrder execution
authority. The WorkOrder view must expose current Plan/revision, released and
current WorkOrder revision, classified risk, exact eligible Factory/model/
harness/runtime/backend tuple, host, repository, policy, cost authority,
approvals, and evidence requirements. Reuse deterministic routing and dispatch
validators. Unknown or unavailable checks cannot appear as PASS.

Readiness is a read-only projection. Dispatch repeats authoritative checks in
its transaction, and worker claim repeats exact tuple and lease admission.
A preview neither reserves budget nor approves, dispatches, verifies, accepts,
publishes, merges or releases work.

Checks use PASS, BLOCKED, DEFERRED and NOT_APPLICABLE. DEFERRED means a named
later boundary must produce proof: an attempt-specific dependency preparation
receipt, independent verifier preparation, and exact-candidate evidence cannot
exist before their subject. These remain visible execution/acceptance blockers;
they are not silently counted as successful admission checks. An operator may
request admitted preparation when current admission checks pass. The existing
worker must still fail closed before implementation when preparation fails.

The response binds WorkOrder/revision, Plan/revision, Factory/configuration and
model/harness/runtime/backend identities, an evaluation timestamp and each check's reason.
Candidate evidence remains explicitly pending. No generic repository Ready state substitutes for
this projection. Runtime context is derived server-side under delivery scope.

Tests must cover stale/foreign lineage, exhausted budgets, exact tuple rejection,
unknown preparation, absent/expired/revoked approvals, and the difference between
admission and execution readiness. Live browser proof must be recorded separately
from component tests. No real pilot dispatch until named identities and incident
preflight are supplied and all required authority is recorded.
