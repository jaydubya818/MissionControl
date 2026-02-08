# Mission Control - EPICs 2-8 Implementation Guide

**Version:** 1.0  
**Last Updated:** 2026-02-01

---

## Overview

This document provides detailed implementation guidance for EPICs 2-8 of Mission Control, following the completion of EPIC 1 (Multi-Project Workspaces).

---

## EPIC 2: Telegram Command Bus (MVP-critical)

### Objective
Build a Telegram bot that serves as the command bus and notification channel for Mission Control.

### Components

#### 2.1 Telegram Bot Package

**Location:** `packages/telegram-bot/`

**Dependencies:**
- `node-telegram-bot-api` or `telegraf`
- `convex` client
- `dotenv`

**Files to Create:**
```
packages/telegram-bot/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Bot initialization
│   ├── commands/          # Command handlers
│   │   ├── projects.ts
│   │   ├── inbox.ts
│   │   ├── approvals.ts
│   │   ├── squad.ts
│   │   └── status.ts
│   ├── notifications.ts   # Notification sender
│   ├── threads.ts         # Thread-per-task mapping
│   └── utils.ts           # Helpers
```

#### 2.2 Commands Implementation

**Required Commands:**

1. `/projects` - List all projects
   ```typescript
   // Query: api.projects.list
   // Response: Formatted list with slug and task counts
   ```

2. `/switch <project>` - Switch project context
   ```typescript
   // Store user's active project in memory or DB
   // Response: Confirmation with project name
   ```

3. `/inbox` - Show inbox tasks
   ```typescript
   // Query: api.tasks.listByStatus({ projectId, status: "INBOX" })
   // Response: Formatted task list with IDs
   ```

4. `/my_approvals` - Show pending approvals
   ```typescript
   // Query: api.approvals.listPending({ projectId })
   // Response: Formatted approval list with IDs
   ```

5. `/approve <id>` - Approve request
   ```typescript
   // Mutation: api.approvals.approve({ approvalId, decidedByUserId })
   // Response: Confirmation
   ```

6. `/deny <id> <reason>` - Deny request
   ```typescript
   // Mutation: api.approvals.deny({ approvalId, decidedByUserId, reason })
   // Response: Confirmation
   ```

7. `/pause_squad` - Pause all agents
   ```typescript
   // Mutation: api.agents.pauseAll({ projectId, userId, reason })
   // Response: Count of paused agents
   ```

8. `/resume_squad` - Resume all agents
   ```typescript
   // Mutation: api.agents.resumeAll({ projectId, userId, reason })
   // Response: Count of resumed agents
   ```

9. `/quarantine <agent>` - Quarantine agent
   ```typescript
   // Mutation: api.agents.updateStatus({ agentId, status: "QUARANTINED" })
   // Response: Confirmation
   ```

10. `/status` - Show project status
    ```typescript
    // Query: api.projects.getStats({ projectId })
    // Response: Formatted stats
    ```

11. `/burnrate` - Show burn rate
    ```typescript
    // Query: api.standup.generate({ projectId })
    // Response: Today's burn rate
    ```

#### 2.3 Thread-per-Task

**Schema Updates:**
- `threadRef` already added to tasks and messages in EPIC 1

**Implementation:**
```typescript
// When task is created, create Telegram thread
async function createTaskThread(taskId: string, title: string) {
  const thread = await bot.telegram.sendMessage(chatId, `📋 Task: ${title}`, {
    reply_to_message_id: topicId, // For forum groups
  });
  
  // Store threadRef on task
  await convex.mutation(api.tasks.update, {
    taskId,
    threadRef: `${chatId}:${thread.message_id}`,
  });
}
```

#### 2.4 Notifications

**Types:**
- Approvals pending
- Budget exceeded
- Loop blocked
- Gateway degraded
- Daily CEO brief

**Implementation:**
```typescript
// Convex cron or mutation triggers notification
async function sendNotification(type: string, data: any) {
  const message = formatNotification(type, data);
  await bot.telegram.sendMessage(chatId, message, {
    parse_mode: "Markdown",
  });
}
```

#### 2.5 Daily CEO Brief

**Convex Cron:**
```typescript
// convex/crons.ts
crons.daily("dailyCEOBrief", { hourUTC: 9, minuteUTC: 0 }, 
  internal.telegram.sendDailyCEOBrief
);
```

