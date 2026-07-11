# MissionControl Software Factory Domain Contracts

## Contract strategy

Use additive contracts.

- Preserve existing `tasks`, `workflowRuns`, `approvals`, `runs`
- Introduce a first-class `workOrders` table
- Extend `workflowRuns` so runs can link directly to a `workOrderId`
- Provide adapters from legacy `tasks` into WorkOrder-shaped summaries where needed

## 1. WorkOrder

```ts
type WorkOrderState =
  | "DRAFT"
  | "READY"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "AWAITING_VERIFICATION"
  | "DONE"
  | "CANCELED";

type WorkOrderRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface AcceptanceCriterion {
  id: string;
  title: string;
  description?: string;
  verificationMethod?: "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST";
  status: "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";
}

interface SourceOfTruthRef {
  kind: "REPO" | "DOC" | "PRD" | "ISSUE" | "URL";
  label: string;
  location: string;
}

interface WorkOrder {
  _id: Id<"workOrders">;
  projectId?: Id<"projects">;
  legacyTaskId?: Id<"tasks">;
  title: string;
  desiredOutcome: string;
  context?: string;
  repository?: string;
  branchStrategy?: string;
  priority: 1 | 2 | 3 | 4;
  riskLevel: WorkOrderRisk;
  requestedBy?: string;
  assignedAgent?: string;
  assignedSquad?: string;
  acceptanceCriteria: AcceptanceCriterion[];
  constraints?: string[];
  dependencies?: string[];
  sourceOfTruthRefs?: SourceOfTruthRef[];
  requiredApprovals?: string[];
  state: WorkOrderState;
  currentExecutionRunId?: Id<"workflowRuns">;
  createdAt: number;
  updatedAt: number;
  metadata?: any;
}
```

## 2. ExecutionRun

For slice one, ExecutionRun is an adapter over `workflowRuns` plus additive fields.

```ts
type ExecutionRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";

interface ExecutionRun {
  _id: Id<"workflowRuns">;
  workOrderId?: Id<"workOrders">;
  workflowId: string;
  status: ExecutionRunStatus;
  agent?: string;
  runtime?: string;
  model?: string;
  tools?: string[];
  permissions?: string[];
  worktree?: string;
  currentStep?: string;
  startedAt: number;
  completedAt?: number;
  retryCount: number;
  humanInterventions?: number;
  failureReason?: string;
}
```

## 3. Compatibility mapping

### Legacy task → WorkOrder summary

Rules:

1. Existing `tasks` remain valid and visible in old surfaces
2. New software-factory surfaces read from `workOrders`
3. A `workOrders.legacyTaskId` link supports migration and traceability
4. If a WorkOrder is created from a task, preserve:
   - title
   - description → desiredOutcome/context split
   - projectId
   - priority
   - assignees
   - source/sourceRef

## 4. Hermes and Pi communication contract

## Hermes → MissionControl

```ts
type HermesCommand =
  | { type: "work_order.upsert"; workOrderId?: string; payload: Partial<WorkOrder> }
  | { type: "factory.status.get" }
  | { type: "work_order.dispatch"; workOrderId: string }
  | { type: "attention.required.get" }
  | { type: "work_order.summary.get"; workOrderId: string }
  | { type: "execution.control"; workOrderId: string; runId?: string; action: "pause" | "resume" | "retry" | "cancel" };
```

## Pi → MissionControl

```ts
type PiEvent =
  | { type: "run.created"; workOrderId: string; runId: string }
  | { type: "worktree.created"; workOrderId: string; runId: string; worktree: string }
  | { type: "plan.generated"; workOrderId: string; runId: string }
  | { type: "step.started"; workOrderId: string; runId: string; step: string }
  | { type: "step.completed"; workOrderId: string; runId: string; step: string }
  | { type: "artifact.produced"; workOrderId: string; runId: string; artifact: string }
  | { type: "approval.required"; workOrderId: string; runId: string; summary: string }
  | { type: "verification.executed"; workOrderId: string; runId: string; summary: string }
  | { type: "failure.encountered"; workOrderId: string; runId: string; reason: string }
  | { type: "retry.attempted"; workOrderId: string; runId: string; attempt: number }
  | { type: "pr.updated"; workOrderId: string; runId: string; reference: string }
  | { type: "run.completed"; workOrderId: string; runId: string; outcome: string }
  | { type: "learning.candidate.proposed"; workOrderId: string; runId: string; summary: string };
```

