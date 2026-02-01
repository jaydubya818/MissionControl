# 5. Agent Integration Contract

## Overview

This document defines exactly how OpenClaw agents interact with Mission Control **before a UI exists**. Agents can use either CLI commands or direct HTTP calls.

---

## Integration Options

### Option 1: CLI (`mc` command)
```bash
# Install globally
npm install -g @openclaw/mission-control-cli

# Or use via npx
npx @openclaw/mc task list
```

### Option 2: HTTP API
Direct calls to `$MC_API_URL/api/v1/*`

### Option 3: OpenClaw Tool (Recommended)
A custom MCP tool that wraps the API for seamless agent use.

---

## Environment Configuration

Each agent needs these environment variables:

```bash
# Required
MC_API_URL=http://localhost:3100        # Mission Control API URL
MC_AGENT_ID=jordan                       # This agent's ID
MC_AGENT_TOKEN=mc_agt_xxx               # API token for this agent

# Optional
MC_WORKSPACE=/Users/jay/.openclaw/agents/jordan  # Agent workspace path
MC_DEFAULT_TIMEOUT=30000                 # Request timeout in ms
MC_LOG_LEVEL=info                        # debug | info | warn | error
```

**Config file alternative:** `~/.openclaw/mission-control.json`
```json
{
  "apiUrl": "http://localhost:3100",
  "agentId": "jordan",
  "token": "mc_agt_xxx",
  "workspace": "/Users/jay/.openclaw/agents/jordan"
}
```

---

## Agent Registration

Before an agent can participate, it must be registered:

### CLI
```bash
mc agent register \
  --id jordan \
  --name "Jordan" \
  --emoji "🎧" \
  --role SPECIALIST \
  --workspace /Users/jay/.openclaw/agents/jordan \
  --task-types CONTENT,SOCIAL,CUSTOMER_RESEARCH \
  --budget-daily 5.00 \
  --budget-per-run 0.75
```

### HTTP
```bash
curl -X POST $MC_API_URL/api/v1/agents \
  -H "Authorization: Bearer $MC_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "jordan",
    "name": "Jordan",
    "emoji": "🎧",
    "role": "SPECIALIST",
    "workspacePath": "/Users/jay/.openclaw/agents/jordan",
    "allowedTaskTypes": ["CONTENT", "SOCIAL", "CUSTOMER_RESEARCH"],
    "budgetDaily": 5.00,
    "budgetPerRun": 0.75
  }'
```

---

## Heartbeat Loop

Every agent heartbeat should include a Mission Control check:

### CLI
```bash
mc heartbeat --status HEALTHY
```

### HTTP
```bash
curl -X POST $MC_API_URL/api/v1/agents/$MC_AGENT_ID/heartbeat \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionKey": "session_abc123",
    "status": "HEALTHY",
    "currentTaskId": "task_xyz"
  }'
```

### Response
```json
{
  "acknowledged": true,
  "pendingNotifications": [
    {
      "id": "notif_1",
      "type": "MENTION",
      "title": "@jordan please review",
      "taskId": "task_123"
    }
  ],
  "pendingApprovals": [],
  "assignedTasks": [
    {
      "id": "task_456",
      "title": "Write blog post",
      "status": "ASSIGNED",
      "priority": 2
    }
  ]
}
```

---

## Task Operations

### List Tasks
```bash
# CLI
mc task list --status INBOX,ASSIGNED --type CONTENT --limit 10

# HTTP
curl "$MC_API_URL/api/v1/tasks?status=INBOX,ASSIGNED&type=CONTENT&limit=10" \
  -H "Authorization: Bearer $MC_AGENT_TOKEN"
```

### Claim a Task
```bash
# CLI
mc task claim task_123

# HTTP
curl -X PATCH $MC_API_URL/api/v1/tasks/task_123 \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assigneeIds": ["jordan"]
  }'
```

### Post Work Plan & Start
```bash
# CLI
mc task start task_123 \
  --plan "1. Research topic\n2. Write draft\n3. Add examples\n4. Self-review"

# HTTP
curl -X POST $MC_API_URL/api/v1/tasks/task_123/transition \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "toStatus": "IN_PROGRESS",
    "workPlan": {
      "bullets": [
        "Research topic",
        "Write draft",
        "Add examples",
        "Self-review"
      ],
      "estimatedCost": 2.50
    },
    "reason": "Claiming and starting work"
  }'
```