**Format:**
```
📊 Daily CEO Brief - OpenClaw

✅ Completed: 5 tasks
🔄 In Progress: 8 tasks
🚫 Blocked: 2 tasks
⏳ Approvals Pending: 3

💰 Burn Rate: $12.50 today

🎯 Top 3 Next Actions:
1. Review social media campaign (Task #15)
2. Approve payment integration (Approval #3)
3. Unblock API documentation (Task #12)
```

### Acceptance Criteria

- [ ] Bot responds to all 11 commands
- [ ] Commands are project-scoped (use active project)
- [ ] Thread-per-task creates Telegram threads for new tasks
- [ ] Notifications sent for key events
- [ ] Daily CEO brief sent at 9am UTC
- [ ] Documentation in `docs/TELEGRAM_COMMANDS.md`

---

## EPIC 3: Approvals & Risk System (MVP-critical)

### Objective
Enforce policy allowlists and approval gates in the database layer.

### Components

#### 3.1 Allowlist Enforcement in Convex

**Update:** `convex/policy.ts`

**Current State:** Allowlist functions exist in `packages/policy-engine/src/allowlists.ts` but are not called by `policy.evaluate`.

**Implementation:**
```typescript
// convex/policy.ts - evaluate mutation
export const evaluate = mutation({
  handler: async (ctx, args) => {
    const policy = await getActivePolicy(ctx, args.projectId);
    
    if (args.actionType === "TOOL_CALL") {
      const { toolName, toolArgs } = args.actionPayload;
      
      // Check shell allowlist
      if (toolName === "shell" || toolName === "exec") {
        const command = toolArgs.command;
        if (!isShellAllowed(command, policy.shellAllowlist, policy.shellBlocklist)) {
          return { decision: "DENIED", reason: "Shell command not allowed" };
        }
      }
      
      // Check network allowlist
      if (toolName === "web_fetch" || toolName === "http") {
        const url = toolArgs.url;
        if (!isNetworkAllowed(url, policy.networkAllowlist)) {
          return { decision: "DENIED", reason: "Network domain not allowed" };
        }
      }
      
      // Check file allowlist
      if (toolName === "read" || toolName === "write") {
        const path = toolArgs.path;
        const allowed = toolName === "read" 
          ? isFileReadAllowed(path, policy.fileReadPaths)
          : isFileWriteAllowed(path, policy.fileWritePaths);
        if (!allowed) {
          return { decision: "DENIED", reason: "File path not allowed" };
        }
      }
    }
    
    // ... rest of policy evaluation
  }
});
```

#### 3.2 DONE Approval Gate

**Update:** `convex/tasks.ts`

**Requirement:** REVIEW → DONE requires approval record when policy says so.

**Implementation:**
```typescript
// In transition mutation, before allowing REVIEW → DONE
if (fromStatus === "REVIEW" && toStatus === "DONE") {
  const policy = await getActivePolicy(ctx, task.projectId);
  
  if (policy.rules.reviewToDoneRequiresApproval) {
    // Check for approved approval record
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("status"), "APPROVED"))
      .collect();
    
    if (approvals.length === 0) {
      return {
        success: false,
        errors: [{
          field: "status",
          message: "REVIEW → DONE requires an approved approval record"
        }],
      };
    }
  }
}
```

### Acceptance Criteria

- [ ] Shell commands checked against allowlist/blocklist
- [ ] Network requests checked against domain allowlist
- [ ] File operations checked against path allowlists
- [ ] REVIEW → DONE blocked without approval when policy requires
- [ ] Clear error messages for policy violations

---

## EPIC 4: Peer Review Engine (MVP-critical)

### Objective
Implement structured peer review with PRAISE/REFUTE/CHANGESET/APPROVE.

### Components

#### 4.1 Review Message Types

**Schema:** Already exists in `messages` table with `type: "REVIEW"`

**New Review Types:**
```typescript
type ReviewType = 
  | "PRAISE"       // Positive feedback
  | "REFUTE"       // Disagree with approach
  | "CHANGESET"    // Specific changes requested
  | "APPROVE";     // Final approval
```

#### 4.2 Review Workflow

**Flow:**
1. Task moves to REVIEW
2. Reviewer (or Sofie) posts review messages
3. If CHANGESET → task moves back to IN_PROGRESS
4. If APPROVE → approval record created
5. With approval → task can move to DONE

