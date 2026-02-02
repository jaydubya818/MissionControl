# Mission Control v1.6+ Implementation Roadmap

**Status:** In Progress  
**Date:** 2026-02-02

---

## ✅ Completed Features (v1.0-v1.5)

### Core Infrastructure
- ✅ Multi-project workspaces (3 projects)
- ✅ 18 agents across all projects
- ✅ Task state machine with transitions
- ✅ Approval workflow
- ✅ Policy engine
- ✅ Budget tracking
- ✅ Observability (activities, alerts, runs, messages)

### UI Features
- ✅ Drag & Drop Kanban
- ✅ Smart Task Assignment
- ✅ Webhook System
- ✅ Mobile Responsive UI
- ✅ Health Dashboard
- ✅ Monitoring Dashboard
- ✅ Cost Analytics
- ✅ Agent Performance Dashboard
- ✅ Task Comments with @Mentions
- ✅ **Peer Review System (v1.6)** - PRAISE/REFUTE/CHANGESET/APPROVE

### Telegram Bot
- ✅ 11 commands
- ✅ Inline buttons for approvals
- ✅ Project switching
- ✅ Status monitoring

---

## 🚧 In Progress (v1.6)

### 1. Thread-per-Task in Telegram
**Priority:** HIGH  
**Complexity:** Medium  
**Impact:** High (UX)

**Implementation:**
```typescript
// convex/tasks.ts - Add threadRef field
tasks: defineTable({
  // ... existing fields
  threadRef: v.optional(v.object({
    chatId: v.string(),
    threadId: v.string(),
  })),
})

// packages/telegram-bot/src/threads.ts - Enhanced
export async function createTaskThread(bot, task) {
  const message = await bot.telegram.sendMessage(
    CHAT_ID,
    `📋 Task #${task._id.slice(-6)}: ${task.title}`,
    { 
      reply_to_message_id: undefined, // Creates new thread
      allow_sending_without_reply: true 
    }
  );
  
  // Save threadRef to task
  await convex.mutation(api.tasks.updateThreadRef, {
    taskId: task._id,
    threadRef: {
      chatId: CHAT_ID,
      threadId: message.message_id.toString(),
    },
  });
}

// All task-related messages go to this thread
export async function postToTaskThread(bot, task, message) {
  if (!task.threadRef) {
    await createTaskThread(bot, task);
  }
  
  await bot.telegram.sendMessage(
    task.threadRef.chatId,
    message,
    { reply_to_message_id: parseInt(task.threadRef.threadId) }
  );
}
```

**Files to Modify:**
- `convex/schema.ts` - Add threadRef field
- `packages/telegram-bot/src/threads.ts` - Implement thread creation/posting
- `packages/telegram-bot/src/notifications.ts` - Use threads for all notifications
- `convex/tasks.ts` - Add updateThreadRef mutation

**Testing:**
1. Create a task
2. Check Telegram for new thread
3. Post comment - should appear in thread
4. Assign agent - notification in thread
5. Complete task - summary in thread

---

### 2. Multi-Executor Routing (Automation)
**Priority:** HIGH  
**Complexity:** High  
**Impact:** Very High (Automation)

**Implementation:**
```typescript
// convex/executors.ts - NEW FILE
export const executorTypes = v.union(
  v.literal("CURSOR"),
  v.literal("CLAUDE_CODE"),
  v.literal("OPENCLAW_AGENT"),
  v.literal("MANUAL")
);

// Schema
executionRequests: defineTable({
  projectId: v.id("projects"),
  taskId: v.id("tasks"),
  
  executor: executorTypes,
  status: v.union(
    v.literal("PENDING"),
    v.literal("ASSIGNED"),
    v.literal("IN_PROGRESS"),
    v.literal("COMPLETED"),
    v.literal("FAILED")
  ),
  
  // Request details
  requestType: v.union(
    v.literal("CODE_CHANGE"),
    v.literal("RESEARCH"),
    v.literal("CONTENT"),
    v.literal("EMAIL"),
    v.literal("SOCIAL"),
    v.literal("OPS")
  ),
  context: v.any(),
  
  // Routing rules
  routingScore: v.number(),
  routingReason: v.string(),
  
  // Execution
  assignedAt: v.optional(v.number()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  
  // Results
  result: v.optional(v.any()),
  artifacts: v.optional(v.array(v.string())),
  error: v.optional(v.string()),
})

// Smart routing logic
export const routeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    
    // Routing logic
    let executor: string;
    let score: number;
    let reason: string;
    
    if (task.type === "ENGINEERING" && task.title.includes("refactor")) {
      executor = "CURSOR";
      score = 0.9;
      reason = "Code refactoring best handled by Cursor";
    } else if (task.type === "RESEARCH") {
      executor = "CLAUDE_CODE";
      score = 0.85;
      reason = "Research tasks suited for Claude Code";
    } else if (task.type === "CONTENT" || task.type === "SOCIAL") {
      executor = "OPENCLAW_AGENT";
      score = 0.95;
      reason = "Content generation optimized for OpenClaw";
    } else {
      executor = "MANUAL";
      score = 0.5;
      reason = "Default to manual execution";
    }
    
    // Create execution request
    const requestId = await ctx.db.insert("executionRequests", {
      projectId: task.projectId,
      taskId: args.taskId,
      executor,
      status: "PENDING",
      requestType: task.type,
      context: { task },
      routingScore: score,
      routingReason: reason,
    });
    
    return { requestId, executor, score, reason };
  },
});

