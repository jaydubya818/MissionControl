---
title: "Software Factory Capability Map"
date: 2026-07-28
baseline_commit: 478cac7c24bca636015bc9ba52d397ce403c2b59
status: superseded
superseded_by: ../product/software-factory-capability-maturity.md
---

# Software Factory Capability Map

> Historical baseline only. This map describes commit `478cac7c` and is not a
> statement of current capability. Use the
> [Software Factory Capability Maturity Ledger](../product/software-factory-capability-maturity.md)
> for current status.

Status meanings:

- **Live-proven:** real data and a targeted browser journey were observed.
- **Live-partial:** real data exists, but a material action or journey is
  missing/broken.
- **Preview:** declared preview or incomplete product contract.
- **Demo:** fixture/narrative-backed.
- **Hidden/missing:** no production route or complete capability.

Complexity uses S/M/L/XL. The disposition vocabulary is KEEP, ENHANCE,
CONSOLIDATE, MOVE, RENAME, DEPRECATE, REMOVE, REBUILD, or RESEARCH FURTHER.

| Capability | Existing view | Backend/data source | Status | Evidence | Material gap | Recommendation | Pri | Cx | Dependency | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workspace/repository | Workspaces & Repositories | `projects`, Convex | Live-proven | Selected Research Lab persisted in URL/refresh | Membership enforcement TODOs | Add roles and repository health | P0 | M | Auth model | ENHANCE |
| Goals/objectives | Goals | Goals/task links | Preview | Declared preview in route registry | Weak Mission relationship and no proven lifecycle | Keep as strategic outcome only | P1 | M | Domain IA | ENHANCE |
| Mission portfolio | Missions | `missions.list` | Live-partial | Nine UI-created DRAFTs persisted | DRAFT mislabeled “In progress” | Fix state projection | P0 | S | None | ENHANCE |
| Mission detail | Mission Detail | `missions.get` | Live-partial | Component exists; direct and clicked routes return to portfolio | Unreachable route, no refresh/back proof | Fix canonical route and workspace authorization | P0 | M | Route sync | REBUILD |
| Mission draft authoring | Define Mission dialog | `missions.createDraft` | Live-partial | UI creates title/objective/stop only | Context, constraints, sources, budget, owner, concurrency and iterations absent; no edit | Full draft form and autosave | P0 | M | Mission detail | ENHANCE |
| Mission planning | No complete UI | `missions.submitPlan` | Hidden/missing | Server mutation and schema exist | No builder, diff, validation, revision UI | Add versioned plan builder | P0 | L | Draft authoring | REBUILD |
| Mission approval | Approval Center/none specific | `missions.approvePlan`, approvals | Hidden/missing | Backend approval command exists | No reject reason/revision UI; authority not enforced | Use shared approval decision contract | P0 | L | Auth and plan UI | REBUILD |
| Mission WorkOrder release | No UI | `missionPlans`, `workOrders` | Hidden/missing | Blueprint stored but approval does not materialize WorkOrders | No idempotent release/eligibility action | Add server-owned materialization | P0 | L | Approved plan | REBUILD |
| Mission handoff/validation | Detail component/backend | `missionHandoffs`, `validationAssertions`, receipts | Live-partial | Backend supports record/accept; detail code has tabs | No authoring or evidence drilldown journey | Add independent validator workflow | P0 | L | Run identity | ENHANCE |
| WorkOrder list/detail | Work Orders | `workOrders.*` | Live-proven | Seven scoped records, filters, governed actions visible | Dense master-detail, demo seed action, relationship/aging gaps | Attention default and unified tabs | P1 | M | Mission links | ENHANCE |
| WorkOrder governance | Work Orders/Approvals | approval decisions, receipts, revisions | Live-proven | 35 focused governance/dispatch tests pass | Authorization/role enforcement incomplete | Enforce role and expose reasons | P0 | M | Auth model | ENHANCE |
| Tasks board | Tasks | `tasks.*` | Live-proven | 84 scoped tasks, search/filter/move controls | Horizontal density, review backlog, legacy/mission ambiguity | Add table mode and attention/review queues | P1 | L | Relationship model | ENHANCE |
| Create Task/PRD import | Tasks dialogs | tasks/import functions | Live-proven | Prior E2E report proves scoped import and persistence | Task creation can bypass outcome hierarchy | Default creation from WorkOrder; retain standalone exception | P1 | M | Mission/WO links | ENHANCE |
| Runs/execution inspector | Execution | workflow runs, run events/artifacts | Live-partial | Inspector/model tests exist; route is preview | Correlation is not consistently discoverable from every parent | Canonical bidirectional links | P1 | M | URL contract | ENHANCE |
| Task graph/Mission DAG | Task Graph | workflow engine and dependencies | Preview | DAG contracts and loop execution proven in prior report | Strategic Mission graph and execution graph are conflated | Show plan graph vs runtime graph explicitly | P1 | M | Mission plan | RENAME |
| Pipeline | Pipelines/Build Pipeline/Content | workflows, deployments, GitHub | Preview | Several components/routes exist | Duplicate domains, no single authoritative pipeline run | One pipeline model with typed stages | P2 | XL | Quality gates | CONSOLIDATE |
| Agent Registry | Agent Registry | agents, routing policies | Live-proven | Scoped agents visible; lifecycle and model-routing work merged | Identity/version/capacity relationship incomplete | Add governed worker profile | P1 | L | Identity | ENHANCE |
| Identity Directory | Identities | identity records/scans | Live-partial | Route declared live; supplied workspace previously empty | Ingestion, ownership and authorization not end to end | Make identity mandatory for active agents | P0 | L | Auth model | ENHANCE |
| Model routing | Model Routing | routing policies/decisions | Live-proven | Persisted policies and decision capture exist | Evaluation feedback and provider capacity are incomplete | Close decision→outcome loop | P1 | M | Outcome metrics | ENHANCE |
| Queue/ATC | Queue | tasks/agents | Live-proven | Declared live and project scoped | Overlaps Tasks attention handling | Keep as capacity/dispatch, not work tracking | P1 | M | Task IA | RENAME |
| Approvals & Audit | Approval Center/Audit | approvals, decisions, events | Live-proven | Scoped empty state observed; WorkOrder approvals exist | Mission plans, waivers and aging not unified | One entity-aware decision center | P0 | L | Auth and Mission | CONSOLIDATE |
| Incidents/telemetry | Telemetry | alerts, runs, tool calls | Live-partial | Declared live | Incident lifecycle, correlation and browser/API errors fragmented | Incident object linked to run/entity | P1 | L | OTel mapping | ENHANCE |
| Command Center | Command Center | live scoped projections plus labeled demo | Live-proven | Research Lab counts changed with workspace | Some metrics low confidence; release gate says not enforced | Keep exception/evidence-first and remove residual wallpaper | P1 | M | Quality gates | ENHANCE |
| QC rules | QC Rulesets | rulesets, QC runs | Preview | Route preview; TODO tenant resolution/policy evaluation | Not authoritative release gate | Consolidate under Quality | P1 | L | Evidence model | CONSOLIDATE |
| QC dashboard/runs/findings | Multiple QC views | QC tables | Preview | Components exist | Fragmented navigation and fixture risk | One Quality page with tabs | P1 | L | QC rules | CONSOLIDATE |
| Memory overview | Memory | memory records/packages/runs | Live-partial | Research Lab showed zero scoped records | Two nested Memory navigation models; incomplete durable episode storage | Simplify and add provenance/lifecycle | P1 | L | Memory contract | REBUILD |
| Knowledge graph | Memory → Knowledge graph → Graph | graph nodes/edges/hyperedges | Live-partial | Empty state observed; import/query functions exist; 4 component tests pass | Import-focused; no governed ingestion/retrieval evaluation | Add adapter and deterministic baseline | P1 | XL | Memory contract | ENHANCE |
| Context/skills | Context Catalog plus five preview pages | context packages/installations/evals | Live/preview mix | Global catalog declared live; lifecycle pages preview | Catalog, installed context and evaluations are fragmented | One Context Registry with global/workspace tabs | P1 | L | IA | CONSOLIDATE |
| Docs | Docs | docs site/static content | Live-proven | Declared global and labeled GLOBAL | Search/version/source ownership limited | Keep global; link contextual docs | P2 | M | Search | KEEP |
| Chat | Chat dock/Chat | mission chat and shared history | Live-partial | Empty messages disabled; prior E2E proves linked work/history | Factory Agent modes and failure-to-work handoff need clearer contract | Make requests create/link drafts, never hidden work | P1 | L | Mission/WO create | ENHANCE |
| Search | Search/command palette | multiple queries | Live-partial | Shell search reachable | Cross-entity relevance, scope, and result actions unproven | Unified scoped entity search | P1 | L | Canonical IDs | CONSOLIDATE |
| Calendar/schedules | Calendar, Schedule, Run Schedule, Agent Schedules | scheduled jobs/crons | Preview/mixed | Multiple routes/components | Duplicate concepts, missed-run/incidents not unified | One Automation & Schedule surface | P2 | L | Incident model | CONSOLIDATE |
| Automations control plane | Operations → Automations | automation definitions, WorkOrders, workflows, receipts | V1 implementation | Candidate→disabled definition→explicit activation→idempotent review gate | Automatic dispatch and mutating levels intentionally disabled | Prove LEVEL_0/1 before autonomy expansion | P2 | M | WorkOrder governance | ENHANCE |
| Deployments | Deployments | governance/deployments | Preview | Declared preview | Release gate and rollback not fully enforced | Promote only after evidence gate | P1 | L | Pipeline/QC | ENHANCE |
| System/database | Database | Convex data explorer | Preview/admin | Route preview | High-power tool in operator nav; role gating absent | Move to role-gated Settings/Developer Tools | P0 | M | Auth | MOVE |
| Meetings/Telegraph/collaboration | Labs and legacy routes | meetings/telegraph | Hidden/demo/secondary | Components exist outside live EOS default | Not core to governed delivery | Keep Labs until linked to durable work | P3 | M | IA | MOVE |
| Effectiveness/readiness/friction/recommendations/dossiers | Intelligence demo routes | demo data | Demo | Registry labels them demo | Could be mistaken for measured analytics | Hide until real measures and drilldowns | P2 | L | Outcome metrics | DEPRECATE |
| Recorder/API Import/Gherkin/Flaky/Hybrid/CodeGen | Developer Tools/Labs | mixed | Preview | Registry labels preview | No core operator journey or acceptance proof | Keep feature-flagged; promote by evidence | P3 | varies | Capability owner | MOVE |
| Continuous research/Loop Engineering | Loop Engineering | cycles, tasks, WorkOrders, graph runs | Preview with proven backend | Prior E2E report documents four bounded cycles | Operator UI and recurring automation remain incomplete | Keep bounded, approval-gated, evidence-led | P2 | L | Mission vertical slice | ENHANCE |

## Cross-cutting conclusions

1. Route maturity is necessary but insufficient. “Live” must require a real
   create/read/update journey, authorization, audit, refresh, and browser proof.
2. Capabilities should be measured with a five-stage maturity model:
   route-only, real-read, UI-write, governed/audited, browser-proven.
3. The application should not expose a second mutable source of truth for
   Missions, pipelines, quality, or memory.
4. The strongest removal candidates are live demo seeding and production-menu
   entries that only render fixtures. Most other experimental components should
   be hidden or consolidated before deletion.
