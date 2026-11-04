# Canonical accounting, gate and recovery qualification

Accepted bases are MissionControl a6065c1dd50e0ca7bd99adb33e31d9e876e7c9e8 and MyFactory e498c31db8b749fa91b0544ecd1d1a661b971c2c. Keep the provider pin and historical evidence. Production integration, paid operations, deployment, publication and executable production grants remain disabled.

## Completion predicate

Native and delegated admission must transactionally share canonical Attempt budget authority at WorkOrder, Mission, project policy and daily scope. Settled charges plus unresolved reservations cannot exceed any ceiling. Actual deterministic execution must pass authenticated Result ingestion, canonical policy-v2 gate evaluation and autonomous recovery without replacement execution authority. Prove this with real Convex/PostgreSQL, faults, fresh clones, hosted CI and independent security/architecture reviews.

## Design decision

Use workflowRuns.executionCostAuthorization and canonical run events. Extend the existing offline resource authorization and its shared admission helper with immutable integer-money identity and governed settlement. Existing inference reservations remain provider-operation children. Do not put Docker execution into fabricated token reservations or keep enterpriseFixtureBudget as the new authority.

A reservation binds tenant/owner, Mission, WorkOrder revision, Attempt, delegation or native identity, factory/version, exact provider/model policy, ceiling, expiry and idempotency identity. Retain full unresolved exposure across cancellation, expiry, terminal state and daily rollover. Settlement is an immutable fact on the same Attempt, backed by authenticated terminal evidence or transactionally proven no-dispatch. Preserve historical authority and charge date. Do not infer resource cost from zero paid calls. The isolated deterministic profile needs an explicit approved zero-charge tariff, bound into authority and Result delegation identity; absent that policy, resource cost remains unknown.

The shared scope reader must include native and delegated Attempt reservations. Paid-provider children may not bypass parent authority. This checkpoint cannot create paid grants or claim paid-provider qualification. Treat historical unsupported/unparented liabilities conservatively.

For the gate, reuse immutable Verification Subjects, separate Verification Attempts/plans, evidence/result/receipt persistence and currentVerification. Complete the existing LOCAL_GIT observation projection. A gate row is an audit projection, never its own acceptance authority. Qualification evidence cannot be relabeled LIVE. Human acceptance and publication remain separate.

Recovery uses existing delegation identities, durable scheduling and fenced reconciliation. STATUS/RESULT/cleanup readback may repeat; admission and productive execution may not. Persist observation before acknowledging it and preserve UNKNOWN if evidence is absent.

## Ordered checkpoints

1. Accounting contracts, abuse-case tests, shared canonical native/delegated admission and exact settlement. Test real-database races, duplicate/conflicting identities, cancellation/expiry, restart, rollover and cross-owner denial. Review, commit, push, verify SHA before gate work.
2. Canonical policy-v2 evidence ingestion and authoritative gate/currentness qualification, including mandatory-check failure and stale/mismatched evidence. Keep human acceptance/publication distinct. Review and preserve a checkpoint.
3. Durable autonomous readback/reconciliation and fault qualification across both restarts, lost acknowledgments, stale writers and failed verifiers. Fresh-clone/CI/regressions and final independent reviews; preserve exact SHAs and report.

## Work organization

Blocking first steps are source/contract discovery, isolation, proof of shared accounting shape and the red abuse-case harness. Independent security and architecture discovery run read-only. One implementation owner serializes the coupled schema/admission/settlement changes; the user's task-tool mapping requests sequential implementation. Real database suites run serially because the local backend has strict execution deadlines. No primary checkout or dependency PR is modified.

Model the Domain selected a typed immutable reservation and settlement on existing Attempts. Sequence Work into Verifiable Units selected accounting, gate and recovery commits in that order. The rejected design was a second inference-like record for Docker, which would fabricate provider semantics and double count authority.
