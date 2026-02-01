# 3. API Surface

## Overview

RESTful API with JSON payloads. All endpoints require authentication via Bearer token or API key.

**Base URL:** `http://localhost:3100/api/v1`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
X-Idempotency-Key: <uuid>  (optional, for safe retries)
X-Agent-Id: <agent-id>     (for agent-originated requests)
```

---

## Authentication

### POST /auth/token
Generate API token for an agent or user.

```typescript
// Request
{
  agentId?: string;
  userId?: string;
  expiresIn?: string;  // "1h", "7d", etc.
}

// Response
{
  token: string;
  expiresAt: string;
}
```

---

## Tasks

### GET /tasks
List tasks with filtering.

```typescript
// Query params
{
  status?: TaskStatus | TaskStatus[];
  type?: TaskType;
  assigneeId?: string;
  creatorId?: string;
  priority?: number;
  parentTaskId?: string;
  labels?: string[];
  search?: string;
  limit?: number;       // default 50, max 200
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'priority' | 'dueAt';
  orderDir?: 'asc' | 'desc';
}

// Response
{
  tasks: Task[];
  total: number;
  hasMore: boolean;
}
```

### GET /tasks/:id
Get task detail with thread.

```typescript
// Response
{
  task: Task;
  transitions: TaskTransition[];
  messages: Message[];
  documents: Document[];
  runs: Run[];           // Recent runs for this task
  approvals: Approval[]; // Pending/recent approvals
}
```

### POST /tasks
Create a new task.

```typescript
// Request
{
  title: string;
  description?: string;
  type: TaskType;
  priority?: number;        // default 3
  assigneeIds?: string[];
  parentTaskId?: string;
  labels?: string[];
  dueAt?: string;
  estimatedCost?: number;
  metadata?: Record<string, any>;
}
// Header: X-Idempotency-Key recommended

// Response
{
  task: Task;
  created: boolean;  // false if idempotency hit
}
```

### PATCH /tasks/:id
Update task fields (non-transition updates).

```typescript
// Request
{
  title?: string;
  description?: string;
  priority?: number;
  assigneeIds?: string[];
  labels?: string[];
  dueAt?: string;
  workPlan?: WorkPlan;
  deliverable?: Deliverable;
  metadata?: Record<string, any>;
}

// Response
{
  task: Task;
}
```

### POST /tasks/:id/transition
Execute a state transition with validation.

```typescript
// Request
{
  toStatus: TaskStatus;
  reason?: string;
  
  // Required based on target status:
  workPlan?: WorkPlan;           // Required for ASSIGNED → IN_PROGRESS
  deliverable?: Deliverable;      // Required for IN_PROGRESS → REVIEW
  reviewChecklist?: ReviewChecklist;
}
// Header: X-Idempotency-Key recommended

// Response (success)
{
  success: true;
  task: Task;
  transition: TaskTransition;
}

// Response (validation failure)
{
  success: false;
  errors: [
    { field: 'workPlan', message: 'Work plan required for IN_PROGRESS' },
    { field: 'assigneeIds', message: 'Must have at least one assignee' }
  ];
  allowedTransitions: TaskStatus[];  // What transitions ARE valid
}
```

### GET /tasks/:id/transitions
Get transition history (audit log).

```typescript
// Response
{
  transitions: TaskTransition[];
}
```

---

## Messages (Task Thread)

### GET /tasks/:id/messages
Get messages for a task.

```typescript
// Query params
{
  type?: MessageType;
  limit?: number;
  before?: string;  // cursor
}

// Response
{
  messages: Message[];
  hasMore: boolean;
}
```

### POST /tasks/:id/messages
Post a message to task thread.

```typescript
// Request
{
  type: MessageType;  // COMMENT | WORK_PLAN | PROGRESS | ARTIFACT | REVIEW
  content: string;
  artifacts?: Artifact[];
  mentions?: string[];  // Agent IDs to notify
  replyToId?: string;
}
// Header: X-Idempotency-Key recommended

// Response
{
  message: Message;
  notifications: { agentId: string; queued: boolean }[];
}
```

---

## Approvals

### GET /approvals
List approvals (filterable).

```typescript
// Query params
{
  status?: ApprovalStatus;
  requestorId?: string;
  taskId?: string;
  actionType?: string;
  limit?: number;
}

