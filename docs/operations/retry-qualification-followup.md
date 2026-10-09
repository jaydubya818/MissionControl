# Retry qualification follow-up plan

The October 8 follow-up preserves the failed October 4 Attempt and authorizes
cost reconciliation, a focused producer correction, tests, and commits.
Another paid Attempt and broader deployment remain separate decisions.

1. Reproduce it yourself on the matching surface via the driver skill.
   Use the persisted server events and failed runtime session. Do not invoke a model.
2. Binary-search the cause.
   Costs exist in eight server events but never reach Attempt spend. Failure reports
   omit the normalized result artifact. Producer tools return REPOSITORY_LIMIT for
   broad searches and PATH_DENIED for generated skill paths.
3. Plan the fix.
   Sum unique, manifest-bound Fab model completion events into observed spend.
   Keep unknown cost completeness and the full reservation. Provide an audited,
   permission-checked terminal reconciliation mutation for the historical Attempt.
   Retain normalized artifacts on failure. Prepare explicit readable source paths
   for the next producer configuration without raising its turn limit.
4. Verify on the same surface; the original repro now passes.
   Reconcile retained events through the local backend only after tests. Run the
   mutation twice to prove idempotency. No inference is needed for this check.
5. Stage the commits so the failing repro lands before the fix in git history.
6. Run Opening a PR.
   Skip publication until the reviewed changes and remaining qualification limits
   are ready for the next explicit publication decision.

The repository requires sequential work; no subagents are used. Cost evidence
is provider-reported telemetry, not invoice settlement. This change must not
release reserved budget, authorize a retry, or change Attempt state.

## Result

Observed cost reconciliation passed locally, including an idempotent repeat.
The producer investigation disproved the prompt-only fix. Fab's hard snapshot
limit also prevents checks and candidate capture for this repository. The
adapter now rejects that incompatible setup before credential minting.
See [retained results](../testing/evidence/retry-followup-2026-10-08/README.md).
A new compatible executor configuration is a separate qualification decision.
