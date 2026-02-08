# Mission Control - Epics & User Stories

**Version:** v0.9 MVP  
**Target:** 6-8 weeks  
**Last Updated:** 2026-02-01

---

## Epic Structure

This document organizes implementation into 4 major epics aligned with the phase breakdown:

1. **Epic 1: Foundation** (Weeks 1-2) - Core infrastructure
2. **Epic 2: Safety & Collaboration** (Weeks 3-4) - Approvals, budgets, threads
3. **Epic 3: Observability** (Weeks 5-6) - Timeline, cost tracking, audit
4. **Epic 4: Hardening** (Weeks 7-8) - Testing, docs, production readiness

Each epic contains user stories with:
- **ID:** Unique identifier (E1-US-001)
- **Title:** Short descriptive name
- **Description:** As a [user], I want [feature] so that [benefit]
- **Acceptance Criteria:** Verifiable checklist
- **Dependencies:** Other stories that must complete first
- **Estimate:** Story points (1=trivial, 2=simple, 3=moderate, 5=complex, 8=very complex)

---

## EPIC 1: FOUNDATION (Weeks 1-2)

**Goal:** Core infrastructure + basic task/agent management

**Stories:** 15 stories, 44 story points

---

### E1-US-001: Set up monorepo structure
**Description:** As a developer, I need a monorepo with TypeScript packages so that code is organized and shareable.

**Acceptance Criteria:**
- [ ] Root `package.json` with workspaces (npm/yarn/pnpm)
- [ ] Packages: `api`, `ui`, `policy-engine`, `state-machine`, `workers`, `shared`
- [ ] Each package has `package.json` and `tsconfig.json`
- [ ] Root `tsconfig.json` with path aliases
- [ ] Turbo or Nx for build orchestration
- [ ] `npm run build` builds all packages
- [ ] `npm run dev` starts all dev servers
- [ ] Typecheck passes across all packages

**Dependencies:** None  
**Estimate:** 3

---

### E1-US-002: Define Convex schema for agents
**Description:** As a developer, I need an agents table so that I can store agent metadata and state.

**Acceptance Criteria:**
- [ ] `convex/schema.ts` defines `agents` table with fields: name, sessionKey, autonomyLevel, status, modelConfig, toolPermissions, budgets, currentTaskId, lastHeartbeat, errorStreak, totalSpend, todaySpend, soulHash, metadata
- [ ] Autonomy levels: "intern" | "specialist" | "lead"
- [ ] Status: "active" | "paused" | "drained" | "quarantined" | "stopped"
- [ ] Schema validates successfully (`npx convex dev`)
- [ ] Typecheck passes

**Dependencies:** E1-US-001  
**Estimate:** 2

---

### E1-US-003: Define Convex schema for tasks
**Description:** As a developer, I need a tasks table so that I can store task metadata and state.

**Acceptance Criteria:**
- [ ] `convex/schema.ts` defines `tasks` table with fields: title, description, type, status, priority, assigneeIds, reviewerIds, subscriberIds, threadRef, parentTaskId, dependsOn, budget, spend, workPlan, deliverable, selfReview, evidence, blockedReason, metadata
- [ ] Task types: "content" | "social" | "email_marketing" | "customer_research" | "seo_research" | "engineering" | "docs" | "ops"
- [ ] Task statuses: "inbox" | "assigned" | "in_progress" | "review" | "needs_approval" | "blocked" | "done" | "canceled"
- [ ] Priority: "high" | "medium" | "low"
- [ ] Schema validates successfully
- [ ] Typecheck passes

**Dependencies:** E1-US-001  
**Estimate:** 2

---

### E1-US-004: Define Convex schema for taskTransitions
**Description:** As a developer, I need a taskTransitions table so that I can audit every status change.

**Acceptance Criteria:**
- [ ] `convex/schema.ts` defines `taskTransitions` table with fields: taskId, fromStatus, toStatus, actor, actorId, reason, artifactsProvided, idempotencyKey
- [ ] Actor: "agent" | "human" | "system"
- [ ] Schema validates successfully
- [ ] Typecheck passes

**Dependencies:** E1-US-003  
**Estimate:** 1

---

### E1-US-005: Define Convex schema for messages, activities, runs, toolCalls, approvals, policies, alerts
**Description:** As a developer, I need remaining core tables so that I can store all system data.

**Acceptance Criteria:**
- [ ] `messages` table: taskId, threadRef, authorId, authorType, content, mentions, metadata
- [ ] `activities` table: type, taskId, agentId, actorId, actorType, summary, details
- [ ] `runs` table: taskId, agentId, sessionKey, startTime, endTime, status, cost, toolCallCount, errorMessage, idempotencyKey
- [ ] `toolCalls` table: runId, taskId, agentId, tool, risk, input, output, duration, status, cost, approvalId
- [ ] `approvals` table: taskId, agentId, toolCallId, summary, risk, reason, status, approver, decision, decidedAt
- [ ] `policies` table: version, active, autonomyRules, riskMap, allowlists, budgets, spawnLimits, loopDetection
- [ ] `alerts` table: type, severity, taskId, agentId, message, resolved, resolvedAt, resolvedBy
- [ ] Schema validates successfully
- [ ] Typecheck passes

