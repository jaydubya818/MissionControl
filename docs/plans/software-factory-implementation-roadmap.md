---
title: "Software Factory Implementation Roadmap"
date: 2026-07-28
status: proposed
---

# Software Factory Implementation Roadmap

## Delivery rules

- One approved, bounded PR at a time across shared schema/navigation files.
- Read-only discovery may run concurrently; repository mutation uses isolated
  worktrees and explicit ownership.
- Every PR has one operator outcome, a rollback flag or additive migration, and
  focused unit/integration/browser proof.
- No full-suite run is required for every small PR. Run affected tests locally,
  then use CI for the broader gate.
- No item is “done” because its UI renders. It must read real scoped data,
  perform authorized writes, audit decisions, recover, refresh, and pass its
  browser journey.

## P0 — correctness and trust

### P0.1 Mission navigation and draft truth

- **Problem:** DRAFT displays “In progress”; cards and direct detail links
  return to the portfolio.
- **Outcome:** A created Mission opens, edits, refreshes, and navigates
  back/forward with truthful state and workspace enforcement.
- **Scope:** canonical `/v2/missions/:id`; route alias; state copy; full draft
  fields; edit/autosave; loading/empty/error/success; duplicate-submit guard.
- **Non-scope:** plan builder, approval, WorkOrders, execution.
- **Likely files:** `AppShellV2.tsx`, route config, `MissionPortfolioView.tsx`,
  `MissionDetailView.tsx`, a focused Mission draft form/model, `convex/missions.ts`.
- **Schema:** ideally none; fields already exist. Add only revision timestamp or
  archived state if contract review requires it.
- **UI/migration:** redirect query-based and `mission-detail` URLs; preserve
  workspace and filters.
- **Acceptance:** create, open, edit all fields, refresh, direct-link,
  back/forward, workspace mismatch rejection, one create event.
- **Tests:** route model, Mission view model, mutation validation/idempotency,
  Playwright desktop/narrow/axe.
- **Dependencies/risk:** none; route synchronization race is primary risk.
- **Complexity/PR:** M; **PR 1**.

### P0.2 Mission plan, approval, and WorkOrder release

- **Problem:** Server contracts exist but cannot be operated end to end in UI;
  approved blueprints do not materialize WorkOrders.
- **Outcome:** A complete approved plan releases eligible WorkOrders once.
- **Scope:** plan/blueprint/assertion builder; dependency validation; preview and
  revision diff; submit; approve/reject with reason; resubmit; immutable
  approval; idempotent WorkOrder materialization; serial eligibility display.
- **Non-scope:** automatic execution, validation runner, final acceptance.
- **Likely files:** Mission UI/models; `convex/missions.ts`,
  `convex/lib/missionGovernance.ts`, `convex/workOrders.ts`, schema only if
  rejection/revision decisions need new explicit fields; approval components.
- **Schema:** additive decision/rejection reference and blueprint
  materialization IDs if existing event metadata is insufficient.
- **Migration:** existing DRAFTs remain valid; approved legacy plans are not
  materialized automatically.
- **Acceptance:** invalid graph/empty assertions blocked; rejection reason
  retained; resubmission creates revision; duplicate approval/release creates no
  duplicates; WorkOrder order and links are correct.
- **Tests:** pure plan validation, Convex integration, race/idempotency,
  Playwright author→reject→revise→approve→release.
- **Dependencies/risk:** P0.1 and authorization decision; highest risk is
  partial failure across assertion/WorkOrder creation.
- **Complexity/PR:** L; **PR 2**.

### P0.3 Authorization and identity enforcement

- **Problem:** Project actions contain TODO membership/role checks; actor IDs
  are often strings such as `operator`.
- **Outcome:** Server-side authorization governs plan, approval, waiver,
  dispatch, acceptance, database, and deployment actions.
- **Scope:** role matrix, authenticated identity resolution, project membership,
  decision actor snapshot, denied-action audit, admin gating.
- **Non-scope:** enterprise SSO provisioning and complex ABAC.
- **Likely files:** project/session/auth helpers, Mission/WorkOrder/approval/
  deployment mutations, shell capability checks.
- **Schema:** additive membership/role indexes and actor identity refs.
- **Migration:** bootstrap one explicit owner/admin; quarantine unknown mutating
  agents; do not fabricate historical identities.
- **Acceptance:** unauthorized action is rejected server-side and audited;
  authorized action retains actor/role/timestamp.
- **Tests:** table-driven permission matrix, tenant/workspace isolation, browser
  role journeys.
