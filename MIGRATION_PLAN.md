# ARM–Mission Control Migration Plan

**Version**: 0.2  
**Date**: February 9, 2026  
**Branch**: `feat/arm-mc-migration`  
**Strategy**: Incremental dual-write migration; no big-bang rewrite

---

## References

- **Unified Schema Mapping v0.2**: 55-table combined model; ARM owns registry, governance, audit, identity, deployments; MC owns execution, coordination, communication, intelligence, workflow, platform ops.
- **ARM repo**: https://github.com/jaydubya818/ARM — Reference for schema patterns, genome hashing, state machines, policy evaluation, ChangeRecords.
- **ARM PRD v2.1 Technical Review (Claude Opus 4.6, Feb 2026)**: Fork mapping, data model gaps, lifecycle details, and P1 build order. **This migration plan is the migration strategy called out as missing in the PRD review.**

---

## Principles

1. **Dual-write**: New ARM tables and fields populated in parallel; MC tables and `agentId` paths unchanged until cutover.
2. **No deletes**: Do not remove MC `agents`, `policies`, `approvals`, `activities`, `taskTransitions`, `taskEvents` tables.
3. **Read preference flag**: `armCompatMode` — when false, reads prefer `instanceId`/`versionId`; when true, prefer legacy `agentId`. Default: true (safe).
4. **Small commits**: One commit per phase; run build + typecheck after each.
5. **Backward compatibility**: All existing MC flows (tasks, runs, toolCalls, approvals) must remain functional.

---

## Phase 0 — Documentation ✅

**Goal**: Document fork boundary and migration plan.

**Deliverables**:
- [x] Create `FORK_BOUNDARY.md` — Carried forward, refactored, retired, net-new
- [x] Create `MIGRATION_PLAN.md` — This file

**Commit**: `docs: add fork boundary + migration plan`

---

## Phase 1 — Multi-Tenancy Foundation

**Goal**: Add ARM multi-tenancy and RBAC primitives; extend MC tables with optional `tenantId`.

### Schema Changes (convex/schema.ts)

**New tables**:
- [ ] `tenants` — Top-level isolation (name, slug, metadata)
- [ ] `environments` — Release channels (tenantId, name, type: dev/staging/prod)
- [ ] `operators` — Human identity (tenantId, email, name, authId, GDPR fields)
- [ ] `roles` — RBAC role definitions (tenantId, name, permissions[])
- [ ] `permissions` — Permission registry (resource, action)
- [ ] `roleAssignments` — Operator-to-role mappings (operatorId, roleId, scope)

**Modified tables**:
- [ ] `projects` — Add `tenantId: v.id("tenants")` (REQUIRED); create default tenant in seed
- [ ] All other MC tables — Add `tenantId: v.optional(v.id("tenants"))` (backfill later)

**Indexes**:
- [ ] Add `by_tenant` index on: tenants, environments, operators, projects, and all new ARM tables

### New Files

- [ ] `convex/lib/getActiveTenant.ts` — Resolve tenant from auth/session (stub: return default tenant)

### Testing

- [ ] Run `pnpm typecheck` — no errors
- [ ] Run `pnpm --filter @mission-control/shared build` — success
- [ ] Verify Convex schema deploys: `npx convex dev` (or existing deployment)

**Commit**: `schema: add tenants/environments/operators + rbac primitives`

---

## Phase 2 — ARM Registry Kernel

**Goal**: Add ARM registry (templates, versions, instances, identities) and governance (policies, approvals, changeRecords, deployments).

### New Modules

