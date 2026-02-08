# Mission Control -- Backend Structure

**Last Updated:** February 8, 2026  
**Backend:** Convex serverless functions  
**Schema Source of Truth:** `convex/schema.ts`

---

## Architecture

The backend is entirely Convex. There is no Express server, no REST API, and no standalone worker processes.

- **Queries:** Read-only functions, subscribed to reactively by the frontend
- **Mutations:** Write functions, called by the frontend or other Convex functions
- **Actions:** Functions that can call external APIs (HTTP, third-party services)
- **Internal functions:** Server-only functions not exposed to the client
- **Cron jobs:** Scheduled background tasks (convex/crons.ts)

---

## Database Tables (18 total)

### Core Data

| Table | Purpose | Key Fields |
|---|---|---|
| `projects` | Multi-project workspaces | name, slug, policyDefaults |
| `agents` | Agent registry | name, role, status, budgetDaily, budgetPerRun, spendToday, currentTaskId |
| `tasks` | Task management | title, type, status, priority, assigneeIds, actualCost, workPlan, deliverable |
| `taskTransitions` | Immutable audit log of status changes | taskId, fromStatus, toStatus, actorType, reason, idempotencyKey |
| `messages` | Task thread messages | taskId, authorType, type (COMMENT/WORK_PLAN/PROGRESS/ARTIFACT/REVIEW/SYSTEM), content |

### Execution & Cost

| Table | Purpose | Key Fields |
|---|---|---|
| `runs` | Agent execution turns | agentId, taskId, model, inputTokens, outputTokens, costUsd, status |
| `toolCalls` | Tool call tracking | runId, toolName, riskLevel, status, inputPreview, outputPreview |

### Safety & Approvals

| Table | Purpose | Key Fields |
|---|---|---|
| `approvals` | Approval requests | taskId, requestorAgentId, riskLevel (YELLOW/RED), status, justification |
| `policies` | Policy configuration | scopeType, rules, toolRiskMap, budgetDefaults, loopThresholds |
| `alerts` | System alerts | severity (INFO/WARNING/ERROR/CRITICAL), type, status |

### Collaboration

| Table | Purpose | Key Fields |
|---|---|---|
| `notifications` | Agent notifications | agentId, type (MENTION/TASK_ASSIGNED/APPROVAL_REQUESTED/etc), readAt |
| `threadSubscriptions` | Task thread subscriptions | agentId, taskId |
| `reviews` | Peer reviews | taskId, type (PRAISE/REFUTE/CHANGESET/APPROVE), status, score |

### Agent Memory

| Table | Purpose | Key Fields |
|---|---|---|
| `agentDocuments` | Agent session docs | agentId, type (WORKING_MD/DAILY_NOTE/SESSION_MEMORY), content |

### System

| Table | Purpose | Key Fields |
|---|---|---|
| `activities` | Audit log | actorType, action, description, taskId, agentId |
| `executionRequests` | Multi-executor routing | taskId, executor (CURSOR/CLAUDE_CODE/OPENCLAW_AGENT), status, payload |
| `webhooks` | Webhook subscriptions | url, events, active |
| `webhookDeliveries` | Webhook delivery tracking | webhookId, status, attempts |

### Indexes

All tables use indexes for efficient querying. Common patterns:
- `by_project` -- filter by projectId
- `by_status` -- filter by status
- `by_task` -- filter by taskId
- `by_agent` -- filter by agentId
- `by_idempotency` -- prevent duplicate creates
- Composite indexes: `by_project_status`, `by_agent_type`, etc.

---

## API Surface by Domain

### Tasks (convex/tasks.ts)

| Function | Type | Purpose |
|---|---|---|
| `get` | query | Get task by ID |
| `listByStatus` | query | List tasks filtered by status and project |
| `listAll` | query | List all tasks, optionally by project |
| `listByAgent` | query | List tasks assigned to agent |
| `search` | query | Search tasks by title/description/labels |
| `getWithTimeline` | query | Task with full timeline (transitions, messages, runs, approvals) |
| `getAllowedTransitionsForHuman` | query | Valid status transitions for human actors |
| `exportIncidentReport` | query | Export task as markdown report |
| `create` | mutation | Create task with idempotency |
| `transition` | mutation | Transition task status (state machine validated) |
| `assign` | mutation | Assign agents to task |
| `updateThreadRef` | mutation | Update Telegram thread reference |

### Agents (convex/agents.ts)

| Function | Type | Purpose |
|---|---|---|
| `get` | query | Get agent by ID |
| `getByName` | query | Get agent by name |
| `listAll` | query | List all agents, optionally by project |
| `listByStatus` | query | List agents by status |
| `listActive` | query | List active agents |
| `register` | mutation | Register or update agent |
| `heartbeat` | mutation | Update heartbeat, return pending work |
| `updateStatus` | mutation | Update agent status |
| `pauseAll` | mutation | Emergency: pause all active agents |
| `resumeAll` | mutation | Resume all paused agents |
| `recordSpend` | mutation | Record agent spending |

### Runs (convex/runs.ts)