**Implementation:**
```typescript
// convex/messages.ts
export const postReview = mutation({
  args: {
    taskId: v.id("tasks"),
    reviewType: v.string(), // PRAISE, REFUTE, CHANGESET, APPROVE
    comments: v.string(),
    changeset: v.optional(v.array(v.object({
      file: v.string(),
      change: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    // Post review message
    await postMessageInternal(ctx, {
      taskId: args.taskId,
      type: "REVIEW",
      content: formatReview(args.reviewType, args.comments, args.changeset),
    });
    
    // If APPROVE, create approval record
    if (args.reviewType === "APPROVE") {
      await ctx.runMutation(api.approvals.request, {
        taskId: args.taskId,
        actionType: "COMPLETE_TASK",
        actionSummary: "Complete task after review approval",
        riskLevel: "YELLOW",
        justification: "Reviewer approved deliverable",
      });
    }
  }
});
```

### Acceptance Criteria

- [ ] Review messages support PRAISE/REFUTE/CHANGESET/APPROVE
- [ ] CHANGESET moves task back to IN_PROGRESS
- [ ] APPROVE creates approval record
- [ ] Review cycle count incremented
- [ ] UI shows review type badges

---

## EPIC 5: Budgets / Cost / Burn Rate (MVP-critical)

### Objective
Implement per-task and per-run budget tracking with containment.

### Components

#### 5.1 Schema Updates

**Add to tasks table:**
```typescript
tasks: {
  // ... existing fields
  budgetAllocated: v.optional(v.number()),  // Budget for this task
  budgetRemaining: v.optional(v.number()),  // Remaining budget
}
```

**Add to runs table:**
```typescript
runs: {
  // ... existing fields
  budgetAllocated: v.optional(v.number()),  // Budget for this run
}
```

#### 5.2 Budget Enforcement

**Implementation:**
```typescript
// convex/runs.ts
export const start = mutation({
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    const task = args.taskId ? await ctx.db.get(args.taskId) : null;
    
    // Check agent daily budget
    if (agent.spendToday >= agent.budgetDaily) {
      await ctx.runMutation(api.agents.updateStatus, {
        agentId: args.agentId,
        status: "PAUSED",
        reason: "Daily budget exceeded",
      });
      throw new Error("Agent daily budget exceeded");
    }
    
    // Check task budget
    if (task && task.budgetAllocated) {
      if (task.actualCost >= task.budgetAllocated) {
        await ctx.runMutation(api.tasks.transition, {
          taskId: task._id,
          toStatus: "NEEDS_APPROVAL",
          actorType: "SYSTEM",
          reason: "Task budget exceeded",
        });
        throw new Error("Task budget exceeded");
      }
    }
    
    // Create run with budget
    const runId = await ctx.db.insert("runs", {
      agentId: args.agentId,
      taskId: args.taskId,
      budgetAllocated: agent.budgetPerRun,
      // ... other fields
    });
    
    return { runId };
  }
});
```

#### 5.3 Burn Rate Tracking

**Already implemented in EPIC 1:** `standup.generate` includes burn rate.

**Additional Queries:**
```typescript
// convex/runs.ts
export const getBurnRate = query({
  args: {
    projectId: v.optional(v.id("projects")),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    let runs;
    if (args.projectId) {
      runs = await ctx.db
        .query("runs")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      runs = await ctx.db.query("runs").collect();
    }
    
    const filtered = runs.filter(r => 
      r.startedAt >= args.startDate && r.startedAt <= args.endDate
    );
    
    const total = filtered.reduce((sum, r) => sum + r.costUsd, 0);
    
    return {
      total,
      count: filtered.length,
      average: total / (filtered.length || 1),
      byAgent: groupByAgent(filtered),
      byTask: groupByTask(filtered),
    };
  }
});
```

### Acceptance Criteria

- [ ] Per-task budget tracked and enforced
- [ ] Per-run budget allocated from agent budget
- [ ] Budget exceed moves task to NEEDS_APPROVAL
- [ ] Budget exceed pauses agent
- [ ] Alert created on budget violation
- [ ] Burn rate query returns detailed breakdown

---

## EPIC 6: Observability Timeline (MVP-critical)

### Objective
Enhanced TaskDrawer with tabs and complete timeline including runs, toolCalls, approvals.

### Components

