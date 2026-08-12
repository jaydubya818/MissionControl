---
title: Verification Failure, Recovery, and Reconciliation
status: PROPOSED_NORMATIVE
last_verified: 2026-08-11
baseline_commit: 2b1a7c4
---

# Verification Failure, Recovery, and Reconciliation

Failures are durable facts. Recovery may produce a new Attempt, evidence, or
decision, but it never rewrites the failed history or broadens authority inside
an active Attempt.

## Recovery rules

1. Fail closed when authority, subject identity, evidence, or policy is unknown.
2. Retry only after classifying the failure and recording a changed hypothesis
   or recoverable external condition.
3. A changed candidate, contract, WorkOrder revision, or manifest requires a new
   verification evaluation and usually a new Attempt.
4. Late or duplicate events are reconciled idempotently against their original
   subject; they cannot advance the current subject.
5. Human exceptions are scoped, expiring decisions—not edits to evidence.

## Failure matrix

| Failure | Authoritative record | Gate/verdict | Retry | New Attempt? | Evidence treatment | Operator recovery |
| --- | --- | --- | --- | --- | --- | --- |
| Missing criterion evidence | Verification run/coverage | `NOT_VERIFIED` / `UNKNOWN` | After evidence method is available | Usually no if candidate unchanged; new verification run | Existing evidence remains; missing relationship explicit | Run required verifier or revise contract through approval |
| Required verifier not configured | Check result | `NOT_CONFIGURED`; ineligible | After configuration/readiness change | No if execution candidate unchanged | No synthetic evidence | Bind/install verifier or approve new contract; never infer pass |
| Mandatory check fails | Check result and evidence | `NOT_VERIFIED` | After implementation change | Yes for changed candidate | Failed evidence retained; later proof supersedes reliance | Correct work and dispatch governed retry |
| Verifier errors or times out | Check result/event | `ERROR`; ineligible | Within verifier retry policy | Not necessarily | Partial output quarantined unless method defines validity | Repair verifier/runtime, then rerun |
| Check intentionally skipped | Check result plus policy reason | Ineligible if mandatory | Only through active contract/policy | No | Skip record retained | Run it or obtain precise allowed waiver |
| File/line budget exceeded | Diff verifier/finding | `BLOCKED` | Only after reducing change or revising authority | Yes after changed candidate/revision | All diff evidence retained | Reduce scope or approve new WorkOrder revision |
| Protected or denied path changed | Scope finding | `BLOCKED` | After revert or governed scope change | Yes | Violation retained | Revert; otherwise new risk/approval and fresh Attempt |
| Test/scanner weakened | Anti-gaming finding | `BLOCKED` or human review | After independent disposition | Yes if candidate changes | Both base comparison and finding retained | Revert or obtain separate assurance-change approval |
| Dirty worktree after verification | Candidate invariant event | Attempt fails | After cleanup | Yes | Verification for dirty state unusable | Recreate clean worktree and rerun |
| Candidate SHA changes | Git reconciliation | `STALE` / invalid | Against new SHA | Yes or explicit continuation reset | Old evidence remains bound to old SHA | Verify new candidate from scratch |
| Contract/Plan/WorkOrder revision changes | Revision record | Existing decision stale | Under new contract | Usually yes | Impacted receipts invalidated; unaffected reuse requires explicit policy | Approve revision, recompile, dispatch |
| Approval expires/revokes | Approval decision | `AWAITING_HUMAN` or ineligible | New approval | No only if candidate/evidence still current | Evidence remains; authority removed | Request fresh approval |
| Conditional or rejected human review | Approval decision | Continuation closed | Governed revision/retry | Yes | Verification remains historical | Address conditions via new authorized work |
| Lease lost or heartbeat stale | WorkflowRun lease/events | Attempt cannot report/publish | Reclaim only per lease policy | Depends on checkpoint validity | Events retained; late owner reports rejected | Reconcile owner; resume or create retry |
| Duplicate result/event | Idempotency/reconciliation record | No state change | Not applicable | No | One semantic result; duplicate audit/metric | None unless payload conflicts |
| Late result for old candidate | Event/evidence subject | No current advancement | Not applicable | No | Stored as historical/stale | Inspect only; wait for current result |
| Conflicting credible validators | Evidence relationship/risk review | `UNKNOWN` or `WAIVER_REQUIRED`; never majority pass | After adjudication/new method | No unless candidate changes | Preserve both and disagreement | Create Risk Review with specialized owner |
| Forged/unauthorized packet | Auth/audit denial | Ineligible; possible quarantine | Only after security review | No automatic retry | Reject payload; retain safe audit metadata | Rotate credentials, investigate producer |
| GitHub webhook signature/repository mismatch | Ingress reconciliation | No state change | Valid redelivery only | No | Reject as evidence | Fix App configuration or investigate spoofing |
| Branch push succeeds, response lost | Publication reconciliation | Pending until remote lookup | Idempotent reconcile | Same Attempt | Bind observed remote branch to permit/candidate | Query by exact branch/SHA; do not duplicate PR |
| PR exists with wrong head SHA | GitHub lineage finding | `BLOCKED` | After new verified candidate/PR repair | Usually yes | Mismatch retained | Close/correct PR; never relabel as verified |
| Evidence expires | Validity evaluator | `STALE` | Fresh verification | No if subject unchanged | Prior evidence retained as expired | Rerun method before decision |
| Verifier later compromised | Revocation record | Prior decisions require impact analysis | With trusted verifier | No for unchanged artifact, new verification run | Revoke affected evidence/certificates | Quarantine affected scope and reverify |
| Operator cancels | Cancellation event | Canceled | New explicit dispatch | Yes | All evidence retained but cannot imply completion | Review partial effects and clean resources |

## Retry budget

Track execution retries separately from verifier retries and external-event
redeliveries. A verifier infrastructure retry does not authorize another code
mutation. Repeating a deterministic failure without changed inputs or a new
hypothesis consumes budget and should escalate.

## Reconciliation keys

- Service command: service identity, capability, idempotency key, payload digest.
- Verification: WorkflowRun, WorkOrder revision, candidate SHA, engine version.
- Evidence: producer, method version, subject digest, criterion/check, native
  artifact digest.
- GitHub delivery: installation, repository, delivery ID, event type.
- Pull request: repository, branch/ref, candidate head SHA.
- Human continuation: approval ID, verification run, candidate SHA, manifest
  digest, lease, single-use publication permit.

## Operator explanation contract

Every blocking state states what failed, authoritative record, candidate and
contract affected, evidence present/missing/stale, retry eligibility, remaining
budget, decision owner, safe options, and what resumes automatically.