All commands/events must be:

- idempotent
- audit-friendly
- keyed by `workOrderId`
- keyed by `runId` when execution exists

## 5. First-slice schema changes

1. Add `workOrders` table
2. Add optional `workOrderId` to `workflowRuns`
3. Add optional execution metadata fields to `workflowRuns` needed for UI display:
   - `runtime`
   - `model`
   - `worktree`
   - `currentStepLabel`
   - `failureReason`
   - `humanInterventions`

## 6. Second-slice governed dispatch boundary

MissionControl now needs one authoritative command for WorkOrder dispatch.

### Server-owned command

```ts
type DispatchWorkOrderCommand = {
  workOrderId: Id<"workOrders">;
  workflowId?: string;
  actorType: "HUMAN" | "SYSTEM" | "AGENT";
  actorId?: string;
  idempotencyKey: string;
  runtime?: string;
  model?: string;
  worktree?: string;
};
```

### Command guarantees

The command must:

1. validate dispatchability
2. validate workflow availability
3. enforce approval/policy gates
4. prevent duplicate active runs
5. create and link the execution run
6. transition WorkOrder state to `DISPATCHED`
7. emit auditable lifecycle events

### Required callers

The following entrypoints must all use this same command instead of creating runs directly:

- MissionControl UI
- `scripts/mc` CLI
- orchestration server API

### Lifecycle synchronization contract

`workflowRuns` remains the execution record, but WorkOrder state is synchronized from run status:

| Run status | WorkOrder state |
| --- | --- |
| `PENDING` | `DISPATCHED` |
| `RUNNING` | `IN_PROGRESS` |
| `PAUSED` | `AWAITING_APPROVAL` |
| `FAILED` | `BLOCKED` |
| `CANCELED` | `CANCELED` |
| `COMPLETED` + approval pending/revision/reject | `AWAITING_APPROVAL` |
| `COMPLETED` + execution complete | `AWAITING_VERIFICATION` |

`COMPLETED` no longer means accepted. Explicit acceptance is a separate governed command.

### Auditable lifecycle log

Use `workOrderEvents` for canonical lifecycle auditing:

## 7. Third-slice governance and evidence contracts

### ApprovalDecision

```ts
type WorkOrderApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "CONDITIONAL"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "EXPIRED"
  | "SUPERSEDED";

type WorkOrderApprovalDecision = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "REQUEST_REVISION";

interface ApprovalDecision {
  _id: Id<"approvalDecisions">;
  workOrderId: Id<"workOrders">;
  workflowRunId?: Id<"workflowRuns">;
  approvalType: string;
  requestedAction: string;
  riskLevel: WorkOrderRisk;
  requestedBy?: string;
  approver?: string;
  status: WorkOrderApprovalStatus;
  decision?: WorkOrderApprovalDecision;
  conditions?: string[];
  reason?: string;
  supersededByApprovalDecisionId?: Id<"approvalDecisions">;
  createdAt: number;
  decidedAt?: number;
  metadata?: any;
}
```

### VerificationReceipt

```ts
type VerificationReceiptStatus = "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE";

interface VerificationReceipt {
  _id: Id<"verificationReceipts">;
  workOrderId: Id<"workOrders">;
  acceptanceCriterionId: string;
  workflowRunId: Id<"workflowRuns">;
  verificationMethod?: "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST";
  commandOrCheck?: string;
  result?: string;
  evidenceLocation?: string;
  artifactReference?: string;
  verifier?: string;
  status: VerificationReceiptStatus;
  exceptionOrWaiver?: string;
  waiverApprovalDecisionId?: Id<"approvalDecisions">;
  recordedAt: number;
  metadata?: any;
}
```

### Explicit acceptance boundary

```ts
type AcceptWorkOrderCommand = {
  workOrderId: Id<"workOrders">;
  actorType: "HUMAN" | "SYSTEM" | "AGENT";
  actorId?: string;
  idempotencyKey: string;
};
```

The command must reject acceptance unless:

1. no active run exists
2. the latest run is `COMPLETED`
3. required approvals are satisfied
4. every acceptance criterion has a non-stale receipt
5. no receipt is failed
6. waived criteria carry an approved waiver decision

- `WORK_ORDER_CREATED`
- `DISPATCH_REQUESTED`
- `DISPATCHED`
- `RUN_COMPLETED`
- `RUN_FAILED`
- `RUN_CANCELED`
- `RUN_RETRIED`
- `STATE_SYNCED`
