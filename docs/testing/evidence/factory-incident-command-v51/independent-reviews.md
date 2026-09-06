# Factory Incident Command v51 independent reviews

Overall decision: **GO for source merge; Experimental maturity retained.**

## Architecture

GO. The implementation is a thin incident aggregate over canonical evidence,
authorization, audit, and activity records. It does not create a second worker,
grant, WorkOrder, Attempt, or evidence authority. Restoration records an
incident decision only and cannot reactivate another subsystem.

## Security

GO. Public operations use existing workspace permissions. Every containment
and restoration control requires two distinct canonical PASS evidence
envelopes for the exact control and receipt role. Project scope, phase
currentness, creation order, observation time, idempotency, and sequence are
fail-closed. Signed service commands can detect and propose, but cannot contain,
restore, erase evidence, or resolve.

## Data integrity

GO. Incident transitions are append-only and sequence-checked. Containment
requires exactly one execution per declared control. Restoration requires the
exact previously contained control set and phase-current receipts. The optional
legacy read field preserves historical local fixture compatibility; new writes
never emit it.

## Simplicity

GO. One aggregate, one transition log, one proposal table, and the existing
evidence store are sufficient. The review rejected opaque identifier-shaped
control references and avoided inventing an actuator abstraction or parallel
state machine. No further generalization is justified before a real drill.

## Documentation

GO. Runtime ownership, exact public diff, operating semantics, threat controls,
maturity, qualification evidence, and limitations are explicit. Historical
v46-v50 evidence and the original todo 060 fixture remain unchanged.

## Findings resolved before GO

1. Restoration now maps the exact control set from the original containment
   transition rather than accepting a caller-selected subset.
2. Restoration cannot reuse containment receipts; command and effect receipts
   must be created after entry into the current incident phase.
3. Arbitrary audit-shaped identifiers no longer count as proof. Only canonical,
   project-scoped PASS evidence envelopes with exact command/effect check IDs
   are accepted.