### Post Progress Comment
```bash
# CLI
mc task comment task_123 --type PROGRESS "Completed research phase. Starting draft."

# HTTP
curl -X POST $MC_API_URL/api/v1/tasks/task_123/messages \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "type": "PROGRESS",
    "content": "Completed research phase. Starting draft."
  }'
```

### Attach Artifact
```bash
# CLI
mc task artifact task_123 \
  --name "blog-post-draft.md" \
  --file ./output/blog-post-draft.md \
  --type DELIVERABLE

# HTTP (content inline)
curl -X POST $MC_API_URL/api/v1/tasks/task_123/messages \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ARTIFACT",
    "content": "Attached draft for review",
    "artifacts": [{
      "name": "blog-post-draft.md",
      "type": "DELIVERABLE",
      "content": "# My Blog Post\n\n..."
    }]
  }'
```

### Submit for Review
```bash
# CLI
mc task submit task_123 \
  --deliverable ./output/final.md \
  --checklist ./output/review-checklist.json

# HTTP
curl -X POST $MC_API_URL/api/v1/tasks/task_123/transition \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "toStatus": "REVIEW",
    "deliverable": {
      "content": "# Final Blog Post\n\n...",
      "artifacts": [
        { "name": "blog-post.md", "type": "DELIVERABLE" }
      ]
    },
    "reviewChecklist": {
      "type": "CONTENT",
      "items": [
        { "label": "Clear intent/audience", "checked": true },
        { "label": "Good structure", "checked": true },
        { "label": "Evidence cited", "checked": true },
        { "label": "CTA included", "checked": true },
        { "label": "Grammar checked", "checked": true }
      ]
    },
    "reason": "Ready for review"
  }'
```

---

## Approval Requests

### Request Approval
```bash
# CLI
mc approval request \
  --task task_123 \
  --action-type TOOL_EXEC \
  --summary "Execute shell command: git push origin main" \
  --risk RED \
  --justification "Need to deploy the fix" \
  --rollback "git revert HEAD"

# HTTP
curl -X POST $MC_API_URL/api/v1/approvals \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_123",
    "actionType": "TOOL_EXEC",
    "actionSummary": "Execute shell command: git push origin main",
    "riskLevel": "RED",
    "justification": "Need to deploy the fix",
    "rollbackPlan": "git revert HEAD",
    "estimatedCost": 0
  }'
```

### Check Approval Status
```bash
# CLI
mc approval check approval_456

# HTTP
curl $MC_API_URL/api/v1/approvals/approval_456 \
  -H "Authorization: Bearer $MC_AGENT_TOKEN"
```

### Response
```json
{
  "id": "approval_456",
  "status": "PENDING",
  "actionSummary": "Execute shell command: git push origin main",
  "riskLevel": "RED",
  "expiresAt": "2026-02-02T12:00:00Z"
}
```

---

## Policy Checks

Before executing risky actions, agents should check policy:

### CLI
```bash
mc policy check \
  --action-type TOOL_CALL \
  --tool exec \
  --args '{"command": "rm -rf /tmp/test"}'

# Output:
# Decision: DENY
# Risk Level: RED
# Reason: Command matches blocked pattern: rm -rf
```

### HTTP
```bash
curl -X POST $MC_API_URL/api/v1/policy/evaluate \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "jordan",
    "action": {
      "type": "TOOL_CALL",
      "tool": "exec",
      "command": "rm -rf /tmp/test"
    },
    "context": {
      "taskId": "task_123",
      "sessionKey": "session_abc"
    }
  }'
```

### Response
```json
{
  "decision": "DENY",
  "riskLevel": "RED",
  "reason": "Command matches blocked pattern: rm -rf",
  "violations": ["shell_blocklist:rm -rf"]
}
```

---

## Event Reporting

Agents should report runs and tool calls for cost tracking and auditing.

### Report Run Start
```bash
curl -X POST $MC_API_URL/api/v1/events/run \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: run_$(uuidgen)" \
  -d '{
    "agentId": "jordan",
    "taskId": "task_123",
    "sessionKey": "session_abc",
    "model": "claude-opus-4-5",
    "startedAt": "2026-02-01T10:00:00Z",
    "status": "RUNNING"
  }'
```

### Report Run Completion
```bash
curl -X PATCH $MC_API_URL/api/v1/events/run/run_789 \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endedAt": "2026-02-01T10:02:30Z",
    "inputTokens": 5000,
    "outputTokens": 1500,
    "costUsd": 0.45,
    "status": "COMPLETED"
  }'
```