// Callback handler for execution results
export const handleExecutionCallback = mutation({
  args: {
    requestId: v.id("executionRequests"),
    status: v.string(),
    result: v.optional(v.any()),
    artifacts: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: args.status,
      result: args.result,
      artifacts: args.artifacts,
      error: args.error,
      completedAt: Date.now(),
    });
    
    // Update task based on result
    const request = await ctx.db.get(args.requestId);
    if (request && args.status === "COMPLETED") {
      await ctx.db.patch(request.taskId, {
        status: "REVIEW",
      });
    }
  },
});
```

**Files to Create:**
- `convex/executors.ts` - Routing logic and callbacks
- `packages/executor-client/` - Client library for executors
- `packages/cursor-executor/` - Cursor integration
- `packages/claude-code-executor/` - Claude Code integration

**Testing:**
1. Create CODE_CHANGE task - should route to Cursor
2. Create RESEARCH task - should route to Claude Code
3. Create CONTENT task - should route to OpenClaw
4. Test callback handling
5. Verify task status updates

---

### 3. Incident Report Export
**Priority:** MEDIUM  
**Complexity:** Low  
**Impact:** Medium (Compliance)

**Implementation:**
```typescript
// convex/reports.ts - NEW FILE
export const generateIncidentReport = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    const transitions = await ctx.db
      .query("taskTransitions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    // Calculate costs
    const totalCost = runs.reduce((sum, r) => sum + (r.cost || 0), 0);
    
    // Generate markdown
    let report = `# Incident Report: ${task.title}\n\n`;
    report += `**Task ID:** ${task._id}\n`;
    report += `**Status:** ${task.status}\n`;
    report += `**Created:** ${new Date(task._creationTime).toISOString()}\n`;
    report += `**Total Cost:** $${totalCost.toFixed(2)}\n\n`;
    
    report += `## Timeline\n\n`;
    for (const t of transitions) {
      report += `- ${new Date(t._creationTime).toISOString()} - ${t.fromStatus} → ${t.toStatus}\n`;
      if (t.reason) report += `  *${t.reason}*\n`;
    }
    
    report += `\n## Messages (${messages.length})\n\n`;
    for (const m of messages.slice(0, 10)) {
      report += `### ${new Date(m._creationTime).toISOString()}\n`;
      report += `${m.body}\n\n`;
    }
    
    report += `\n## Approvals (${approvals.length})\n\n`;
    for (const a of approvals) {
      report += `- **${a.actionSummary}** - ${a.status}\n`;
      report += `  Risk: ${a.riskLevel}, Cost: $${a.estimatedCost?.toFixed(2) || 0}\n`;
    }
    
    report += `\n## Execution Runs (${runs.length})\n\n`;
    for (const r of runs) {
      report += `- ${r.status} - Cost: $${r.cost?.toFixed(2) || 0}\n`;
    }
    
    return { report, task, totalCost };
  },
});

