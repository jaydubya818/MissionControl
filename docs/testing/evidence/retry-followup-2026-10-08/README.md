# Local Research Lab qualification follow-up

The October 8 follow-up repaired observed-cost reporting and diagnosed why the
runbook qualification cannot finish with the selected Fab runtime.

## Cost reconciliation

Commits `df3241d` and `40c03fe` reconcile persisted, manifest-bound Fab model
completion costs. Reports deduplicate each session and model-call number,
reject conflicting duplicate amounts, and ignore unknown or invalid amounts.
Observed spend can increase but cannot decrease. Mission spend increases only
by the new delta. Reconciliation does not release the reservation, mark cost
completeness as measured, change execution state, or authorize a retry.

The historical mutation requires workspace delivery-write permission, matching
WorkOrder scope, a terminal Attempt, and an audit reason. It accepts no amount
from the caller. New worker reports reconcile under their existing lease fence.
Worker-authored telemetry is observed cost evidence, not provider billing
settlement. The failure report now retains the normalized result artifact.

`initial-cost-reconciliation.json` records the failed Attempt changing from
$0 to $0.0102412, followed by an idempotent repeat with zero delta.
`local-cost-reconciliation.json` records the final cost-status clarification.
Both retain FAILED, one Attempt, and the full $4.49 reservation. No inference
was invoked. The original October 4 evidence remains unchanged.

Only the preserved local Research Lab backend at port 3214 was updated.
The pre-change backup is
`/private/tmp/mc-research-lab-before-cost-reconciliation-20261008.zip`.
No worker was started. No branch was pushed or shared deployment performed.

## Producer root cause and preflight correction

The original eight turns included three unavailable-file reads, two denied
private skill paths, two repository-limit failures, and one file listing.
`fab-readiness-probe.json` reproduces the important boundaries without inference.
The public `skills/` files are readable. `.mission-control/skills/` is denied.
The pinned runtime supports snapshots of at most 300 files; this checkout exposes
3,932 files. Both contained checks and candidate capture require that snapshot.
A prompt-only correction or larger turn budget cannot resolve this incompatibility.

The adapter now runs the runtime's snapshot validation before model creation or
credential minting. The new regression failed before the fix and passes after
it. The runtime's limits and filesystem protections were not weakened.

The next producer requires a repository-capable executor and a newly reviewed
exact execution configuration. Its prompt should use the readable public skill
paths and an explicit source list. The old qualification packet and revision-1
cost-policy reference must not be reused as approval for that new configuration.
No new producer Attempt is authorized or queued by these changes.

## Verification

- 1,516 Convex tests passed across 167 files.
- 768 orchestration tests passed, with 11 existing skips across 3 files.
- The final cost-status refinement passed all 10 targeted cost tests.
- Convex TypeScript checking passed.
- Live reconciliation and its duplicate call passed on the preserved failed Attempt.
- The repository compatibility probe used no provider credentials or inference.

The full Convex run initially exposed 42 failures from a Bedrock fixture whose
fixed price expired before this follow-up. That fixture now pins its clock to
October 4 within its original validity period. Production price expiration
checks and price data are unchanged.

## Result

Observed spend is reconciled. Billing completeness remains unconfirmed, and
reserved budget remains unavailable for reuse. The producer failure has a
reproduced cause and a guard against spending on the same incompatible setup.
Full end-to-end qualification, independent verification, successful-candidate
recovery, and draft publication remain incomplete. Broader deployment remains
gated on a fresh approval supported by completed qualification evidence.