**Dependencies:** E1-US-002, E1-US-003, E1-US-004  
**Estimate:** 3

---

### E1-US-006: Implement state machine validator
**Description:** As a developer, I need a state machine validator so that invalid task transitions are rejected.

**Acceptance Criteria:**
- [ ] `packages/state-machine/src/validator.ts` exports `validateTransition(from, to, actor, artifacts)`
- [ ] Returns `{ valid: boolean, error?: string }`
- [ ] Enforces all transition rules from spec (see IMPLEMENTATION_PLAN.md)
- [ ] Checks required artifacts (workPlan for IN_PROGRESS, deliverable for REVIEW, approval for DONE)
- [ ] Unit tests cover all valid transitions (pass)
- [ ] Unit tests cover all invalid transitions (reject with clear error)
- [ ] Typecheck passes

**Dependencies:** E1-US-003  
**Estimate:** 5

---

### E1-US-007: Create Convex mutations for agent CRUD
**Description:** As a developer, I need Convex mutations for agents so that I can create/update/delete agents.

**Acceptance Criteria:**
- [ ] `convex/agents.ts` exports: `createAgent`, `updateAgent`, `deleteAgent`, `pauseAgent`, `drainAgent`, `quarantineAgent`, `restartAgent`
- [ ] `createAgent` validates required fields, sets defaults
- [ ] `pauseAgent` sets status to "paused"
- [ ] `drainAgent` sets status to "drained" (finish current task, then pause)
- [ ] `quarantineAgent` sets status to "quarantined", blocks current task
- [ ] `restartAgent` sets status to "active", resets errorStreak
- [ ] Typecheck passes

**Dependencies:** E1-US-002  
**Estimate:** 3

---

### E1-US-008: Create Convex queries for agent listing
**Description:** As a developer, I need Convex queries for agents so that I can list and retrieve agents.

**Acceptance Criteria:**
- [ ] `convex/agents.ts` exports: `listAgents`, `getAgent`
- [ ] `listAgents` returns all agents with optional status filter
- [ ] `getAgent` returns single agent by ID
- [ ] Typecheck passes

**Dependencies:** E1-US-002  
**Estimate:** 1

---

### E1-US-009: Create Convex mutations for task CRUD
**Description:** As a developer, I need Convex mutations for tasks so that I can create/update/delete tasks.

**Acceptance Criteria:**
- [ ] `convex/tasks.ts` exports: `createTask`, `updateTask`, `deleteTask`, `transitionTask`
- [ ] `createTask` validates required fields, sets defaults
- [ ] `transitionTask` calls state machine validator, records transition in `taskTransitions`, creates activity log
- [ ] `transitionTask` rejects invalid transitions with error
- [ ] Typecheck passes

**Dependencies:** E1-US-003, E1-US-006  
**Estimate:** 5

---

### E1-US-010: Create Convex queries for task listing
**Description:** As a developer, I need Convex queries for tasks so that I can list and retrieve tasks.

**Acceptance Criteria:**
- [ ] `convex/tasks.ts` exports: `listTasks`, `getTask`, `getTasksByStatus`, `getTasksByAgent`
- [ ] `listTasks` supports filters: status, type, assigneeId, priority
- [ ] `getTask` returns single task by ID with full details
- [ ] Typecheck passes

**Dependencies:** E1-US-003  
**Estimate:** 2

---

### E1-US-011: Create Express API server with agent routes
**Description:** As a developer, I need REST API endpoints for agents so that the UI can manage agents.

**Acceptance Criteria:**
- [ ] `packages/api/src/index.ts` creates Express app
- [ ] `packages/api/src/routes/agents.ts` defines routes: GET /agents, GET /agents/:id, POST /agents, PATCH /agents/:id, POST /agents/:id/pause, POST /agents/:id/drain, POST /agents/:id/quarantine, POST /agents/:id/restart, DELETE /agents/:id
- [ ] Routes call Convex mutations/queries
- [ ] Error handling middleware catches and formats errors
- [ ] CORS enabled
- [ ] Server starts on port 3000
- [ ] Typecheck passes

**Dependencies:** E1-US-007, E1-US-008  
**Estimate:** 3

---

### E1-US-012: Create Express API routes for tasks
**Description:** As a developer, I need REST API endpoints for tasks so that the UI can manage tasks.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/tasks.ts` defines routes: GET /tasks, GET /tasks/:id, POST /tasks, PATCH /tasks/:id, POST /tasks/:id/transition, DELETE /tasks/:id
- [ ] Routes call Convex mutations/queries
- [ ] POST /tasks/:id/transition validates transition with state machine
- [ ] Typecheck passes

**Dependencies:** E1-US-009, E1-US-010, E1-US-011  
**Estimate:** 3

---

### E1-US-013: Create React UI with agent list
**Description:** As a user, I want to see a list of agents so that I can monitor their status.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/AgentList.tsx` displays agents
- [ ] Shows: name, status (colored badge), autonomyLevel, lastHeartbeat (relative time), todaySpend, currentTask (if any)
- [ ] Status colors: active=green, paused=yellow, quarantined=red, stopped=gray
- [ ] Clicking agent opens detail view (placeholder for now)
- [ ] Real-time updates via Convex subscription
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E1-US-008, E1-US-011  
**Estimate:** 3

