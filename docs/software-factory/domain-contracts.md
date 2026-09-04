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

## 2a. Structured run timeline and artifacts

```ts
type RunEventType =
  | "RUN_STARTED"
  | "STEP_STARTED"
  | "STEP_COMPLETED"
  | "TOOL_CALLED"
  | "COMMAND_EXECUTED"
  | "FILE_CHANGED"
  | "ARTIFACT_CREATED"
  | "CHECKPOINT_CREATED"
  | "RETRY_STARTED"
  | "RETRY_COMPLETED"
  | "HUMAN_INTERVENTION_REQUESTED"
  | "RUN_PAUSED"
  | "RUN_RESUMED"
  | "RUN_FAILED"
  | "RUN_COMPLETED";

interface RunEvent {
  _id: Id<"runEvents">;
  workflowRunId: Id<"workflowRuns">;
  workOrderId?: Id<"workOrders">;
  sequenceNumber: number;
  eventType: RunEventType;
  workflowStep?: string;
  status?: string;
  actor?: string;
  toolName?: string;
  commandSummary?: string;
  retryNumber?: number;
  verificationReceiptId?: Id<"verificationReceipts">;
  evidenceArtifactIds?: Id<"runArtifacts">[];
  errorCategory?: string;
  errorSummary?: string;
  metadata?: any;
}

type RunArtifactType =
  | "CODE_DIFF"
  | "TEST_OUTPUT"
  | "BUILD_OUTPUT"
  | "LOG_BUNDLE"
  | "SCREENSHOT"
  | "GENERATED_DOCUMENT"
  | "VERIFICATION_EVIDENCE"
  | "PULL_REQUEST"
  | "CHECKPOINT"
  | "STRUCTURED_OUTPUT"
  | "OTHER";

interface RunArtifact {
  _id: Id<"runArtifacts">;
  workflowRunId: Id<"workflowRuns">;
  workOrderId?: Id<"workOrders">;
  artifactType: RunArtifactType;
  name: string;
  repositoryPath?: string;
  externalLocation?: string;
  verificationReceiptId?: Id<"verificationReceipts">;
  acceptanceCriterionId?: string;
  producingEventId?: Id<"runEvents">;
  contentHash?: string;
  producer?: string;
  createdAt: number;
  metadata?: any;
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
  taskId?: Id<"tasks">;
  workflowId?: string;
  actorType: "HUMAN" | "SYSTEM" | "AGENT";
  actorId?: string;
  idempotencyKey: string;
  runtime?: string;
  repositoryId?: Id<"workspaceRepositories">;
  codeScopeIds?: Id<"repositoryCodeScopes">[];
  owningTeamId?: Id<"scrumTeams">;
  ownerMemberId?: Id<"orgMembers">;
  executionEnvironment?: "LOCAL" | "CLOUD" | "REMOTE" | "POLICY_SELECTED";
  executorHostId?: string;
  factoryDefinitionVersionId?: Id<"factoryDefinitionVersions">;
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
8. for stable repository WorkOrders, require the exact active Factory version,
   approved code scopes, accountable team and owner, execution environment, and
   current eligible host to match the persisted WorkOrder contract

The browser may display these bindings, but it is never their authority. A
Factory activation, readiness, scope, workflow, host, or organization change
between the browser read and the mutation must reject dispatch without creating
a run.

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
  linkedRunArtifactIds?: Id<"runArtifacts">[];
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

## 8. Fourth-slice run inspector contract

MissionControl exposes one authoritative inspector query over `workflowRuns` plus additive `runEvents` and `runArtifacts`.

```ts
type GetExecutionRunInspector = {
  workflowRunId: Id<"workflowRuns">;
  verificationReceiptId?: Id<"verificationReceipts">;
  acceptanceCriterionId?: string;
};
```

It returns:

1. the canonical `workflowRun`
2. ordered `runEvents`
3. linked `runArtifacts`
4. derived file-change and retry summaries
5. focused evidence lineage for a receipt or acceptance criterion

## 9. Fifth-slice lifecycle revision and reopen contract

MissionControl keeps WorkOrder history immutable and additive.

### Additional WorkOrder lifecycle states

```ts
type WorkOrderState =
  | "DRAFT"
  | "READY"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "AWAITING_VERIFICATION"
  | "REOPENED"
  | "DONE"
  | "CANCELED"
  | "SUPERSEDED";
