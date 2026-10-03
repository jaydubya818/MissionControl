# Saved verification retry review

Reviewed the uncommitted primary-checkout changes in convex/factory/attempts.ts,
convex/lib/factoryAttempt.ts, convex/lib/localCandidateRecovery.ts,
convex/workOrders.ts, and convex/__tests__/factoryVerificationRetry.test.ts.
Compared them with main 4c58c26. Those changes remain in the primary checkout.

## Intended behavior

Current retryVerification admits FAILED or CANCELED superseded verification
Attempts. The saved patch also admits a COMPLETED verifier with a NOT_VERIFIED
or BLOCKED verdict. It creates a new, non-executing source continuation for the
same candidate, retains the failed source and evidence, binds a new subject,
and schedules independent verification. WorkOrder projection stays BLOCKED
when a completed verifier rejects the candidate.

The design preserves history rather than relabeling the failed source as
successful. It checks current revision, contract, subject, source, and competing
Attempts. This is useful recovery behavior, but it changes the evidence and
publication chain and needs qualification before shipment.

## Missing evidence

The saved integration file has three cases: successful/idempotent retry,
stale-source rejection, and blocked WorkOrder projection. Its subject fixture
uses version 1, its scheduler is injected, and its identity is an anonymous demo
administrator. Those tests do not establish:

- Version 2 pre-publication subject continuation through the real scheduler,
  verifier report, producer-lineage resolution, human review, and publication.
- Denial for unauthorized operators and mismatched tenant/project records.
- Rejection of stale contracts, changed Git candidate identities, and concurrent
  source Attempts through the mutation boundary.
- Evidence preservation after repeated failed verification and multiple retries.
- Transaction rollback if scheduling or subject binding fails.

Before recovery, add these mutation/integration cases with actual scheduling and
reporting boundaries. Review producer provenance against execution manifests,
invocation/lease identity, and the unchanged candidate tree. Keep retry audit
events tied to both old and new subject identities. Do not treat mocked schedule
success as end-to-end evidence.

## Live qualification prerequisites

A fresh factory run needs the operator-selected approved Mission/WorkOrder,
target repository, and model-spend limit. These were requested in chat. No paid
run, production mutation, or invented approval was used for this review.
