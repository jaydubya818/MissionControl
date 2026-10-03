# Verification retry recovery

Base: main 63ae3c9. The operator requested recovery of saved verification retries
and end-to-end testing. Use the assigned checkout; preserve the primary checkout.
No new Mission, approval, or cost authorization is implied by test fixtures.

Recover the bounded completed-verifier retry changes from the primary checkout.
A completed verifier with NOT_VERIFIED or BLOCKED may be retried only against
its exact current candidate, revision, and contract. Create a source continuation
without replaying the executor. Preserve the original failed source and evidence.
The new verifier remains independently scheduled and subject to publication review.

Use actual mutation handlers, real scheduling and report functions, persisted
synthetic rows, and transaction rollback in the test fixture. Cover v2 subjects,
authorization, tenant/project separation, changed identity, stale contracts,
concurrent execution, idempotency, and repeated failure. Keep unrelated pending
revision summaries and UI changes out of this patch. Run broader Convex and
factory qualification, then required CI before merge.

Live-test discovery found the September 6 Bedrock qualification approval. Its
five-dollar cap is total historical authority for that program, not a new budget.
Do not reuse it to authorize a fresh model run. Continue deterministic work while
live work item and budget remain unresolved.
