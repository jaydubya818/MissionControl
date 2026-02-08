# Mission Control Intelligence Layer Plan

Last updated: 2026-02-08
Owner: Product + Platform

This plan reconciles the existing roadmap docs in `docs/planning/` with current repository reality.

## 1. Scope

Intelligence Layer means the control-plane logic that determines:
- how work is routed, decomposed, and assigned
- when policy allows, blocks, or escalates actions
- how operators understand and intervene in live execution

Core pillars:
- Task State Machine
- Guardrails (risk/approval/budget)
- Observability and explainability
- Operator control

## 2. Source Plans Reviewed

- `docs/planning/IMPLEMENTATION_PLAN.md`
- `docs/planning/IMPLEMENTATION_PLAN_V1.3.md`
- `docs/planning/IMPLEMENTATION_PLAN_V1.4.md`
- `docs/planning/IMPLEMENTATION_ROADMAP_V1.6.md`

## 3. Plan vs Reality Matrix

| Capability | Planned | Current Reality | Gap | Tracking Issue / Acceptance Criteria |
|---|---|---|---|---|
| Deterministic task lifecycle | Fully implemented | Implemented in `convex/tasks.ts` with transition rules and audit table | Remove legacy duplicate variants: legacy transition helpers previously in `convex/lib/stateMachine.ts` (if present) and any duplicated status-update paths outside `tasks.transition` | AC: Single canonical transition path via `tasks.transition`; zero duplicate state-change code paths; all 8 states exercised in tests |
| Risk policy + approvals | Fully implemented | Implemented (`convex/policy.ts`, `convex/approvals.ts`) with risk classifier + allowlists | Missing explainability: decision provenance (which rule fired and why), model inputs/outputs logging, risk classifier confidence scores, and an approvals audit endpoint in `convex/approvals.ts` | AC: Every policy decision includes `triggeredRules` with provenance; approvals audit endpoint returns full decision chain; classifier exposes confidence |
| Full timeline/audit | Fully implemented | Present but split across transitions/messages/runs/toolCalls/activities and not fully unified in UI | Unify event stream and causality fields across tables into a single ordered timeline query | AC: Single `getTaskTimeline` query returns all event types ordered; each event has `timestamp`, `actor`, `eventType`, `taskId`, `projectId` |
| Smart assignment | Implemented | `convex/taskRouter.ts` present with scoring | Needs operator visibility: operator dashboard showing assignment rationale, per-task scoring logs, scoring rationale export from `convex/taskRouter.ts`, and assignment metrics/SLIs | AC: Operator can view scoring breakdown per assignment; rationale exportable as JSON; SLIs tracked for assignment quality |
| Multi-executor automation | Implemented | Exists (`executionRequests`, `executorRouter`) but contains stub/manual sections | Mark as partial, add rollout gating before claiming completion | AC: All stub sections replaced with implementations or explicitly gated behind feature flags; rollout gate documented |
| Search and command center | Implemented | Search API exists, UI integration has contract drift in some places | Fix drifted contracts: search results API contract (response shape vs UI expectations), quick-action payload schema (command palette actions), and UI integration points (`CommandPalette.tsx`, `SearchBar.tsx`) | AC: Search API response shape matches TypeScript types consumed by UI; zero runtime type errors; quick-action payloads validated |
| Security/multi-tenant isolation | Production-ready | Project scoping optional in many read paths, minimal authz checks | Mandatory project scope + authz enforcement is required (see Phase 1 requirements below) | AC: All read queries include project filter; all mutations validate project ownership; 0 unauthorized cross-project data leaks in pen test |
| CI and hardening | Production-ready | No GitHub Actions workflow in repo | Add CI baseline and quality gates | AC: GitHub Actions workflow runs lint, type-check, and tests on every PR; merge blocked on failure |

## 4. Corrected Target Contracts

### 4.1 Policy Decision Contract

All policy decisions should expose:
- `decision`: `ALLOW | NEEDS_APPROVAL | DENY`
- `riskLevel`: `GREEN | YELLOW | RED`
- `triggeredRules`: array of machine-readable rule IDs
- `requiredApprovals`: array with type, reason, expiry expectation
- `remediationHints`: actionable next steps for operator/agent

### 4.2 Task Timeline Contract

Task timeline should be a single ordered stream including:
- state transitions
- policy decisions
- approvals requested/decided
- agent runs and tool calls
- operator actions
- cost deltas

