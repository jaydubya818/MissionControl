# OpenClaw Agent Integration Guide

**Version:** 1.0  
**Last Updated:** 2026-02-02

---

## Overview

This guide explains how to integrate OpenClaw autonomous agents with Mission Control for orchestration, governance, and observability.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Mission Control                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Convex    │  │  React UI    │  │  Telegram Bot    │  │
│  │  (Backend)  │  │  (Frontend)  │  │  (Command Bus)   │  │
│  └──────┬──────┘  └──────────────┘  └──────────────────┘  │
│         │                                                    │
│         │ API Calls (register, heartbeat, tasks, etc.)      │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Agents                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Scout   │  │  Cipher  │  │  Nova    │  │  Pixel   │   │
│  │ (Research)│  │  (Code)  │  │ (Content)│  │ (Design) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  Each agent:                                                 │
│  - Registers with Mission Control                           │
│  - Sends heartbeat every 15 minutes                         │
│  - Claims tasks from inbox                                  │
│  - Executes work in isolated workspace                      │
│  - Posts progress and artifacts                             │
│  - Requests approvals for RED actions                       │
│  - Respects budget limits                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Contract

### 1. Agent Registration

**When:** On agent startup

**API Call:**
```typescript
const result = await convex.mutation(api.agents.register, {
  projectId: "<project-id>",  // Get from api.projects.getBySlug
  name: "Scout",
  role: "SPECIALIST",  // INTERN, SPECIALIST, or LEAD
  workspacePath: "/tmp/scout-workspace",
  allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH"],
  emoji: "🔍",
  metadata: {
    version: "1.0.0",
    capabilities: ["web_search", "web_scrape", "analysis"],
  },
});

const agentId = result.agent._id;
```

**Response:**
```typescript
{
  agent: {
    _id: Id<"agents">,
    name: string,
    status: "ACTIVE",
    budgetDaily: number,
    budgetPerRun: number,
    // ... other fields
  }
}
```

### 2. Heartbeat Loop

**When:** Every 15 minutes (configurable)

**API Call:**
```typescript
const result = await convex.mutation(api.agents.heartbeat, {
  agentId: "<agent-id>",
  status: "ACTIVE",
});
```

**Response:**
```typescript
{
  success: boolean,
  pendingTasks: Array<{
    _id: Id<"tasks">,
    title: string,
    status: string,  // Tasks already assigned to this agent
  }>,
  claimableTasks: Array<{
    _id: Id<"tasks">,
    title: string,
    type: string,  // Tasks in INBOX matching agent's allowedTaskTypes
  }>,
  pendingNotifications: Array<{
    _id: Id<"notifications">,
    type: string,
    title: string,
    body: string,
  }>,
  budgetWarning?: {
    spendToday: number,
    budgetDaily: number,
    remaining: number,
  },
}
```

**Agent Logic:**
```typescript
// 1. Check notifications
if (result.pendingNotifications.length > 0) {
  // Process notifications
  await convex.mutation(api.notifications.markAllReadForAgent, { agentId });
}

// 2. Check pending tasks (already assigned)
if (result.pendingTasks.length > 0) {
  const task = result.pendingTasks[0];
  
  if (task.status === "ASSIGNED") {
    // Start the task
    await startTask(agentId, task._id);
  } else if (task.status === "IN_PROGRESS") {
    // Continue working on task
    await continueTask(agentId, task._id);
  }
  
  return; // Work on one task at a time
}

// 3. Claim new task if available
if (result.claimableTasks.length > 0) {
  const task = result.claimableTasks[0];
  await claimTask(agentId, task._id);
  return;
}

// 4. No work - stand by
console.log("HEARTBEAT_OK — No pending work");
```

### 3. Task Claiming

**When:** Agent finds claimable task in heartbeat response

**API Call:**
```typescript
await convex.mutation(api.tasks.assign, {
  taskId: "<task-id>",
  agentIds: [agentId],
  actorType: "AGENT",
  actorAgentId: agentId,
  idempotencyKey: `claim-${taskId}-${Date.now()}`,
});
```

**Result:** Task status changes from INBOX → ASSIGNED

### 4. Starting Task (ASSIGNED → IN_PROGRESS)

**When:** Agent is ready to work on assigned task