---

### E1-US-014: Create React UI with Kanban board
**Description:** As a user, I want to see tasks in a Kanban board so that I can visualize workflow.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/Kanban.tsx` displays columns: Inbox, Assigned, In Progress, Review, Needs Approval, Blocked, Done
- [ ] Each column shows task cards with: title, type badge, priority indicator, assignee avatars, spend
- [ ] Cards draggable between columns (triggers transition API call)
- [ ] Invalid transitions show error toast
- [ ] Real-time updates via Convex subscription
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E1-US-010, E1-US-012  
**Estimate:** 5

---

### E1-US-015: Create Docker Compose setup
**Description:** As a developer, I need Docker Compose so that I can run the full stack locally.

**Acceptance Criteria:**
- [ ] `docker/docker-compose.yml` defines services: api, ui, workers (placeholder)
- [ ] `docker/Dockerfile.api` builds API server
- [ ] `docker/Dockerfile.ui` builds UI (Vite dev server)
- [ ] `.env.example` documents required env vars
- [ ] `docker-compose up` starts all services
- [ ] API accessible at http://localhost:3000
- [ ] UI accessible at http://localhost:5173
- [ ] Services can communicate (API calls Convex)
- [ ] `docker-compose down` stops cleanly

**Dependencies:** E1-US-011, E1-US-013, E1-US-014  
**Estimate:** 3

---

## EPIC 2: SAFETY & COLLABORATION (Weeks 3-4)

**Goal:** Approvals, budgets, thread mapping, containment

**Stories:** 18 stories, 47 story points

---

### E2-US-001: Implement policy engine risk classifier
**Description:** As a developer, I need a risk classifier so that tool actions are categorized as green/yellow/red.

**Acceptance Criteria:**
- [ ] `packages/policy-engine/src/evaluator.ts` exports `classifyRisk(tool, params)`
- [ ] Returns "green" | "yellow" | "red"
- [ ] Uses tool risk map from POLICY_V1.md
- [ ] Checks params for secret patterns (API keys, tokens, passwords)
- [ ] Checks params for production indicators (prod, production, master branch)
- [ ] Unit tests cover all tool types
- [ ] Typecheck passes

**Dependencies:** None  
**Estimate:** 3

---

### E2-US-002: Implement policy engine approval checker
**Description:** As a developer, I need an approval checker so that I know when to require human approval.

**Acceptance Criteria:**
- [ ] `packages/policy-engine/src/evaluator.ts` exports `requiresApproval(tool, risk, agent, task, budget)`
- [ ] Returns `{ required: boolean, reason: string }`
- [ ] RED always requires approval
- [ ] YELLOW requires approval if agent is Intern
- [ ] Requires approval if action exceeds budget cap
- [ ] Requires approval if action touches secrets
- [ ] Requires approval if network egress not allowlisted
- [ ] Unit tests cover all scenarios
- [ ] Typecheck passes

**Dependencies:** E2-US-001  
**Estimate:** 3

---

### E2-US-003: Implement policy engine allowlists
**Description:** As a developer, I need allowlists so that shell/network/file actions are validated.

**Acceptance Criteria:**
- [ ] `packages/policy-engine/src/allowlists.ts` exports: `isShellAllowed`, `isNetworkAllowed`, `isFileReadAllowed`, `isFileWriteAllowed`
- [ ] Shell allowlist: ls, pwd, cat, head, tail, grep, find (scoped), git status/diff/log/checkout -b/add/commit, project tests/lint, node/python scripts in scripts/
- [ ] Shell blocklist: rm -rf, sudo, chmod 777, chown, dd, mkfs, curl|bash
- [ ] Network allowlist: git host, docs domains (configurable)
- [ ] Filesystem read: workspace + subdirs
- [ ] Filesystem write: workspace/output/**, workspace/docs/**, workspace/memory/**
- [ ] Filesystem write block: workspace/config/** (except approved)
- [ ] Unit tests cover allowed/blocked cases
- [ ] Typecheck passes

**Dependencies:** None  
**Estimate:** 3

---

### E2-US-004: Create Convex mutations for approvals
**Description:** As a developer, I need Convex mutations for approvals so that I can request/approve/deny actions.

**Acceptance Criteria:**
- [ ] `convex/approvals.ts` exports: `createApproval`, `approveAction`, `denyAction`
- [ ] `createApproval` validates required fields, sets status to "pending"
- [ ] `approveAction` updates status to "approved", records approver + decision + timestamp
- [ ] `denyAction` updates status to "denied", records approver + decision + timestamp
- [ ] Creates activity log for each action
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 2

---

### E2-US-005: Create Convex queries for approvals
**Description:** As a developer, I need Convex queries for approvals so that I can list pending approvals.

**Acceptance Criteria:**
- [ ] `convex/approvals.ts` exports: `listApprovals`, `getApproval`, `getPendingApprovals`
- [ ] `listApprovals` supports filters: status, taskId, agentId
- [ ] `getPendingApprovals` returns only status="pending"
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 1

---

### E2-US-006: Create Express API routes for approvals
**Description:** As a developer, I need REST API endpoints for approvals so that the UI can manage approvals.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/approvals.ts` defines routes: GET /approvals, GET /approvals/:id, POST /approvals/:id/approve, POST /approvals/:id/deny
- [ ] Routes call Convex mutations/queries
- [ ] Approve/deny endpoints require authentication (placeholder: check header)
- [ ] Typecheck passes

