# Inference observation retention

Status: implementation in progress under todo 063 and the cumulative capability
convergence program. Baseline: merged `8bf19fcb7e46f4b80a862054d22fbd7ca7ed436f`.
This contract extends the existing inference ledger and provider liability
aggregate. It does not authorize provider calls or release.

## Observations survive admission violations

A provider observation describes work that may already have incurred liability.
Valid nonnegative safe-integer counters, resolved identities, request identity,
response digest and timing must survive individual or cumulative token/cost
overruns. Persist explicit violation codes atomically with the receipt. Fence
further spending for the affected WorkOrder, including existing reservations and
new reservations; preserve every original allocation. A correction must not
automatically unfreeze spending or return capacity.

The fence blocks subsequent claim admission, including intents persisted before
the incident. It cannot revoke an allowance already issued to a transport; that
allowance remains subject to its existing finite deadline and one-send bound.

New canonical receipts use a versioned extension. Existing v2 snapshots remain
readable with their original bytes and digests; no global canonical-hash change
or historical rewrite is allowed. Derived money is ESTIMATED. Model/provider
drift must preserve the observation and make requested-route pricing UNKNOWN.
Missing pricing and arithmetic overflow also remain UNKNOWN, never zero or a
clipped value. Structurally invalid counters are rejected rather than invented.
Observed cumulative usage is computed from validated canonical receipts, not
mutable duplicated fields.

New corrected projections use `accepted-outcome-economics/v2`. Historical v1
projection snapshots remain readable with their original digests; current
comparisons exclude them. Monetary corrections are applied in recorded order.
An UNKNOWN monetary correction supersedes an older estimate; a later usage-only
correction cannot resurrect it. All correction lineage remains retained.
Projection construction validates each correction's canonical digest before
using its money or completeness. If individually valid costs exceed the safe
integer range when aggregated, the projection or cohort omits its aggregate
money. Receipts, outcome counts and lineage remain available; confidence is NONE
and the comparison is ineligible with `AGGREGATE_COST_UNKNOWN`. The inspector
shows Unknown instead of recomputing an unsafe total or reviving older money.

## Accounting after execution ends

First settlement authenticates the service and binds to the original immutable
reservation, hold, Attempt, request digest, lease identity/generation, profile,
repository and frozen price identity. It does not require an active lease,
current worker registration, current Attempt, running status or still-active
pricing. Expiry, cancellation, completion and a replacement Attempt cannot
erase accounting for an already admitted request. This path grants no dispatch,
new hold, budget increase, lease renewal or Attempt revival.

Exact duplicates remain idempotent. Conflicting receipts, stale corrections,
incorrect historical ownership and request-ID reuse remain rejected. Operator
corrections retain their separate permission and evidence requirements. Validate
all reconciliation counters; missing observations remain missing. Reuse the
existing composed Bedrock settlement, which already retains overrun evidence
and freezes its aggregate.

## Transport persistence failures

Once a provider result is known, a failed accounting write must not replace it
with an empty UNKNOWN observation or trigger another provider send. Surface the
exact bounded settlement payload to bridge callers for reconciliation, without
prompt/output content. An in-memory error payload is not a durable outbox or
restart proof. The existing Docker consumer retains only the error message;
integrated recovery payload retention and durable accounting delivery remain the
next dependency-ready work. This slice does not claim that path recovers usage
after its consumer catch or a process restart.

## Qualification

Use failing regressions before implementation for individual and cumulative
overruns, wrong-route pricing, overflow/missing costs, historical settlement,
scope/replay/correction negatives and known-result persistence failure. Exercise
new and historical receipt snapshots through actual local Convex storage and
concurrent claims; bind the proof to final source hashes. Run the existing
composed, Phase 5 and critical browser qualification and independent review.
All fixture, provider, human acceptance and release evidence remains distinct.
