# E2E Test Plan — Mission Control

**Version:** 1.0  
**Date:** 2026-02-21  
**Purpose:** Validate full system end-to-end

---

## Test Suite Overview

| Test ID | Name | Type | Duration | Priority |
|---------|------|------|----------|----------|
| A1 | Boot Validation | Smoke | <30s | Critical |
| A2 | Convex Connectivity | Smoke | <10s | Critical |
| B1 | Schema Sanity | Doctor | <10s | High |
| B2 | Agent Registry | Doctor | <30s | High |
| C1 | Inbox Lifecycle | Doctor | <60s | High |
| D1 | Content Drop | Doctor | <30s | Medium |
| E1 | Budget Ledger | Doctor | <30s | Medium |
| F1 | Workflow Execution | Doctor | <120s | High |

---

## A) Boot Validation

### A1: UI Starts Without Errors

**Command:**
```bash
timeout 10 pnpm run dev:ui &
sleep 5
curl -s http://localhost:5173 | head -20
```

**Expected:**
- Exit code 0
- Response contains HTML
- No runtime errors in console

**Logs:** Console output

---

### A2: Convex Dev Starts

**Command:**
```bash
timeout 15 npx convex dev &
sleep 10
curl -s $CONVEX_URL/health
```

**Expected:**
- HTTP 200
- Response: `{"status": "healthy"}`

**Logs:** `.env.local` (generated with deployment URL)

---

### A3: Orchestration Server Starts

**Command:**
```bash
timeout 10 pnpm run dev:orch &
sleep 5
curl -s http://localhost:3000/health
```

**Expected:**
- HTTP 200
- Response contains `status` field

**Logs:** Server stdout

---

## B) Convex + Data Layer

### B1: Schema Sanity Check

**Command:**
```bash
npx convex run api.health.schemaCheck
```

**Expected:**
- All required tables exist:
  - `agents` — Agent registry
  - `tasks` — Task lifecycle
  - `workflows` — Workflow definitions
  - `workflowRuns` — Workflow executions
  - `runs` — Agent execution runs
  - `approvals` — Approval requests

**Validation:**
```typescript
// Expected schema structure
agents: { agentId, name, emoji, role, status, lastHeartbeatAt }
tasks: { taskId, title, status, assigneeIds, createdAt }
workflows: { workflowId, name, steps, active }
```

---

### B2: Agent Registry Round Trip

**Steps:**
1. Create agent
2. List agents
3. Read back agent
4. Verify required fields

**Commands:**
```bash
# Create
npx convex run api.agents.register --arg '{
  "name": "TestAgent",
  "emoji": "🧪",
  "role": "INTERN",
  "allowedTaskTypes": ["ENGINEERING"]
}'

# List
npx convex run api.agents.list

# Verify fields present
```

**Expected:**
- Agent created with ID
- List contains new agent
- Required fields: name, emoji, role, status, createdAt

---

## C) Inbox Lifecycle

### C1: Full Task Lifecycle

**Steps:**
1. Create task in INBOX
2. Claim task (ASSIGNED)
3. Start work (IN_PROGRESS)
4. Complete task (DONE)

**Commands:**
```bash
# 1. Create
TASK_ID=$(npx convex run api.tasks.create --arg '{
  "title": "E2E Test Task",
  "type": "ENGINEERING",
  "priority": 2,
  "description": "Test task for E2E validation"
}' | jq -r '.taskId')

# 2. Claim
npx convex run api.tasks.assign --arg "{\"taskId\": \"$TASK_ID\", \"assigneeIds\": [\"test-agent-id\"]}"

# 3. Start
npx convex run api.tasks.transition --arg "{\"taskId\": \"$TASK_ID\", \"toStatus\": \"IN_PROGRESS\"}"

# 4. Complete
npx convex run api.tasks.transition --arg "{\"taskId\": \"$TASK_ID\", \"toStatus\": \"DONE\"}"

# Verify
npx convex run api.tasks.get --arg "{\"taskId\": \"$TASK_ID\"}"
```

