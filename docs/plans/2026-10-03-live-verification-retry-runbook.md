# Live verification-retry runbook WorkOrder

The operator approved this scope in chat on October 3, 2026: one documentation
WorkOrder in jaydubya818/MissionControl, at most $5 total model spending, ending
at a draft PR. Base is merged main `5308727`.

Done means a real governed Mission/WorkOrder produces only an operator runbook
for verification retries, independently verifies its exact candidate, records
human publication approval, survives a worker restart without replay, and opens
a draft PR. Retain attempt, model usage/cost, verification, restart, and PR
evidence. Do not merge that PR or claim production deployment.

The document must explain completed NOT_VERIFIED/BLOCKED retries, unchanged
candidate/revision/contract requirements, retained failed evidence, independent
verification, fresh approval, and failure/recovery states. Allowed candidate path
is `docs/operations/verification-retry-runbook.md`; no application changes belong
in the live worker's candidate.

Inspect configured runtime and identities before dispatch. Use the normal
Mission, plan approval, WorkOrder, Task, Attempt, verifier, and publication APIs.
Do not seed successful results, impersonate an independent reviewer, or weaken
admission gates. Existing service configuration may be reused after checking
current readiness; old qualification approvals and budgets are not authority
for this run. Reserve the complete bounded provider liability before any call.

Preserve the primary checkout's edits and other running demo services. Prepare
the smallest supported local runtime. Record a concrete blocker if credentials,
provider spending enforcement, authentication, or exact execution admission
cannot support this approved run. Current external expenditure is zero.
