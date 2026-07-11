# MissionControl UI and Capability Assessment

## Inspection scope

Reviewed:

- UI shell and view routing in `apps/mission-control-ui/src/App.tsx`, `TopNav.tsx`, `sections/*`
- Task surfaces in `Kanban.tsx`, `TaskDrawerTabs.tsx`, `CreateTaskModal.tsx`
- Workflow surfaces in `WorkflowDashboard.tsx`, `WorkflowRunPanel.tsx`, `CodePipelineView.tsx`
- Control-plane/demo surfaces in `sections/ControlSection.tsx`, `controlPlane/*`
- Convex schema and core functions in `convex/schema.ts`, `tasks.ts`, `workflowRuns.ts`, `workflows.ts`, `approvals.ts`, `runs.ts`, `projects.ts`, `github.ts`
- Orchestration and CLI in `apps/orchestration-server/src/*`, `apps/workflow-executor/src/index.ts`, `scripts/mc`
- Workflow definitions in `workflows/*.yaml`
- Docs in `README.md`, `docs/ARCHITECTURE.md`, `docs/MISSION_CONTROL_RUNBOOK.md`, `docs/WORKFLOWS.md`, related planning docs

## Local run findings

- UI started locally at `http://127.0.0.1:5173`
- Convex local backend did **not** start in this session because `npx convex dev` required an interactive backend upgrade prompt
- Result: the shell rendered, but most live views stayed in loading/skeleton state
- Screenshots captured:
  - `tmp/ui-audit-2026-07-10/desktop-full.png`
  - `tmp/ui-audit-2026-07-10/mobile-full.png`
  - `tmp/ui-audit-2026-07-10/desktop-approvals.png`

This means the visual assessment below combines live shell inspection with code inspection.

## 1. What the UI currently communicates well

1. **MissionControl is broad, not narrow.** The shell clearly presents MissionControl as an operational console with many domains: ops, agents, chat, code, quality, content, comms, knowledge, platform.
2. **Task lifecycle exists.** The Kanban/task drawer model makes status, assignee, comments, approvals, runs, tool calls, and activities feel real rather than aspirational.
3. **Governance exists.** Approvals, audit, policy, operator controls, risk chips, and approval modal all show a serious human-in-the-loop posture.
4. **Workflow execution exists.** `workflowRuns`, `WorkflowRunPanel`, and YAML workflows already establish the concept of deterministic multi-step execution.
5. **Repository/project context exists.** `projects` already carry GitHub repo + branch metadata and the UI references repo linkage.
6. **There is already a software-factory direction.** The `controlPlane/*` package uses language like epics, branches, worktrees, PRs, autonomy, blast radius, and agent fleet.

## 2. What is confusing, incomplete, or overly generic

1. **The product taxonomy is too wide.** The shell exposes dozens of views. It is hard to tell which ones are primary for day-to-day delivery and which are experiments, diagnostics, or future bets.
2. **“Task” is overloaded.** A task currently mixes request, unit of work, execution artifact, and outcome tracking. That makes it hard to answer: “What value was requested?” versus “What execution happened?”
3. **The homepage optimizes for dashboard breadth, not operator decisions.** Even where metrics are rich, they do not yet center exceptions, approvals, blocked work, verification gaps, and human attention consumption.
4. **The control-plane section is compelling but not authoritative.** `ControlSection` is still driven by deterministic demo data, so the most software-factory-like UI is not the source of truth.
5. **Workflow views are execution-centric, not outcome-centric.** Existing workflow/run views focus on step progress, not acceptance criteria, evidence, risks, and delivered value.
6. **Verification is fragmented.** QC, approvals, task review, run logs, and workflow results are spread across separate surfaces with no direct traceability matrix from request → criterion → evidence.
7. **The visual language still reads as “agent command center.”** Terms like agents, fleet, command, live chat, office, council, and ATC dominate over outcome, acceptance, verification, repository, and release.
8. **Mobile behavior is shell-first, task-second.** The shell compresses, but there is no clearly prioritized software-factory mobile flow for triage, approvals, and evidence review.

## 3. Backend capabilities that already exist but are not represented clearly in the UI

1. **Immutable state transitions** via `taskTransitions`
2. **Canonical event timeline** via `taskEvents`
3. **Run-level execution telemetry** via `runs` and `toolCalls`
4. **Approval chain/auditability** via `approvals`, `approvalRecords`, `activities`, `changeRecords`, `opEvents`
5. **Project/repository context** via `projects.githubRepo`, `projects.githubBranch`
6. **Workflow execution state** via `workflowRuns` with step status, retries, task linkage, started/completed times
7. **Goal-to-task linking** via `goalId`
8. **Policy/risk controls** via operator controls, risk classifier, legacy tool policy, ARM policy envelopes
9. **GitHub-linked provenance** via `tasks.source`, `sourceRef`, and `github.ts`
10. **Dense demo data** via `seedMissionControlDemo.ts` for validating richer delivery-centric views

The UI underuses these capabilities. For example, `TaskDrawerTabs` already loads transitions, messages, runs, tool calls, approvals, activities, and task events, but the operator still lacks a concise “what outcome was requested / what proves it is done?” workspace.

## 4. Proposed concepts that require new contracts or backend capabilities

### Requires new first-class contracts

1. **WorkOrder** as a first-class requested-value object
2. **ExecutionRun** as a normalized governed attempt model, rather than only raw `workflowRuns`
3. **VerificationReceipt** as explicit acceptance-criteria evidence
4. **ApprovalDecision** as an operator/policy decision model aligned to work, not just generic approval rows
5. **LearningCandidate** as explicit reusable post-run learning
6. **OutcomeMetrics** aligned to accepted verified value and human attention

### Requires schema or contract extension, even if built on existing tables

1. Acceptance criteria stored structurally, not buried in freeform description
2. Source-of-truth declarations per work item
3. Branch/worktree strategy on requested work
4. Linked execution runs from work request to governed attempt
5. Human intervention records on execution runs
6. Criterion-level verification status

### Can be deferred beyond the first slice

1. Full analytics warehouse-style metrics
2. Agentic-KB writeback/integration
3. Advanced GitHub writeback
4. Full Hermes/Pi event bus implementation

## 5. Where the product behaves like an agent dashboard rather than a software factory

1. Primary navigation is organized around system domains, not delivery objects.
2. Execution views emphasize agent activity and step status over requested outcome and proof.
3. Demo control-plane views foreground fleet, epics, autonomy, and commands more than acceptance criteria and verification evidence.
4. The default create flow is **Create Task**, not **Create WorkOrder**.
5. Existing queue views communicate work status, but not clearly:
   - desired outcome
   - blocking decision
   - required human action
   - acceptance criteria pass/fail
   - linked execution evidence

## Assessment summary

MissionControl already has strong foundations for a software factory:

- real task governance
- workflow execution
- approvals
- audit trails
- project/repository context
- run/tool telemetry

But the product’s primary mental model is still **agent/task orchestration** rather than **requested value → governed execution → verified outcome**.

The highest-leverage next move is to introduce a real **WorkOrder** layer and make it the main operator object. That will let MissionControl preserve its existing execution backbone while becoming a practical software-factory control plane.
