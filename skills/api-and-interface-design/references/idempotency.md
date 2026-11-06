# Retry and idempotency rules

Use one stable key per intent, reused across attempts. Generate it at the
initiating client or event, not inside the retry loop. Two legitimate purchases
with identical amounts still need distinct intent identifiers.

- Scope the key by tenant or principal and operation. Authorize every request,
  including replays, before returning a saved response.
- Atomically claim the scoped key with a uniqueness constraint or equivalent
  primitive. A separate lookup followed by a write allows concurrent winners.
- Store a fingerprint of the normalized, effect-relevant request. Reject the
  same key with a different payload; do not replay another request's result.
- Model pending, succeeded, failed, and unknown outcomes explicitly. A timeout
  or a crash after an external call is not proof that the effect failed.
- Choose a documented response for an in-flight duplicate, such as conflict,
  a pending status resource, or a bounded wait. Expiring a lease does not prove
  the previous worker stopped or that a provider did nothing.
- Commit a local effect and its deduplication record in the same transaction
  where possible. For external effects, propagate a stable provider key and
  reconcile provider state after uncertain outcomes. An outbox makes dispatch
  durable but still requires an idempotent consumer or provider.
- Retain records for the longest permitted retry or replay window. Explicitly
  reject or reconcile older replays; do not assume provider key retention
  matches local retention. State how terminal failures and key expiry behave.
- Store only response data needed for replay, under the same access and
  retention controls as the underlying resource.

Prove these cases against the actual persistence mechanism: concurrent same-key
requests produce one effect; changed-payload reuse fails; keys cannot leak
across tenants; a lost response is recoverable; and a crash between provider
success and local acknowledgment does not cause a second charge. For services
without provider idempotency or a reliable status query, report that limitation
and require reconciliation instead of claiming exactly-once execution.
