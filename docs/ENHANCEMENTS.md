# Mission Control Enhancements Backlog

Date: 2026-02-13  
Scope: additive backlog aligned to PRD + ROADMAP (does not replace active milestones)

## Prioritization Rubric

- `P1`: high trust/risk impact for V1 launch
- `P2`: meaningful operator efficiency and scale gains
- `P3`: quality-of-life and longer-horizon improvements

## Enhancements

| Priority | Enhancement | Rationale | Rough LOE | Dependencies |
|---|---|---|---|---|
| P1 | Timeline Diff View (before/after state comparer) | Improves audit readability for governance-heavy transitions and policy decisions. | M | Canonical `taskEvents` adoption in timeline UI |
| P1 | Policy Decision Trace Panel | Shows which specific rule IDs caused `ALLOW/NEEDS_APPROVAL/DENY`, increasing operator trust. | M | Stable `ruleId` emission in task events |
| P1 | Project-Scoped Default Filters | Prevents accidental cross-project context in task/search/approvals views. | S | Security + tenancy hardening milestone |
| P1 | Safe Mode Presets (`PAUSED`/`DRAINING` runbook actions) | Reduces operator mistakes during incidents with one-click controlled actions. | S | Operator controls + runbook snippets |
| P2 | Global Search Facets (task status, risk, assignee, source) | Speeds triage and reduces manual scanning across high-volume queues. | M | Indexed query improvements on tasks/approvals/messages |
| P2 | Approval Queue SLA Indicators | Surfaces oldest pending/escalated approvals and urgency thresholds. | M | Approvals + alerts query coverage |
| P2 | Structured Audit Export Bundles | Produces downloadable evidence packets for incidents/compliance review. | M | Canonical timeline + activity event completeness |
| P2 | Event Ingestion Metrics Dashboard | Adds observability for event throughput, dedupe rate, and backfill drift. | M | Metrics sink (Convex table or external telemetry) |
| P2 | Seed Scenario Packs (`happy-path`, `escalation`, `failure`) | Speeds local QA and onboarding by reproducibly seeding realistic governance cases. | S | Existing seed framework in `convex/seed*.ts` |
| P3 | Timeline Virtualization for Large Tasks | Maintains responsive UI on long-lived tasks with heavy event history. | M | UI timeline component refactor |
| P3 | Query Guardrail Linter Script | Catches `.collect()` + in-memory filtering in hot paths pre-merge. | M | Defined hot-path allowlist and CI hook |
| P3 | Reliability Chaos Checks for Orchestration Tick | Exercises retry/escalation behavior under partial outages. | L | Orchestration server integration harness |

## Notes

- `P1` items are the best post-Milestone-1 candidates because they directly improve trust, governance clarity, and launch safety.
- `P2`/`P3` should be pulled in only after roadmap "Next" tenancy/security work is stable.
