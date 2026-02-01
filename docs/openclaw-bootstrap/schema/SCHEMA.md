# 2. Database Schema

## Overview

This schema supports both Convex (MVP) and Postgres (scale). The interface abstraction allows swapping.

**Key Principles:**
- DB is canonical system of record
- Every mutation creates an audit trail
- Idempotency keys prevent duplicate operations
- Redaction fields track what was sanitized
- References maintain integrity (taskId, agentId, sessionKey)

---

## Tables

### 1. agents

Agent registry with controls and state.

```sql
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,           -- e.g., "jordan", "casey"
  name            TEXT NOT NULL,
  emoji           TEXT,
  role            TEXT NOT NULL,              -- INTERN | SPECIALIST | LEAD
  status          TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | PAUSED | DRAINED | QUARANTINED | OFFLINE
  
  -- Identity
  workspace_path  TEXT NOT NULL,              -- /Users/jay/.openclaw/agents/jordan
  soul_version_hash TEXT,                     -- SHA256 of SOUL.md for tracking changes
  
  -- Config
  allowed_task_types TEXT[],                  -- ['CONTENT', 'SOCIAL', ...]
  allowed_tools   JSONB DEFAULT '[]',         -- Tool allowlist overrides
  
  -- Budgets
  budget_daily    DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  budget_per_run  DECIMAL(10,2) NOT NULL DEFAULT 0.75,
  spend_today     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  spend_reset_at  TIMESTAMPTZ,                -- When daily spend resets
  
  -- Spawn config
  can_spawn       BOOLEAN NOT NULL DEFAULT FALSE,
  max_sub_agents  INTEGER NOT NULL DEFAULT 3,
  parent_agent_id TEXT REFERENCES agents(id),
  
  -- State
  current_task_id TEXT REFERENCES tasks(id),
  last_heartbeat_at TIMESTAMPTZ,
  last_error      TEXT,
  error_streak    INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_role ON agents(role);
CREATE INDEX idx_agents_parent ON agents(parent_agent_id);
```

**Convex equivalent:**
```typescript
// convex/schema.ts
agents: defineTable({
  name: v.string(),
  emoji: v.optional(v.string()),
  role: v.union(v.literal("INTERN"), v.literal("SPECIALIST"), v.literal("LEAD")),
  status: v.union(
    v.literal("ACTIVE"), v.literal("PAUSED"), 
    v.literal("DRAINED"), v.literal("QUARANTINED"), v.literal("OFFLINE")
  ),
  workspacePath: v.string(),
  soulVersionHash: v.optional(v.string()),
  allowedTaskTypes: v.array(v.string()),
  allowedTools: v.array(v.any()),
  budgetDaily: v.number(),
  budgetPerRun: v.number(),
  spendToday: v.number(),
  spendResetAt: v.optional(v.number()),
  canSpawn: v.boolean(),
  maxSubAgents: v.number(),
  parentAgentId: v.optional(v.id("agents")),
  currentTaskId: v.optional(v.id("tasks")),
  lastHeartbeatAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  errorStreak: v.number(),
  metadata: v.any(),
})
  .index("by_status", ["status"])
  .index("by_role", ["role"])
  .index("by_parent", ["parentAgentId"]),
```

---

### 2. tasks

Core task entity with state machine.