// Response
{
  approvals: Approval[];
  total: number;
}
```

### GET /approvals/pending
Get pending approvals requiring human action.

```typescript
// Response
{
  approvals: Approval[];
  urgentCount: number;  // Expiring within 1 hour
}
```

### POST /approvals
Create an approval request.

```typescript
// Request
{
  taskId?: string;
  toolCallId?: string;
  actionType: 'TOOL_EXEC' | 'BUDGET_OVERRIDE' | 'STATE_TRANSITION' | 'SPAWN';
  actionSummary: string;
  riskLevel: 'YELLOW' | 'RED';
  actionPayload?: Record<string, any>;
  estimatedCost?: number;
  rollbackPlan?: string;
  justification: string;
  expiresIn?: string;  // default "24h"
}

// Response
{
  approval: Approval;
  task?: Task;  // Updated to NEEDS_APPROVAL if provided
}
```

### POST /approvals/:id/decide
Approve or deny a request.

```typescript
// Request
{
  decision: 'APPROVED' | 'DENIED';
  reason?: string;
}

// Response
{
  approval: Approval;
  task?: Task;  // If task was updated
}
```

---

## Policy Evaluation

### POST /policy/evaluate
Evaluate an action against policy.

```typescript
// Request
{
  agentId: string;
  action: {
    type: 'TOOL_CALL' | 'FILE_WRITE' | 'NETWORK' | 'SPAWN' | 'TRANSITION';
    tool?: string;
    path?: string;
    domain?: string;
    targetStatus?: string;
    estimatedCost?: number;
  };
  context?: {
    taskId?: string;
    sessionKey?: string;
    currentSpend?: number;
  };
}

// Response
{
  decision: 'ALLOW' | 'DENY' | 'NEEDS_APPROVAL';
  riskLevel: 'GREEN' | 'YELLOW' | 'RED';
  reason: string;
  
  // If NEEDS_APPROVAL:
  approvalRequired?: {
    type: string;
    suggestedJustification: string;
  };
  
  // If DENY:
  violations?: string[];
  
  // Budget info if relevant:
  budget?: {
    daily: number;
    spentToday: number;
    remaining: number;
    perRunCap: number;
  };
}
```

### GET /policy/active
Get active policy for scope.

```typescript
// Query params
{
  scope?: 'GLOBAL' | 'AGENT' | 'TASK_TYPE';
  scopeId?: string;
}

// Response
{
  policy: Policy;
}
```

---

## Agents

### GET /agents
List all agents.

```typescript
// Query params
{
  status?: AgentStatus;
  role?: AgentRole;
}

// Response
{
  agents: Agent[];
}
```

### GET /agents/:id
Get agent detail with stats.

```typescript
// Response
{
  agent: Agent;
  stats: {
    tasksCompleted: number;
    tasksInProgress: number;
    spendToday: number;
    spendThisWeek: number;
    avgTaskDuration: number;
    errorRate: number;
  };
  recentRuns: Run[];
  currentTask?: Task;
}
```

### POST /agents
Register a new agent.

```typescript
// Request
{
  id: string;
  name: string;
  emoji?: string;
  role: AgentRole;
  workspacePath: string;
  allowedTaskTypes?: TaskType[];
  budgetDaily?: number;
  budgetPerRun?: number;
  canSpawn?: boolean;
  parentAgentId?: string;
}

// Response
{
  agent: Agent;
}
```

### PATCH /agents/:id
Update agent config.

```typescript
// Request
{
  name?: string;
  allowedTaskTypes?: TaskType[];
  budgetDaily?: number;
  budgetPerRun?: number;
  metadata?: Record<string, any>;
}

// Response
{
  agent: Agent;
}
```

### POST /agents/:id/control
Agent control actions.

```typescript
// Request
{
  action: 'PAUSE' | 'RESUME' | 'DRAIN' | 'QUARANTINE' | 'RESTART';
  reason?: string;
  duration?: string;  // For temporary actions
}

// Response
{
  agent: Agent;
  affectedTasks?: Task[];  // Tasks that were blocked/reassigned
}
```

### POST /agents/:id/heartbeat
Record agent heartbeat.

```typescript
// Request
{
  sessionKey: string;
  status: 'HEALTHY' | 'BUSY' | 'IDLE';
  currentTaskId?: string;
  metadata?: Record<string, any>;
}

// Response
{
  acknowledged: true;
  pendingNotifications: Notification[];
  pendingApprovals: Approval[];  // Approvals this agent can decide
  assignedTasks: Task[];         // Tasks waiting for this agent
}
```

---

## Events / Timeline

### POST /events/run
Record a run (agent execution turn).

```typescript
// Request
{
  agentId: string;
  taskId?: string;
  sessionKey: string;
  model: string;
  startedAt: string;
  endedAt?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  error?: string;
  metadata?: Record<string, any>;
}
// Header: X-Idempotency-Key recommended