Each event must include:
- timestamp
- actor (`SYSTEM | HUMAN | AGENT`)
- event type
- task and project IDs
- optional `before`/`after` and metadata payload

### 4.3 Simulation Contract (Dry Run)

Simulation endpoints should return no side effects and include:
- predicted transition validity + violated constraints
- predicted policy decision and required approvals
- risk level and impacted guardrails
- recommended remediations

## 5. Telemetry & SLOs

Minimum telemetry:
- policy decision counts by risk and outcome
- approval latency (request -> decision)
- task dwell time by state
- blocked loop incidents and recovery time
- cost per task/run and budget breach rates

Initial SLO targets:
- P95 policy decision latency < 250ms
- P95 approval load query < 500ms
- 0 unauthorized cross-project data leaks
- 100% transition attempts auditable

## 6. Evaluation Plan

Evaluation should include:
- transition validity test matrix (all allowed/disallowed edges)
- policy decision snapshot tests (risk and approval triggers)
- simulation consistency tests (dry-run matches live checks)
- timeline completeness tests for canonical event types
- Security/authorization tests: validate cross-tenant isolation and project-scoping enforcement (ref: Section 5 SLO "0 unauthorized cross-project data leaks" and Section 3 security gap)
- Performance/load tests: validate SLO targets including P95 policy decision latency < 250ms, P95 approval load query < 500ms, and cost-per-query benchmarks (ref: Section 5 SLOs)
- Chaos/resilience tests: specifically exercise blocked loop recovery, including stuck-task detection and automatic escalation within recovery time SLO (ref: Section 5 "blocked loop incidents and recovery time")

## 7. Rollout Plan

Phase 1 (Now):
- Fix contract drift in search/palette and timeline aggregation
- Add policy explainability + dry-run simulation
- Upgrade approvals center + agent registry controls
- Add CI gates
- **Enforce mandatory project scoping and authz checks** (moved from Phase 2 -- security is gating)
  - All read queries must include a project filter
  - All mutations must validate project ownership
  - Security audit / penetration test must pass before "Production-ready" is claimed
  - Gating SLO: "0 unauthorized cross-project data leaks" must be demonstrated

Phase 2 (Next):
- Remove duplicated legacy state/policy/report paths
- Reduce `.collect()` hot paths with indexed query patterns

Phase 3 (Later):
- Harden executor automation (remove stubs)
- Add richer alerting/reporting exports
- Add policy/routing offline eval harness with benchmark datasets

## 8. Explicit Non-Goals (Current Iteration)

- Replacing Convex with a custom API layer
- Building a full RBAC system from scratch in one pass
- Full autonomous executor orchestration without staged rollout safeguards

## 9. Definition of Done for Intelligence Layer v1

v1 is done when:
- operators can explain any task decision path in under 60 seconds
- risky actions are consistently gated and auditable
- dry-run simulation is available before action execution
- task and approval flows are stable, test-covered, and CI-protected
- README/docs reflect real system behavior, not aspirational behavior

## 10. Principal Engineer Recommendations

1. Make project scoping mandatory in all list/search queries.
- Rationale: this is the highest trust boundary and easiest place for accidental data leaks.

2. Add rule IDs to every policy decision path and store them in timeline events.
- Rationale: enables deterministic debugging and measurable policy quality.

3. Promote simulation-first UX for risky transitions.
- Rationale: operators should see blockers/approvals before committing state changes.

4. Standardize event schema across `taskTransitions`, `activities`, `runs`, and `toolCalls`.
- Rationale: avoids brittle UI adapters and simplifies export/report pipelines.

5. Add index-first query audits for hot dashboards.
- Rationale: reduce `.collect()` + in-memory filtering to prevent latency regressions as volume grows.

6. Gate executor automation behind explicit rollout flags.
- Rationale: current code includes partial/stub behavior; feature flags prevent unsafe assumptions.

## 11. Tradeoffs and Risks

- Strict project scoping will break some convenience queries. This is intentional and should ship with explicit migration notes.
- Rich timeline/event payloads increase write volume. Mitigate with retention rules and lightweight metadata contracts.
- Simulation surfaces may expose policy complexity to users. UX should prioritize actionable remediation hints over raw internals.
- all queries enforce mandatory project scoping with zero cross-tenant leaks (validate via security/authorization tests in Section 6 and penetration test per Phase 1 gating)
- all SLO targets are met and monitored in production (validate via performance/load tests in Section 6; ref: Section 5 SLO targets)