```sql
CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,                -- Prevents duplicate creation
  
  -- Core fields
  title           TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL,              -- CONTENT | SOCIAL | EMAIL_MARKETING | ...
  status          TEXT NOT NULL DEFAULT 'INBOX',  -- See state machine
  priority        INTEGER NOT NULL DEFAULT 2, -- 1=critical, 2=high, 3=normal, 4=low
  
  -- Assignment
  creator_agent_id TEXT REFERENCES agents(id),
  assignee_ids    TEXT[] DEFAULT '{}',        -- Can be multiple
  reviewer_id     TEXT REFERENCES agents(id),
  
  -- Hierarchy
  parent_task_id  TEXT REFERENCES tasks(id),
  
  -- Work plan (required for IN_PROGRESS)
  work_plan       JSONB,                      -- { bullets: [...], estimatedCost: ... }
  
  -- Deliverable (required for REVIEW)
  deliverable     JSONB,                      -- { content: ..., artifacts: [...] }
  
  -- Review
  review_checklist JSONB,                     -- Completed checklist
  review_cycles   INTEGER NOT NULL DEFAULT 0,
  
  -- Cost tracking
  estimated_cost  DECIMAL(10,2),
  actual_cost     DECIMAL(10,2) DEFAULT 0.00,
  
  -- Timestamps
  due_at          TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,                -- When moved to REVIEW
  completed_at    TIMESTAMPTZ,
  
  -- Metadata
  labels          TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  redacted_fields TEXT[] DEFAULT '{}',        -- Fields that were sanitized
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_assignees ON tasks USING GIN(assignee_ids);
CREATE INDEX idx_tasks_priority_status ON tasks(priority, status);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_idempotency ON tasks(idempotency_key);
```

---

### 3. task_transitions

Audit log of all state transitions (immutable).

```sql
CREATE TABLE task_transitions (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,                -- Prevents duplicate transitions
  
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  
  -- Transition
  from_status     TEXT NOT NULL,
  to_status       TEXT NOT NULL,
  
  -- Actor
  actor_agent_id  TEXT REFERENCES agents(id),
  actor_user_id   TEXT,                       -- Human override
  
  -- Validation
  validation_result JSONB,                    -- { valid: bool, errors: [...] }
  artifacts_snapshot JSONB,                   -- Snapshot of required artifacts at time
  
  -- Context
  reason          TEXT,
  session_key     TEXT,                       -- OpenClaw session reference
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transitions_task ON task_transitions(task_id);
CREATE INDEX idx_transitions_actor ON task_transitions(actor_agent_id);
CREATE INDEX idx_transitions_created ON task_transitions(created_at DESC);
```

---

### 4. messages

Thread messages (comments, updates, artifacts).

```sql
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  author_agent_id TEXT REFERENCES agents(id),
  author_user_id  TEXT,                       -- Human comment
  
  -- Content
  type            TEXT NOT NULL,              -- COMMENT | WORK_PLAN | PROGRESS | ARTIFACT | REVIEW | APPROVAL_REQUEST
  content         TEXT NOT NULL,
  content_redacted TEXT,                      -- Sanitized version
  
  -- Attachments
  artifacts       JSONB DEFAULT '[]',         -- [{ name, url, type, sizeBytes }]
  
  -- Mentions
  mentions        TEXT[] DEFAULT '{}',        -- Agent IDs mentioned
  
  -- Threading
  reply_to_id     TEXT REFERENCES messages(id),
  
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  redacted_fields TEXT[] DEFAULT '{}',
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at       TIMESTAMPTZ
);

CREATE INDEX idx_messages_task ON messages(task_id);
CREATE INDEX idx_messages_author ON messages(author_agent_id);
CREATE INDEX idx_messages_type ON messages(type);
CREATE INDEX idx_messages_mentions ON messages USING GIN(mentions);
CREATE INDEX idx_messages_created ON messages(task_id, created_at DESC);
```

---

### 5. documents

Standalone documents (artifacts, outputs).

```sql
CREATE TABLE documents (
  id              TEXT PRIMARY KEY,
  
  -- Ownership
  task_id         TEXT REFERENCES tasks(id),
  agent_id        TEXT REFERENCES agents(id),
  
  -- Content
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,              -- DELIVERABLE | EVIDENCE | CHECKLIST | REPORT
  mime_type       TEXT,
  
  -- Storage
  content         TEXT,                       -- Inline content (small)
  storage_url     TEXT,                       -- External storage (large)
  size_bytes      INTEGER,
  checksum        TEXT,                       -- SHA256 for integrity
  
  -- Redaction
  is_redacted     BOOLEAN NOT NULL DEFAULT FALSE,
  redaction_note  TEXT,
  
  -- Version tracking
  version         INTEGER NOT NULL DEFAULT 1,
  previous_version_id TEXT REFERENCES documents(id),
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_task ON documents(task_id);
CREATE INDEX idx_documents_agent ON documents(agent_id);
CREATE INDEX idx_documents_type ON documents(type);
```

