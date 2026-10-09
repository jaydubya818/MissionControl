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

## Replacement executor qualification, October 8

Continue with no-inference repository preflight and offline Docker qualification.
Retain the failed Attempt, revoked credential, stopped pilot worker, and $4.49
reservation. Do not deploy a replacement or mint a live execution credential.

The selected candidate for further qualification is Codex Bedrock through the
governed Docker bridge. Native Codex repository preparation works, but ambient
login does not establish an enforceable provider spend cap. New Docker image
digests are candidates only; production identity constants remain unchanged.

Two test harness corrections are required. Admission fixture holds must bind
the configured Attempt and lease. The worker-death child must inherit the
explicit candidate test configuration. The two-request synthetic bridge test
must reserve both full-context input and maximum output liabilities, including
liability retained after settlement. No runtime admission or spend check changes.

Results and reproducible candidate configuration are retained in the
[executor selection evidence](../testing/evidence/executor-selection-2026-10-08/README.md).
Full qualification remains incomplete. Before any live replacement Attempt,
qualify the full repository in the container, obtain current exact-route price
evidence, bind an approved budget to the current WorkOrder revision, and request
a fresh approval for that concrete configuration. The old price approval has
expired. The old reservation is not available to fund a replacement.

## Full repository container check

Test the complete tracked tree of the preserved producer baseline
`5308727463ec737589bf8072ee9f5de0af1bba7a` using synthetic responses only.
Use a disposable snapshot repository whose Git tree matches that baseline,
without copying local credentials, untracked files, or dependency directories.
Retain archive size and container diagnostics. Do not raise the candidate's
32 MiB invocation bound or 128 MiB workspace limit to make the check pass.
A failure at either bound blocks live activation of this candidate.

The full-tree check failed at the Docker adapter's input admission boundary.
Even compression level 6 produces a 178.76 MiB base64 payload before overhead,
against a 32 MiB limit. The 208.61 MiB tracked tree also exceeds the 128 MiB
workspace. No model was invoked. See [full repository evidence and profile
proposal](../testing/evidence/full-repository-docker-2026-10-08/README.md).
Do not proceed to price approval or live execution until packaging and capacity
are resolved through a separately reviewed local qualification configuration.