#### 6.1 TaskDrawer Tabs

**Update:** `apps/mission-control-ui/src/TaskDrawer.tsx`

**Tabs:**
1. **Overview** - Current content (description, assignees, work plan, deliverable, actions)
2. **Timeline** - Chronological stream of all events
3. **Artifacts** - Deliverable + artifact files
4. **Approvals** - All approval requests for this task
5. **Cost** - Budget, actual cost, run breakdown

#### 6.2 Enhanced Timeline Query

**Update:** `convex/tasks.ts`

```typescript
export const getWithTimeline = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    
    // Get all timeline data
    const transitions = await ctx.db
      .query("taskTransitions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    // Get tool calls for all runs
    const toolCalls = [];
    for (const run of runs) {
      const calls = await ctx.db
        .query("toolCalls")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      toolCalls.push(...calls);
    }
    
    return {
      task,
      transitions,
      messages,
      runs,
      toolCalls,
      approvals,
    };
  }
});
```

#### 6.3 Search Implementation

**New Query:** `convex/tasks.ts`

```typescript
export const search = query({
  args: {
    projectId: v.optional(v.id("projects")),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    let tasks;
    
    if (args.projectId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").collect();
    }
    
    // Simple text search (Convex doesn't have full-text search)
    const query = args.query.toLowerCase();
    const filtered = tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      (t.description && t.description.toLowerCase().includes(query))
    );
    
    return filtered.slice(0, limit);
  }
});
```

#### 6.4 Export Incident Report

**New Mutation:** `convex/tasks.ts`

```typescript
export const exportIncidentReport = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const data = await getWithTimeline(ctx, args);
    if (!data) return null;
    
    // Format as markdown
    const report = formatIncidentReport(data);
    return report;
  }
});
```

### Acceptance Criteria

- [ ] TaskDrawer has 5 tabs
- [ ] Timeline includes transitions, messages, runs, toolCalls (redacted), approvals
- [ ] Search works across tasks by title/description
- [ ] Export incident report generates markdown
- [ ] Timeline sorted chronologically
- [ ] Tool I/O redacted in timeline

---

## EPIC 7: Agent Autonomy + Heartbeats (MVP-critical)

### Objective
Implement agent heartbeat system, loop detection, and quarantine UX.

### Components

#### 7.1 Heartbeat Enhancements

**Already implemented:** `convex/agents.ts` has `heartbeat` mutation

**Enhancements:**
- Detect stale agents (no heartbeat in 30+ minutes)
- Auto-pause stale agents
- Heartbeat returns work recommendations

#### 7.2 Loop Detection

**New Cron:** `convex/crons.ts`

```typescript
crons.interval("detectLoops", { minutes: 15 }, internal.loops.detectLoops);
```

**New Module:** `convex/loops.ts`

```typescript
export const detectLoops = internalMutation({
  handler: async (ctx) => {
    const policy = await getActivePolicy(ctx);
    const thresholds = policy.loopThresholds;
    
    // Detect comment storms
    const tasks = await ctx.db.query("tasks")
      .filter((q) => q.neq(q.field("status"), "DONE"))
      .collect();
    
    for (const task of tasks) {
      const recentMessages = await ctx.db
        .query("messages")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .filter((q) => 
          q.gte(q.field("_creationTime"), 
            Date.now() - thresholds.windowMinutes * 60 * 1000)
        )
        .collect();
      
      if (recentMessages.length > thresholds.maxCommentsPerWindow) {
        // Block task and create alert
        await ctx.runMutation(api.tasks.transition, {
          taskId: task._id,
          toStatus: "BLOCKED",
          actorType: "SYSTEM",
          reason: "Comment storm detected",
        });
        
        await ctx.db.insert("alerts", {
          projectId: task.projectId,
          severity: "WARNING",
          type: "LOOP_DETECTED",
          title: "Comment storm on task",
          description: `Task ${task.title} has ${recentMessages.length} messages in ${thresholds.windowMinutes} minutes`,
          taskId: task._id,
          status: "OPEN",
        });
      }
    }
    
    // Detect review ping-pong
    // Detect repeated tool failures
    // ...
  }
});
```

#### 7.3 Quarantine UX

**Already implemented:** `agents.updateStatus` can set to QUARANTINED

**Enhancements:**
- Add quarantine reason to metadata
- Create alert when agent quarantined
- UI badge for quarantined agents