---

### 6. runs

Execution runs (agent turns, tool usage).

```sql
CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  
  -- Context
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  task_id         TEXT REFERENCES tasks(id),
  session_key     TEXT NOT NULL,              -- OpenClaw session
  
  -- Timing
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  duration_ms     INTEGER,
  
  -- Model usage
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  
  -- Cost
  cost_usd        DECIMAL(10,6) NOT NULL DEFAULT 0,
  
  -- Status
  status          TEXT NOT NULL,              -- RUNNING | COMPLETED | FAILED | TIMEOUT
  error           TEXT,
  
  -- Context size
  context_messages INTEGER,
  
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_runs_agent ON runs(agent_id);
CREATE INDEX idx_runs_task ON runs(task_id);
CREATE INDEX idx_runs_session ON runs(session_key);
CREATE INDEX idx_runs_created ON runs(created_at DESC);
CREATE INDEX idx_runs_agent_date ON runs(agent_id, DATE(created_at));
```

---

### 7. tool_calls

Individual tool invocations within runs.

```sql
CREATE TABLE tool_calls (
  id              TEXT PRIMARY KEY,
  
  run_id          TEXT NOT NULL REFERENCES runs(id),
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  task_id         TEXT REFERENCES tasks(id),
  
  -- Tool info
  tool_name       TEXT NOT NULL,
  tool_version    TEXT,
  
  -- Risk assessment
  risk_level      TEXT NOT NULL,              -- GREEN | YELLOW | RED
  policy_result   JSONB,                      -- { allowed, reason, approval_id }
  
  -- Input/Output (redacted by default)
  input_preview   TEXT,                       -- First 500 chars, sanitized
  output_preview  TEXT,                       -- First 500 chars, sanitized
  input_hash      TEXT,                       -- SHA256 of full input
  output_hash     TEXT,                       -- SHA256 of full output
  
  -- Execution
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  duration_ms     INTEGER,
  
  -- Status
  status          TEXT NOT NULL,              -- PENDING | RUNNING | SUCCESS | FAILED | DENIED
  error           TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_calls_run ON tool_calls(run_id);
CREATE INDEX idx_tool_calls_agent ON tool_calls(agent_id);
CREATE INDEX idx_tool_calls_tool ON tool_calls(tool_name);
CREATE INDEX idx_tool_calls_risk ON tool_calls(risk_level);
CREATE INDEX idx_tool_calls_status ON tool_calls(status);
```

---

### 8. approvals

Approval requests and decisions.

```sql
CREATE TABLE approvals (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  
  -- Request
  task_id         TEXT REFERENCES tasks(id),
  tool_call_id    TEXT REFERENCES tool_calls(id),
  requestor_agent_id TEXT NOT NULL REFERENCES agents(id),
  
  -- What needs approval
  action_type     TEXT NOT NULL,              -- TOOL_EXEC | BUDGET_OVERRIDE | STATE_TRANSITION | SPAWN
  action_summary  TEXT NOT NULL,
  risk_level      TEXT NOT NULL,              -- YELLOW | RED
  
  -- Details
  action_payload  JSONB,                      -- Full action details
  estimated_cost  DECIMAL(10,2),
  rollback_plan   TEXT,
  justification   TEXT NOT NULL,
  
  -- Status
  status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | DENIED | EXPIRED | CANCELED
  
  -- Decision
  decided_by_agent_id TEXT REFERENCES agents(id),
  decided_by_user_id TEXT,                    -- Human approval
  decided_at      TIMESTAMPTZ,
  decision_reason TEXT,
  
  -- Expiration
  expires_at      TIMESTAMPTZ NOT NULL,       -- Auto-expire stale requests
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_task ON approvals(task_id);
CREATE INDEX idx_approvals_requestor ON approvals(requestor_agent_id);
CREATE INDEX idx_approvals_expires ON approvals(expires_at) WHERE status = 'PENDING';
```