**Dependencies:** E2-US-004, E2-US-005  
**Estimate:** 2

---

### E2-US-007: Implement budget tracking in task transitions
**Description:** As a developer, I need budget tracking so that task spend is recorded and enforced.

**Acceptance Criteria:**
- [ ] `convex/tasks.ts` `transitionTask` checks budget before allowing transition
- [ ] If task.spend > task.budget, transition to NEEDS_APPROVAL (unless already there)
- [ ] Creates alert with type "budget_exceeded"
- [ ] Records budget breach in activity log
- [ ] Typecheck passes

**Dependencies:** E1-US-009, E1-US-005  
**Estimate:** 3

---

### E2-US-008: Implement agent daily budget tracking
**Description:** As a developer, I need agent daily budget tracking so that agents are paused when they exceed daily cap.

**Acceptance Criteria:**
- [ ] `convex/agents.ts` exports `recordAgentSpend(agentId, cost)`
- [ ] Increments `todaySpend` and `totalSpend`
- [ ] If `todaySpend > budgets.dailyCap`, pause agent and create alert
- [ ] Resets `todaySpend` to 0 at midnight (cron job or on first activity of day)
- [ ] Typecheck passes

**Dependencies:** E1-US-007, E1-US-005  
**Estimate:** 3

---

### E2-US-009: Create Convex mutations for messages
**Description:** As a developer, I need Convex mutations for messages so that agents/humans can post comments.

**Acceptance Criteria:**
- [ ] `convex/messages.ts` exports: `createMessage`, `updateMessage`, `deleteMessage`
- [ ] `createMessage` validates required fields, extracts @mentions from content
- [ ] Creates activity log for each message
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 2

---

### E2-US-010: Create Convex queries for messages
**Description:** As a developer, I need Convex queries for messages so that I can list comments by task.

**Acceptance Criteria:**
- [ ] `convex/messages.ts` exports: `listMessages`, `getMessage`, `getMessagesByTask`, `getMessagesByThread`
- [ ] `listMessages` supports filters: taskId, threadRef, authorId
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 1

---

### E2-US-011: Create Express API routes for messages
**Description:** As a developer, I need REST API endpoints for messages so that the UI can post/read comments.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/messages.ts` defines routes: GET /messages, POST /messages
- [ ] Routes call Convex mutations/queries
- [ ] POST /messages validates content and taskId
- [ ] Typecheck passes

**Dependencies:** E2-US-009, E2-US-010  
**Estimate:** 2

---

### E2-US-012: Implement notification dispatcher daemon
**Description:** As a developer, I need a notification dispatcher so that @mentions are delivered to agents.

**Acceptance Criteria:**
- [ ] `packages/workers/src/notification-dispatcher.ts` runs continuously
- [ ] Queries messages with undelivered mentions
- [ ] Delivers notifications to agents (placeholder: console.log for now)
- [ ] Marks notifications as delivered with idempotency key
- [ ] Retries with exponential backoff on failure
- [ ] Typecheck passes

**Dependencies:** E2-US-009, E2-US-010  
**Estimate:** 3

---

### E2-US-013: Implement loop detection daemon
**Description:** As a developer, I need a loop detector so that runaway comment loops are caught.

**Acceptance Criteria:**
- [ ] `packages/workers/src/loop-detector.ts` runs every 1 min
- [ ] Queries tasks with >20 comments in last 30 min
- [ ] Queries tasks with >3 review cycles
- [ ] Queries tasks with same pair back-and-forth >8 times in 10 min
- [ ] On detection: transition task to BLOCKED, create alert, create Loop Summary doc
- [ ] Typecheck passes

**Dependencies:** E2-US-009, E2-US-010, E1-US-009  
**Estimate:** 5

---

### E2-US-014: Implement budget enforcer daemon
**Description:** As a developer, I need a budget enforcer so that budget breaches trigger containment.

**Acceptance Criteria:**
- [ ] `packages/workers/src/budget-enforcer.ts` runs on cost events (real-time)
- [ ] Checks task spend vs budget
- [ ] Checks agent todaySpend vs dailyCap
- [ ] On breach: transition task to NEEDS_APPROVAL or BLOCKED, pause agent, create alert
- [ ] Typecheck passes

**Dependencies:** E2-US-007, E2-US-008  
**Estimate:** 3

---

### E2-US-015: Create React UI for approvals inbox
**Description:** As a user, I want to see pending approvals so that I can approve/deny risky actions.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/ApprovalsInbox.tsx` displays pending approvals
- [ ] Shows: task title, agent name, action summary, risk (colored badge), timestamp
- [ ] Clicking approval opens detail modal with: full summary, risk reason, tool call trace (if available), approve/deny buttons
- [ ] Approve/deny buttons call API, show success/error toast
- [ ] Real-time updates via Convex subscription
- [ ] Badge on nav shows count of pending approvals
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E2-US-005, E2-US-006  
**Estimate:** 5