### Report Tool Call
```bash
curl -X POST $MC_API_URL/api/v1/events/tool-call \
  -H "Authorization: Bearer $MC_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "run_789",
    "agentId": "jordan",
    "taskId": "task_123",
    "toolName": "web_search",
    "riskLevel": "GREEN",
    "inputPreview": "query: best practices for...",
    "startedAt": "2026-02-01T10:01:00Z",
    "status": "RUNNING"
  }'
```

---

## Payload Formats

### WorkPlan
```typescript
interface WorkPlan {
  bullets: string[];           // 3-6 action items
  estimatedCost?: number;      // Estimated $ cost
  estimatedDuration?: string;  // e.g., "2 hours"
  dependencies?: string[];     // Task IDs this depends on
}
```

### Deliverable
```typescript
interface Deliverable {
  content: string;             // Main content (markdown)
  artifacts: Artifact[];       // Attached files
  summary?: string;            // Brief summary
}

interface Artifact {
  name: string;                // Filename
  type: 'DELIVERABLE' | 'EVIDENCE' | 'CHECKLIST' | 'REPORT';
  content?: string;            // Inline content (small files)
  url?: string;                // External URL (large files)
  mimeType?: string;
}
```

### ReviewChecklist
```typescript
interface ReviewChecklist {
  type: TaskType;
  items: ChecklistItem[];
  notes?: string;
}

interface ChecklistItem {
  label: string;
  checked: boolean;
  note?: string;
}
```

### ApprovalRequest
```typescript
interface ApprovalRequest {
  taskId?: string;
  toolCallId?: string;
  actionType: 'TOOL_EXEC' | 'BUDGET_OVERRIDE' | 'STATE_TRANSITION' | 'SPAWN';
  actionSummary: string;       // What action needs approval
  riskLevel: 'YELLOW' | 'RED';
  actionPayload?: any;         // Full action details
  estimatedCost?: number;
  rollbackPlan?: string;       // How to undo if needed
  justification: string;       // Why this is needed
  expiresIn?: string;          // Default "24h"
}
```

---

## OpenClaw Tool Definition

For seamless integration, add this MCP tool to OpenClaw:

```typescript
// tools/mission-control.ts
export const missionControlTool = {
  name: 'mission_control',
  description: 'Interact with Mission Control for task management, approvals, and policy checks',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'heartbeat',
          'task_list', 'task_get', 'task_claim', 'task_start', 
          'task_comment', 'task_submit', 'task_artifact',
          'approval_request', 'approval_check',
          'policy_check',
          'report_run', 'report_tool_call'
        ]
      },
      taskId: { type: 'string' },
      content: { type: 'string' },
      // ... other params based on action
    },
    required: ['action']
  }
};
```

---

## Integration Checklist for New Agents

1. [ ] Set environment variables or create config file
2. [ ] Register agent with Mission Control
3. [ ] Add heartbeat check to agent's heartbeat loop
4. [ ] Handle pending notifications on heartbeat
5. [ ] Check policy before risky tool calls
6. [ ] Report runs and costs
7. [ ] Follow state machine for task transitions
8. [ ] Request approval when needed (YELLOW for specialists, all RED)
9. [ ] Attach deliverables before submitting to REVIEW

---

## Error Handling

All API calls may return errors. Handle gracefully:

```typescript
async function mcApiCall(endpoint: string, options: RequestInit) {
  const response = await fetch(`${MC_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${MC_AGENT_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Agent-Id': MC_AGENT_ID,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json();
    
    switch (response.status) {
      case 401:
        throw new Error('Unauthorized - check MC_AGENT_TOKEN');
      case 403:
        // Policy violation - may need approval
        if (error.error?.code === 'POLICY_VIOLATION') {
          return { needsApproval: true, reason: error.error.message };
        }
        throw new Error(`Forbidden: ${error.error?.message}`);
      case 409:
        // Idempotency conflict - already processed
        return { alreadyProcessed: true };
      case 429:
        // Rate limited - back off
        const retryAfter = response.headers.get('Retry-After') || '60';
        await sleep(parseInt(retryAfter) * 1000);
        return mcApiCall(endpoint, options); // Retry
      default:
        throw new Error(`MC API Error: ${error.error?.message || response.statusText}`);
    }
  }

  return response.json();
}
```
