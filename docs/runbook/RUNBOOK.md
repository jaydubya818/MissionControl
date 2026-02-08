# Mission Control - Operations Runbook

**Version:** 0.9.0  
**Last Updated:** 2026-02-01

---

## Table of Contents

0. [Mission Control (Convex) — Current](#mission-control-convex--current)
1. [Sofie as CAO (Chief Agent Officer)](#sofie-as-cao-chief-agent-officer)
2. [Multi-Project Workspaces](#multi-project-workspaces)
3. [Startup Procedures](#startup-procedures)
4. [Shutdown Procedures](#shutdown-procedures)
5. [Health Checks](#health-checks)
6. [Common Incidents](#common-incidents)
7. [Recovery Procedures](#recovery-procedures)
8. [Maintenance](#maintenance)
9. [Monitoring](#monitoring)

---

## Mission Control (Convex) — Current

Mission Control uses **Convex** as the backend (no separate REST API). The UI and agent-runner talk to Convex directly.

### Startup (local)

```bash
# 1. Install and set Convex URL (from .env.local after npx convex dev once)
pnpm install
export VITE_CONVEX_URL="https://your-deployment.convex.cloud"   # or use .env.local

# 2. Start Convex + UI
pnpm dev

# 3. Seed data (once)
pnpm run convex:seed

# 4. (Optional) Run a minimal agent loop (register + heartbeat + claim/start tasks)
CONVEX_URL="$VITE_CONVEX_URL" pnpm run agent:run:scout    # Terminal 2
# Or: CONVEX_URL="$VITE_CONVEX_URL" pnpm run agent:run:scribe
```

### URLs

- **UI:** http://localhost:5173 (or port Vite prints)
- **Convex dashboard:** https://dashboard.convex.dev

### Operator actions (via UI)

- **Pause all agents:** Sidebar → "Pause squad"
- **Approvals:** Sidebar → "Approvals" → Approve/Deny
- **Notifications:** Sidebar → "Notifications" (all agents’ notifications)
- **Standup:** Sidebar → "Standup" (daily summary: agents, tasks, approvals)
- **Policy:** Sidebar → "Policy" (view active policy)
- **Create task:** Header → "+ New task"
- **Move task:** Kanban card → "Move to" dropdown or drag to column

### Agent runner (minimal loop)

The `@mission-control/agent-runner` package runs a single agent process: register (or reuse), then every 15 min heartbeat; if there are assigned tasks, start one; if there are claimable INBOX tasks, claim one. Use for testing or as a reference for OpenClaw integration.

---

## Sofie as CAO (Chief Agent Officer)

**Sofie** is the Chief Agent Officer for OpenClaw and the top-level authority for Mission Control execution.

### CAO Responsibilities

1. **Task Triage + Assignment** - Sofie reviews the inbox and assigns tasks to appropriate agents based on their roles, allowed task types, and current workload.

2. **Approval Decisions** - Sofie approves or denies requests directly (via the Approvals inbox) or configures policy automation for automatic approval of low-risk actions.

3. **Dispute Resolution** - When agents disagree (refute loops, conflicting recommendations), Sofie makes the final call.

4. **Escalation Handling** - Sofie handles budget spikes, policy violations, and incidents. When containment kicks in (agent paused, task blocked), Sofie reviews and decides next steps.

### CAO Authority Rules

- **All agents report to Sofie** - Specialists, reviewers, challengers, interns, and sub-agents all operate under Sofie's governance.
- **No self-promotion of autonomy** - Agents cannot increase their own permissions or budget without approval.
- **RED actions require approval** - Any RED-classified action requires an approval record authorized by Sofie or policy.
- **Spawn requests must be logged** - Sub-agent creation must be logged and authorized per Sofie's governance rules.

### Conflict Resolution

- **DB is canonical** - Telegram/threads are for collaboration, but Mission Control DB is the source of truth.
- **If instructions conflict, Sofie wins** - Agent outputs must be posted back to Mission Control; if there's a conflict between instructions, Sofie's directives take precedence.

### Operating as Sofie

When you (the human operator) are making decisions in Mission Control, you are acting as Sofie (or on Sofie's behalf). This includes:
- Approving/denying requests in the Approvals inbox
- Moving tasks through the state machine (especially REVIEW → DONE)
- Pausing/resuming/quarantining agents
- Resolving blocked tasks

---

## Multi-Project Workspaces

Mission Control supports multiple projects (workspaces). Every entity is scoped to a project.

### Switching Projects

Use the project dropdown in the UI header to switch between projects. All views (Kanban, Approvals, Live Feed, Standup) filter by the selected project.

### Creating Projects

Projects can be created via Convex:

```typescript
// Create a new project
const result = await convex.mutation(api.projects.create, {
  name: "SiteGPT",
  slug: "sitegpt",
  description: "AI-powered website assistant",
});
```

### Default Project

The seed script creates an "OpenClaw" default project. All seeded agents and tasks belong to this project.

### Per-Project Operations

When operating on a project:
- **Pause squad** affects only agents in the current project
- **Resume squad** affects only paused agents in the current project
- **Standup report** shows stats for the current project only

See [docs/MULTI_PROJECT_MODEL.md](MULTI_PROJECT_MODEL.md) for complete documentation.

```bash
# From repo root; CONVEX_URL or VITE_CONVEX_URL must be set
pnpm run agent:run              # Uses AGENT_NAME=Scout default
pnpm run agent:run:scout        # Scout (INTERN, CUSTOMER_RESEARCH, SEO_RESEARCH)
pnpm run agent:run:scribe       # Scribe (INTERN, DOCS, CONTENT)

# Custom agent
AGENT_NAME=MyAgent AGENT_ROLE=SPECIALIST AGENT_TYPES=CONTENT,SOCIAL pnpm run agent:run
```

### Convex crons (automatic)

- **Expire approvals:** Every 15 min (`api.approvals.expireStale`)
- **Daily standup:** 09:00 UTC (`api.standup.runDaily`) — report saved to activities

### Health

- Convex: dashboard.convex.dev → your deployment
- UI: open app and check Mission Queue loads
- Agents: Sidebar shows agent list; "X Agents Active" in header

---

## Startup Procedures

### Local Development

```bash
# 1. Start Convex dev server
pnpm run convex:dev

# 2. Start UI (separate terminal or use pnpm dev for both)
pnpm run dev:ui

# 3. Verify
open http://localhost:5173
```

### Docker Deployment

```bash
# 1. Ensure environment variables are set
cp .env.example .env
vim .env  # Fill in Convex credentials

# 2. Start all services
docker-compose up -d

# 3. View logs
docker-compose logs -f

# 4. Verify services
docker-compose ps
curl http://localhost:3000/health
```

### Production (VPS)

```bash
# 1. SSH into VPS
ssh user@your-vps-ip

# 2. Navigate to project directory
cd /opt/mission-control

# 3. Pull latest changes
git pull origin main

# 4. Rebuild if needed
docker-compose build

# 5. Start services
docker-compose up -d

# 6. Verify health
curl http://localhost:3000/health
```

---

## Shutdown Procedures

### Graceful Shutdown

```bash
# 1. Pause all agents (prevents new work)
curl -X POST http://localhost:3000/api/emergency/pause-squad

# 2. Wait for in-progress tasks to complete (check status)
curl http://localhost:3000/api/tasks?status=in_progress

# 3. Stop services
docker-compose down

# 4. Backup database (if needed)
npm run backup
```

### Emergency Shutdown

```bash
# Immediate stop (no graceful drain)
docker-compose down --timeout 10
```

---

## Health Checks

### API Health

```bash
# Basic health check
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": 1706745600000,
#   "services": {
#     "api": "ok",
#     "convex": "ok",
#     "workers": "ok"
#   }
# }
```

### Convex Connection

```bash
# Check Convex dashboard
open https://dashboard.convex.dev

# Verify tables exist
npx convex run --prod agents:list
```

### Workers Running

```bash
# Check worker logs
docker-compose logs workers

# Should see heartbeat logs every 30s
# [HeartbeatMonitor] Checking agent liveness...
# [NotificationDispatcher] Processing notifications...
```

### Agent Liveness

```bash
# List agents with last heartbeat
curl http://localhost:3000/api/agents

# Check for stale agents (lastHeartbeat > 5 min ago)
```

---

## Common Incidents

### 1. Budget Exceeded

**Symptoms:**
- Task status changes to `needs_approval` or `blocked`
- Alert: "Budget exceeded"
- Agent paused

**Resolution:**
```bash
# 1. Check spend
curl http://localhost:3000/api/costs/agent/{agentId}

# 2. Review recent runs
curl http://localhost:3000/api/runs?agentId={agentId}&limit=10

# 3. Identify expensive operations
# Look for high-cost tool calls or loops

# 4. Options:
# a) Increase budget (if justified)
curl -X PATCH http://localhost:3000/api/agents/{agentId} \
  -d '{"budgets": {"dailyCap": 20}}'

# b) Quarantine agent (if runaway)
curl -X POST http://localhost:3000/api/agents/{agentId}/quarantine

# c) Approve task to continue
curl -X POST http://localhost:3000/api/approvals/{approvalId}/approve \
  -d '{"approver": "operator", "decision": "Approved with increased budget"}'
```

---

### 2. Loop Detected

**Symptoms:**
- Task status changes to `blocked`
- Alert: "Loop detected"
- High comment rate or review cycles

**Resolution:**
```bash
# 1. Check task timeline
curl http://localhost:3000/api/tasks/{taskId}/timeline

# 2. Review Loop Summary document
# Should be auto-generated in task artifacts

# 3. Identify root cause:
# - Agents disagreeing on approach
# - Unclear requirements
# - Tool failures causing retries

# 4. Options:
# a) Clarify requirements and unblock
curl -X POST http://localhost:3000/api/tasks/{taskId}/transition \
  -d '{
    "toStatus": "assigned",
    "actor": "human",
    "reason": "Clarified requirements: use approach X",
    "idempotencyKey": "manual-unblock-123"
  }'

# b) Reassign to different agent
curl -X PATCH http://localhost:3000/api/tasks/{taskId} \
  -d '{"assigneeIds": ["{newAgentId}"]}'

# c) Cancel task if unrecoverable
curl -X POST http://localhost:3000/api/tasks/{taskId}/transition \
  -d '{
    "toStatus": "canceled",
    "actor": "human",
    "reason": "Loop unrecoverable, requirements unclear",
    "idempotencyKey": "cancel-loop-123"
  }'
```

---

### 3. Agent Stuck

**Symptoms:**
- Agent `lastHeartbeat` > 5 minutes ago
- Task stuck in `in_progress`
- No recent activity

**Resolution:**
```bash
# 1. Check agent status
curl http://localhost:3000/api/agents/{agentId}

# 2. Check current task
curl http://localhost:3000/api/tasks/{taskId}

# 3. Check recent runs
curl http://localhost:3000/api/runs?agentId={agentId}&limit=5

# 4. Options:
# a) Restart agent
curl -X POST http://localhost:3000/api/agents/{agentId}/restart

# b) Reassign task
curl -X PATCH http://localhost:3000/api/tasks/{taskId} \
  -d '{"assigneeIds": ["{newAgentId}"]}'

# c) Quarantine agent if repeatedly stuck
curl -X POST http://localhost:3000/api/agents/{agentId}/quarantine
```

---

### 4. Database Corruption

**Symptoms:**
- API errors: "Invalid task status"
- State machine validation failures
- Missing required fields

**Resolution:**
```bash
# 1. Stop all services
docker-compose down

# 2. Restore from backup
npm run restore -- --backup=./backups/latest.json

# 3. Verify data integrity
npm run verify-db

# 4. Restart services
docker-compose up -d

# 5. Check health
curl http://localhost:3000/health
```

---

### 5. Runaway Costs

**Symptoms:**
- Multiple budget alerts
- Spend spike in cost dashboard
- Many agents paused

**Resolution:**
```bash
# 1. Emergency stop all agents
curl -X POST http://localhost:3000/api/emergency/pause-squad

# 2. Check total spend today
curl http://localhost:3000/api/costs/daily

# 3. Identify culprits
curl http://localhost:3000/api/agents?sortBy=todaySpend&order=desc

# 4. Review expensive runs
curl http://localhost:3000/api/runs?sortBy=cost&order=desc&limit=20

# 5. Quarantine expensive agents
for agentId in {list}; do
  curl -X POST http://localhost:3000/api/agents/$agentId/quarantine
done

# 6. Investigate root cause:
# - Model misconfiguration (using expensive model)
# - Loop causing repeated LLM calls
# - Tool failures causing retries

# 7. Fix and restart selectively
```

---

## Recovery Procedures

### Restore from Backup

```bash
# 1. Stop services
docker-compose down

# 2. List available backups
ls -lh ./backups/

# 3. Restore specific backup
npm run restore -- --backup=./backups/2026-02-01-09-00.json

# 4. Verify restoration
npm run verify-db

# 5. Restart services
docker-compose up -d
```

### Rollback Deployment

```bash
# 1. Stop current version
docker-compose down

# 2. Checkout previous version
git checkout <previous-commit-hash>

# 3. Rebuild
docker-compose build

# 4. Start services
docker-compose up -d

# 5. Verify health
curl http://localhost:3000/health
```

### Reset Agent State

```bash
# If agent is in bad state, reset to clean slate
curl -X PATCH http://localhost:3000/api/agents/{agentId} \
  -d '{
    "status": "active",
    "errorStreak": 0,
    "todaySpend": 0,
    "currentTaskId": null
  }'
```

---

## Maintenance

### Daily Tasks

```bash
# 1. Check alerts
curl http://localhost:3000/api/alerts?resolved=false

# 2. Review daily standup
# Auto-generated at 9am, check logs or dashboard

# 3. Check spend
curl http://localhost:3000/api/costs/daily

# 4. Verify backups
ls -lh ./backups/ | tail -5
```

### Weekly Tasks

```bash
# 1. Review agent performance
curl http://localhost:3000/api/agents?sortBy=totalSpend&order=desc

# 2. Check for stale tasks
curl http://localhost:3000/api/tasks?status=blocked,needs_approval

# 3. Clean up old data (optional)
npm run cleanup -- --older-than=30d

# 4. Update dependencies
npm outdated
npm update
```

### Monthly Tasks

```bash
# 1. Review policy effectiveness
# Check approval rates, budget breach frequency

# 2. Tune budgets if needed
# Adjust based on actual spend patterns

# 3. Archive old tasks
npm run archive -- --older-than=90d

# 4. Security audit
npm audit
npm run security-check
```

---

## Monitoring

### Key Metrics

1. **Agent Health**
   - Active agents count
   - Average error streak
   - Stale agents (lastHeartbeat > 5 min)

2. **Task Throughput**
   - Tasks completed per day
   - Average time to completion
   - % tasks reaching Review without intervention

3. **Cost**
   - Total spend per day
   - Spend by agent
   - Spend by task type

4. **Incidents**
   - Budget breaches per day
   - Loops detected per day
   - Approval requests per day

### Alerting

Set up alerts for:
- Any critical alert (severity=critical)
- Budget breach (type=budget_exceeded)
- Loop detected (type=loop_detected)
- Agent error streak > 3
- API health check fails
- Worker heartbeat missed

### Logs

```bash
# API logs
docker-compose logs api -f

# Worker logs
docker-compose logs workers -f

# All logs
docker-compose logs -f

# Filter by level
docker-compose logs | grep ERROR
docker-compose logs | grep WARN
```

---

## Emergency Contacts

- **Primary Operator:** Jarrett West
- **Backup Operator:** TBD
- **Convex Support:** https://convex.dev/support
- **OpenClaw Support:** TBD

---

## Appendix: Useful Commands

```bash
# Quick status check
curl -s http://localhost:3000/health | jq

# List all agents
curl -s http://localhost:3000/api/agents | jq

# List tasks by status
curl -s http://localhost:3000/api/tasks?status=in_progress | jq

# Get task timeline
curl -s http://localhost:3000/api/tasks/{id}/timeline | jq

# Pause all agents
curl -X POST http://localhost:3000/api/emergency/pause-squad

# Quarantine agent
curl -X POST http://localhost:3000/api/agents/{id}/quarantine

# Approve action
curl -X POST http://localhost:3000/api/approvals/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{"approver": "operator", "decision": "Approved"}'

# Export audit logs
curl -s "http://localhost:3000/api/audit/export?startDate=2026-02-01&endDate=2026-02-02" > audit.json
```

---

**End of Runbook**