// UI Component
export function ExportReportButton({ taskId }) {
  const reportData = useQuery(api.reports.generateIncidentReport, { taskId });
  
  const handleExport = () => {
    if (!reportData) return;
    
    const blob = new Blob([reportData.report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-report-${taskId.slice(-6)}.md`;
    a.click();
  };
  
  return (
    <button onClick={handleExport}>
      📄 Export Report
    </button>
  );
}
```

**Files to Create:**
- `convex/reports.ts` - Report generation logic
- `apps/mission-control-ui/src/ExportReportButton.tsx` - UI component

**Testing:**
1. Complete a task with full lifecycle
2. Click "Export Report"
3. Verify markdown file downloads
4. Check report includes timeline, messages, approvals, costs

---

### 4. Enhanced Error Handling & Retry Logic
**Priority:** HIGH  
**Complexity:** Medium  
**Impact:** High (Reliability)

**Implementation:**
```typescript
// packages/shared/src/retry.ts - NEW FILE
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: "linear" | "exponential";
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = "exponential",
    onRetry,
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      if (onRetry) {
        onRetry(attempt, lastError);
      }
      
      const delay = backoff === "exponential" 
        ? delayMs * Math.pow(2, attempt - 1)
        : delayMs * attempt;
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Circuit breaker
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
    }
  }
}

// Usage in Convex mutations
export const robustMutation = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    return await withRetry(
      async () => {
        // Your mutation logic
        return await someOperation();
      },
      {
        maxAttempts: 3,
        delayMs: 1000,
        backoff: "exponential",
        onRetry: (attempt, error) => {
          console.log(`Retry attempt ${attempt}:`, error.message);
        },
      }
    );
  },
});
```

**Files to Create:**
- `packages/shared/src/retry.ts` - Retry utilities
- `packages/shared/src/circuit-breaker.ts` - Circuit breaker
- Update all Convex mutations to use retry logic

---

### 5. Agent Learning from History
**Priority:** MEDIUM  
**Complexity:** High  
**Impact:** Very High (Intelligence)

**Implementation:**
```typescript
// convex/agentLearning.ts - NEW FILE
agentPerformance: defineTable({
  agentId: v.id("agents"),
  projectId: v.id("projects"),
  
  // Task performance
  taskType: v.string(),
  successRate: v.number(),
  avgCompletionTime: v.number(),
  avgCost: v.number(),
  
  // Quality metrics
  avgReviewScore: v.number(),
  refuteCount: v.number(),
  praiseCount: v.number(),
  
  // Learning data
  patterns: v.array(v.object({
    pattern: v.string(),
    frequency: v.number(),
    successRate: v.number(),
  })),
  
  lastUpdated: v.number(),
})

export const updateAgentPerformance = internalMutation({
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    
    for (const agent of agents) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_agent", (q) => q.eq("assignedAgentId", agent._id))
        .collect();
      
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_reviewer", (q) => q.eq("reviewerAgentId", agent._id))
        .collect();
      
      // Calculate metrics
      const completed = tasks.filter(t => t.status === "DONE");
      const successRate = completed.length / tasks.length;
      
      const avgScore = reviews
        .filter(r => r.type === "PRAISE" && r.score)
        .reduce((sum, r) => sum + (r.score || 0), 0) / reviews.length;
      
      // Update or create performance record
      const existing = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
        .first();
      
      if (existing) {
        await ctx.db.patch(existing._id, {
          successRate,
          avgReviewScore: avgScore,
          lastUpdated: Date.now(),
        });
      } else {
        await ctx.db.insert("agentPerformance", {
          agentId: agent._id,
          projectId: agent.projectId,
          taskType: "ALL",
          successRate,
          avgCompletionTime: 0,
          avgCost: 0,
          avgReviewScore: avgScore,
          refuteCount: reviews.filter(r => r.type === "REFUTE").length,
          praiseCount: reviews.filter(r => r.type === "PRAISE").length,
          patterns: [],
          lastUpdated: Date.now(),
        });
      }
    }
  },
});

// Cron job to update daily
export const updatePerformanceMetrics = internalMutation({
  handler: async (ctx) => {
    await updateAgentPerformance(ctx);
  },
});
```

---

### 6. GitHub Integration
**Priority:** HIGH  
**Complexity:** Medium  
**Impact:** High (Automation)

**Implementation:**
```typescript
// packages/github-integration/ - NEW PACKAGE
import { Octokit } from "@octokit/rest";

export class GitHubIntegration {
  private octokit: Octokit;
  
  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }
  
  // Sync issues to tasks
  async syncIssues(owner: string, repo: string, projectId: string) {
    const { data: issues } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: "open",
    });
    
    for (const issue of issues) {
      // Create task in Mission Control
      await convex.mutation(api.tasks.create, {
        projectId,
        title: issue.title,
        description: issue.body || "",
        type: "ENGINEERING",
        priority: issue.labels.includes("urgent") ? 1 : 3,
        metadata: {
          githubIssueId: issue.id,
          githubIssueNumber: issue.number,
          githubUrl: issue.html_url,
        },
      });
    }
  }
  
  // Update PR status
  async updatePRStatus(owner: string, repo: string, prNumber: number, status: string) {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `Mission Control Status: ${status}`,
    });
  }
  
  // Create PR from task
  async createPRFromTask(task: any, branch: string) {
    const { data: pr } = await this.octokit.pulls.create({
      owner: task.metadata.owner,
      repo: task.metadata.repo,
      title: task.title,
      body: task.description,
      head: branch,
      base: "main",
    });
    
    return pr;
  }
}
```

---

## 📋 Summary

### Completed (v1.6)
- ✅ Peer Review System

### Ready to Implement (Priority Order)
1. **Thread-per-Task** - High impact UX improvement
2. **Multi-Executor Routing** - Core automation feature
3. **Error Handling** - Critical for reliability
4. **GitHub Integration** - High-value automation
5. **Incident Reports** - Compliance requirement
6. **Agent Learning** - Long-term intelligence

### Estimated Timeline
- Thread-per-Task: 2-3 hours
- Multi-Executor Routing: 4-6 hours
- Error Handling: 2-3 hours
- GitHub Integration: 3-4 hours
- Incident Reports: 1-2 hours
- Agent Learning: 4-6 hours

**Total: 16-24 hours of focused development**

---

## 🎯 Next Steps

1. **Immediate:** Integrate PeerReviewPanel into TaskDrawer
2. **Next:** Implement Thread-per-Task (highest UX impact)
3. **Then:** Multi-Executor Routing (core automation)
4. **Finally:** Remaining features in priority order

All features have detailed implementation plans above. Ready to execute! 🚀