- **Dependencies/risk:** product-owner role decision; lockout migration risk.
- **Complexity/PR:** L; separate P0 after PR 2 or a prerequisite if multi-user
  deployment is imminent.

### P0.4 Evidence and acceptance integrity

- **Problem:** Mission assertions, WorkOrder criteria, receipts, QC runs, and
  waivers are not one enforced evidence gate.
- **Outcome:** Failed, missing, stale, unknown, or unauthorized evidence blocks
  acceptance and release.
- **Scope:** canonical evidence envelope, verifier identity, environment/build,
  freshness, waiver expiry, assertion/criterion mappings, gate evaluator.
- **Non-scope:** analytics warehouse and every test provider.
- **Likely files:** schema, Mission/WorkOrder governance, QC adapters, evidence
  panels, approval center.
- **Schema:** additive evidence type/freshness/verifier/decision relations.
- **Migration:** existing receipts become `legacy` with explicit confidence;
  never infer independent validation.
- **Acceptance/tests:** intentional fail/stale/unknown/waiver cases, blocked
  acceptance/deployment, recovery after fresh independent evidence.
- **Dependencies/risk:** P0.2 and P0.3; migration ambiguity.
- **Complexity/PR:** XL; split into evidence envelope then gate enforcement.

## P1 — operator effectiveness

### P1.1 WorkOrder and Task attention/traceability

- **Problem:** Dense WorkOrder master-detail and 84-task horizontal board hide
  age, relationships, and required action.
- **Outcome:** Operators triage Attention/Active/Review quickly and navigate the
  full entity chain.
- **Scope:** table mode, saved views, age/SLO, next owner/action, Mission and
  WorkOrder badges, attempt collapse, URL persistence, unified tabs and links.
- **Non-scope:** state-machine changes, hard WIP limits, bulk mutation.
- **Likely files:** `WorkOrdersView.tsx`, `Kanban.tsx`, Task cards/drawer,
  focused view models and query additions.
- **Schema:** optional indexed timestamps/owner fields only if not derivable.
- **Migration:** preserve board mode and old links; default to Attention under a
  feature flag.
- **Acceptance/tests:** filters/views refresh, blocked/review detail, relationship
  links, keyboard/narrow viewport, no contradictory state.
- **Dependencies/risk:** P0.1/2 canonical links; large-component blast radius.
- **Complexity/PR:** L; **PR 3**.

### P1.2 Navigation consolidation

- **Problem:** Expanded preview tree exposes overlapping QC, pipeline, context,
  Memory, schedule, and demo intelligence products.
- **Outcome:** Six job-oriented domains with stable canonical routes and
  explicit Global/Preview/Demo scope.
- **Scope:** target groups, redirects, telemetry, tabs, hide demo, role-gate
  database, remove live demo seed.
- **Non-scope:** rewriting underlying feature components.
- **Likely files:** EOS nav/route capabilities/filter, shell route model,
  wrappers for consolidated pages.
- **Schema:** none.
- **Migration:** alias for one release; track old-route usage.
- **Acceptance/tests:** link crawl, direct links, browser history, workspace
  state, responsive keyboard nav.
- **Dependencies/risk:** Mission route fix; bookmark churn.
- **Complexity/PR:** M.

### P1.3 Agent identity, capacity, and compatibility

- **Problem:** Agent Registry and routing are real, but identity/version/skill/
  permission/capacity are fragmented.
- **Outcome:** Every active worker has a governed profile and compatible
  assignment.
- **Scope:** template/version/instance/identity relations, compatibility guard,
  health/cost/capacity table, quarantine/retire enforcement.
- **Non-scope:** agent marketplace or autonomous hiring.
- **Likely files:** agents/identity/routing Convex functions and registry views.
- **Schema:** additive refs, version and capacity snapshots.
- **Migration:** deterministic backfill; unknown identity cannot mutate.
- **Acceptance/tests:** compatible assignment, denied incompatible/quarantined
  assignment, lifecycle audit, cost/health display.
- **Dependencies/risk:** P0.3; migration lockout.
- **Complexity/PR:** L.

### P1.4 Memory contract and Convex graph baseline

- **Problem:** Existing graph/import UI lacks governed memory lifecycle and
  measured retrieval.
- **Outcome:** Scoped, provenance-rich memory and provider-neutral graph access
  pass deterministic fixtures.
- **Scope:** memory envelope, GraphStoreAdapter, InMemory/Convex stores,
  deterministic graph/retrieval fixtures, consolidated Memory IA.