**Expected:**
- Task status: DONE
- Assignee: test-agent-id
- State transitions logged

**Logs:** Task document in Convex dashboard

---

## D) Content Drop

### D1: Submit and Retrieve

**Command:**
```bash
# Submit
DROP_ID=$(npx convex run api.contentDrops.submit --arg '{
  "title": "E2E Test Drop",
  "contentType": "CODE_SNIPPET",
  "content": "console.log('Hello E2E')",
  "agentId": "test-agent"
}' | jq -r '.dropId')

# Retrieve
npx convex run api.contentDrops.get --arg "{\"dropId\": \"$DROP_ID\"}"
```

**Expected:**
- Drop created with ID
- Content matches submission
- Metadata: agentId, timestamp, contentType

---

## E) Budget Ledger

### E1: Write and Verify

**Command:**
```bash
# Write
npx convex run api.agents.recordSpend --arg '{
  "agentId": "test-agent",
  "amount": 0.05,
  "description": "E2E test spend"
}'

# Verify
npx convex run api.agents.get --arg '{"agentId": "test-agent"}'
# Check: totalSpend increased by 0.05
```

**Expected:**
- Spend recorded
- Budget remaining updated

---

## F) Workflow Execution

### F1: Feature Dev Workflow

**Command:**
```bash
npx convex run api.workflows.run --arg '{
  "workflowId": "feature-dev",
  "input": "Add a console.log statement to index.ts",
  "projectId": "test-project"
}'
```

**Expected:**
- Workflow run created
- Status progresses through steps
- Final status: COMPLETED or FAILED (with error)

**Timeout:** 120 seconds

---

### F2: Bug Fix Workflow

**Command:**
```bash
npx convex run api.workflows.run --arg '{
  "workflowId": "bug-fix",
  "input": "Fix typo in console.log",
  "projectId": "test-project"
}'
```

**Expected:**
- Workflow run created
- 6 steps execute
- Final status: COMPLETED

---

### F3: Security Audit Workflow

**Command:**
```bash
npx convex run api.workflows.run --arg '{
  "workflowId": "security-audit",
  "input": "Audit src/auth.ts for vulnerabilities",
  "projectId": "test-project"
}'
```

**Expected:**
- Audit-only mode (no changes)
- Report generated
- Status: COMPLETED

---

### F4: Code Review Workflow (if exists)

**Command:**
```bash
npx convex run api.workflows.run --arg '{
  "workflowId": "code-review",
  "input": "Review PR: Add logging",
  "projectId": "test-project"
}'
```

**Expected:**
- 4 steps: intake → review → verify → approve
- Decision: APPROVE or CHANGES_REQUESTED

---

## Success Criteria

### Smoke Tests (mc-smoke.sh)
- [ ] All env vars present
- [ ] Dependencies installed
- [ ] Workflows valid YAML
- [ ] Schema has required tables
- [ ] Packages exist

### Doctor Tests (mc-doctor.sh)
- [ ] Convex ping succeeds
- [ ] Agent registry works
- [ ] Inbox lifecycle completes
- [ ] Content drop round trip
- [ ] Budget ledger updates
- [ ] At least 2 workflows execute

### Full System
- [ ] UI loads
- [ ] Convex responds
- [ ] Orchestration starts
- [ ] End-to-end task flow works
- [ ] Workflows execute

---

## Failure Response

For each failure:
1. Log error with context
2. Identify root cause
3. Fix in smallest possible commit
4. Add regression test
5. Re-run full suite

---

## CI Integration

**GitHub Action should:**
1. Install deps: `pnpm install`
2. Run smoke: `./scripts/mc-smoke.sh`
3. Run typecheck: `pnpm run typecheck`
4. Run lint: `pnpm run lint`
5. Run unit tests: `pnpm run test`

**Note:** Full doctor tests require Convex deployment (skip in CI or use mock)
