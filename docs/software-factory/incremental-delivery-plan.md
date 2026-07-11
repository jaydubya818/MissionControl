# MissionControl Software Factory Incremental Delivery Plan

## Prioritized gap analysis

## Tier 1 — must exist to change the product center of gravity

1. **First-class WorkOrder object**
2. **Work Queue view centered on outcomes**
3. **WorkOrder detail view centered on acceptance criteria and evidence**
4. **Direct linkage between requested work and execution runs**

## Tier 2 — needed soon after

1. Approval center aligned to WorkOrders
2. Verification receipts / traceability matrix
3. Real factory overview using live data

## Tier 3 — later

1. Analytics
2. LearningCandidate pipeline
3. Hermes/Pi event transport hardening
4. GitHub writeback improvements

## Selected thin vertical slice

Implement:

**Create and inspect a first-class WorkOrder with acceptance criteria and linked ExecutionRuns.**

## Second thin vertical slice

Implement:

**Governed WorkOrder Dispatch and Lifecycle Synchronization**

### Scope

1. authoritative server-owned dispatch command
2. idempotent dispatch request handling
3. duplicate active run prevention
4. approval/policy gate enforcement
5. WorkOrder lifecycle synchronization from run outcomes
6. auditable lifecycle event stream
7. UI, CLI, and orchestration adoption of the same dispatch boundary
8. concurrency/lifecycle tests

## Third thin vertical slice

Implement:

**WorkOrder-aware ApprovalDecision and VerificationReceipt traceability**

### Scope

1. first-class `approvalDecisions`
2. first-class `verificationReceipts`
3. explicit `workOrders.accept` command
4. acceptance gating from approvals plus verification coverage
5. stale-evidence supersession on new runs
6. control-plane Approval Center
7. WorkOrder verification traceability matrix
8. CLI and orchestration entrypoints for acceptance/governance flows
9. lifecycle and governance tests

## Why this slice first

Because it establishes the correct domain boundary without requiring a platform rewrite:

- request object becomes explicit
- execution stays governed by existing workflow/run infrastructure
- operator can inspect value request and execution together
- future approvals, verification, and analytics have a stable anchor

## Why this slice next

Because run completion alone is not enough to prove delivery:

- business acceptance must remain explicit
- approvals need a WorkOrder-native audit trail
- verification evidence must map criterion-by-criterion
- operators need one place to see what still blocks acceptance

## Scope for slice one

### Included

1. Convex schema for `workOrders`
2. `workflowRuns` linkage to `workOrderId`
3. Convex queries/mutations for list/get/create demo fixtures
4. Typed WorkOrder contract and adapters
5. Work Queue UI
6. WorkOrder detail UI
7. Acceptance-criteria display
8. Linked ExecutionRun timeline
9. Seed/dev fixtures
10. Tests for:
   - contract mapping
   - queue filtering/view model
   - linked run timeline mapping

### Excluded

1. Analytics
2. KB ingestion
3. Advanced GitHub writeback
4. Full verification receipts
5. Replacing all legacy task surfaces

## Implementation plan

### Step 1 — domain and schema

- add `workOrders` table
- extend `workflowRuns`
- add `convex/workOrders.ts`
- add adapter helpers for linked execution runs

### Step 2 — development fixtures

- add software-factory seed/dev fixture data
- ensure at least:
  - multiple repositories
  - multiple lifecycle states
  - multiple risk levels
  - acceptance criteria in pass/pending/fail states
  - linked runs in running/completed/failed states

### Step 3 — UI list/detail

- add `Control > Work Orders`
- build list-first queue with filters
- build detail panel/page for selected WorkOrder

### Step 4 — verification

- add unit tests
- run typecheck
- run targeted vitest
- record verification receipt

## Acceptance criteria for slice one

1. Operator can create or seed a WorkOrder with structured acceptance criteria.
2. Operator can view a Work Queue that communicates outcome, state, risk, verification status, and required attention.
3. Operator can open a WorkOrder detail view and understand:
   - what is being requested
   - what success looks like
   - which run is executing it
   - what happened on linked runs
4. Linked ExecutionRuns are visible without exposing raw tool noise by default.
5. Existing task/workflow concepts remain compatible.
6. Tests cover contract logic and critical queue/detail view-model behavior.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Broad rewrite pressure | Keep changes inside control-plane slice and additive schema |
| Live Convex environment instability | Use codegen + tests + dev fixtures, keep runtime dependencies thin |
| Confusion between tasks and work orders | Add explicit legacy compatibility link and document boundary |
| Demo-only regression | Make new slice real-data first, not demo-only |