| Function | Type | Purpose |
|---|---|---|
| `get` | query | Get run by ID |
| `listByAgent` | query | Runs for an agent |
| `listByTask` | query | Runs for a task |
| `listRecent` | query | Recent runs |
| `getStats` | query | Run statistics |
| `start` | mutation | Start run with budget checks |
| `complete` | mutation | Complete run, update costs |

### Approvals (convex/approvals.ts)

| Function | Type | Purpose |
|---|---|---|
| `get` | query | Get approval by ID |
| `listPending` | query | Pending approvals |
| `listByTask` | query | Approvals for a task |
| `request` | mutation | Request approval |
| `approve` | mutation | Approve request |
| `deny` | mutation | Deny request |
| `cancel` | mutation | Cancel request |
| `expireStale` | mutation | Expire old pending approvals (cron) |

### Messages (convex/messages.ts)

| Function | Type | Purpose |
|---|---|---|
| `listByTask` | query | Messages for a task thread |
| `listRecent` | query | Recent messages (Live Feed) |
| `post` | mutation | Post message with idempotency |
| `postWorkPlan` | mutation | Post work plan message |
| `postProgress` | mutation | Post progress update |
| `postReview` | mutation | Post review message |

### Search (convex/search.ts)

| Function | Type | Purpose |
|---|---|---|
| `searchAll` | query | Full-text search across tasks, messages, agents, activities |
| `searchTasks` | query | Search tasks with filters and relevance |
| `quickSearch` | query | Quick search (tasks + agents only) |
| `getSearchSuggestions` | query | Search suggestions |
| `getAvailableFilters` | query | Available filter values |

### Health & Monitoring (convex/health.ts, convex/monitoring.ts)

| Function | Type | Purpose |
|---|---|---|
| `health.check` | query | Basic health check |
| `health.ready` | query | Readiness check |
| `health.metrics` | query | System metrics |
| `health.status` | query | Detailed system status |
| `monitoring.listRecentErrors` | query | Recent errors |
| `monitoring.getPerformanceStats` | query | Performance statistics |
| `monitoring.getAuditLog` | query | Audit log with filters |
| `monitoring.logError` | mutation | Log an error |

### Agent Learning (convex/agentLearning.ts)

| Function | Type | Purpose |
|---|---|---|
| `getAgentPerformance` | query | Agent performance metrics |
| `getAgentStrengths` | query | Agent strengths by task type |
| `getAgentWeaknesses` | query | Agent weaknesses by task type |
| `getBestAgentForTask` | query | Best agent recommendation |
| `getProjectLearningInsights` | query | Project learning insights |
| `recordTaskCompletion` | mutation | Record completion for learning (stub) |
| `discoverPattern` | mutation | Discover agent patterns (stub) |

### Other

| Domain | Key Functions |
|---|---|
| `activities` | listRecent, listByTask, listByAgent, listByAction (all queries) |
| `notifications` | listByAgent, create, markRead, markAllReadForAgent |
| `reviews` | listByTask, create, respond, supersede, remove |
| `agentDocuments` | get, listByAgent, getWorkingMd, getDailyNote, set |
| `executionRequests` | get, listPending, enqueue, updateStatus, cancel |
| `webhooks` | list, create, update, remove, deliverPending (action) |
| `standup` | generate (query), save, runDaily (mutations) |
| `loops` | detectLoops (internal mutation, called by cron) |

---

## Cron Jobs (convex/crons.ts)

| Job | Schedule | Function | Purpose |
|---|---|---|---|
| Expire stale approvals | Every 15 min | `api.approvals.expireStale` | Clean up expired approval requests |
| Detect loops | Every 15 min | `internal.loops.detectLoops` | Block tasks with comment storms, ping-pong, repeated failures |
| Daily standup | 9:00 UTC daily | `api.standup.runDaily` | Generate and save daily standup report |
| Daily CEO brief | 9:00 UTC daily | `internal.telegram.prepareDailyCEOBrief` | Send daily brief via Telegram |

---

## Key Patterns

### Idempotency

Creates use `idempotencyKey` to prevent duplicates. The key is checked against an index before inserting. Tables with idempotency: tasks, taskTransitions, messages, approvals, runs.

### Budget Enforcement

Budget checks happen inline in `convex/runs.ts` when a run starts:
1. Check agent daily budget (spendToday vs budgetDaily)
2. Check per-run budget (estimatedCost vs budgetPerRun)
3. Check task budget (task.actualCost vs task.budgetAllocated)
4. On exceed: agent paused OR task moved to NEEDS_APPROVAL

### State Machine

Task transitions are validated by the state machine logic (replicated in `convex/tasks.ts`). The validator checks:
1. Is the transition valid from current state to target state?
2. Does the actor type have permission for this transition?
3. Are required artifacts present (workPlan for IN_PROGRESS, deliverable for REVIEW)?
4. Is there an idempotency key?

### Activity Logging

Most mutations log an activity entry to the `activities` table for audit trail. Activities include: task transitions, agent status changes, approval decisions, error events.