// Response
{
  run: Run;
  budgetWarning?: {
    type: 'APPROACHING_LIMIT' | 'EXCEEDED';
    remaining: number;
    message: string;
  };
}
```

### PATCH /events/run/:id
Update run (e.g., when it completes).

```typescript
// Request
{
  endedAt?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  status?: RunStatus;
  error?: string;
}

// Response
{
  run: Run;
}
```

### POST /events/tool-call
Record a tool call.

```typescript
// Request
{
  runId: string;
  agentId: string;
  taskId?: string;
  toolName: string;
  riskLevel: 'GREEN' | 'YELLOW' | 'RED';
  inputPreview?: string;   // Sanitized, max 500 chars
  inputHash?: string;
  startedAt: string;
  status: 'PENDING' | 'RUNNING';
  policyResult?: {
    decision: string;
    reason: string;
    approvalId?: string;
  };
}

// Response
{
  toolCall: ToolCall;
}
```

### PATCH /events/tool-call/:id
Update tool call (completion/failure).

```typescript
// Request
{
  endedAt?: string;
  status?: ToolCallStatus;
  outputPreview?: string;
  outputHash?: string;
  error?: string;
  retryCount?: number;
}

// Response
{
  toolCall: ToolCall;
}
```

### GET /events/timeline
Get activity timeline.

```typescript
// Query params
{
  taskId?: string;
  agentId?: string;
  action?: string;
  limit?: number;
  before?: string;
}

// Response
{
  activities: Activity[];
  hasMore: boolean;
}
```

---

## Notifications

### GET /notifications
Get notifications for target.

```typescript
// Query params
{
  targetAgentId?: string;
  status?: NotificationStatus;
  type?: NotificationType;
  limit?: number;
}

// Response
{
  notifications: Notification[];
}
```

### POST /notifications/:id/ack
Acknowledge notification delivery.

```typescript
// Request
{
  externalId?: string;  // Telegram message_id, etc.
}

// Response
{
  notification: Notification;
}
```

---

## Alerts

### GET /alerts
Get alerts.

```typescript
// Query params
{
  status?: AlertStatus;
  severity?: AlertSeverity;
  agentId?: string;
  limit?: number;
}

// Response
{
  alerts: Alert[];
  openCount: number;
  criticalCount: number;
}
```

### POST /alerts/:id/acknowledge
Acknowledge alert.

```typescript
// Request
{
  note?: string;
}

// Response
{
  alert: Alert;
}
```

### POST /alerts/:id/resolve
Resolve alert.

```typescript
// Request
{
  resolutionNote: string;
}

// Response
{
  alert: Alert;
}
```

---

## Stats / Dashboard

### GET /stats/overview
Get dashboard overview stats.

```typescript
// Response
{
  tasks: {
    byStatus: Record<TaskStatus, number>;
    byType: Record<TaskType, number>;
    completedToday: number;
    completedThisWeek: number;
  };
  agents: {
    active: number;
    paused: number;
    quarantined: number;
  };
  approvals: {
    pending: number;
    urgentCount: number;
  };
  alerts: {
    open: number;
    critical: number;
  };
  costs: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}
```

### GET /stats/agents/:id/costs
Get cost breakdown for agent.

```typescript
// Query params
{
  period: 'day' | 'week' | 'month';
}

// Response
{
  total: number;
  byModel: Record<string, number>;
  byTaskType: Record<string, number>;
  runs: number;
  avgCostPerRun: number;
}
```

---

## Error Responses

All errors follow this format:

```typescript
{
  error: {
    code: string;      // 'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED', etc.
    message: string;
    details?: any;
    requestId: string;
  }
}
```

**Status Codes:**
- 200: Success
- 201: Created
- 400: Bad Request (validation)
- 401: Unauthorized
- 403: Forbidden (policy violation)
- 404: Not Found
- 409: Conflict (idempotency/state)
- 429: Rate Limited
- 500: Server Error

---

## Rate Limits

| Endpoint Pattern | Limit |
|------------------|-------|
| POST /tasks | 100/min per agent |
| POST /events/* | 1000/min per agent |
| POST /policy/evaluate | 500/min per agent |
| GET /* | 300/min per client |

---

## Webhooks (Outbound)

Configure webhooks to receive events:

### POST /webhooks
Register a webhook.

```typescript
// Request
{
  url: string;
  events: string[];  // ['task.created', 'task.transitioned', 'approval.requested', ...]
  secret: string;    // For signature verification
}

// Response
{
  webhook: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
  };
}
```

### Webhook Payload
```typescript
{
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, any>;
  signature: string;  // HMAC-SHA256 of payload with secret
}
```