---

### 9. policies

Policy configurations (versioned).

```sql
CREATE TABLE policies (
  id              TEXT PRIMARY KEY,
  version         INTEGER NOT NULL,
  
  -- Scope
  name            TEXT NOT NULL,              -- 'default', 'team-a', 'project-x'
  scope_type      TEXT NOT NULL,              -- GLOBAL | AGENT | TASK_TYPE
  scope_id        TEXT,                       -- agent_id or task_type if scoped
  
  -- Rules
  rules           JSONB NOT NULL,             -- Full policy rules
  
  -- Risk mappings
  tool_risk_map   JSONB,                      -- { tool_name: risk_level }
  
  -- Allowlists
  shell_allowlist JSONB,
  shell_blocklist JSONB,
  file_read_paths JSONB,
  file_write_paths JSONB,
  network_allowlist JSONB,
  
  -- Budgets
  budget_defaults JSONB,                      -- { daily, per_run, per_task }
  
  -- Spawn limits
  spawn_limits    JSONB,                      -- { max_active, max_per_parent, max_depth, ttl_hours }
  
  -- Loop detection
  loop_thresholds JSONB,                      -- { comments_30m, review_cycles, ... }
  
  -- Metadata
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      TEXT,
  notes           TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_policies_active ON policies(name, scope_type, scope_id) WHERE active = TRUE;
CREATE INDEX idx_policies_scope ON policies(scope_type, scope_id);
```

---

### 10. notifications

Notification queue and delivery tracking.

```sql
CREATE TABLE notifications (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  
  -- Target
  target_agent_id TEXT REFERENCES agents(id),
  target_user_id  TEXT,
  channel         TEXT NOT NULL,              -- TELEGRAM | SLACK | EMAIL | WEBHOOK
  
  -- Content
  type            TEXT NOT NULL,              -- MENTION | ASSIGNMENT | APPROVAL_REQUEST | ALERT | DIGEST
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  
  -- Reference
  task_id         TEXT REFERENCES tasks(id),
  message_id      TEXT REFERENCES messages(id),
  approval_id     TEXT REFERENCES approvals(id),
  
  -- Delivery
  status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SENT | DELIVERED | FAILED | EXPIRED
  
  -- Retries
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ,
  last_error      TEXT,
  
  -- Delivery confirmation
  delivered_at    TIMESTAMPTZ,
  external_id     TEXT,                       -- Telegram message_id, etc.
  
  -- Scheduling
  send_after      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_target ON notifications(target_agent_id);
CREATE INDEX idx_notifications_pending ON notifications(next_attempt_at) WHERE status = 'PENDING';
CREATE INDEX idx_notifications_channel ON notifications(channel, status);
```

---

### 11. alerts

System alerts for operators.

```sql
CREATE TABLE alerts (
  id              TEXT PRIMARY KEY,
  
  -- Alert info
  severity        TEXT NOT NULL,              -- INFO | WARNING | ERROR | CRITICAL
  type            TEXT NOT NULL,              -- BUDGET_EXCEEDED | LOOP_DETECTED | AGENT_ERROR | ...
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  
  -- Context
  agent_id        TEXT REFERENCES agents(id),
  task_id         TEXT REFERENCES tasks(id),
  run_id          TEXT REFERENCES runs(id),
  
  -- Status
  status          TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | ACKNOWLEDGED | RESOLVED | IGNORED
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_agent ON alerts(agent_id);
CREATE INDEX idx_alerts_open ON alerts(created_at DESC) WHERE status = 'OPEN';
```

---

### 12. activities

General activity feed (denormalized for fast reads).