**API Call:**
```typescript
// 1. Post work plan
await convex.mutation(api.messages.postWorkPlan, {
  taskId: "<task-id>",
  agentId: "<agent-id>",
  bullets: [
    "1. Research competitor pricing models",
    "2. Analyze market trends",
    "3. Compile findings into report",
  ],
  estimatedCost: 2.50,
  idempotencyKey: `workplan-${taskId}-${Date.now()}`,
});

// 2. Transition to IN_PROGRESS
await convex.mutation(api.tasks.transition, {
  taskId: "<task-id>",
  toStatus: "IN_PROGRESS",
  actorType: "AGENT",
  actorAgentId: "<agent-id>",
  idempotencyKey: `start-${taskId}-${Date.now()}`,
  workPlan: {
    bullets: [...],
    estimatedCost: 2.50,
  },
});
```

### 5. Posting Progress

**When:** During task execution

**API Call:**
```typescript
await convex.mutation(api.messages.postProgress, {
  taskId: "<task-id>",
  agentId: "<agent-id>",
  content: "Completed competitor analysis. Found 5 key pricing models.",
  idempotencyKey: `progress-${taskId}-${Date.now()}`,
});
```

### 6. Requesting Approval (for RED actions)

**When:** Agent needs to perform RED-rated action

**API Call:**
```typescript
const result = await convex.mutation(api.approvals.request, {
  taskId: "<task-id>",
  requestorAgentId: "<agent-id>",
  actionType: "TOOL_CALL",
  actionSummary: "Send email to customer list",
  riskLevel: "RED",
  estimatedCost: 0.10,
  justification: "Need to notify customers of new pricing",
  expiresInMinutes: 60,
  metadata: {
    toolName: "send_email",
    recipients: ["customer-list@example.com"],
  },
});

const approvalId = result.approval._id;

// Poll for approval decision
while (true) {
  await sleep(5000); // Wait 5 seconds
  
  const approval = await convex.query(api.approvals.get, { approvalId });
  
  if (approval.status === "APPROVED") {
    // Proceed with action
    break;
  } else if (approval.status === "DENIED") {
    // Abort action
    throw new Error(`Approval denied: ${approval.decisionReason}`);
  } else if (approval.status === "EXPIRED") {
    // Request expired
    throw new Error("Approval request expired");
  }
}
```

### 7. Submitting for Review (IN_PROGRESS → REVIEW)

**When:** Task work is complete

**API Call:**
```typescript
// 1. Post deliverable
await convex.mutation(api.messages.post, {
  taskId: "<task-id>",
  authorType: "AGENT",
  authorAgentId: "<agent-id>",
  type: "ARTIFACT",
  content: "Competitor pricing analysis complete",
  artifacts: [
    { name: "pricing-analysis.md", url: "...", type: "document" },
    { name: "pricing-data.json", url: "...", type: "data" },
  ],
  idempotencyKey: `artifact-${taskId}-${Date.now()}`,
});

// 2. Transition to REVIEW
await convex.mutation(api.tasks.transition, {
  taskId: "<task-id>",
  toStatus: "REVIEW",
  actorType: "AGENT",
  actorAgentId: "<agent-id>",
  idempotencyKey: `review-${taskId}-${Date.now()}`,
  deliverable: {
    summary: "Completed competitor pricing analysis with 5 models",
    artifactIds: ["pricing-analysis.md", "pricing-data.json"],
  },
  reviewChecklist: [
    "✓ All 5 competitors analyzed",
    "✓ Data validated against public sources",
    "✓ Report formatted per template",
  ],
});
```

### 8. Tracking Runs and Tool Calls

**When:** Starting and completing execution turns

**Start Run:**
```typescript
const runResult = await convex.mutation(api.runs.start, {
  agentId: "<agent-id>",
  taskId: "<task-id>",
  sessionKey: "cursor-session-123",
  model: "claude-3.5-sonnet",
  idempotencyKey: `run-${taskId}-${Date.now()}`,
  metadata: { executor: "cursor" },
});

const runId = runResult.run._id;
```

**Complete Run:**
```typescript
await convex.mutation(api.runs.complete, {
  runId: "<run-id>",
  inputTokens: 1500,
  outputTokens: 800,
  costUsd: 0.025,
  status: "COMPLETED",
});
```

**Log Tool Call:**
```typescript
await convex.mutation(api.toolCalls.log, {
  runId: "<run-id>",
  agentId: "<agent-id>",
  taskId: "<task-id>",
  toolName: "web_search",
  riskLevel: "GREEN",
  inputPreview: "search query: competitor pricing",
  outputPreview: "found 10 results",
  costUsd: 0.005,
  durationMs: 1200,
  status: "SUCCESS",
});
```

---

## Agent Runner Package

The `packages/agent-runner/` package provides a reference implementation for agent integration.

### Usage

