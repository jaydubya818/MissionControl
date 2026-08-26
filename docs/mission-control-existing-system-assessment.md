---
title: "Mission Control Existing-System Assessment"
date: 2026-08-02
status: historical-baseline
baseline_commit: 04b5e64
working_branch: codex/AI_FDE
related_plan: docs/plans/2026-08-02-feat-ai-software-factory-v1-program-plan.md
superseded_by: docs/product/software-factory-capability-maturity.md
---

# Mission Control Existing-System Assessment

> Historical baseline only. This assessment records the system at commit
> `04b5e64`; several gaps described below have since been implemented. Use the
> [Software Factory Capability Maturity Ledger](product/software-factory-capability-maturity.md)
> for current status.

## Executive verdict

Mission Control already contains the core records needed for a governed AI
software factory. The correct V1 strategy is to harden and connect them, not
introduce a second orchestration hierarchy.

The current system is strongest at company/workspace structure, Mission and
WorkOrder governance, operational Tasks, workflow execution, evidence records,
approvals, agent/runtime catalogs, and exception-first operator surfaces. It is
not yet production-ready for real repository mutation because human/service
authorization remains uneven, GitHub is not represented as a versioned
least-privilege App connection, Factory configuration/readiness is not a
first-class immutable aggregate, and neither Codex worker prototype implements
the approved production adapter contract.

The next runtime PR must therefore remain GitHub readiness and signed ingress.
The Codex executor decision is approved, but its adapter is intentionally
sequenced after GitHub readiness and Factory configuration.

## Assessment scope and method

This assessment consolidates rather than replaces:

- [Software Factory capability map](./plans/software-factory-capability-map.md)
- [UI and capability assessment](./software-factory/ui-and-capability-assessment.md)
- [Human/service authorization matrix](./security/human-service-authorization-matrix.md)
- [Mission Control North Star](./product/mission-control-north-star.md)
- [V1 product strategy](./product/mission-control-v1-product-strategy.md)
- [V1 decisions](./decisions/ai-software-factory-v1-decisions.md)

Evidence was inspected on commit `04b5e64` plus the active authority/lineage
worktree. Counts are diagnostic, not product metrics:

- 136 Convex tables in `convex/schema.ts`;
- 762 exported public Convex queries, mutations, and actions;
- 51 exported internal Convex queries, mutations, and actions;
- 20 routes declared Live, 29 Preview, and 7 Demo in
  `apps/mission-control-ui/src/shellV2/routeCapabilities.ts`;
- six YAML workflow definitions under `workflows/`;
- 53 Convex test files, 48 application test files, and 35 package test files.

The breadth of these counts is a warning against adding generic replacement
tables or another top-level navigation domain.

## Status vocabulary

| Status | Meaning in this assessment |
| --- | --- |
| Complete | Canonical contract exists and the relevant V1 behavior is implemented and proven for its current scope |
| Partial | Real contract exists, but a material V1 behavior, authority boundary, or recovery state is incomplete |
| Missing | Required V1 contract or operable path does not exist |
| Duplicated | Multiple surfaces or records compete for the same product responsibility |
| Obsolete | Retained compatibility or legacy behavior should not receive new V1 investment |
| Preview/Demo-only | Useful experimental or fixture-backed capability that cannot support a production claim |

Route `Live` is a declared UI capability, not automatic proof that every
backend mutation on the route meets the V1 ship gate.

## Canonical hierarchy and glossary

```text
Company / Tenant
└── Workspace / Project
    └── Repository
        └── Factory configuration version
            └── Mission
                └── Approved Plan
                    └── WorkOrder
                        └── Task
                            └── Attempt / WorkflowRun
                                ├── events and tool calls
                                ├── artifacts and changed files
                                └── verification evidence
Pull Request -> Merge -> Deployment -> Activation -> Production Verification
```

| Term | Canonical responsibility | Existing records |
| --- | --- | --- |
| Company | Tenant and membership boundary | `tenants`, `operators`, `roles`, `roleAssignments` |
| Workspace | Product/repository operating scope inside a company | `projects` |
| Repository | Explicit authorized source-code target and code scope | `workspaceRepositories`, `repositoryCodeScopes`, `workspaceHostBindings` |
| Factory | Thin immutable configuration referencing existing repository, workflow, agent, policy, budget, and verifier records | **Missing**; do not duplicate those referenced records |
| Mission | Desired outcome, constraints, sources, budget, stop condition, and plan lifecycle | `missions`, `missionPlans`, `missionEvents` |
| WorkOrder | Versioned governed delivery contract and acceptance boundary | `workOrders`, revisions, decisions, supersessions, events |
| Task | Operational unit assigned and transitioned during execution | `tasks`, transitions, events, dependencies, relations |
| Attempt | One bounded execution against a Task/WorkOrder version | `workflowRuns` and linked `runs`; naming adapter still required |
| Evidence | Criterion-linked proof with producer/verifier and execution lineage | `verificationReceipts`, `runEvents`, `runArtifacts` |
| Pull request | External review artifact correlated by exact repository/branch/head/work lineage | `harnessPrChecks` and run artifacts |
| Deployment | Post-merge environment action, distinct from merge and verification | `deployments`, `releaseGateEvaluations` |

