# Fork Boundary: Mission Control → ARM Integration

**Date**: February 9, 2026  
**Baseline**: Mission Control v0.9.0  
**Target**: ARM v0.2 integration (55-table combined model)  
**Strategy**: Incremental migration with dual-write; no big-bang rewrite

---

## Overview

This document defines what Mission Control components are:
1. **Carried forward unchanged** — used as-is or with minimal adaptation
2. **Refactored** — extended with ARM concepts (tenantId, instanceId, versionId)
3. **Retired later** — superseded by ARM equivalents but not deleted in this migration
4. **Net-new ARM modules** — added to enable ARM registry and governance

---

## 1. Carried Forward Unchanged

These Mission Control components are reused directly or with minimal adaptation:

### Infrastructure & Patterns

| Component | Path | Notes |
|-----------|------|-------|
| **Convex backend** | `convex/` | Reactive model, serverless functions, real-time subscriptions — perfect fit for ARM dashboards |
| **State machine pattern** | `packages/state-machine/` | Validator, transition rules, append-only log — reused for ARM Version/Instance lifecycles |
| **Policy engine** | `packages/policy-engine/` | Risk classification (GREEN/YELLOW/RED), autonomy rules, budget caps, allowlists, loop detection — refactored from task-scope to version/instance-scope in Phase 7 |
| **Approval system** | `convex/approvals.ts` | Request/approve/deny/escalate/expire workflow — pattern reused for ARM approvalRecords |
| **Risk classifier** | `convex/lib/riskClassifier.ts` | 59-tool risk map, secret detection, production impact — carried forward, extended |
| **Operator controls** | `convex/lib/operatorControls.ts` | Kill switches (NORMAL/PAUSED/DRAINING/QUARANTINED) — maps to ARM instance lifecycle |
| **UI shell** | `apps/mission-control-ui/` | React 18 + Vite + Convex, dark theme, sidebar nav, drawer pattern, modal system — views change, shell stays |
| **Shared types pattern** | `packages/shared/` | Type organization — ARM types added alongside MC types |
| **Activity logging** | `convex/activities.ts` | Append-only audit log — kept for MC; parallel writes to ARM changeRecords/opEvents added |
| **Alerts system** | `convex/alerts.ts` | Severity-based alerts with threshold triggers — extended with tenantId |

### Execution & Coordination

| Component | Path | Notes |
|-----------|------|-------|
| **Task execution** | `convex/tasks.ts` | Core work unit — extended with tenantId and assigneeInstanceIds; not demoted |
| **Runs & tool calls** | `convex/runs.ts`, `convex/toolCalls.ts` | Execution tracking — extended with instanceId/versionId |
| **Messages** | `convex/messages.ts` | Task thread comms — extended with authorInstanceId |
| **Workflow orchestration** | `convex/workflows.ts`, `convex/workflowRuns.ts` | Multi-agent workflows — extended with tenantId |

### Communication & Intelligence

| Component | Path | Notes |
|-----------|------|-------|
| **Telegraph** | `convex/telegraph.ts`, `convex/telegraphThreads.ts` | Async messaging — extended with tenantId |
| **Meetings** | `convex/meetings.ts` | Meeting orchestration — extended with tenantId |
| **Voice** | `convex/voice.ts`, `convex/voiceArtifacts.ts` | TTS/audio — extended with tenantId |
| **Agent learning** | `convex/agentPerformance.ts`, `convex/agentPatterns.ts` | Performance metrics — refactored to use instanceId/versionId |
| **Agent documents** | `convex/agentDocuments.ts` | Session memory, working notes — refactored to use instanceId |

---

## 2. Refactored (Extended with ARM Concepts)

These components are extended but not replaced:

### Schema Extensions

| Table | Changes | Migration Path |
|-------|---------|----------------|
| **projects** | Add `tenantId` (required) | Default tenant created; existing projects assigned to it |
| **tasks** | Add `tenantId` (optional), `assigneeInstanceIds` (optional) | Dual-write: populate both assigneeIds and assigneeInstanceIds |
| **runs** | Add `tenantId` (optional), `instanceId`, `versionId`, `templateId` | Dual-write: populate both agentId and instance refs |
| **toolCalls** | Add `tenantId` (optional), `instanceId`, `versionId` | Dual-write via resolver |
| **messages** | Add `tenantId` (optional), `authorInstanceId`, `operatorId` | Dual-write for author refs |
| **All other MC tables** | Add `tenantId` (optional) | Backfill later; not required initially |