```

### WorkOrderRevision

```ts
interface WorkOrderRevision {
  _id: Id<"workOrderRevisions">;
  workOrderId: Id<"workOrders">;
  revisionNumber: number;
  status: "DRAFT" | "APPROVED" | "APPLIED" | "REJECTED";
  changeSummary: string;
  reason?: string;
  requestedBy?: string;
  approvedBy?: string;
  previousRevisionId?: Id<"workOrderRevisions">;
  beforeSnapshot: any;
  afterSnapshot: any;
  impactedAcceptanceCriteriaIds?: string[];
  createdAt: number;
  approvedAt?: number;
  appliedAt?: number;
}
```

### ReopenDecision

```ts
interface ReopenDecision {
  _id: Id<"reopenDecisions">;
  workOrderId: Id<"workOrders">;
  reason: string;
  sourceIssueOrDefect?: string;
  requestedBy?: string;
  approvedBy?: string;
  reopenScope: "full-workorder" | "targeted-criteria";
  acceptanceCriteriaImpacted?: string[];
  invalidatedReceiptIds?: Id<"verificationReceipts">[];
  createdAt: number;
}
```

### WorkOrderSupersession

```ts
interface WorkOrderSupersession {
  _id: Id<"workOrderSupersessions">;
  workOrderId: Id<"workOrders">;
  replacementWorkOrderId: Id<"workOrders">;
  reason: string;
  actorType: "HUMAN" | "SYSTEM" | "AGENT";
  actorId?: string;
  createdAt: number;
}
```

### Governance validity windows

- `approvalDecisions.expiresAt` allows time-bounded approvals.
- `verificationReceipts.validUntil` allows time-bounded evidence.
- expired approvals transition to `EXPIRED` and no longer satisfy dispatch or acceptance gates.
- expired or invalidated receipts transition to `STALE` and block acceptance until replaced.

### Authoritative lifecycle commands

```ts
type RequestWorkOrderRevisionCommand = {
  workOrderId: Id<"workOrders">;
  idempotencyKey: string;
  changeSummary: string;
  reason?: string;
  requestedBy?: string;
  patch: Partial<WorkOrder>;
};

type ApproveWorkOrderRevisionCommand = {
  workOrderRevisionId: Id<"workOrderRevisions">;
  approvedBy?: string;
};

type ReopenWorkOrderCommand = {
  workOrderId: Id<"workOrders">;
  idempotencyKey: string;
  reason: string;
  sourceIssueOrDefect?: string;
  requestedBy?: string;
  approvedBy?: string;
  reopenScope: "full-workorder" | "targeted-criteria";
  acceptanceCriteriaImpacted?: string[];
};

type SupersedeWorkOrderCommand = {
  workOrderId: Id<"workOrders">;
  replacementWorkOrderId: Id<"workOrders">;
  reason: string;
  actorType: "HUMAN" | "SYSTEM" | "AGENT";
  actorId?: string;
  idempotencyKey: string;
};

type ExpireGovernanceRecordsCommand = {
  workOrderId: Id<"workOrders">;
};
```

### Lifecycle guarantees

1. revisions append immutable snapshots instead of mutating history in place
2. applying a material revision advances `currentRevisionNumber`
3. reopen preserves prior evidence lineage but marks impacted receipts stale
4. supersession marks the original WorkOrder `SUPERSEDED` and links the replacement both ways
5. expiry is server-evaluated and auditable via lifecycle events
6. UI, CLI, and orchestration must all call these server-owned commands

## 10. Sixth-slice factory overview contract

MissionControl exposes one authoritative portfolio-level overview query for the Control > Portfolio surface.

```ts
type GetFactoryOverview = {
  projectId?: Id<"projects">;
  limit?: number;
};
```

It returns:

1. summary metrics for active work, blocked work, pending approvals, stale evidence, verification failures, attention-seeking runs, and recently accepted outcomes
2. blocked WorkOrders with their latest execution run summary
3. pending approval queue entries with linked WorkOrder context
4. stale verification receipts with linked WorkOrder context
5. latest runs needing attention because of failure, pause, retry churn, or human intervention
6. recently accepted WorkOrders to make throughput visible in the same surface

- `WORK_ORDER_CREATED`
- `DISPATCH_REQUESTED`
- `DISPATCHED`
- `RUN_COMPLETED`
- `RUN_FAILED`
- `RUN_CANCELED`
- `RUN_RETRIED`
- `STATE_SYNCED`

## 11. Factory execution identity composition

Factory execution uses four independent identities:

```text
Model Route
    +
Harness
    +
Runtime Artifact
    +
Execution Backend
    =