The accepted hierarchy is also documented in
`docs/decisions/task-workorder-hierarchy-decisions.md`. `AgentRun`, a second
Workspace table, or a generic Factory lifecycle must not be added.

## Lifecycle compatibility mapping

No broad state rename is required. Product language maps to the current
authoritative states as follows:

| Product stage | Mission | Plan | WorkOrder | Task | Attempt / WorkflowRun |
| --- | --- | --- | --- | --- | --- |
| Define | `DRAFT` | `DRAFT` | — | — | — |
| Plan/revise | `PLANNING` | `DRAFT` / `PROPOSED` / `REJECTED` | `DRAFT` | `INBOX` | `PENDING` |
| Await authority | `AWAITING_PLAN_APPROVAL` | `PROPOSED` | `AWAITING_APPROVAL` | `NEEDS_APPROVAL` | `PAUSED` when execution is gated |
| Ready/released | `READY` | `APPROVED` | `READY` | `READY` / compatibility `ASSIGNED` | `PENDING` |
| Execute | `IN_PROGRESS` | `APPROVED` | `DISPATCHED` / `IN_PROGRESS` | `IN_PROGRESS` | `RUNNING` |
| Needs decision/recovery | `BLOCKED` | current approved revision retained | `BLOCKED` / `REOPENED` | `BLOCKED` / `FAILED` | `FAILED` / `PAUSED` |
| Validate | `AWAITING_VALIDATION` | `APPROVED` | `AWAITING_VERIFICATION` | `REVIEW` | `COMPLETED` with independent evidence still required |
| Accept | `AWAITING_ACCEPTANCE` | `APPROVED` | passing receipts and approval decision | `DONE` does not imply WorkOrder acceptance | `COMPLETED` does not imply acceptance |
| Terminal | `DONE` / `CANCELED` / `SUPERSEDED` | `SUPERSEDED` where replaced | `DONE` / `CANCELED` / `SUPERSEDED` | `DONE` / `CANCELED` | `COMPLETED` / `CANCELED` |

Progression between layers must remain explicit: Task completion does not
accept a WorkOrder; WorkOrder completion does not accept a Mission; a PR does
not imply merge; merge does not imply deployment or production verification.

## Capability assessment