**convex/registry/**:
- [ ] `tenants.ts` — createTenant, getTenant, listTenants
- [ ] `environments.ts` — createEnvironment, listEnvironments
- [ ] `operators.ts` — createOperator, getOperator, listOperators
- [ ] `agentTemplates.ts` — createTemplate, getTemplate, listTemplates, updateTemplate
- [ ] `agentVersions.ts` — createVersion (compute genomeHash), getVersion, listVersions, transitionVersion (lifecycle: DRAFT→TESTING→CANDIDATE→APPROVED→DEPRECATED→RETIRED)
- [ ] `agentInstances.ts` — createInstance, getInstance, listInstances, transitionInstance (lifecycle: PROVISIONING→ACTIVE→PAUSED/READONLY/DRAINING/QUARANTINED→RETIRED), optional `legacyAgentId` field
- [ ] `agentIdentities.ts` — upsertAgentIdentity (writes changeRecord: IDENTITY_UPDATED), getIdentity, listIdentities; link to `templateId`

**convex/governance/**:
- [ ] `policyEnvelopes.ts` — createPolicyEnvelope, attachPolicy (tenant/project/version scope), evaluate (ALLOW/DENY/NEEDS_APPROVAL), policy inheritance (version > project > tenant)
- [ ] `approvalRecords.ts` — createApprovalRecord, decideApproval, listApprovals (enriched with MC fields: rollbackPlan, justification, escalationLevel)
- [ ] `changeRecords.ts` — appendChangeRecord (typed enum: TEMPLATE_CREATED, VERSION_CREATED, INSTANCE_CREATED, IDENTITY_UPDATED, POLICY_ATTACHED, APPROVAL_REQUESTED, APPROVAL_DECIDED, DEPLOYMENT_CREATED, DEPLOYMENT_ACTIVATED, EMERGENCY_PAUSE, etc.), listChangeRecords, getChangeRecord
- [ ] `deployments.ts` — createDeployment, activateDeployment, rollbackDeployment, listDeployments
- [ ] `roles.ts` — createRole, listRoles
- [ ] `permissions.ts` — createPermission, listPermissions
- [ ] `roleAssignments.ts` — assignRole, listAssignments

**convex/lib/**:
- [ ] `genomeHash.ts` — computeGenomeHash (SHA-256 of canonicalized genome), verifyGenomeHash

### Genome MVP (required fields only)

```typescript
{
  modelConfig: { provider, modelId, temperature?, maxTokens? },
  promptBundleHash: string,
  toolManifestHash: string,
  provenance: { createdBy, source, createdAt }
}
```

All other genome fields optional in P1.

### Testing

- [ ] Run `pnpm typecheck` — no errors
- [ ] Create test tenant, environment, template, version, instance
- [ ] Verify genomeHash computation
- [ ] Verify changeRecord written on identity update

**Commit**: `arm: add registry + governance kernel (templates/versions/instances/identities/policy/approvals/changeRecords)`

---

## Phase 3 — Compatibility Layer

**Goal**: Resolve legacy `agentId` ↔ ARM `instanceId`/`versionId`; dual-write to MC agents.

### New Files

**convex/lib/agentResolver.ts**:
- [ ] `resolveAgentRef(input)` — accepts `agentId` or `instanceId`; returns `{ instanceId, versionId, templateId, legacyAgentId? }`
- [ ] `getAgentByLegacyId(legacyAgentId)` — returns instance-shaped object (for callers expecting "agent")
- [ ] `ensureInstanceForLegacyAgent(legacyAgentId)` — creates template/version/instance if missing; idempotent

### Schema Changes

- [ ] `agentInstances` — Add `legacyAgentId: v.optional(v.id("agents"))` field
- [ ] Add index: `by_legacy_agent` on `agentInstances`

### Code Path Updates

- [ ] Identify agent creation points in MC (e.g., `convex/agents.ts` `register` mutation)
- [ ] Add calls to `ensureInstanceForLegacyAgent()` — creates ARM entities
- [ ] Keep writing to MC `agents` table (dual-write)
- [ ] Identify agent loading points (e.g., `agents.get`, `agents.getByName`)
- [ ] Add compat wrappers that call `resolveAgentRef()` when needed

### Testing

- [ ] Create an agent via MC path — verify ARM template/version/instance created
- [ ] Query agent by legacy ID — verify returns instance data
- [ ] Verify MC `agents` table still written

**Commit**: `arm: add compat resolver + legacy mapping (dual-write ready)`

---

## Phase 4 — Execution Ref Cutover

**Goal**: Add `instanceId`/`versionId` fields to execution tables; dual-write; backfill.

### Schema Changes

- [ ] `tasks` — Add `assigneeInstanceIds: v.optional(v.array(v.id("agentInstances")))`
- [ ] `runs` — Add `instanceId: v.optional(v.id("agentInstances"))`, `versionId: v.optional(v.id("agentVersions"))`, `templateId: v.optional(v.id("agentTemplates"))`
- [ ] `toolCalls` — Add `instanceId: v.optional(v.id("agentInstances"))`, `versionId: v.optional(v.id("agentVersions"))`
- [ ] `messages` — Add `authorInstanceId: v.optional(v.id("agentInstances"))`, `operatorId: v.optional(v.id("operators"))`
- [ ] Add indexes: `by_instance` on runs, toolCalls; `by_author_instance` on messages

### Dual-Write Implementation

**In convex/tasks.ts**:
- [ ] `assign` mutation — when writing `assigneeIds`, also populate `assigneeInstanceIds` via resolver
- [ ] `create` mutation — if assignees provided, populate both fields

**In convex/runs.ts**:
- [ ] `create` mutation — populate both `agentId` and `instanceId`/`versionId` via resolver

**In convex/toolCalls.ts** (or wherever tool calls are created):
- [ ] Populate `instanceId`/`versionId` alongside existing fields

**In convex/messages.ts**:
- [ ] `create` mutation — populate `authorInstanceId` alongside `authorAgentId`

### Read Preference Flag

- [ ] Add `armCompatMode` env var or feature flag (default: `true`)
- [ ] Update read queries to check flag:
  - If `armCompatMode === true`: use `agentId`, `assigneeIds`, `authorAgentId`
  - If `armCompatMode === false`: use `instanceId`, `assigneeInstanceIds`, `authorInstanceId`

### Backfill Action

**convex/migrations/backfillInstanceRefs.ts**:
- [ ] Convex action that iterates tasks, runs, toolCalls, messages with cursor
- [ ] For each record with `agentId`, resolve to `instanceId`/`versionId` via `agentResolver`
- [ ] Populate new fields
- [ ] Track progress (cursor, count); idempotent and restartable

### Testing

- [ ] Create task with assignees — verify both `assigneeIds` and `assigneeInstanceIds` populated
- [ ] Create run — verify `agentId`, `instanceId`, `versionId` all present
- [ ] Run backfill action on sample data — verify fields populated
- [ ] Toggle `armCompatMode` — verify reads switch between legacy and instance refs

**Commit**: `exec: add instance/version refs + dual-write + backfill action`

---

## Phase 5 — Observability Split

**Goal**: Add `opEvents` for high-volume telemetry; wire parallel writes to `changeRecords` and `opEvents`.

### Schema Changes

**New table**: `opEvents`
- [ ] Fields: tenantId, type (enum), timestamp, instanceId, versionId, projectId, payload (any), changeRecordId (optional)
- [ ] Indexes: `by_tenant`, `by_timestamp`, `by_instance`, `by_type`, `by_project`

**opEvents.type enum** (v0.2):
```
RUN_STARTED | RUN_STEP | RUN_COMPLETED | RUN_FAILED
TOOL_CALL_STARTED | TOOL_CALL_COMPLETED | TOOL_CALL_BLOCKED
WORKFLOW_STEP_STARTED | WORKFLOW_STEP_COMPLETED | WORKFLOW_STEP_FAILED
HEARTBEAT | COST_TICK | MESSAGE_SENT | DECISION_MADE
```

### Wiring

**In convex/runs.ts**:
- [ ] On run start — write opEvent: RUN_STARTED
- [ ] On run complete — write opEvent: RUN_COMPLETED
- [ ] On run fail — write opEvent: RUN_FAILED

**In convex/toolCalls.ts** (or tool execution path):
- [ ] On tool call start — write opEvent: TOOL_CALL_STARTED
- [ ] On tool call complete — write opEvent: TOOL_CALL_COMPLETED
- [ ] On tool call blocked — write opEvent: TOOL_CALL_BLOCKED

**In convex/workflowRuns.ts**:
- [ ] On step start — write opEvent: WORKFLOW_STEP_STARTED
- [ ] On step complete — write opEvent: WORKFLOW_STEP_COMPLETED
- [ ] On step fail — write opEvent: WORKFLOW_STEP_FAILED

**In convex/tasks.ts** (or wherever task transitions happen):
- [ ] On task transition — write changeRecord: TASK_TRANSITIONED (governance event)

**In convex/approvals.ts**:
- [ ] On approval request — write changeRecord: APPROVAL_REQUESTED
- [ ] On approval decision — write changeRecord: APPROVAL_DECIDED

**Keep existing writes**: Do not remove MC `activities` writes; add parallel writes.

### Testing

- [ ] Create a run — verify opEvent written (RUN_STARTED)
- [ ] Complete a run — verify opEvent written (RUN_COMPLETED)
- [ ] Transition a task — verify changeRecord written (TASK_TRANSITIONED)
- [ ] Request approval — verify changeRecord written (APPROVAL_REQUESTED)

**Commit**: `obs: add opEvents + wire parallel writes`

---

## Phase 6 — Deployments Bridge

**Goal**: Add promotion/rollback channel between approved versions and running instances.

### Schema Changes

**New table**: `deployments` (in governance)
- [ ] Fields: tenantId, templateId, environmentId, targetVersionId, previousVersionId, rolloutPolicy (object), status (PENDING | ACTIVE | ROLLING_BACK | RETIRED), createdBy, approvedBy, activatedAt
- [ ] Indexes: `by_tenant`, `by_template`, `by_environment`, `by_status`

### Mutations (convex/governance/deployments.ts)

- [ ] `createDeployment` — writes changeRecord: DEPLOYMENT_CREATED
- [ ] `activateDeployment` — requires approval or policy gate; writes changeRecord: DEPLOYMENT_ACTIVATED
- [ ] `rollbackDeployment` — creates new deployment pointing to `previousVersionId`, sets old deployment status to RETIRED, writes changeRecords; optionally rebinds instances to prior version
- [ ] `listDeployments` — query by tenant, template, environment, status

### Instance Creation Enforcement (optional)

- [ ] Add flag: `requireActiveDeployment` (per environment)
- [ ] In `agentInstances.create` — if flag set, verify an ACTIVE deployment exists for the version

### Testing

- [ ] Create deployment — verify changeRecord written
- [ ] Activate deployment — verify status updated, changeRecord written
- [ ] Rollback deployment — verify new deployment created, old retired, changeRecords written

**Commit**: `rel: add deployments + activation + rollback`

---

## Phase 7 — Policy Bridge

**Goal**: Route MC tool execution through ARM policy evaluator.

### Code Changes

**In convex/policy.ts** (or wherever tool execution policy check happens):
- [ ] Add function: `evaluateWithARM(instanceId, toolName, riskLevel, context)`
- [ ] Resolve `agentId` → `instanceId` via `agentResolver`
- [ ] Call `policyEnvelopes.evaluate(instanceId, toolName, riskLevel, context)`
- [ ] Handle decisions:
  - **ALLOW**: Proceed, write opEvent (TOOL_CALL_STARTED)
  - **NEEDS_APPROVAL**: Create ARM `approvalRecord`, block until decided
  - **DENY**: Block, write changeRecord (POLICY_DENIED) + opEvent (TOOL_CALL_BLOCKED)

**Policy inheritance**:
- [ ] Implement in `policyEnvelopes.evaluate` — resolve effective policy: version policy > project policy > tenant policy

### Integration Points

- [ ] Identify MC tool execution entry point (likely in runs or tool call creation)
- [ ] Add call to `evaluateWithARM()` before tool execution
- [ ] Keep existing MC `policy.evaluate()` functional (dual-path during migration)

### Testing

- [ ] Execute tool with ALLOW policy — verify proceeds, opEvent written
- [ ] Execute tool with NEEDS_APPROVAL policy — verify approval created, tool blocked
- [ ] Execute tool with DENY policy — verify blocked, changeRecord + opEvent written
- [ ] Verify policy inheritance (version overrides project overrides tenant)

**Commit**: `gov: route tool execution through ARM policy evaluator`

---

## Phase 8 — Minimal ARM UI

**Goal**: Add placeholder UI pages for ARM entities; no redesign of existing MC views.

### Navigation

**In apps/mission-control-ui/src/TopNav.tsx** (or AppSideNav):
- [ ] Add nav items: "Directory", "Policies", "Deployments", "Audit", "Telemetry"

**In apps/mission-control-ui/src/App.tsx**:
- [ ] Add routes for new views
- [ ] Wire up view switching

### New Views

- [ ] `DirectoryView.tsx` — List templates, versions, instances (tabs); detail drawer
- [ ] `PoliciesView.tsx` — List policy envelopes; detail drawer
- [ ] `DeploymentsView.tsx` — List deployments; detail drawer with activate/rollback actions
- [ ] `AuditView.tsx` — List changeRecords; filter by type, tenant, date range
- [ ] `TelemetryView.tsx` — List opEvents; filter by type, instance, date range

**Design**: Reuse existing MC shell components (PageHeader, drawer pattern, StatusChip, tables). Minimal styling; no redesign.

### Testing

- [ ] Navigate to each new view — verify loads without errors
- [ ] Create template via UI — verify appears in Directory
- [ ] View changeRecords — verify audit events displayed
- [ ] View opEvents — verify telemetry events displayed

**Commit**: `ui: add ARM pages (directory/policy/deployments/audit/telemetry)`

---

## Quality Bar / Acceptance Criteria

After all phases complete:

- [ ] **MC flows functional**: Tasks, runs, toolCalls, messages, approvals, policy evaluation all work as before
- [ ] **ARM tables present**: tenants, environments, operators, agentTemplates, agentVersions, agentInstances, agentIdentities, policyEnvelopes, approvalRecords, changeRecords, deployments, opEvents, roles, permissions, roleAssignments
- [ ] **Dual-write working**: Agent creation populates both MC agents and ARM instances
- [ ] **Backfill available**: Action to populate instanceId/versionId on existing tasks/runs/toolCalls
- [ ] **Traceability**: Every run/toolCall traceable to instanceId + versionId after backfill
- [ ] **Audit split**: changeRecords (governance) and opEvents (telemetry) both written
- [ ] **Deployments**: Create, activate, rollback (at least stubbed)
- [ ] **Policy bridge**: Tool execution calls ARM evaluator; ALLOW/NEEDS_APPROVAL/DENY decisions work
- [ ] **UI functional**: ARM pages load and display data
- [ ] **Tests pass**: All existing tests still pass
- [ ] **Build succeeds**: `pnpm build` completes without errors

---

## Out of Scope for This Migration

Per ARM PRD v2.1 Technical Review:

- **Federation** (P1.7): Protocol spec, provider adapters, inventory sync, command channel
- **Evidence artifacts** (P1.6): Signed Agent Card, Lineage Sheet, Audit Pack; signing scheme and key management
- **EvaluationSuite / EvaluationRun / promotion gates** (P1.3): New subsystem
- **Cost ledger with full attribution** (P1.5): MC budget caps remain; ARM CostLedgerEntry/outcome tagging later
- **Telemetry at scale**: opEvents in Convex for now; separate store (e.g. ClickHouse) only if volume demands
- **Full file reorganization**: New ARM modules added under registry/ and governance/; existing MC files stay at convex root

---

## Rollback Plan

If migration causes issues:

1. **Revert schema changes**: Convex supports schema rollback via dashboard
2. **Disable dual-write**: Comment out ARM writes in code
3. **Switch read preference**: Set `armCompatMode = true` to use legacy fields only
4. **Revert commits**: `git revert <commit-hash>` for each phase

---

## Post-Migration Tasks (Future)

After this migration is stable:

1. **Retire MC tables**: Delete `agents`, `policies`, `approvals`, `activities`, `taskTransitions`, `taskEvents` after verifying ARM equivalents stable
2. **Remove dual-write**: Delete legacy field writes; remove `armCompatMode` flag
3. **File reorganization**: Move MC modules to `convex/operations/` for cleaner structure
4. **Full cutover**: Switch all reads to ARM fields; remove legacy field support
5. **Add Federation** (P1.7): Implement protocol, provider adapters
6. **Add Evidence artifacts** (P1.6): Signing, Agent Card, Lineage Sheet, Audit Pack
7. **Add Evaluation system** (P1.3): EvaluationSuite, EvaluationRun, promotion gates
8. **Add Cost ledger** (P1.5): Full attribution with outcome tagging

---

**Status**: Ready for Phase 1 implementation  
**Next**: See [FORK_BOUNDARY.md](FORK_BOUNDARY.md) for component mapping details