qualified immutable Factory Version
```

They have distinct ownership:

- **Model Route** is inference identity. `factory-model-route/v2` contains the
  provider, provider route, model ID, and bounded inference/reasoning settings.
  It contains no adapter, harness, executable, image, or backend identity.
- **Harness** is agent execution behavior. Its adapter and version, upstream
  harness identity, capability manifest, and effective-configuration digest
  describe what the execution implementation can do.
- **Runtime Artifact** is the exact executable environment. The
  `harness-runtime-artifact/v1` sidecar identifies a pinned executable or
  container image and has its own canonical digest.
- **Execution Backend** is placement. It identifies where the harness executes,
  such as a persistent worker or admitted remote sandbox; it is not a model or
  harness property.

Compatibility is separate from identity. Reviewed qualification may bind an
exact model route to an exact harness/runtime/backend combination for bounded
workload and risk scopes. That binding does not collapse the components into a
single abstraction and does not make any component authoritative for routing.
`factory-model-route-qualification/v2` records the compatible adapter/version,
capability-manifest digest, effective-configuration digest, runtime-artifact
digest, and backend next to the route digest and evidence scope.

One inference route may therefore have multiple immutable catalog
qualification instances. Re-registering a route may reuse an unqualified
draft, but it never mutates an already-qualified instance. Factory creation
filters by the complete compatibility and risk/workload scope before requiring
one result; zero matches fail closed, and multiple equally eligible matches
require an explicit catalog ID.

### Factory Version execution binding

Only an immutable Factory Version is routable. A newly created executable
Factory Version freezes at least:

- the model-catalog record, `factory-model-route/v2` snapshot, canonical route
  digest, and exact qualification evidence;
- the harness adapter/version, complete capability manifest and digest, and
  effective-configuration digest;
- the runtime-artifact snapshot and canonical digest;
- the execution backend and, for remote execution, the exact Sandbox Profile
  snapshot and digest;
- the repository, workflow, all workflow-agent bindings, code scopes, policy,
  budget, risk boundary, recovery contract, and independent verifiers.

Every executable workflow role must resolve to the one model route frozen by
the V1 Factory configuration. Validating only the first workflow step is not
sufficient. For V2 routes, the effective temperature and token limit on every
Agent Version must also agree with the frozen route; provider route and all
reasoning controls travel unchanged to the adapter. A workflow requiring
multiple model routes requires a future, explicitly governed contract; Phase 1
does not infer or compose one.

Changing a model route, harness manifest, effective harness configuration,
runtime artifact, backend, sandbox profile, or any other material authority
creates a different Factory configuration digest. Dispatch and retry cannot
swap one component inside an existing Factory Version.

### Attempt and worker admission

An Attempt copies a V2 Factory Version's exact execution composition into
`factory-execution-manifest/v2`; frozen legacy routes retain the byte-compatible
`factory-execution-manifest/v1` projection. The manifest proves which model
route, harness, runtime artifact, backend, configuration, sandbox, repository
source, and scoped authority were requested. It remains immutable after
dispatch.

A worker is eligible only when its current advertisement and exact Factory
Version binding agree with the frozen request. Admission compares:

- adapter and adapter version;
- harness capability-manifest digest;
- effective-configuration digest;
- host adapter runtime-artifact digest;
- supported execution backend;
- provider and model;
- isolation and sandbox capabilities;
- repository authority; and
- Factory Version, configuration, model-route, and Sandbox Profile digests.

The Factory Version binding also carries the exact execution-artifact digest.
For persistent execution it is the harness executable. For remote execution it
is the immutable Sandbox Profile image, reconciled again against the sandbox
result's environment descriptor; it is not confused with the host adapter
binary used to supervise that sandbox.

Missing, stale, malformed, or mismatched values fail closed. A worker never
substitutes another installed harness or runtime artifact. The normalized
`harness-result/v1` provenance is reconciled against the same frozen Attempt,
including the exact model-route digest, provider route, and reasoning controls.
Unavailable telemetry remains `null`, and harness completion cannot satisfy
verification or publication gates.

### Frozen V1 compatibility

`factory-model-route/v1` embedded Codex harness and runtime identity in the
model snapshot. It remains readable for historical evidence and executable
only through a legacy Factory Version that already froze the exact V1 route,
qualification, harness, runtime, and backend combination.

New model registrations and new Factory Versions use
`factory-model-route/v2`. Mission Control does not silently migrate malformed
V1 data, infer missing identity, recalculate historical digests under the V2
namespace, or use a V1 catalog record to create a new executable Factory
Version. Historical examples and canonical digests remain unchanged.
