# Evidence, and what Mission Control refuses to invent

Mission Control's product claim is that a number on the screen corresponds to
something that actually happened. A fabricated pass count, cost, or evidence
hash is worse than a missing one: a missing capability is visible and
actionable, while a plausible fake is neither.

The operating rule is therefore: **a missing capability is better than
fabricated evidence.** Where a capability does not exist, the system fails
closed with a named error rather than synthesizing a result.

## Named unavailability errors

| Constant | Module | Meaning |
| --- | --- | --- |
| `EXECUTION_RUNNER_UNAVAILABLE` | `convex/execution.ts` | No test execution runner is configured. `testGeneration.execute` and `hybridWorkflows.execute` throw rather than persist a result. |
| `QC_ANALYZER_UNAVAILABLE` | `convex/qcRuns.ts` | No quality-control analyzer is configured. `qcRuns.execute` marks the run `FAILED` with this reason rather than completing it with a synthesized evidence pack. |
| `CODEGEN_EXECUTOR_UNAVAILABLE` | `convex/codegen.ts` | No code-generation executor is configured. |

The real automation path is
`apps/orchestration-server/src/automationAdapter.ts`: allowlisted executables,
artifact hash verification, redacted logs, and a normalized result with real
exit codes.

## Provenance is recorded, not assumed

`executionResults` rows carry `metadata.producer`:

- `AUTOMATION_ADAPTER` — produced by a real runner. This is the only value that
  makes a row usable as evidence.
- `MANUAL_IMPORT` — a human entered it.
- `FIXTURE` — seeded or demo data.

`execution.storeResult` is `internal` and requires both `producer` and
`producedBy`. It was previously a public mutation accepting a client-supplied
`success: true`, which meant anyone holding the deployment URL could write
passing test evidence. `ExecutionView` renders rows with no producer as
"unattributed (simulated executor)" rather than as a passing run.

The EOS demo layer keeps its own provenance model (`ProvenanceBadge`,
`PageProvenanceNote`); demo projections are labelled at the point of display.

Seeded QC runs carry `evidenceHash: "seed-fixture-no-evidence:<runId>"` — a
value deliberately not shaped like a digest, because the previous
`sha256:${Math.random()}` was indistinguishable from a real content hash to
every reader and verifier while hashing nothing.

## Telemetry is measured, not estimated

`@mission-control/openclaw-sdk` requires `deliverable.usage` with measured
`inputTokens`, `outputTokens` and `costUsd`. `completeTask()` throws without it.
It previously sent `inputTokens: 1000, outputTokens: 500` on every completion
with a caller-chosen `costUsd`, and those numbers reached the cost dashboards
indistinguishable from measured ones.

`planning.generatePlanFromAnswers` returns `source: "MODEL" | "TEMPLATE"` and,
for templates, an `unavailableReason`. The template estimates nothing — it
previously returned `estimatedCost: 0.5` and `"1–2 hours"` through the same
shape as a generated plan, including when the model call had failed and the
error had been swallowed.

The Factory Agent chat mode is deterministic client-side keyword routing. It no
longer reports a `cost` or a `model`, because it invokes neither.

## Agents do not attest to their own review

The SDK's submission checklist starts with the judgement items unchecked.
"Acceptance criteria addressed" and "Deliverable ready for independent review"
were hardcoded `checked: true` — an agent self-attestation rendered in the
reviewer's UI as though a reviewer had confirmed it. Only the mechanically
checkable item ("Evidence attached") is pre-filled.

## Withdrawn rather than mocked

The CRM view queried the agent fleet and rendered it as a sales pipeline —
`IDLE` agents under "Prospect", `QUARANTINED` agents under "Proposal" — with
unwired "Add contact" and "Filter" buttons. There is no contact model in
Mission Control, so the page now states that plainly instead of displaying
numbers that describe something other than what they claim.

The Team view is labelled as a static reference model of role definitions, not
as live fleet state.