---

### E2-US-016: Add BLOCKED and NEEDS_APPROVAL columns to Kanban
**Description:** As a user, I want to see blocked and needs-approval tasks so that I can take action.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/Kanban.tsx` adds columns: Needs Approval, Blocked
- [ ] Needs Approval column shows tasks with status="needs_approval"
- [ ] Blocked column shows tasks with status="blocked"
- [ ] Cards show blockedReason (if available)
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E1-US-014  
**Estimate:** 2

---

### E2-US-017: Create incident banner with emergency controls
**Description:** As a user, I want an incident banner so that I can quickly pause/quarantine during emergencies.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/IncidentBanner.tsx` displays at top of screen when alerts exist
- [ ] Shows: alert count, severity (colored), most recent alert message
- [ ] Buttons: Pause Squad, Quarantine Agent (opens agent selector), Dismiss
- [ ] Pause Squad calls POST /emergency/pause-squad
- [ ] Quarantine Agent calls POST /agents/:id/quarantine
- [ ] Banner auto-dismisses when no critical alerts
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E1-US-011, E1-US-005  
**Estimate:** 3

---

### E2-US-018: Create Express API emergency routes
**Description:** As a developer, I need emergency API endpoints so that the UI can trigger emergency controls.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/emergency.ts` defines routes: POST /emergency/pause-squad, POST /emergency/stop
- [ ] POST /emergency/pause-squad pauses all active agents
- [ ] POST /emergency/stop pauses all agents + transitions all non-terminal tasks to BLOCKED
- [ ] Creates activity log for each action
- [ ] Typecheck passes

**Dependencies:** E1-US-007, E1-US-009  
**Estimate:** 2

---

## EPIC 3: OBSERVABILITY (Weeks 5-6)

**Goal:** Timeline view, cost tracking, audit logs, operational polish

**Stories:** 14 stories, 37 story points

---

### E3-US-001: Create Convex mutations for runs
**Description:** As a developer, I need Convex mutations for runs so that I can track task execution.

**Acceptance Criteria:**
- [ ] `convex/runs.ts` exports: `createRun`, `updateRun`, `endRun`
- [ ] `createRun` validates required fields, generates idempotency key
- [ ] `updateRun` updates status, cost, toolCallCount
- [ ] `endRun` sets endTime, final status, final cost
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 2

---

### E3-US-002: Create Convex queries for runs
**Description:** As a developer, I need Convex queries for runs so that I can list runs by task/agent.

**Acceptance Criteria:**
- [ ] `convex/runs.ts` exports: `listRuns`, `getRun`, `getRunsByTask`, `getRunsByAgent`
- [ ] `listRuns` supports filters: taskId, agentId, status
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 1

---

### E3-US-003: Create Convex mutations for toolCalls
**Description:** As a developer, I need Convex mutations for toolCalls so that I can log every tool invocation.

**Acceptance Criteria:**
- [ ] `convex/toolCalls.ts` exports: `createToolCall`, `updateToolCall`
- [ ] `createToolCall` validates required fields, redacts secrets in input/output
- [ ] `updateToolCall` updates status, duration, cost
- [ ] Redaction regex: API_KEY, TOKEN, PASSWORD, SECRET patterns
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 3

---

### E3-US-004: Create Convex queries for toolCalls
**Description:** As a developer, I need Convex queries for toolCalls so that I can list tool calls by run/task.

**Acceptance Criteria:**
- [ ] `convex/toolCalls.ts` exports: `listToolCalls`, `getToolCall`, `getToolCallsByRun`, `getToolCallsByTask`
- [ ] `listToolCalls` supports filters: runId, taskId, agentId, risk
- [ ] Typecheck passes

**Dependencies:** E1-US-005  
**Estimate:** 1

---

### E3-US-005: Create Convex query for task timeline
**Description:** As a developer, I need a task timeline query so that I can show complete execution history.

**Acceptance Criteria:**
- [ ] `convex/tasks.ts` exports `getTaskTimeline(taskId)`
- [ ] Returns array of events: transitions, runs, toolCalls, approvals, alerts, messages
- [ ] Events sorted by timestamp (oldest first)
- [ ] Each event includes: type, timestamp, actor, summary, details
- [ ] Typecheck passes

**Dependencies:** E3-US-002, E3-US-004, E2-US-005, E2-US-010, E1-US-004  
**Estimate:** 3

---

### E3-US-006: Create Express API route for task timeline
**Description:** As a developer, I need a REST API endpoint for task timeline so that the UI can display it.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/tasks.ts` adds route: GET /tasks/:id/timeline
- [ ] Calls `getTaskTimeline` Convex query
- [ ] Returns JSON array of events
- [ ] Typecheck passes