### Code Paths

| Path | Refactoring | Phase |
|------|-------------|-------|
| **Agent creation** | Call `ensureInstanceForLegacyAgent()` to create ARM template/version/instance; dual-write to MC agents | Phase 3 |
| **Agent loading** | Call `resolveAgentRef()` to get instanceId/versionId; support both agentId and instanceId | Phase 3 |
| **Task assignment** | Write both assigneeIds and assigneeInstanceIds | Phase 4 |
| **Run creation** | Write both agentId and instanceId/versionId | Phase 4 |
| **Policy evaluation** | Add path that calls ARM `policyEnvelopes.evaluate()` with instanceId | Phase 7 |
| **Activity logging** | Parallel writes to changeRecords (governance) and opEvents (telemetry) | Phase 5 |

---

## 3. Retired Later (Not Deleted in This Migration)

These MC tables are superseded by ARM equivalents but kept for backward compatibility:

| MC Table | ARM Replacement | Retirement Plan |
|----------|-----------------|-----------------|
| **agents** | agentTemplates + agentVersions + agentInstances | Keep; dual-write during migration; retire after full cutover |
| **policies** | policyEnvelopes | Keep; MC policy.evaluate() stays functional; ARM evaluator added in parallel |
| **approvals** | approvalRecords | Keep; adapter or dual-write; merge later |
| **activities** | changeRecords + opEvents | Keep; parallel writes added; retire after audit trail verified |
| **taskTransitions** | changeRecords (type: TASK_TRANSITIONED) | Keep; parallel writes added |
| **taskEvents** | opEvents | Keep; parallel writes added |
| **notifications** (partial) | ARM notificationEvents | Keep MC notifications; merge later |

**Retirement criteria**: Only retire after:
- ARM equivalents proven stable in production
- All queries migrated to ARM tables
- Backfill complete and verified
- Audit trail continuity confirmed

---

## 4. Net-New ARM Modules

New code added to enable ARM registry and governance:

### Registry (convex/registry/)

| Module | Purpose | Key Entities |
|--------|---------|--------------|
| **tenants.ts** | Multi-tenant isolation | Tenant CRUD, default tenant |
| **environments.ts** | Release channels | Environment CRUD (dev, staging, prod) |
| **operators.ts** | Human identity | Operator CRUD, auth integration |
| **agentTemplates.ts** | Agent blueprints | Template CRUD, metadata |
| **agentVersions.ts** | Immutable genomes | Version CRUD, genomeHash computation, integrity verification, lifecycle (DRAFT→TESTING→CANDIDATE→APPROVED→DEPRECATED→RETIRED) |
| **agentInstances.ts** | Runtime bindings | Instance CRUD, version binding, lifecycle (PROVISIONING→ACTIVE→PAUSED/READONLY/DRAINING/QUARANTINED→RETIRED), legacyAgentId mapping |
| **agentIdentities.ts** | Identity governance | IDENTITY/SOUL/TOOLS content, compliance status, templateId link |

### Governance (convex/governance/)

| Module | Purpose | Key Entities |
|--------|---------|--------------|
| **policyEnvelopes.ts** | Policy definitions | Policy CRUD, autonomy tiers 0-5, tool whitelist, cost limits, scope (tenant/project/version), inheritance |
| **approvalRecords.ts** | Approval workflows | Approval CRUD, decision logic, enriched with MC fields (rollbackPlan, justification, escalation) |
| **changeRecords.ts** | Governance audit | Append-only governance events (typed enum), tamper-evident |
| **deployments.ts** | Promotion/rollback | Deployment CRUD, activation, rollback, status (PENDING/ACTIVE/ROLLING_BACK/RETIRED) |
| **roles.ts** | RBAC roles | Role definitions with permissions |
| **permissions.ts** | Permission registry | Resource + action permissions |
| **roleAssignments.ts** | Operator-role mappings | Assignment CRUD |