```bash
# Set environment variables
export CONVEX_URL=https://different-gopher-55.convex.cloud
export PROJECT_SLUG=openclaw
export AGENT_NAME=Scout
export AGENT_ROLE=SPECIALIST
export AGENT_TYPES=CUSTOMER_RESEARCH,SEO_RESEARCH
export AGENT_EMOJI=🔍

# Run agent
cd packages/agent-runner
pnpm dev
```

### What It Does

1. **Registers** agent with Mission Control (or finds existing)
2. **Sends heartbeat** every 15 minutes
3. **Claims tasks** from inbox matching agent's types
4. **Starts tasks** by posting work plan and transitioning to IN_PROGRESS
5. **Marks notifications** as read

### Extending for Full Integration

To integrate with actual OpenClaw agents, extend the runner to:

1. **Execute Real Work:**
   ```typescript
   async function executeTask(task) {
     // Call OpenClaw agent with task context
     const result = await openclawAgent.execute({
       task: task.title,
       description: task.description,
       workspace: AGENT_WORKSPACE,
     });
     
     // Post progress
     await postProgress(result.progress);
     
     // Submit for review
     await submitForReview(result.deliverable);
   }
   ```

2. **Handle Approvals:**
   ```typescript
   async function requestApprovalAndWait(action) {
     const approval = await requestApproval(action);
     return await pollForDecision(approval._id);
   }
   ```

3. **Track Costs:**
   ```typescript
   async function trackRun(task, fn) {
     const run = await startRun(task);
     try {
       const result = await fn();
       await completeRun(run, result.tokens, result.cost);
       return result;
     } catch (error) {
       await completeRun(run, 0, 0, error);
       throw error;
     }
   }
   ```

---

## Sofie as CAO Integration

Sofie is the Chief Agent Officer and has special authority:

### Sofie's Responsibilities

1. **Task Triage:** Assign tasks to appropriate agents
2. **Approval Decisions:** Approve or deny RED actions
3. **Dispute Resolution:** Resolve refute loops and conflicts
4. **Escalation Handling:** Handle budget spikes, policy violations, incidents

### How Agents Interact with Sofie

**1. Task Assignment:**
```typescript
// Sofie assigns task to agent
await convex.mutation(api.tasks.assign, {
  taskId: "<task-id>",
  agentIds: ["<agent-id>"],
  actorType: "AGENT",
  actorAgentId: "<sofie-id>",
  idempotencyKey: `sofie-assign-${taskId}-${Date.now()}`,
});
```

**2. Approval Escalation:**
```typescript
// Agent requests approval
const approval = await convex.mutation(api.approvals.request, {
  taskId: "<task-id>",
  requestorAgentId: "<agent-id>",
  actionType: "TOOL_CALL",
  actionSummary: "Deploy to production",
  riskLevel: "RED",
  // ... other fields
});

// Sofie (or policy automation) approves/denies
await convex.mutation(api.approvals.approve, {
  approvalId: approval._id,
  decidedByAgentId: "<sofie-id>",
  reason: "Deployment approved after review",
});
```

**3. Dispute Resolution:**
```typescript
// If agents disagree (refute loop), Sofie makes final call
await convex.mutation(api.messages.post, {
  taskId: "<task-id>",
  authorType: "AGENT",
  authorAgentId: "<sofie-id>",
  type: "DECISION",
  content: "Final decision: Proceed with Cipher's approach. Nova's concerns noted but risk is acceptable.",
  idempotencyKey: `sofie-decision-${taskId}-${Date.now()}`,
});
```

---

## Policy Enforcement

Agents must respect policy rules enforced by Mission Control:

### 1. Risk Levels

**GREEN** - Always allowed:
- read, web_search, web_fetch, memory_search

**YELLOW** - Requires approval for INTERN:
- write, edit, exec, bash, shell, browser

**RED** - Always requires approval:
- message, gateway, cron, deploy

### 2. Allowlists

**Shell Commands:**
- Allowed: ls, cat, grep, git, npm, pnpm, node, python
- Blocked: rm -rf, sudo, chmod 777, curl|bash, path traversal

**Network:**
- Allowed domains: api.convex.dev, github.com, npmjs.com
- Default deny for other domains

**Filesystem:**
- Read: All source files (*.ts, *.js, *.json, *.md, etc.)
- Write: Source files only (no config/, secrets/, .env)

### 3. Budget Limits

Per agent role (daily):
- **INTERN:** $2.00/day, $0.25/run
- **SPECIALIST:** $5.00/day, $0.75/run
- **LEAD:** $12.00/day, $1.50/run

**Enforcement:**
- Agent paused when daily budget exceeded
- Task moved to NEEDS_APPROVAL when task budget exceeded
- Alerts created for violations

### 4. Spawn Limits