| Capability | Status | Current evidence | V1 disposition |
| --- | --- | --- | --- |
| Company identity and membership | Partial | Clerk-aware company helpers and named permissions exist; explicit demo mode remains | Finish real cross-company browser denial and remove remaining domain gaps |
| Workspace/repository scope | Partial | Projects, repository records, code scopes, and host bindings exist | Reuse; bind them to Factory readiness and every mutating Attempt |
| Mission draft and plan lifecycle | Partial | Draft, update, plan draft, submit, revise, approve, start, and accept commands exist | Enforce all golden-path permissions and separation of duties |
| WorkOrder governance | Partial | Versioned WorkOrders, revisions, decisions, verification, dispatch, and acceptance exist | Keep as execution authority boundary; split remaining human/service callers |
| Task lifecycle | Partial | Operational create/link/transition records and board UI exist | Preserve; authenticated service commands must replace borrowed actor strings |
| Attempts and workflow execution | Partial | Workflow runs, steps, events, artifacts, retries, snapshots, and six workflows exist | Add one adapter contract; do not introduce `AgentRun` |
| Approval and audit | Partial | Generic approvals plus first-class approval decisions, activities, change records, and op events exist | Unify authority semantics and add durable denied-action audit |
| Verification/evidence | Partial | Criterion receipts, events, artifacts, PR checks, merge gates, and inspectors exist | Normalize freshness, conflict, waiver, validator independence, and review package |
| Exact PR/CI lineage | Partial | Exact branch correlation and explicit uncorrelated state are implemented; HMAC is verified | Add delivery dedupe/replay records and GitHub App installation identity |
| Agent registry/model routing | Partial | Templates, versions, instances, identities, policies, and routing decisions exist | Reuse; Factory references approved versions and required capabilities |
| Workflow catalog | Complete for current scope | Six versioned YAML definitions plus workflow snapshots | Validate allowed workflow versions through Factory configuration |
| CLI | Partial | `mc` supports health, workflow run, governed dispatch/acceptance, governance, runs, tasks, flags, skills, and context | Route CLI and UI through the same authenticated commands |
| Orchestration server | Partial | Hono process, coordinator loop, agent lifecycle, automation endpoints, bearer middleware | Dev-mode auth and unauthenticated Convex client calls cannot support production service identity |
| Codex executor | Preview/Demo-only | Read-only factory worker and one-shot implementation prototype exist | Approved target is one versioned Codex adapter after Factory/readiness contracts freeze |
| Simulated executor | Missing as formal adapter | Tests mock client/executor behavior but no stable adapter contract exists | Add only as deterministic contract/recovery test implementation |
| Factory definition/version | Missing | Factory-oriented views exist without one immutable configuration aggregate | Add thin reference-only aggregate in Phase 2 |
| Factory readiness | Preview/Demo-only | Readiness/demo views exist; no versioned evidence-based activation gate | Build checks with status, evidence, freshness, remediation, and dependency blocker |
| Loop Engineering | Preview/Demo-only | Bounded cycles, exact outer-loop evidence, governed improvements, browser route | Keep Preview until denied audit and real auth/service evidence pass |
| Automations | Partial | Definitions, decisions, artifacts, evaluations, schedules, and governed UI exist | Keep Level 0/1; no self-authorizing repository mutation |
| Deployments/release | Partial | Deployment and release-gate records/UI exist | V1 stops at PR; productionize in V1.1 |
| Cost and outcome analytics | Preview/Demo-only | Cost events and dashboards exist, but coverage and production outcome source are incomplete | Instrument facts before promotion; do not infer outcomes |
| FDE engagement workspace | Missing | No coherent isolated customer-engagement domain | Defer until after the V1 ship gate |

## Route and navigation inventory

The enforced EOS capability registry is authoritative for production
navigation. Current declared routes are:

- **Live (20):** Command Center, WorkOrders, Approvals, Tasks, Agents, ATC,
  Audit, Telemetry, Automations and runs, Registry discover, Memory, Docs,
  Identities, Deployments, Projects, Model Routing, Operator Evals, Missions,
  and Mission Detail.
- **Preview (29):** Trace Inspector, policies, goals, factory/pipeline surfaces,
  graph/analytics, Loop Engineering and selected Harness routes, Registry
  lifecycle/evaluation views, QC rules, Gateway, Database, Design DNA, and
  developer tools.
- **Demo (7):** effectiveness, legacy factory health, readiness, friction,
  recommendations, agent catalog, and dossiers.
- **Hidden:** any view omitted from `ROUTE_CAPABILITIES` when capability
  enforcement is enabled.

The legacy `navConfig.ts` still enumerates a much broader taxonomy. It is
**Duplicated** as a product map and must not be used to justify new primary
navigation. The EOS route registry and job-oriented sidebar remain canonical.

## Schema and domain inventory

The 136-table schema already covers these clusters:

1. company, workspace, repository, host, environment, role, and permission;
2. Mission, plan, assertion, handoff, WorkOrder, revision, approval, receipt;
3. Task, dependency, relation, transition, workflow run, event, artifact, run,
   tool call, and cost;
4. agent templates, versions, instances, identities, routing, and policies;
5. GitHub/webhook, review, PR checks, QC, release gates, and deployments;
6. context packages, manifests, locks, installations, evals, memory, and graph;
7. Loop Engineering, verifiers, change risk, meta-loop, and automations.

Only the plan-approved additive aggregates should be considered next:
`factoryDefinitions`, immutable `factoryDefinitionVersions`, and
`factoryReadinessAssessments`. Evidence reconciliation and factual intervention
telemetry remain later phases.

## Human and service boundary inventory

| Caller | Current posture | Required production posture |
| --- | --- | --- |
| Browser human | Company/workspace helper coverage is improving; several golden-path domains remain inventoried | Exact Clerk membership, named permission, repository scope, retained operator identity |
| Convex scheduler/internal work | Internal functions exist and Loop projection now schedules internally | Internal-only command with scoped business identifiers and idempotency |
| GitHub webhook | HMAC verified before processing; PR ingestion is internal after verification | GitHub App installation identity plus delivery dedupe/replay record |
| Orchestration server | Optional bearer token protects Hono routes; Convex client has no production service identity | Required service authentication, scoped commands, no open dev fallback in production |
| Workflow executor | Uses public Convex functions through `ConvexHttpClient` | Authenticated service command surface; no direct human mutation reuse |
| Pi/receipt bridge | Hono ingress and receipt packet tests exist | Required service token/identity, WorkOrder scope, idempotency, retained producer provenance |
| Codex workers | Environment-driven scripts use public Convex calls and fixed actor strings | Versioned adapter behind orchestration and authenticated service commands |

