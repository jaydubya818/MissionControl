# Governed Planning Agent V1

## Product gap

Mission intent could reach a repository-researched Plan candidate, but adversarial review found that the planning read boundary was metadata rather than OS-enforced, the recorded Factory agent was not the built-in prompt implementation that executed, multiple clients could create competing active runs, research execution provenance was not durable across generation retries, and an approved Plan could be visually conflated with a later unadopted candidate.

This PR hardens that narrow golden path. It does not add new adapters, routing modes, pilot surfaces, a Flight Recorder, a tool broker, or learning/publication behavior.

## What changed

- Runs planning commands under the live-tested Codex `mission-planner-contained` permission profile. The exact detached worktree and minimal runtime files are readable; unrelated host files, repository `.env` files, repository writes, network egress, commit, and push are denied. Adapter health fails closed unless the pinned CLI/digest and permission probe pass.
- Records the implementation that actually executes as built-in `mission-planner/v1`, including phase-specific prompt versions and SHA-256 prompt digests. The approved Factory agent remains separate admission context.
- Transactionally enforces at most one `QUEUED`, `RESEARCHING`, `GENERATING`, or `VALIDATING` run per Mission. A racing request receives the existing active run with `ACTIVE_RUN_EXISTS`.
- Persists idempotent research and generation execution receipts before phase validation. Retry/reload keeps prior receipts, and success is assembled only from receipts reloaded from the database.
- Keeps exact-SHA research, server-verified repository citations, strict candidate validation, and the existing human adoption/submission/approval authority boundaries.
- Preserves `planningRepositorySha` through Plan, WorkOrder, Task/Attempt, and execution manifest. SOFTWARE dispatch fails closed if the canonical worker has moved to a different SHA.
- Separates `Bound to this Plan` from `Latest unadopted candidate`. Candidates can be applied only to an absent or DRAFT Plan; approved/proposed revisions cannot be replaced in place.
- Auto-collapses the persistent chat dock on dense Plan/review routes from 900–1279px while keeping the reopen control and wide-desktop behavior.
- Suppresses the irrelevant editing feature-flag warning on approved Plans.
- Aligns the live planner prompt, citation validator, and JSON-safe candidate digest transport after real model output exposed mismatched contracts. Invalid output still fails before candidate persistence.
- Keeps nonmutating validator WorkOrders materially valid and distinguishes a dispatch checkpoint that mentions acceptance from an actual final-acceptance decision.

## Security and authority

The planning executor advertises no submission, approval, dispatch, execution, verification, acceptance, publication, or merge authority. Control-plane credentials are removed from its child environment. The candidate remains advisory until a human applies, saves, submits, and approves a Plan revision. Approval releases WorkOrders but does not start execution.

## Qualification

- `pnpm run qualify:planning-containment` — PASS. Allowed repository read succeeded; outside-host read, `.env` read, repository write, commit, push, and network failed as required; authority was `NONE` and control-plane credentials were absent.
- `pnpm run typecheck` — PASS across 19 workspace projects.
- `pnpm run test` — PASS: UI 69 files / 313 tests; orchestration 28 files / 185 tests plus one opt-in integration skip; Convex 107 files / 781 tests; all other workspace suites passed.
- `pnpm run ci:runtime-contract` — PASS at public contract v34.
- `pnpm run lint` — PASS across 19 workspace projects and 10 Skills.
- `pnpm run test:e2e:critical` — PASS: 9 Chromium checks.
- `pnpm run release:security` — PASS: no critical/high production advisories, authorization baseline unchanged at 637, repository secret scan clean, and Factory docs consistent.
- `pnpm run smoke:orchestration-start` — PASS.
- `pnpm run qualify:factory` — PASS across all 16 canonical stages, including full tests, lint, build, security, runtime contract, smoke, and whitespace integrity.
- Browser qualification — GitHub App and 16/16 Factory readiness, live exact-SHA research/generation, candidate review, draft adoption, submission, approval, WorkOrder release/approvals, refresh durability, and fail-closed dispatch were operated or observed in the real UI.

Detailed evidence: [live planning proof](docs/testing/evidence/governed-planning-agent-v1/live-planning-proof.md), [revision chain](docs/testing/evidence/governed-planning-agent-v1/revision-chain.md), [UI operation log](docs/testing/evidence/governed-planning-agent-v1/07-ui-operation-log.md), and [go/no-go record](docs/testing/evidence/governed-planning-agent-v1/go-no-go.md).

## Current verdict and limitation

**NO-GO for the complete live golden path.** GitHub App readiness is now `VERIFIED`, Factory readiness is 16/16, and the browser path produced and human-approved an exact-SHA Plan with two released WorkOrders. The first real UI dispatch then failed closed before Task/Attempt creation. The implementation WorkOrder is `CRITICAL`/`RED`; the sole frozen Factory route and boundary are qualified only for `MISSION_PLANNING`/`YELLOW`, and the route exposes no cost estimate under the hard budget. Routing decision `zh7dqvsgbw0h0sj6j6wxspqmed8d9typ` recorded all three blockers.

No authority override, downgraded WorkOrder, synthetic Attempt, verification record, or PR was created. Recommendation: **DO NOT MERGE** until a separately reviewed exact route and Factory version are qualified for the WorkOrder's execution workload, `RED` boundary, and cost policy, then the same browser path reaches independent verification.