### Operations (convex/operations/)

| Module | Purpose | Notes |
|--------|---------|-------|
| **opEvents.ts** | High-volume telemetry | Execution events (runs, tool calls, workflow steps, heartbeats, cost ticks); separate from governance changeRecords |

### Shared Utilities (convex/lib/)

| Module | Purpose |
|--------|---------|
| **getActiveTenant.ts** | Tenant resolution from auth/session |
| **agentResolver.ts** | Legacy agentId ↔ instanceId/versionId mapping |
| **genomeHash.ts** | SHA-256 genome hashing (ARM pattern) |

---

## 5. Field Migration Map: MC agents → ARM

| MC agents field | ARM destination | Notes |
|-----------------|-----------------|-------|
| `name`, `emoji`, `role` | `agentTemplates.metadata` | Blueprint-level metadata |
| `status` (ACTIVE/PAUSED/etc) | `agentInstances.state` | ARM's richer state machine |
| `allowedTaskTypes`, `allowedTools` | `policyEnvelopes` (tool whitelist) | Governance, not agent property |
| `budgetDaily`, `budgetPerRun` | `policyEnvelopes.costLimits` | Policy-driven budgets |
| `spendToday`, `spendResetAt` | `agentInstances.metadata` | Runtime budget tracking |
| `canSpawn`, `maxSubAgents` | `policyEnvelopes` spawn constraints | Governance |
| `currentTaskId` | `agentInstances.metadata` | Runtime state |
| `lastHeartbeatAt` | `agentInstances.heartbeatAt` | Runtime health |
| `parentAgentId` | `agentInstances.metadata.parentInstanceId` | Spawn hierarchy |
| `workspacePath` | `agentTemplates.metadata` or `agentIdentities` | Blueprint or identity |
| `soulVersionHash` | `agentVersions.genomeHash` | Subsumed by genome |

---

## 6. Directory Structure (Target)

```
convex/
├── schema.ts                    # Unified schema (MC + ARM tables)
│
├── registry/                    # ARM domain (NEW)
│   ├── tenants.ts
│   ├── environments.ts
│   ├── operators.ts
│   ├── agentTemplates.ts
│   ├── agentVersions.ts
│   ├── agentInstances.ts
│   └── agentIdentities.ts
│
├── governance/                  # ARM domain (NEW)
│   ├── policyEnvelopes.ts
│   ├── approvalRecords.ts
│   ├── changeRecords.ts
│   ├── deployments.ts
│   ├── roles.ts
│   ├── permissions.ts
│   └── roleAssignments.ts
│
├── operations/                  # MC domain (optional reorg)
│   ├── opEvents.ts              # NEW
│   ├── tasks.ts                 # (could move here later)
│   ├── runs.ts
│   ├── toolCalls.ts
│   └── ...
│
├── lib/                         # Shared utilities
│   ├── getActiveTenant.ts       # NEW
│   ├── agentResolver.ts         # NEW
│   ├── genomeHash.ts            # NEW
│   ├── riskClassifier.ts        # (existing)
│   ├── operatorControls.ts      # (existing)
│   └── stateMachine.ts          # (existing)
│
└── [existing MC modules]        # Stay at root until later reorg
    ├── agents.ts
    ├── approvals.ts
    ├── policy.ts
    ├── activities.ts
    └── ...
```

**Note**: This migration adds only `registry/`, `governance/`, and new `lib/` modules. Existing MC modules stay at `convex/*.ts` to minimize churn. A later file reorganization can move MC modules to `operations/` if desired.

---

## 7. Integration Points (v0.2)

### The Join: agentInstances ↔ tasks

```
tasks.assigneeIds → agentInstances._id[]
tasks.assigneeInstanceIds → agentInstances._id[] (dual-write)
runs.agentId → agents._id (legacy)
runs.instanceId → agentInstances._id (new)
runs.versionId → agentVersions._id (new)
toolCalls.instanceId → agentInstances._id
agentInstances.versionId → agentVersions._id (immutable genome)
agentVersions.templateId → agentTemplates._id (blueprint)
```