**Dependencies:** E3-US-005  
**Estimate:** 1

---

### E3-US-007: Create React UI for task detail drawer
**Description:** As a user, I want a task detail drawer so that I can see full task information.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/TaskDrawer.tsx` displays as side panel
- [ ] Tabs: Overview, Timeline, Artifacts, Approvals, Cost
- [ ] Overview tab: title, description, type, status, priority, assignees, reviewers, subscribers, budget, spend, workPlan, deliverable, selfReview, evidence, blockedReason
- [ ] Clicking task card in Kanban opens drawer
- [ ] Close button
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E1-US-010, E1-US-014  
**Estimate:** 5

---

### E3-US-008: Create React UI for task timeline tab
**Description:** As a user, I want to see task timeline so that I can understand execution history.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/TaskTimeline.tsx` displays timeline events
- [ ] Vertical timeline with icons for each event type
- [ ] Event types: transition (arrow), run (play), tool call (wrench), approval (checkmark), alert (warning), message (chat)
- [ ] Each event shows: timestamp (relative), actor, summary, expandable details
- [ ] Tool calls show: tool name, risk badge, duration, status
- [ ] Approvals show: risk, approver, decision
- [ ] Real-time updates via Convex subscription
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E3-US-006, E3-US-007  
**Estimate:** 5

---

### E3-US-009: Create React UI for cost tab
**Description:** As a user, I want to see task cost breakdown so that I can understand spend.

**Acceptance Criteria:**
- [ ] `packages/ui/src/components/TaskCost.tsx` displays cost breakdown
- [ ] Shows: total spend, budget, % used, progress bar
- [ ] Breakdown by run: runId, startTime, duration, cost, status
- [ ] Breakdown by tool call: tool, count, total cost
- [ ] Chart: spend over time (line chart)
- [ ] Typecheck passes
- [ ] UI renders correctly in browser

**Dependencies:** E3-US-002, E3-US-004, E3-US-007  
**Estimate:** 3

---

### E3-US-010: Implement cost attribution in runs
**Description:** As a developer, I need cost attribution so that run costs are calculated accurately.

**Acceptance Criteria:**
- [ ] `convex/runs.ts` `endRun` calculates cost from tool calls
- [ ] Sums toolCall costs where available
- [ ] Estimates cost for LLM calls (input tokens * input rate + output tokens * output rate)
- [ ] Model pricing table in `shared/constants.ts`
- [ ] Typecheck passes

**Dependencies:** E3-US-001, E3-US-003  
**Estimate:** 3

---

### E3-US-011: Create Convex query for cost rollups
**Description:** As a developer, I need cost rollup queries so that I can report spend by agent/task/day.

**Acceptance Criteria:**
- [ ] `convex/runs.ts` exports: `getAgentSpend(agentId, startDate, endDate)`, `getTaskSpend(taskId)`, `getDailySpend(date)`
- [ ] `getAgentSpend` sums run costs for agent in date range
- [ ] `getTaskSpend` sums run costs for task
- [ ] `getDailySpend` sums run costs for all agents on date
- [ ] Typecheck passes

**Dependencies:** E3-US-002  
**Estimate:** 2

---