The detailed migration boundary remains
`docs/security/human-service-authorization-matrix.md`. Public human functions
must not be blanket-guarded until equivalent service callers move behind their
own boundary.

## Workflow, CLI, and integration inventory

### Workflows

The installed workflow catalog contains `bug-fix`, `code-review`,
`feature-dev`, `loop-engineering`, `quality-audit`, and `security-audit`.
Workflow definitions can be snapshotted onto runs, which is the correct basis
for Factory version compatibility.

### CLI

The `scripts/mc` CLI exposes operator/agent access to status, run, WorkOrder
dispatch and acceptance, governance/revision/supersession, run evidence, Tasks,
feature flags, skills, and context manifests. It is **Partial** because several
commands still call the same public functions used by browser or executor
paths, rather than one authenticated server-owned command.

### Integrations

- GitHub PR/check/review webhook: Partial; HMAC exists, App identity and replay
  ledger are incomplete.
- Stripe webhook: secondary to the software-delivery V1 path.
- Pi receipt packets: Partial; governed Hono endpoint and tests exist, service
  identity remains a gate.
- Gateway/OpenClaw: Preview; the local UI may report an unconfigured endpoint.
- Additional issue trackers/chat/CI providers: not approved for V1.

## Current golden path

The most mature path is:

1. select a company and workspace;
2. create and edit a Mission draft;
3. create, submit, revise, and approve a versioned plan;
4. release governed WorkOrders idempotently;
5. dispatch a WorkOrder into Tasks and a WorkflowRun;
6. collect run events, artifacts, approval decisions, and verification receipts;
7. ingest exact PR/CI evidence or retain it as visibly uncorrelated;
8. inspect merge gates and accept only with current governed evidence.

This path is **Partial**. It is proven in focused tests and demo browser
journeys, but not yet against one real GitHub App-authorized sandbox repository
with production service identities, durable recovery, or a complete review
package.

## Test and verification posture

Current focused verification includes:

- 53 Convex test files covering governance, Missions, WorkOrders, Tasks,
  scheduling, evidence, exact lineage, automation, and Loop Engineering;
- 193 Mission Control UI tests in the latest authority/lineage verification;
- package tests for workflow engine, orchestration helpers, policy, state,
  context, memory, routing, and runtime libraries;
- production UI typecheck/build and browser evidence under
  `docs/testing/evidence/` and `output/playwright/`.

Important missing release evidence includes real cross-company Clerk denial,
GitHub installation permission failure/recovery, webhook replay, authenticated
service execution, executor crash/restart, cancellation with late events, and a
real sandbox PR.

## Approved decisions and open blockers

Approved:

- Hono remains the orchestration runtime; Convex remains source of truth.
- The hierarchy remains Mission -> WorkOrder -> Task -> Attempt/evidence.
- Codex is the one production executor; simulation is test-only.
- GitHub is the only V1 Git provider.
- Merge remains human-only in V1.
- RED implementation requires explicit approval and a restricted sandbox.
- Existing Approver/Reviewer roles own uncorrelated evidence decisions.
- The second connector is deferred until customer demand is known.
- Evidence retention is tiered: one year for audit/decisions, 90 days for
  execution evidence, and 30 days for sensitive temporary data.
- GitHub Issues with governed production labels and exact lineage are the V1
  production outcome source.

These are tracked in
`docs/decisions/ai-software-factory-v1-decisions.md`. All eight program
decisions now have explicit Product Owner approval.

## Required implementation sequence

1. Complete the remaining golden-path authority/service and denied-audit work.
2. Add GitHub App readiness, least-privilege verification, signed delivery
   dedupe, and replay handling without dispatch.
3. Add thin immutable Factory configuration and evidence-based activation.
4. Define the stable executor adapter and implement Codex plus a test-only
   simulation.
5. Run one governed Mission against a real sandbox repository.

Starting step 4 before steps 2 and 3 would leave the executor without an
authoritative repository identity, configuration version, or readiness gate.

## Exit assessment

The current system is suitable for incremental V1 productionization. It is not
suitable for a broad rebuild, multi-provider connector framework, autonomous
merge, or self-improving production mutation. The next implementation should
close a named trust/readiness gap and leave all Preview/Demo labels truthful.