### Acceptance Criteria

- [ ] Heartbeat detects stale agents
- [ ] Loop detection runs every 15 minutes
- [ ] Comment storms block tasks
- [ ] Review ping-pong detected
- [ ] Repeated tool failures detected
- [ ] Quarantine creates alert
- [ ] UI shows quarantine status

---

## EPIC 8: Multi-Executor Routing (v1 stub)

### Objective
Create ExecutionRequest model for routing work to different executors.

### Components

#### 8.1 Schema

**New Table:** `convex/schema.ts`

```typescript
executionRequests: defineTable({
  projectId: v.optional(v.id("projects")),
  taskId: v.optional(v.id("tasks")),
  type: v.union(
    v.literal("CODE_CHANGE"),
    v.literal("RESEARCH"),
    v.literal("CONTENT"),
    v.literal("EMAIL"),
    v.literal("SOCIAL"),
    v.literal("OPS")
  ),
  executor: v.union(
    v.literal("CURSOR"),
    v.literal("CLAUDE_CODE"),
    v.literal("OPENCLAW_AGENT")
  ),
  status: v.union(
    v.literal("PENDING"),
    v.literal("ASSIGNED"),
    v.literal("IN_PROGRESS"),
    v.literal("COMPLETED"),
    v.literal("FAILED")
  ),
  requestedBy: v.id("agents"),
  assignedTo: v.optional(v.string()), // Executor identifier
  payload: v.any(),
  result: v.optional(v.any()),
  metadata: v.optional(v.any()),
})
  .index("by_status", ["status"])
  .index("by_project", ["projectId"])
  .index("by_task", ["taskId"]);
```

#### 8.2 CRUD Operations

**New Module:** `convex/executionRequests.ts`

```typescript
export const enqueue = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    type: v.string(),
    executor: v.string(),
    requestedBy: v.id("agents"),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const requestId = await ctx.db.insert("executionRequests", {
      projectId: args.projectId,
      taskId: args.taskId,
      type: args.type as any,
      executor: args.executor as any,
      status: "PENDING",
      requestedBy: args.requestedBy,
      payload: args.payload,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "AGENT",
      actorId: args.requestedBy.toString(),
      action: "EXECUTION_REQUESTED",
      description: `Requested ${args.type} execution via ${args.executor}`,
      targetType: "EXECUTION_REQUEST",
      targetId: requestId,
      taskId: args.taskId,
      agentId: args.requestedBy,
    });
    
    return { requestId };
  }
});

export const updateStatus = mutation({
  args: {
    requestId: v.id("executionRequests"),
    status: v.string(),
    result: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: args.status as any,
      result: args.result,
    });
  }
});

export const listPending = query({
  args: {
    projectId: v.optional(v.id("projects")),
    executor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let requests = await ctx.db
      .query("executionRequests")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .collect();
    
    if (args.projectId) {
      requests = requests.filter(r => r.projectId === args.projectId);
    }
    
    if (args.executor) {
      requests = requests.filter(r => r.executor === args.executor);
    }
    
    return requests;
  }
});
```

### Acceptance Criteria

- [ ] ExecutionRequest table created
- [ ] Enqueue mutation creates requests
- [ ] UpdateStatus mutation updates status
- [ ] ListPending query filters by project/executor
- [ ] Audit trail logs all requests
- [ ] Manual execution workflow documented

---

## Implementation Order

1. **EPIC 2** - Telegram (enables operator control)
2. **EPIC 3** - Approvals & Risk (enforces governance)
3. **EPIC 5** - Budgets (before EPIC 4 to track review costs)
4. **EPIC 4** - Peer Review (depends on budgets)
5. **EPIC 6** - Observability (debugging tool)
6. **EPIC 7** - Heartbeats & Loops (operational stability)
7. **EPIC 8** - Multi-Executor (future expansion)

---

## Testing Strategy

For each EPIC:
1. Unit tests for new Convex functions
2. Integration tests for workflows
3. Manual testing via UI and Telegram
4. Load testing for crons and loops

---

## Documentation Requirements

For each EPIC:
- Update RUNBOOK.md with new procedures
- Update GETTING_STARTED.md if needed
- Create EPIC-specific docs (e.g., TELEGRAM_COMMANDS.md)
- Update API documentation

---

**Ready to implement!** 🚀