- Max 30 agents globally
- Max 3 sub-agents per parent
- Max depth: 2 levels
- INTERN cannot spawn

---

## Task State Machine

Agents must follow the enforced state machine:

```
INBOX → ASSIGNED → IN_PROGRESS → REVIEW → DONE
                         ↓
                      BLOCKED
                         ↓
                   NEEDS_APPROVAL
```

### Required Artifacts

**ASSIGNED → IN_PROGRESS:**
- Work plan (3-6 bullets)
- Estimated cost

**IN_PROGRESS → REVIEW:**
- Deliverable summary
- Artifact IDs
- Review checklist (3+ items)

**REVIEW → DONE:**
- Approved approval record (if policy requires)

---

## Example: Full Task Lifecycle

```typescript
// 1. Agent registers
const { agentId, projectId } = await registerAgent();

// 2. Agent sends heartbeat
const heartbeat = await sendHeartbeat(agentId);

// 3. Agent claims task
if (heartbeat.claimableTasks.length > 0) {
  const task = heartbeat.claimableTasks[0];
  await claimTask(agentId, task._id);
}

// 4. Agent starts task
await postWorkPlan(task._id, [
  "1. Research competitors",
  "2. Analyze pricing",
  "3. Create report",
]);
await transitionTask(task._id, "IN_PROGRESS");

// 5. Agent executes work
const run = await startRun(agentId, task._id);
try {
  const result = await doWork(task);
  await completeRun(run._id, result.tokens, result.cost);
} catch (error) {
  await completeRun(run._id, 0, 0, error);
}

// 6. Agent posts progress
await postProgress(task._id, "Completed competitor analysis");

// 7. Agent requests approval (if needed)
if (needsApproval) {
  const approval = await requestApproval(task._id, action);
  await waitForApproval(approval._id);
}

// 8. Agent submits for review
await postArtifacts(task._id, artifacts);
await transitionTask(task._id, "REVIEW", {
  deliverable: { summary: "...", artifactIds: [...] },
  reviewChecklist: ["✓ ...", "✓ ...", "✓ ..."],
});

// 9. Reviewer approves
// (Done by another agent or human)

// 10. Task moves to DONE
await transitionTask(task._id, "DONE");
```

---

## Testing Integration

### 1. Register Test Agent

```bash
export CONVEX_URL=https://different-gopher-55.convex.cloud
export PROJECT_SLUG=openclaw
export AGENT_NAME=TestAgent
export AGENT_ROLE=INTERN
export AGENT_TYPES=CUSTOMER_RESEARCH

cd packages/agent-runner
pnpm dev
```

### 2. Verify in UI

1. Open https://mission-control-1nx3xil7e-jaydubya818.vercel.app
2. Check sidebar - should see "TestAgent"
3. Check status badge - should be "ACTIVE"

### 3. Create Test Task

In UI:
1. Click "Create Task"
2. Set type to "CUSTOMER_RESEARCH"
3. Set priority to 1
4. Save

### 4. Watch Agent Claim

Agent should:
1. Detect task in next heartbeat (within 15 min)
2. Claim task (status → ASSIGNED)
3. Start task (status → IN_PROGRESS)
4. Post work plan

### 5. Verify Timeline

1. Click task in Kanban
2. Open TaskDrawer
3. Check Timeline tab
4. Should see: transition events, work plan message

---

## Advanced Integration

### Sub-Agent Spawning

```typescript
// Parent agent spawns sub-agent
const subAgentResult = await convex.mutation(api.agents.register, {
  projectId: "<project-id>",
  name: "Scout-SubAgent-1",
  role: "INTERN",
  parentAgentId: "<parent-agent-id>",
  workspacePath: "/tmp/scout-subagent-1",
  allowedTaskTypes: ["DATA_COLLECTION"],
  metadata: {
    spawned: true,
    parentTask: "<task-id>",
  },
});
```

### Loop Detection Handling

If agent detects it's in a loop:

```typescript
// Check if task is blocked
const task = await convex.query(api.tasks.get, { taskId });

if (task.status === "BLOCKED" && task.blockedReason?.includes("Loop detected")) {
  // Stop work, notify Sofie
  await convex.mutation(api.messages.post, {
    taskId: task._id,
    authorType: "AGENT",
    authorAgentId: agentId,
    type: "ESCALATION",
    content: `Loop detected: ${task.blockedReason}. Requesting Sofie's intervention.`,
    idempotencyKey: `escalation-${taskId}-${Date.now()}`,
  });
  
  // Stand by
  return;
}
```

### Budget Awareness

```typescript
// Check budget before expensive operation
const agent = await convex.query(api.agents.get, { agentId });
const remaining = agent.budgetDaily - agent.spendToday;