Every task execution traceable to an exact immutable version.

### Deployment Flow

```
agentVersions.transition(CANDIDATE → APPROVED) →
  deployments.create(templateId, environmentId, targetVersionId) →
    operator approves deployment →
      deployments.activate() →
        agentInstances.create() bound to deployment
```

Rollback:
```
deployments.create(templateId, env, previousVersionId) →
  old deployment.status → RETIRED
  new instances spawned from previous version
```

### Policy Evaluation Flow

```
MC wants to execute tool →
  ARM policyEnvelopes.evaluate(instanceId, toolName, riskLevel) →
    ALLOW: proceed, write opEvent
    NEEDS_APPROVAL: ARM approvalRecords.create() → operator decides
    DENY: block + changeRecord + opEvent
```

Policy inheritance: version policy > project policy > tenant policy.

### Telemetry Split (v0.2)

```
MC runs complete →
  Governance events → changeRecords (TASK_TRANSITIONED, APPROVAL_DECIDED, etc.)
  Execution events → opEvents (RUN_COMPLETED, TOOL_CALL_COMPLETED, COST_TICK, etc.)
```

Link: `opEvents.changeRecordId` when an op event triggers a governance event.

### Emergency Controls

```
MC operatorControls.PAUSE →
  ARM agentInstances.transition(ACTIVE → PAUSED) →
    changeRecord: EMERGENCY_PAUSE
    All tasks for paused instances → BLOCKED
    opEvent: HEARTBEAT stops
```

---

## 8. Migration Phases Summary

| Phase | What's Added | What's Changed | What's Kept |
|-------|--------------|----------------|-------------|
| **0** | FORK_BOUNDARY.md, MIGRATION_PLAN.md | Nothing | Everything |
| **1** | tenants, environments, operators, roles, permissions, roleAssignments | projects (add tenantId); all MC tables (add optional tenantId) | MC tables functional |
| **2** | registry/ (templates, versions, instances, identities), governance/ (policyEnvelopes, approvalRecords, changeRecords, deployments, roles, permissions, roleAssignments) | Nothing | MC agents, policies, approvals |
| **3** | lib/agentResolver.ts, compat functions | agentInstances (add legacyAgentId) | MC agents (dual-write) |
| **4** | assigneeInstanceIds, instanceId, versionId fields | tasks, runs, toolCalls, messages (dual-write) | MC agentId fields |
| **5** | opEvents table | activities (parallel writes) | MC activities |
| **6** | deployments table | Nothing | Everything |
| **7** | ARM policy evaluator path | policy.ts (add ARM evaluator call) | MC policy.evaluate() |
| **8** | ARM UI pages (Directory, Policies, Deployments, Audit, Telemetry) | TopNav/Sidebar (add nav items) | MC views |

---

## 9. Acceptance Criteria

After all phases:

- ✅ All existing MC flows work (tasks, runs, toolCalls, messages, approvals, policy evaluation)
- ✅ New ARM tables present and functional
- ✅ Dual-write in place; backfill action available
- ✅ Every run/toolCall traceable to instanceId + versionId
- ✅ changeRecords and opEvents both written
- ✅ Deployments: create, activate, rollback (stubbed)
- ✅ Tool execution calls ARM policy evaluator

---

## 10. What's NOT in This Migration

Per ARM PRD v2.1 Technical Review, these are out of scope:

- **Federation**: Protocol spec, provider adapters, inventory sync, command channel (P1.7)
- **Evidence artifacts**: Signed Agent Card, Lineage Sheet, Audit Pack; signing scheme and key management (P1.6)
- **EvaluationSuite / EvaluationRun / promotion gates**: New subsystem (P1.3)
- **Cost ledger with full attribution**: MC budget caps remain; ARM CostLedgerEntry/outcome tagging later (P1.5)
- **Telemetry at scale**: opEvents in Convex; separate store (ClickHouse) only if volume demands
- **Full file reorganization**: New ARM modules added; existing MC files stay at convex root

---

**Next**: See [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for phase-by-phase implementation checklist.