- **Non-scope:** Neo4j, whole-repo indexing, automatic fact promotion.
- **Likely files:** new graph-store package, Convex knowledge functions/schema,
  Memory wrapper/tabs, tests.
- **Schema:** additive provenance/lifecycle/version/index jobs.
- **Migration:** shadow reads and explicit legacy classification.
- **Acceptance/tests:** adapter contract, scope isolation, conflict/
  supersession, deterministic retrieval and browser empty/error states.
- **Dependencies/risk:** evidence identity; graph abstraction leakage.
- **Complexity/PR:** XL, split adapter/contract from ingestion.

## P2 — intelligence and automation

### P2.1 Governed memory ingestion and explainable retrieval

- **Problem:** No production source→claim→index→evaluation workflow.
- **Outcome:** Real sources produce cited, permission-filtered, explainable
  retrieval that improves one measured workflow.
- **Scope:** checkpointed ingestion, dedupe/conflict, hybrid retrieval,
  “why result,” correction/supersede, index health.
- **Non-scope:** provider migration.
- **Files/schema:** ingestion jobs, graph/vector adapters, Memory UI, evaluation
  datasets; additive job/index/claim tables.
- **Migration/tests:** shadow index, injection corpus, citation precision,
  leakage, latency/cost, browser correction/reindex.
- **Dependency/risk/cx:** P1.4 and P0.4; poisoning and cost; XL.

### P2.2 Unified quality control plane

- **Problem:** QC pages and evidence types are fragmented.
- **Outcome:** One Quality surface shows requirements, evidence, runs, findings,
  environments, rules, and trends from real data.
- **Scope:** UI consolidation and adapters; product tests vs agent evals vs
  manual checks.
- **Non-scope:** new test framework.
- **Files/schema:** QC views/functions plus evidence envelope; minimal schema
  after P0.4.
- **Migration/tests:** route aliases, fixture provenance labels, failing gate,
  axe and responsive journeys.
- **Dependency/risk/cx:** P0.4; flaky/noisy data; L.

### P2.3 Unified pipeline domain

- **Problem:** Code, content, build, DAG, and deployment surfaces overlap.
- **Outcome:** Typed PipelineDefinitions project authoritative WorkflowRuns and
  quality gates.
- **Scope:** stage definitions, run projection, repository/commit/PR/build/test/
  deploy/rollback traceability.
- **Non-scope:** custom CI replacement or auto-merge.
- **Files/schema:** pipeline/workflow/deployment/GitHub adapters and views;
  additive definition/stage metadata.
- **Migration/tests:** adapt one code and one content fixture; retry/rollback,
  link and gate tests.
- **Dependency/risk/cx:** P0.4, P1.1; provider variance; XL.

### P2.4 Bounded operations and incidents

- **Problem:** schedules, cost, alerts, telemetry, and incidents are fragmented.
- **Outcome:** Every autonomous run is forecast, correlated, and actionable.
- **Scope:** scheduled execution projection, missed-run incident, budget/policy
  pause, OTel-compatible correlation, attention ranking.
- **Non-scope:** lights-out remediation.
- **Files/schema:** crons/schedules/alerts/incidents/telemetry/Command Center;
  additive incident/correlation records.
- **Migration/tests:** alert dedupe, redaction, missed schedule, budget pause,
  recovery.
- **Dependency/risk/cx:** P0.3/4, P1.3; alert fatigue; L.

## P3 — optimization and scale

### P3.1 Graph provider benchmark and optional Neo4j prototype

- **Problem:** Convex may eventually miss graph scale/query thresholds.
- **Outcome:** Evidence-based provider decision with no lock-in.
- **Scope:** bounded corpus, Neo4j adapter, dual-read verifier, cost/latency/
  recovery/tenancy benchmark.
- **Non-scope:** production cutover without separate ADR/approval.
- **Files/schema:** graph adapter only; no UI-provider coupling.
- **Migration/tests:** export/import/delete/rebuild and result equivalence.
- **Dependency/risk/cx:** P1.4/P2.1; new operations and consistency; L.

### P3.2 Outcome economics and model-routing optimization

- **Problem:** token/cost data is not fully tied to accepted value.
- **Outcome:** Route models using verified outcome quality, latency, retry, and
  cost—not raw token minimization.
- **Scope:** cost per accepted outcome, decision feedback, experiments, guardrail
  against quality regression.
