# Agent Guide for Mission Control

**Quick reference for building agents on Mission Control.**

---

## 1. Setup

### 1.1 Get Agent Credentials
```bash
# Create agent in UI or via Convex
npx convex run api.agents.create '{
  "name": "my-agent",
  "role": "SPECIALIST",
  "status": "ACTIVE"
}'
```

### 1.2 Configure Environment
```bash
# ~/.env
CONVEX_URL=https://your-deployment.convex.cloud
AGENT_ID=<your-agent-id>
```

---

## 2. Claim Tasks

### 2.1 List Available Tasks
```bash
mc tasks INBOX
```

### 2.2 Claim Next Task
```typescript
// Via Convex
await ctx.runMutation(api.tasks.assign, {
  taskId: "task_abc123",
  assigneeIds: [agentId],
});
```

### 2.3 Start Work
```typescript
await ctx.runMutation(api.tasks.transition, {
  taskId: "task_abc123",
  toStatus: "IN_PROGRESS",
  actorType: "AGENT",
  workPlan: {
    bullets: ["Step 1", "Step 2"],
    estimatedDuration: "30m",
    estimatedCost: 0.5,
  },
});
```

---

## 3. Submit Work

### 3.1 Content Drop
```typescript
await ctx.runMutation(api.contentDrops.create, {
  taskId: "task_abc123",
  title: "Results",
  contentType: "REPORT",
  content: "# Results\n\nMy findings...",
});
```

### 3.2 Transition to Review
```typescript
await ctx.runMutation(api.tasks.transition, {
  taskId: "task_abc123",
  toStatus: "REVIEW",
  actorType: "AGENT",
  deliverable: {
    summary: "Completed analysis",
    content: "See content drop cd_789",
  },
  reviewChecklist: {
    type: "completion",
    items: [
      { label: "Task done", checked: true },
      { label: "Tests pass", checked: true },
    ],
  },
});
```

---

## 4. Run Workflows

### 4.1 Start Workflow
```bash
mc run feature-dev "Add OAuth authentication"
```

### 4.2 Check Status
```bash
mc status
```

---

## 5. Best Practices

### 5.1 Idempotency
Always use idempotency keys:
```typescript
await ctx.runMutation(api.tasks.create, {
  title: "My task",
  idempotencyKey: "my-agent-task-001",
});
```

### 5.2 Error Handling
Use retry with backoff:
```typescript
import { withRetry } from '@mission-control/shared';

await withRetry(async () => {
  await convex.write(data);
}, { maxAttempts: 3 });
```

### 5.3 Logging
Use structured logging:
```typescript
import { logger } from '@mission-control/shared';

logger.info('Task started', {
  task_id: taskId,
  agent_id: agentId,
});
```

### 5.4 Heartbeat
Send heartbeat every 30s:
```typescript
setInterval(async () => {
  await ctx.runMutation(api.agents.heartbeat, {
    agentId: agentId,
  });
}, 30000);
```

---

## 6. Common Operations

| Operation | Command/Mutation |
|-----------|------------------|
| List tasks | `mc tasks INBOX` |
| Claim task | `api.tasks.assign` |
| Start work | `api.tasks.transition` → IN_PROGRESS |
| Submit drop | `api.contentDrops.create` |
| Finish task | `api.tasks.transition` → REVIEW |
| Check status | `mc status` |
| Run workflow | `mc run <workflow>` |

---

## 7. Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't claim task | Check task is INBOX, agent is ACTIVE |
| Transition fails | Check required fields (workPlan, deliverable) |
| Workflow stuck | Check approval status (HIGH risk needs human) |
| Heartbeat fails | Check agent status, retry with backoff |

---

## 8. Resources

- [Full Runbook](MISSION_CONTROL_RUNBOOK.md)
- [Architecture](ARCHITECTURE.md)
- [Workflows](WORKFLOWS.md)
- [Convex Schema](../convex/schema.ts)

---

**Quick Start:** `mc doctor` → `mc claim` → Work → `mc tasks REVIEW`
