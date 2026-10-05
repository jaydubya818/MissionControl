# Live retry runbook: execution preflight

October 4 continuation: component qualification now passes, with reported model
cost of $0.0037908. The disabled model route and single-file scope are registered.
Mission creation is waiting on the operator's owner/team selection. See
[`live-retry-2026-10-04`](../testing/evidence/live-retry-2026-10-04/README.md) for
the current evidence and limits. The October 3 observations below are historical.

Observed October 3, 2026 against the preserved local Research Lab backend
(`http://127.0.0.1:3214`). Source base: `5308727463ec737589bf8072ee9f5de0af1bba7a`.

## Outcome

**Blocked before dispatch.** No live Mission, WorkOrder, or Attempt was created.
No inference was invoked, no provider child credential was minted, and no draft
PR was published. Model expenditure for this run is $0 of the authorized $5.
Worker restart and end-to-end publication remain untested.

## Observations

The GitHub App installation lookup for `jaydubya818/MissionControl` returned
HTTP 200 with contents-write and pull-requests-write permissions. This proves
App access, not completed repository binding or publication.

OpenRouter management-key listing returned HTTP 200. Its public model catalog
listed `openai/gpt-4.1-mini`, the model supported by the existing Fab broker.
These read-only observations do not prove live inference, budget enforcement,
credential revocation, or runtime qualification.

The normal `factory/configuration:getVersionOptions` query for Research Lab's
MissionControl repository returned:

| Prerequisite | Available |
| --- | ---: |
| Active repository code scopes | 0 |
| Approved agent versions | 2 |
| Eligible execution profiles | 0 |
| Admitted model routes | 0 |
| Active sandbox profiles | 0 |

`factory/configuration:list` returned a DRAFT factory for Research Lab.
`factory/executionProfiles:list` returned no Research Lab profiles. The separate
Relay workspace has two expired producer profiles and one eligible verifier
profile; none supplies an admitted producer for this repository and workspace.

## Required continuation

1. Collect real qualification evidence for the exact Fab/OpenRouter runtime,
   configuration, model route, credential lifecycle, and spending bound. Keep
   all qualification and production inference within the same $5 total ceiling;
   per-attempt $5 limits alone do not enforce a cumulative $5 program limit.
2. Present that evidence for human qualification review. The model route and
   execution-profile promotion APIs record human approval; preflight access
   checks must not be submitted as successful execution evidence.
3. Bind the actual repository, documentation-only code scope, owner, environment,
   independently verified execution profile, and worker. Assess readiness before
   activating the factory. Preserve unrelated workspace configuration.
4. Resume the approved documentation WorkOrder. Retain real candidate,
   verification, human approval, restart, cost, and draft-publication evidence.

The clean managed checkout prepared for this continuation is
`/Users/jaywest/.codex/worktrees/live-retry-runbook/MissionControl`. The primary
checkout's edits and the existing demo on ports 5199/3210 were left untouched.

This is a preflight record, not a successful end-to-end qualification report.