### E3-US-012: Create Express API routes for cost reports
**Description:** As a developer, I need REST API endpoints for cost reports so that the UI can display spend.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/costs.ts` defines routes: GET /costs/agent/:id, GET /costs/task/:id, GET /costs/daily
- [ ] Routes call Convex cost rollup queries
- [ ] Support query params: startDate, endDate
- [ ] Typecheck passes

**Dependencies:** E3-US-011  
**Estimate:** 2

---

### E3-US-013: Implement daily standup generator daemon
**Description:** As a developer, I need a daily standup generator so that I get a summary of yesterday's work.

**Acceptance Criteria:**
- [ ] `packages/workers/src/daily-standup.ts` runs daily at 9am
- [ ] Queries completed tasks from yesterday
- [ ] Queries total spend from yesterday
- [ ] Queries incidents/alerts from yesterday
- [ ] Generates markdown report with sections: Completed Tasks, Spend, Incidents, Next Up
- [ ] Posts report to operator channel (placeholder: console.log for now)
- [ ] Typecheck passes

**Dependencies:** E3-US-002, E3-US-011, E1-US-005  
**Estimate:** 3

---

### E3-US-014: Create audit log export
**Description:** As a user, I want to export audit logs so that I can review history offline.

**Acceptance Criteria:**
- [ ] `packages/api/src/routes/audit.ts` defines route: GET /audit/export
- [ ] Queries taskTransitions, approvals, activities
- [ ] Supports query params: startDate, endDate, taskId, agentId
- [ ] Returns JSON or CSV (based on Accept header)
- [ ] Typecheck passes

**Dependencies:** E1-US-004, E2-US-005, E1-US-005  
**Estimate:** 3

---

## EPIC 4: HARDENING (Weeks 7-8)

**Goal:** Testing, documentation, production readiness

**Stories:** 12 stories, 40 story points

---

### E4-US-001: Write integration tests for state machine
**Description:** As a developer, I need integration tests for state machine so that I can verify transition logic.

**Acceptance Criteria:**
- [ ] Test file: `packages/state-machine/src/__tests__/validator.test.ts`
- [ ] Tests cover all valid transitions (36+ test cases)
- [ ] Tests cover all invalid transitions (20+ test cases)
- [ ] Tests cover required artifacts checks
- [ ] Tests cover actor permissions (agent can't do human-only transitions)
- [ ] All tests pass
- [ ] Typecheck passes

**Dependencies:** E1-US-006  
**Estimate:** 5

---

### E4-US-002: Write integration tests for policy engine
**Description:** As a developer, I need integration tests for policy engine so that I can verify risk classification and approval logic.

**Acceptance Criteria:**
- [ ] Test file: `packages/policy-engine/src/__tests__/evaluator.test.ts`
- [ ] Tests cover all tool risk classifications
- [ ] Tests cover approval requirements (all scenarios)
- [ ] Tests cover allowlist checks (shell, network, filesystem)
- [ ] Tests cover secret detection
- [ ] All tests pass
- [ ] Typecheck passes

**Dependencies:** E2-US-001, E2-US-002, E2-US-003  
**Estimate:** 5

---

### E4-US-003: Write integration tests for approval workflow
**Description:** As a developer, I need integration tests for approval workflow so that I can verify end-to-end flow.

**Acceptance Criteria:**
- [ ] Test file: `packages/api/src/__tests__/approvals.test.ts`
- [ ] Test: create approval → approve → verify action allowed
- [ ] Test: create approval → deny → verify action blocked
- [ ] Test: approval timeout handling
- [ ] Test: approval audit trail
- [ ] All tests pass
- [ ] Typecheck passes

**Dependencies:** E2-US-004, E2-US-006  
**Estimate:** 3

---

### E4-US-004: Write integration tests for budget enforcement
**Description:** As a developer, I need integration tests for budget enforcement so that I can verify containment.

**Acceptance Criteria:**
- [ ] Test file: `packages/workers/src/__tests__/budget-enforcer.test.ts`
- [ ] Test: task spend exceeds budget → NEEDS_APPROVAL
- [ ] Test: agent todaySpend exceeds dailyCap → pause agent
- [ ] Test: alert created on breach
- [ ] Test: activity log records breach
- [ ] All tests pass
- [ ] Typecheck passes

**Dependencies:** E2-US-014  
**Estimate:** 3

---

### E4-US-005: Write integration tests for loop detection
**Description:** As a developer, I need integration tests for loop detection so that I can verify containment.

**Acceptance Criteria:**
- [ ] Test file: `packages/workers/src/__tests__/loop-detector.test.ts`
- [ ] Test: >20 comments in 30 min → BLOCKED
- [ ] Test: >3 review cycles → BLOCKED
- [ ] Test: same pair back-and-forth >8 times → BLOCKED
- [ ] Test: alert created on detection
- [ ] Test: Loop Summary doc created
- [ ] All tests pass
- [ ] Typecheck passes

**Dependencies:** E2-US-013  
**Estimate:** 3

---

### E4-US-006: Perform load testing
**Description:** As a developer, I need load testing so that I can verify system handles 100+ tasks/day.

**Acceptance Criteria:**
- [ ] Load test script: `scripts/load-test.ts`
- [ ] Simulates 20 agents, 100+ tasks/day, 1000+ tool calls/day
- [ ] Runs for 1 hour
- [ ] Measures: API response times, DB query times, UI update latency
- [ ] No errors or crashes
- [ ] Response times <5s (p95)
- [ ] Report generated with metrics

**Dependencies:** E3-US-010, E3-US-011  
**Estimate:** 5

---

### E4-US-007: Perform security audit
**Description:** As a developer, I need a security audit so that I can verify secrets are protected.

**Acceptance Criteria:**
- [ ] Audit checklist: secrets redaction, allowlist bypass attempts, approval bypass attempts, SQL injection (if applicable)
- [ ] Test: secrets in tool call input/output are redacted
- [ ] Test: blocked shell commands are rejected
- [ ] Test: non-allowlisted network calls are rejected
- [ ] Test: approval required for RED actions (cannot bypass)
- [ ] Test: agent cannot transition tasks with human-only permissions
- [ ] All tests pass
- [ ] Report generated with findings

**Dependencies:** E2-US-003, E3-US-003  
**Estimate:** 3

---

### E4-US-008: Write RUNBOOK.md
**Description:** As an operator, I need a runbook so that I can operate Mission Control.

**Acceptance Criteria:**
- [ ] `docs/RUNBOOK.md` created
- [ ] Sections: Startup, Shutdown, Health Checks, Common Incidents, Recovery Procedures
- [ ] Startup: docker-compose up, verify services, seed data
- [ ] Shutdown: docker-compose down, backup DB
- [ ] Health checks: API /health, Convex connection, workers running
- [ ] Incidents: budget breach, loop detected, agent stuck, DB corruption
- [ ] Recovery: restart services, restore backup, quarantine agent, emergency stop
- [ ] Examples with commands

**Dependencies:** None  
**Estimate:** 3

---

### E4-US-009: Write DEPLOYMENT.md
**Description:** As an operator, I need a deployment guide so that I can deploy to VPS.

**Acceptance Criteria:**
- [ ] `docs/DEPLOYMENT.md` created
- [ ] Sections: Prerequisites, VPS Setup, Environment Variables, SSL/TLS, Backups, Monitoring
- [ ] Prerequisites: Docker, Docker Compose, domain name
- [ ] VPS setup: Ubuntu 22.04, install Docker, clone repo
- [ ] Environment variables: copy .env.example, fill in values
- [ ] SSL/TLS: Caddy or nginx reverse proxy, Let's Encrypt
- [ ] Backups: Convex export, cron job
- [ ] Monitoring: health checks, alerting (optional: Sentry, Datadog)
- [ ] Examples with commands

**Dependencies:** E1-US-015  
**Estimate:** 3

---

### E4-US-010: Write STATE_MACHINE.md
**Description:** As a developer, I need a state machine spec so that I understand transition rules.

**Acceptance Criteria:**
- [ ] `docs/STATE_MACHINE.md` created
- [ ] Sections: States, Transition Matrix, Required Artifacts, Authority, Examples
- [ ] States: list all 8 states with descriptions
- [ ] Transition matrix: table or diagram showing all valid transitions
- [ ] Required artifacts: list artifacts for each status
- [ ] Authority: who can trigger each transition (agent/human/system)
- [ ] Examples: common flows (inbox → assigned → in_progress → review → done)
- [ ] Mermaid diagram of state machine

**Dependencies:** E1-US-006  
**Estimate:** 2

---

### E4-US-011: Write POLICY_V1.md
**Description:** As a developer, I need a policy spec so that I understand risk classification and approval rules.

**Acceptance Criteria:**
- [ ] `docs/POLICY_V1.md` created
- [ ] Sections: Autonomy Levels, Risk Classification, Approval Triggers, Tool Risk Map, Allowlists, Budgets, Spawn Limits, Loop Detection
- [ ] Autonomy levels: Intern, Specialist, Lead with permissions
- [ ] Risk classification: GREEN, YELLOW, RED with examples
- [ ] Approval triggers: all scenarios
- [ ] Tool risk map: complete list
- [ ] Allowlists: shell, network, filesystem
- [ ] Budgets: defaults for all types
- [ ] Spawn limits: quotas, depth, TTL
- [ ] Loop detection: thresholds and containment

**Dependencies:** E2-US-001, E2-US-002, E2-US-003  
**Estimate:** 2

---

### E4-US-012: Write API.md (OpenAPI spec)
**Description:** As a developer, I need an API spec so that I can integrate with Mission Control.

**Acceptance Criteria:**
- [ ] `docs/API.md` created with OpenAPI 3.0 spec
- [ ] Documents all endpoints: agents, tasks, approvals, messages, activities, costs, emergency
- [ ] Each endpoint: method, path, params, request body, response, errors
- [ ] Examples for each endpoint
- [ ] Authentication section (placeholder for now)
- [ ] Rate limiting section (placeholder for now)

**Dependencies:** E1-US-011, E1-US-012, E2-US-006, E2-US-011, E2-US-018, E3-US-012  
**Estimate:** 3

---

## Summary

**Total Stories:** 59  
**Total Story Points:** 168  
**Estimated Duration:** 6-8 weeks (with 1-2 developers)

**Epic Breakdown:**
- Epic 1 (Foundation): 15 stories, 44 points, 2 weeks
- Epic 2 (Safety & Collaboration): 18 stories, 47 points, 2 weeks
- Epic 3 (Observability): 14 stories, 37 points, 2 weeks
- Epic 4 (Hardening): 12 stories, 40 points, 2 weeks

**Critical Path:**
1. E1-US-001 → E1-US-002/003/004/005 → E1-US-006 → E1-US-009 (state machine + tasks)
2. E2-US-001/002/003 → E2-US-004 → E2-US-006 (policy + approvals)
3. E2-US-007/008 → E2-US-014 (budgets)
4. E3-US-001/002/003/004 → E3-US-005 → E3-US-008 (timeline)
5. E4-US-001 through E4-US-012 (testing + docs)

**Risks:**
- Convex learning curve (mitigate: start with simple queries, iterate)
- State machine complexity (mitigate: extensive unit tests, formal spec)
- Real-time updates performance (mitigate: load testing, optimize subscriptions)
- Policy engine edge cases (mitigate: comprehensive test coverage)

---

**End of Epics & Stories**
