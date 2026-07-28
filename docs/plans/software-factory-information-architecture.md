---
title: "Software Factory Information Architecture"
date: 2026-07-28
status: proposed
---

# Software Factory Information Architecture

## Principle

Navigation represents operator jobs and authoritative objects, not every
component in the repository. Detail, tab, and developer-tool destinations do
not each need a top-level page.

## Existing default EOS tree

The route-capability filter currently shows live routes by default:

```text
Overview
  Command Center
Strategy
  Missions
Delivery
  Work Orders
  Tasks
Operations
  Agent Registry
  Queue
  Approvals & Audit
  Incidents
Knowledge
  Context Catalog [Global]
  Memory
  Docs [Global]
Governance
  Identities
Settings
  Workspaces & Repositories
  Model Routing
```

Preview/demo flags add Objectives, Factory Board, Execution, Pipelines, Task
Graph, Cost, Loop Engineering, Quality/Automation, skill subpages, Policies,
Deployments, QC Rulesets, Gateway, Database, Developer Tools, Labs, and
demo-backed Intelligence views.

This maturity filter is a strong foundation. The problem is that the expanded
tree still exposes overlapping products rather than coherent jobs.

## Proposed tree

```text
Overview
  Command Center

Strategy
  Goals
  Missions

Delivery
  Work Orders
  Tasks
  Runs & Pipelines

Operations
  Agent Registry
  Queue & Capacity
  Approvals & Audit
  Incidents & Cost

Quality
  Requirements & Evidence
  Test & Eval Runs
  Findings
  Environments

Knowledge
  Context Registry
  Memory
  Docs [Global]

Settings
  Workspaces & Repositories
  Identities & Access
  Policies
  Model Routing
  Deployments

Developer Tools / Labs [collapsed, flagged]
```

## Scope contract

| Scope | Rule | Examples |
| --- | --- | --- |
| Workspace | URL carries `workspace`; query and mutation enforce it | Missions, WorkOrders, Tasks, agents, memory |
| Repository | Subscope within workspace; never implied from title | pipelines, commits, worktrees, context |
| Global read-only | Explicit GLOBAL badge; no workspace metric mixing | Context Catalog, Docs |
| Tenant/admin | Role gated and absent for normal operators | Database/data explorer, global policy |
| Demo | Dedicated demo workspace/flag and provenance | Atlas narrative, seed actions |

“All workspaces” is an explicit aggregate mode with permission-aware totals,
not a null value that silently selects a default workspace.

## Route mapping and disposition

| Current route/view | Target | Decision | Migration |
| --- | --- | --- | --- |
| `command-center` | `/v2/command-center` | KEEP | No change |
| `goals` | `/v2/goals` | ENHANCE/RENAME Objectives→Goals | Alias old route/label |
| `missions` | `/v2/missions` | KEEP | Fix details below |
| `mission-detail` query-state view | `/v2/missions/:missionId` | REBUILD | Redirect old query link |
| `control-work-orders` | `/v2/work-orders` | RENAME | Preserve alias |
| `tasks` | `/v2/tasks` | KEEP | Add relationship query params |
| `trace-inspector`, `execution` | `/v2/runs/:runId` | CONSOLIDATE | Redirect both |
| `code`, `pipeline`, `content-pipeline` | `/v2/pipelines` and detail | CONSOLIDATE | Keep typed stage filters |
| `dag` | Mission Plan/Run detail Graph tab | MOVE | Route alias opens appropriate tab |
| `factory` | Work Orders board mode | CONSOLIDATE | Feature flag before removal |
| `agents` | `/v2/agents` | KEEP | Add identity/version detail |
| `atc` | `/v2/queue` | RENAME | Preserve alias |
| `audit`, `control-approvals` | `/v2/decisions` | CONSOLIDATE | Tabs: Pending, History, Audit |
| `telemetry` | `/v2/incidents` | ENHANCE/RENAME | Telemetry becomes detail tab |
| `analytics` | Incidents & Cost tabs | MOVE | Alias with `tab=cost` |
| `qc-dashboard`, `qc-runs`, `qc-findings`, `qc-metrics`, `qc-environments`, `qc-rulesets` | `/v2/quality` | CONSOLIDATE | Tab redirects |
| `skills`, registry lifecycle/evaluate/inventory/installations/runs | `/v2/context` | CONSOLIDATE | Global Catalog + Workspace tabs |
| `memory` | `/v2/memory` | REBUILD IA | One tab system, not nested Memory |
| `docs` | `/v2/docs` | KEEP GLOBAL | Label and contextual links |
| `identity` | Settings → Identities & Access | MOVE | Alias |
| `policies`, `qc-rulesets` | Settings → Policies | CONSOLIDATE | Policy/QC tabs |
| `model-routing` | Settings → Model Routing | KEEP | No change |
| `deployments` | Settings → Deployments | KEEP PREVIEW | Promote after gate |
| `projects` | Settings → Workspaces & Repositories | KEEP | No change |
| `gateway` | Settings → Integrations | MOVE | Role gate |
| `system` | Developer Tools → Database | MOVE | Admin role gate |
| effectiveness/health/readiness/friction/recommendations/dossier | No production nav | DEPRECATE DEMO | Hide until live measured model |
| recorder/test generation/API import | Developer Tools | MOVE | Keep preview |
| flaky/Gherkin/hybrid/CodeGen/build pipeline | Labs | MOVE/CONSOLIDATE | Promote only through capability gate |
| meetings/telegraph/content/collaboration legacy views | Labs or contextual panels | MOVE | No V1 production nav |

