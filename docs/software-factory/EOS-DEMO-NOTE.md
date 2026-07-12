# EOS Demo — Implementation Note

**2026-07-11 · precedes implementation on `sf/96-eos-demo` (branched off `sf/90-demo-seed`) · flag `eos.command-center-preview`**

## 1. Current frontend findings (from direct authorship + surveys, condensed)

- **Routing:** state-based `MainView` union (~67 ids) synced to `/v2/<view>` URLs via `AppShellV2` (echo-guarded). Adding views = 4 touchpoints: `TopNav.tsx` union, `App.tsx` VALID_MAIN_VIEWS + viewToSection + SECTION_TABS, section renderer, `shellV2/navConfig.ts` (+ its completeness test).
- **Nav:** v2 rail groups Operate/Factory/Intelligence/Observe/Govern/Workspace; legacy CommandNav retained flag-off.
- **Primitives:** `components/factory/` — PageHeader, DetailLayout+MetadataPanel+DetailTabs, DataTable, MetricBlock/MetricRow, Status/Risk/Score/Trend badges, Breadcrumbs, chartTheme; Overview additions — Eyebrow, ViewAllLink, ThinBar, SectionHeader (extract for reuse). All views on v2 tokens; slop-audited.
- **Charts:** recharts via `chartTheme.ts`; heatmap hand-rolled (AnalyticsView).
- **Demo data:** Convex `seedFactoryDemo` (374 rows, seedTag `sf-demo`, Atlas Checkout narrative: project *Software Factory Demo*, repo `demo/atlas-checkout`, agents `pi-supervisor-demo`/`hermes-executor-demo`/`demo-coder|qa|security|docs|research|ops`, 9 WOs incl. "Enable Apple Pay in live payment config", "PCI compliance evidence pack" [BLOCKED], "Fraud-screening vendor integration" [BLOCKED, quarantined security agent], 15 runs/3 models/$8.35, pending RED dual-control approval, DENIED tool call, correlation chains, `metadata.contextSnapshot` on 4 runs).
- **Flags:** `KNOWN_FLAGS` + `useFlag` env override. **Personas assumed:** single factory operator.
- **Inconsistencies to exploit, not fix here:** three event streams (unified only at `tasks.getUnifiedTimeline`); QC vs task terminology; quota framed as "LLM fuel."
- **Pages that should demote to drill-downs:** recorder, api-import, test-generation, flaky-steps, gherkin, hybrid-workflows, codegen, build-pipeline → under Delivery→Factory Tools; comms/content suite → Administration→Workspace Tools.

## 2. Information architecture (adopted, 8 groups)

OVERVIEW: Command Center · STRATEGY: Missions, Allocation *(preview)* · DELIVERY: Work Orders, Factory Board, Execution (runs/trace), Pipelines, Verification *(preview)* · OPERATIONS: Agents (catalog), Approvals, Queue (tasks board), Incidents (alerts+QC findings), Cost · INTELLIGENCE: AI Effectiveness, Factory Health, Environment Readiness, Friction & Waste, Recommendations · KNOWLEDGE: Context Registry, Skills, Memory, Decisions *(preview)*, Learnings *(preview)* · GOVERNANCE: Policies, Evidence, Audit, Identities · ADMINISTRATION: Integrations/Settings/Advanced Tools (all legacy views live here — nothing deleted).

## 3. Page map (new views, all flag-gated)

`command-center` (replaces home when flag on) · `missions` (portfolio) · `mission-detail` (param via selection state) · `trace-inspector` (per run/WO) · `effectiveness` · `factory-health` · `readiness` · `friction` · `agent-catalog` · `dossier`. Existing views re-homed via a second nav config (`eosNavConfig.ts`); legacy `navConfig` untouched for flag-off.

## 4. Component reuse plan

New shared: `src/eos/` — `types.ts` (the 11 approved interfaces + `Provenance`), `adapters.ts` (Convex-vs-demo composition), `demoData.ts` (typed Atlas fixtures keyed to REAL seed ids/names), `components/` — ProvenanceBadge (Demo data/Preview/Projected/Insufficient evidence/Not yet connected), HealthSignalCard (status+trend+confidence+drill), InsightCard (observed/evidence-n/impact/confidence/action/drill — §18 Insight shape), LineageBreadcrumb, TraceTree. Everything else reuses factory primitives.

## 5. Demo data model

Rule: **if Convex has it, query it; if it's a future projection, it comes from `demoData.ts` through the same adapter interface with `provenance: "demo"` and a visible badge.** Convex-backed: agents, WOs+events, runs, costs, approvals, packages, analytics aggregates. Demo-typed: health signals, effectiveness metrics, friction summaries, readiness assessments, lineage edges beyond correlation, traits, capability profiles, the dossier, outcome/learning states. Every demo object references real seed ids so drill-downs land on real records.

## 6. Implementation sequence (compressed to 4 waves on one branch; PR-sliced commits)

W1 foundation (me): flag, types, demo fixtures, ProvenanceBadge/HealthSignalCard/InsightCard, eosNavConfig + shell/App wiring + **stub components for all 10 views** (agents then edit only their own files — zero wiring conflicts). W2 (4 parallel agents): Command Center · Missions+detail · Trace Inspector · Effectiveness+Factory Health. W3 (2 agents): Readiness+Friction · Agent Catalog+Dossier. W4 (me): recommendations view (thin list over InsightCards), demo-story continuity pass, screenshots, verification sweep.

## 7. Files expected to change

New: `src/eos/**` (~18 files), 10 view files. Modified: `TopNav.tsx` (union), `App.tsx` (ids/mapping/renderer), `shellV2/navConfig.ts`+test (add ids to reachability), `shellV2/AppShellV2.tsx` (nav config switch on flag), `lib/flags.ts` (+`eos.command-center-preview`), `DashboardOverview` untouched (command-center is a new view; home remains). Convex: none (constraint honored).

## 8. Risks & non-goals

Risks: nav duplication (two configs) — accepted, flag-off path untouched; demo/real boundary blur — mitigated by mandatory ProvenanceBadge on every non-Convex datum; sf/* vs `main` receipts divergence — demo branch only, reconciliation stays the program's job (§32). Non-goals: no schema changes, no backend Lineage v1 (that's the approved roadmap), no marketplace economics, no individual rankings, no removal of any existing view, no composite AI score.
