# Local Research Lab retry qualification

October 8 update: observed spend is now reconciled locally. Full qualification
remains blocked by the pinned Fab runtime's repository-size limit. See the
[follow-up findings and evidence](../testing/evidence/retry-followup-2026-10-08/README.md).
The October 4 status below is retained as history.

Status on 2026-10-04 Pacific time: the retry-dispatch regression is fixed locally.
The live documentation qualification failed. Broader deployment is not approved.

## Retry semantics

Zero allowed retries permits one initial execution and no retry Attempts.
For N allowed retries, the upper bound is 1 + N total Attempts. Model turns inside
one Attempt are not additional Attempts. Independent verification is a separate
purpose and must not be counted as another producer retry.

Commit `33e3612` fixes the Mission dispatch gate when both
`correctiveIterations` and `maxCorrectiveIterations` are zero. For positive limits,
the existing `correctiveIterations < maxCorrectiveIterations` comparison remains
unchanged. Mission corrective iterations and execution retries are distinct
counters. This patch does not redefine positive Mission correction behavior or
unify retry policies across execution backends. Negative and fractional counters
remain invalid.

The earlier proposal used `<=` for every limit. That proposal was not deployed.
The operator approved the narrower zero-limit change after automatic approval
review blocked the earlier combined operation. The block was not bypassed.

## Applied scope

The committed fix was applied only to Research Lab at `http://127.0.0.1:3214`.
The local backend serves Research Lab; this is a code deployment to that backend,
not a per-Mission feature flag. No other factory, shared backend, or production
environment received the change. No branch was pushed or merged.

The pre-change export, including storage, remains at
`/private/tmp/mc-research-lab-before-cost-fix-20261004.zip`.
The scoped worker ran with `startServer({ coordinatorEnabled: false })`.
Commit `c5c7679` retains that startup option and the retry-bound test matrix.
This option preserves the default server behavior and suppresses global
coordinator ticks during the pilot.

## Post-commit qualification

Evidence is in [the qualification directory](../testing/evidence/live-retry-2026-10-04/README.md).

| Requirement | Result | Evidence and limit |
| --- | --- | --- |
| Post-commit Convex regression suite | PASS | 162 files, 1,491 tests |
| Post-commit orchestration suite | PASS | 64 files, 766 tests; 11 existing skips across 3 files |
| Zero retries permits initial execution | PASS, live | Exactly one producer Attempt, `ys7bk98j89ry8gjt19y64vqsqh8fpfdt`, executionAttemptNumber 1 and retryCount 0 |
| Duplicate dispatch | PASS, live | Same idempotency key returns the same Attempt with no new Attempt |
| N retries upper bound | PASS, policy tests | Read-only execution claim matrix N = 0, 1, 2, 3, 9 permits 1 + N claims then rejects more. This is not live proof for every backend |
| Failure handling | PASS, live | TURN_LIMIT failure retained, no candidate or file changes, no producer retry |
| Cancellation, recovery, fencing, spend controls | PASS, regression suites | Existing readOnlyRunControl, executionRecovery, preExecutionRecovery, localCandidateRecovery, factoryAttemptWorker, and broker coverage. Live cancellation and stale-lease fault injection were not performed |
| Worker restart | PASS, bounded live check | Failed Attempt remains terminal; session file hash and eight model calls unchanged after restart and polling |
| Credential cleanup | PASS, live | Attempt-scoped $4.49 credential revoked; stale credential returned HTTP 401 after 15 seconds |
| Independent verifier and successful-candidate recovery | NOT REACHED | Producer produced no candidate |
| Human candidate approval and draft PR | NOT REACHED | No publication approval or PR |

## Live dispatch evidence

Mission `gs7qk5q10e4v3v5td71pedhrvx8fqmvg` used approved plan
`gn7htsghr19e1yeschmc1hmbgh8fqp4d` and WorkOrder
`yh786ydmsxnztmr4dm7654xwjd8fq2kp`.
The previously blocked dispatch passed the corrected retry gate, then correctly
failed production-route certification for the experimental Fab harness.

The supported qualification path required explicit qualification metadata,
`NO_PRODUCTION_ACCESS`, and a current human review record. The operator's local
qualification authorization was recorded through normal revision and approval
APIs. WorkOrder revision 2 preserves the one-file scope and $4.49 cap. The stale,
unexecuted revision-1 Task was canceled and retained; a revision-2 Task was created.
These records do not approve candidate publication.

Dispatch then created run `inc68pnu`. The worker claimed and executed it once.
The model exhausted eight turns while reading or searching without writing the
runbook. The runtime recorded TURN_LIMIT, zero retries, no changed files, and no
candidate. Model usage was 70,759 input tokens, 159 output tokens, and $0.0102412.
Together with the earlier component run, reported model cost is $0.014032.
The conservative $5 program reservation remains in place; no funds were
reallocated to another Attempt.

## Open qualification issues

- RL-QUAL-001: the runbook producer failed to produce a candidate within its
  frozen turn limit. A fresh run requires a reviewed preparation change and new
  execution authorization. Increasing the turn limit or retrying silently would
  change the approved experiment.
- RL-QUAL-002: the canonical failed Attempt reports `spentUsd: 0` and actual cost
  unavailable, while retained runtime usage reports $0.0102412. The full $4.49
  reservation remains, so zero is not evidence of free execution or refunded
  budget. Cost reconciliation must be resolved before broader qualification.
- RL-QUAL-003: the frozen route cost-policy source references WorkOrder revision
  1 while the dispatched WorkOrder is revision 2. The cap and scope did not
  expand, but this provenance mismatch needs review before another run.

An earlier startup, before the scoped startup option, ran one global coordinator
tick with zero delegations and decompositions, nine stuck-alert actions, and 119
logged escalations. That process was stopped. Subsequent pilot starts disabled
the coordinator. The audit records were preserved.

The worker was stopped after the restart check. The Research Lab backend and
failed Attempt remain available for inspection. The terminal-failure restart
check does not prove recovery of a verified candidate. This evidence supports
review of the local retry fix, not production readiness. A fresh approval is
required before broader deployment, and another producer Attempt needs explicit
execution and budget authority.