```sql
CREATE TABLE activities (
  id              TEXT PRIMARY KEY,
  
  -- Actor
  actor_type      TEXT NOT NULL,              -- AGENT | USER | SYSTEM
  actor_id        TEXT,
  
  -- Action
  action          TEXT NOT NULL,              -- TASK_CREATED | STATUS_CHANGED | COMMENT_ADDED | ...
  description     TEXT NOT NULL,
  
  -- Target
  target_type     TEXT,                       -- TASK | AGENT | APPROVAL | ...
  target_id       TEXT,
  
  -- Context
  task_id         TEXT REFERENCES tasks(id),
  agent_id        TEXT REFERENCES agents(id),
  
  -- Data
  before_state    JSONB,
  after_state     JSONB,
  metadata        JSONB DEFAULT '{}',
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_task ON activities(task_id);
CREATE INDEX idx_activities_agent ON activities(agent_id);
CREATE INDEX idx_activities_action ON activities(action);
CREATE INDEX idx_activities_created ON activities(created_at DESC);
```

---

## Storage Interface (TypeScript)

```typescript
// packages/shared/src/storage/interface.ts

export interface StorageInterface {
  // Agents
  getAgent(id: string): Promise<Agent | null>;
  listAgents(filter?: AgentFilter): Promise<Agent[]>;
  upsertAgent(agent: AgentInput): Promise<Agent>;
  updateAgentStatus(id: string, status: AgentStatus, reason?: string): Promise<void>;
  
  // Tasks
  getTask(id: string): Promise<Task | null>;
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  createTask(task: TaskInput, idempotencyKey?: string): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  
  // Transitions
  createTransition(transition: TransitionInput): Promise<TaskTransition>;
  getTaskTransitions(taskId: string): Promise<TaskTransition[]>;
  
  // Messages
  createMessage(message: MessageInput, idempotencyKey?: string): Promise<Message>;
  getTaskMessages(taskId: string): Promise<Message[]>;
  
  // Runs & Tool Calls
  createRun(run: RunInput): Promise<Run>;
  updateRun(id: string, updates: Partial<Run>): Promise<void>;
  createToolCall(call: ToolCallInput): Promise<ToolCall>;
  getRunToolCalls(runId: string): Promise<ToolCall[]>;
  
  // Approvals
  createApproval(approval: ApprovalInput, idempotencyKey?: string): Promise<Approval>;
  updateApprovalStatus(id: string, status: ApprovalStatus, decidedBy: string, reason?: string): Promise<void>;
  getPendingApprovals(): Promise<Approval[]>;
  
  // Policies
  getActivePolicy(scope?: PolicyScope): Promise<Policy>;
  
  // Notifications
  queueNotification(notification: NotificationInput): Promise<Notification>;
  getPendingNotifications(limit?: number): Promise<Notification[]>;
  updateNotificationStatus(id: string, status: NotificationStatus, externalId?: string): Promise<void>;
  
  // Alerts
  createAlert(alert: AlertInput): Promise<Alert>;
  getOpenAlerts(): Promise<Alert[]>;
  acknowledgeAlert(id: string, by: string): Promise<void>;
  
  // Activities
  logActivity(activity: ActivityInput): Promise<Activity>;
  getActivities(filter?: ActivityFilter): Promise<Activity[]>;
  
  // Aggregations
  getAgentSpendToday(agentId: string): Promise<number>;
  getTaskCost(taskId: string): Promise<number>;
  getQueueStats(): Promise<QueueStats>;
}
```

---

## Indexes Summary

| Table | Key Indexes | Purpose |
|-------|-------------|---------|
| agents | status, role, parent | Agent queries, hierarchy |
| tasks | status, type, priority+status, assignees (GIN), idempotency | Task board, filtering |
| task_transitions | task_id, actor, created_at | Audit trail |
| messages | task_id, mentions (GIN), created_at | Thread queries |
| runs | agent_id, task_id, session, date | Cost tracking |
| tool_calls | run_id, risk_level, status | Policy enforcement |
| approvals | status, expires_at | Approval queue |
| notifications | status, next_attempt_at | Delivery loop |
| alerts | status, severity | Alert dashboard |
| activities | task_id, agent_id, created_at | Activity feed |