## Entity-detail navigation

Canonical routes:

```text
/v2/goals/:goalId
/v2/missions/:missionId
/v2/work-orders/:workOrderId
/v2/tasks/:taskId
/v2/runs/:runId
/v2/evidence/:evidenceId
/v2/decisions/:decisionId
/v2/agents/:agentId
/v2/memory/entities/:entityId
```

Query parameters hold view state, not identity:

```text
?workspace=<id>
&view=attention
&filter=blocked
&group=mission
&sort=age-desc
&tab=evidence
```

Rules:

- Stable IDs, never titles, select entities.
- Back/forward changes selection and tabs correctly.
- Refresh restores workspace, filters, selection, and tab.
- Links verify entity belongs to the active workspace; mismatch produces an
  explicit access/scope error.
- Parent/child links are bidirectional.
- A detail route can render without first visiting a list.

## Consolidation decisions

### Quality

One page with Overview, Requirements & Evidence, Runs, Findings, Environments,
Rules, and Trends. Product tests, agent evaluations, and manual checks retain
distinct types inside the same evidence model.

### Pipelines

One domain. Code and content are PipelineDefinition types with different stage
schemas. `WorkflowRun` remains execution; pipeline views are a projection, not
another run system.

### Context

One Context Registry:

- Global Catalog;
- Workspace Inventory;
- Installations;
- Evaluation;
- Lifecycle.

### Memory

One tab row:

- Overview;
- Semantic;
- Episodic;
- Procedural;
- Graph;
- Ingestion & Health.

Remove the current nested Knowledge graph→Memory→Graph navigation.

### Decisions

Pending approval, plan review, WorkOrder approval, waivers, deployment gates,
and historical audit use one decision center with entity/type filters.

## Rename decisions

- Objectives → Goals.
- Queue/ATC → Queue & Capacity.
- Execution/Trace Inspector → Runs.
- Approvals & Audit → Decisions initially, or keep user-facing “Approvals &
  Audit” with `/decisions` as the canonical domain.
- QC → Quality.
- Context Catalog → Context Registry for the combined surface; “Catalog” is a
  Global tab.
- Database remains an admin tool, never a primary operator concept.

## Deprecation/removal decisions

Deprecate production navigation for demo intelligence surfaces. Do not delete
them until equivalent live metrics exist or the demo tour is formally removed.

Remove from live UI:

- WorkOrders “Seed demo” button;
- voice button until supported, or keep disabled only in an explicit preview;
- duplicated Memory tab system;
- Build Pipeline as a separate product after pipeline consolidation.

Do not create:

- a separate Roadmaps page;
- a second Mission or pipeline entity;
- an Agent Office/Council as a core delivery view;
- a top-level page for every graph or inspector.

## Migration approach

1. Add canonical route table and route tests.
2. Fix Mission details first; current route is broken.
3. Add redirects/aliases with telemetry.
4. Add target groups behind `ui.navigation.target-ia`.
5. Move one domain at a time without changing its data contract.
6. Persist old URL filters through redirect where possible.
7. Run link crawl, direct deep-link, back/forward, refresh, workspace mismatch,
   keyboard, mobile, and axe tests.
8. Monitor route usage and errors for one release.
9. Hide old entries, then remove code only when no unique live capability
   remains.

## Navigation acceptance criteria

- Every visible route has scope, maturity, owner, source, and browser test.
- Zero live routes render demo fallback.
- Direct entity links load independently and reject workspace mismatch.
- Back/forward and refresh preserve deterministic state.
- Global routes are labeled; global data never enters workspace totals.
- Preview/demo/Labs are collapsed and visibly badged.
- No capability has two authoritative list/detail routes.
- Main navigation is usable by keyboard and at 320 px / 200% zoom.