- **Non-scope:** autonomous pricing/provider procurement.
- **Files/schema:** routing decisions, outcome measures, analytics.
- **Migration/tests:** shadow decisions, counterfactual report, quality floor.
- **Dependency/risk/cx:** evidence and pipeline; Goodhart’s law; L.

### P3.3 Controlled continuous research refresh

- **Problem:** current research becomes stale.
- **Outcome:** Scheduled read-only research can propose one next-cycle draft but
  cannot modify production.
- **Scope:** freshness policy, source drift, bounded refresh schedule,
  recommendation draft and approval.
- **Non-scope:** autonomous implementation/merge/deploy.
- **Files/schema:** Loop Engineering, schedules, research/evidence records.
- **Migration/tests:** duplicate suppression, source outage, cost cap, approval
  boundary.
- **Dependency/risk/cx:** P2.1/2.4; research drift; M.

## Exact first three PR specifications

### PR 1 — `fix(missions): make draft navigation and state truthful`

- **User problem:** Created Missions cannot be inspected and DRAFT is presented
  as active work.
- **Exact scope:** canonical detail route, redirect legacy URL, portfolio link,
  state-health model, complete draft form/edit, workspace authorization,
  pending/error/focus states, focused tests.
- **Non-scope:** plan, approval, WorkOrder release, run execution.
- **Files:** route utilities/config/tests; Mission portfolio/detail; new draft
  form/model; `convex/missions.ts`; generated API only if required.
- **Schema/migration:** no schema expected; URL redirect only.
- **Browser journey:** select Research Lab → create disposable draft → open →
  edit complete fields → refresh → back/forward → direct link → verify DRAFT,
  zero WorkOrders, no contract → archive/cleanup if supported.
- **Rollback:** feature flag `ui.missions.live-detail`; redirect can return to
  portfolio.
- **Risk:** route-state loops and workspace mismatch.
- **Done:** journey passes desktop/narrow/keyboard/axe, one creation event, no
  console/page/network errors.

### PR 2 — `feat(missions): add governed plan, assertion, approval, and release`

- **User problem:** A Mission cannot become authorized executable work through
  the UI.
- **Exact scope:** versioned plan builder, WorkOrder blueprints, assertions,
  dependency validation, diff, submit, reject reason, revise/resubmit, approve,
  idempotent materialization and serial eligibility.
- **Non-scope:** agent execution, validator automation, corrective execution,
  final acceptance.
- **Files:** Mission planning components/models/tests; Mission governance and
  WorkOrder functions; approval components; schema only for explicit decision
  refs/materialization state.
- **Migration:** existing drafts untouched; existing approved plans require
  deliberate operator release.
- **Browser journey:** draft → invalid plan blocked → valid plan → reject with
  reason → revise → approve as different authorized identity → refresh → linked
  WorkOrders appear once in order.
- **Rollback:** `missions.plan-ui-v1`; additive records remain readable.
- **Risks:** duplicate release and partial transaction; mitigate with one
  server-owned idempotent command.
- **Done:** every assertion has blueprint/evidence requirement, decision retains
  actor/reason/time, no dispatch occurs.

### PR 3 — `feat(delivery): add attention queues and relationship traceability`

- **User problem:** Operators cannot efficiently triage dense WorkOrder/Task
  inventories or understand parent/child state.
- **Exact scope:** Attention/Active/Review/Completed views, table mode, age/SLO,
  next owner/action, Mission/WorkOrder relationship badges, current-attempt
  collapse, URL-persistent query, stable detail tabs/breadcrumbs.
- **Non-scope:** state-machine changes, bulk mutation, hard WIP limits.
- **Files:** WorkOrders/Tasks views, card/drawer, view models, targeted indexed
  query additions, shell URL utilities.
- **Schema/migration:** derive first; add timestamps/owner indexes only if
  measured query requires them. Board remains behind a view toggle.
- **Browser journey:** land Attention → filter/group/search → refresh → open
  blocked and review records → inspect relationships/evidence → navigate full
  chain → back without losing view → narrow/keyboard validation.
- **Rollback:** `ui.delivery.attention-v1`; existing board remains available.
- **Risks:** query performance and divergent view models.
- **Done:** WORK-1 through WORK-6 pass with no contradictory state.

## Program stop conditions

Pause and obtain Product Owner direction if:

- the authorization model is undecided;
- a schema change would rewrite historical evidence or decisions;
- a provider/service commitment is required;
- a route consolidation removes a unique live capability;
- a PR exceeds its declared budget or corrective-iteration cap;
- browser evidence contradicts unit tests or product claims.