if (estimatedCost > remaining) {
  console.warn(`Budget low: $${remaining.toFixed(2)} remaining`);
  
  // Request approval for budget increase or defer task
  await requestApproval({
    actionType: "BUDGET_INCREASE",
    actionSummary: "Need additional budget for task completion",
    estimatedCost: estimatedCost - remaining,
  });
}
```

---

## Error Handling

### Agent Paused

```typescript
try {
  await convex.mutation(api.tasks.transition, { ... });
} catch (error) {
  if (error.message.includes("Agent is paused")) {
    console.log("Agent paused - likely budget exceeded. Standing by.");
    // Wait for human to resume via /resume_squad
    return;
  }
  throw error;
}
```

### Task Budget Exceeded

```typescript
try {
  await convex.mutation(api.runs.start, { ... });
} catch (error) {
  if (error.message.includes("Task budget exceeded")) {
    console.log("Task budget exceeded - moved to NEEDS_APPROVAL");
    // Notify Sofie
    await notifySofie(taskId, "Task budget exceeded, needs approval to continue");
    return;
  }
  throw error;
}
```

### Policy Violation

```typescript
// Check policy before action
const policyCheck = await convex.query(api.policy.evaluate, {
  agentId: "<agent-id>",
  actionType: "TOOL_CALL",
  toolName: "shell",
  toolArgs: { command: "rm -rf /tmp/data" },
  estimatedCost: 0.01,
});

if (policyCheck.decision === "DENY") {
  console.error(`Action denied: ${policyCheck.reason}`);
  return;
} else if (policyCheck.decision === "NEEDS_APPROVAL") {
  // Request approval
  const approval = await requestApproval(...);
  await waitForApproval(approval._id);
}
```

---

## Best Practices

### 1. Idempotency
Always use idempotency keys to prevent duplicate operations:
```typescript
idempotencyKey: `${operation}-${taskId}-${Date.now()}`
```

### 2. Error Recovery
Wrap all API calls in try-catch and handle gracefully:
```typescript
try {
  await convex.mutation(...);
} catch (error) {
  console.error("API call failed:", error);
  // Retry with exponential backoff or escalate
}
```

### 3. Heartbeat Reliability
Use setInterval with error handling:
```typescript
const tick = () => runLoop(agentId).catch(console.error);
setInterval(tick, HEARTBEAT_INTERVAL_MS);
```

### 4. Budget Monitoring
Check budget before expensive operations:
```typescript
const agent = await getAgent(agentId);
if (agent.spendToday >= agent.budgetDaily * 0.9) {
  console.warn("Budget at 90% - conserve resources");
}
```

### 5. Graceful Shutdown
Handle SIGTERM/SIGINT:
```typescript
process.on("SIGTERM", async () => {
  await convex.mutation(api.agents.updateStatus, {
    agentId,
    status: "OFFLINE",
    reason: "Graceful shutdown",
  });
  process.exit(0);
});
```

---

## Monitoring and Observability

### Agent Health

Check in Mission Control UI:
- Sidebar shows agent status (ACTIVE, PAUSED, OFFLINE, QUARANTINED)
- Last heartbeat timestamp
- Budget usage (spend today / daily budget)

### Task Progress

Check in TaskDrawer:
- **Overview:** Current status, assignees, work plan
- **Timeline:** All events chronologically
- **Artifacts:** Deliverables and files
- **Approvals:** Approval requests and decisions
- **Cost:** Budget and run breakdown

### Alerts

Mission Control creates alerts for:
- Budget exceeded
- Loop detected
- Policy violation
- Agent offline > 30 minutes

---

## Troubleshooting

### Agent Not Claiming Tasks

**Check:**
1. Agent status is ACTIVE
2. Agent's allowedTaskTypes matches task type
3. Task is in INBOX status
4. No other agent has claimed it

### Heartbeat Failing

**Check:**
1. CONVEX_URL is correct
2. Agent is registered
3. Network connectivity
4. Convex deployment is running

### Approval Stuck

**Check:**
1. Approval is in PENDING status
2. Sofie or operator has been notified
3. Use Telegram `/my_approvals` to see pending
4. Use `/approve <id>` to approve

---

## Next Steps

1. **Test with agent-runner:** Run the reference implementation
2. **Integrate OpenClaw:** Connect real OpenClaw agents
3. **Deploy agents:** Run agents as services (PM2, Docker, etc.)
4. **Monitor:** Watch Mission Control UI and Telegram
5. **Iterate:** Refine based on real-world usage

---

**Ready to integrate!** 🤖
