# Mission Control Simplification Plan

**Version:** 1.0  
**Date:** 2026-02-21  
**Goal:** Reduce complexity, remove dead features, tighten UX for agents and humans

---

## Phase 0 — System Map Summary

### Current State
- **274 TypeScript files** across 17 packages + 2 apps
- **53 Convex functions** (mutations + queries)
- **4 workflows** (feature-dev, bug-fix, security-audit, code-review)
- **25 test files**
- **Complexity:** High — too many packages, unclear boundaries

### Entry Points
1. **UI** (`apps/mission-control-ui/`) — React + Vite frontend
2. **Convex** (`convex/`) — Database + serverless functions
3. **Orchestration** (`apps/orchestration-server/`) — Hono server + coordinator loop
4. **Workflows** (`workflows/*.yaml`) — Agent workflow definitions

---

## Keep / Fix / Remove Analysis

| Feature | Status | Reason |
|---------|--------|--------|
| **UI (mission-control-ui)** | ✅ KEEP | Essential for humans |
| **Convex backend** | ✅ KEEP | Core data layer |
| **Orchestration server** | ✅ KEEP | Heartbeat + agent management |
| **Coordinator loop** | ✅ KEEP | Task routing + workflow execution |
| **Agent runtime** | ✅ KEEP | Agent lifecycle management |
| **Memory** | ✅ KEEP | Agent context persistence |
| **Workflow engine** | ✅ KEEP | Workflow execution |
| **Policy engine** | ✅ KEEP | Governance + approvals |
| **State machine** | ✅ KEEP | Task state transitions |
| **Code-review workflow** | ✅ KEEP | Recently added, useful |
| **Feature-dev workflow** | ✅ KEEP | Primary workflow |
| **Bug-fix workflow** | ✅ KEEP | Primary workflow |
| **Security-audit workflow** | ✅ KEEP | Primary workflow |
| **Telegram bot** | ⚠️ FIX | Legacy, needs simplification |
| **Voice** | ❌ REMOVE | Unused, adds complexity |
| **Agent-runner** | ❌ REMOVE | Legacy, superseded by orchestration-server |
| **Meetings** | ⚠️ FIX | Rarely used, could simplify |
| **Telegraph** | ⚠️ FIX | Internal messaging, unclear usage |
| **Context-router** | ⚠️ FIX | Overlaps with memory |
| **Model-router** | ⚠️ FIX | Could be simpler |
| **17 packages** | ❌ REMOVE | Consolidate to 8-10 packages |

---

## Top 10 Friction Points for Agents

1. **Too many packages** — Hard to understand where code lives
2. **Unclear task lifecycle** — Complex state machine with many edge cases
3. **Missing simple CLI** — No `mc doctor` or `mc run` command
4. **Complex package imports** — `@mission-control/X` everywhere
5. **No structured logging** — Hard to debug agent issues
6. **Inconsistent naming** — `orch` vs `orchestration` vs `coordinator`
7. **Dead code** — telegram-bot, agent-runner packages
8. **Missing idempotency** — Duplicate task creates possible
9. **No simple status command** — Hard to check system health
10. **Complex approval flow** — Too many steps to complete task

---

## Top 10 Simplifications

1. **Consolidate packages (17 → 8)**
   - Merge: coordinator + orchestration-server → `orchestration`
   - Merge: context-router + memory → `memory`
   - Merge: model-router + agent-runtime → `runtime`
   - Remove: voice, agent-runner
   - Keep: UI, Convex, policy, state-machine, shared

2. **Create unified CLI** (`mc`)
   - `mc doctor` — Health check
   - `mc run <workflow>` — Run workflow
   - `mc status` — System status
   - `mc logs` — Structured logs

3. **Standardize naming**
   - `orchestration/` not `orch/`
   - `coordinator/` not `coordinator/`
   - Consistent file naming

4. **Simplify task states**
   - Current: 9 states (INBOX, ASSIGNED, IN_PROGRESS, REVIEW, NEEDS_APPROVAL, BLOCKED, FAILED, DONE, CANCELED)
   - Proposed: 5 states (TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED)

5. **Add structured logging**
   - Every log includes: timestamp, run_id, task_id, agent_id, status, error_code
   - JSON format for machine parsing

6. **Add idempotency keys**
   - All create operations require idempotencyKey
   - Prevents duplicates on retry

7. **Remove dead packages**
   - Delete `packages/voice/`
   - Delete `packages/agent-runner/`
   - Archive unused code

8. **Simplify approval flow**
   - Auto-approve LOW risk tasks
   - Only require human approval for HIGH risk
   - Reduce approval steps from 3 → 1

9. **Add exponential backoff**
   - Heartbeat failures retry with backoff
   - Convex write failures retry with jitter

10. **Create agent-first docs**
    - Single page: "How to build an agent for Mission Control"
    - Clear step-by-step guide

---

## Minimal "Agent-First" Happy Path

### 1. Start a Workflow Run

```bash
mc run feature-dev "Add OAuth2 authentication"
# Output: Run ID: run_abc123
```

**Behind the scenes:**
- Creates workflow run in Convex
- Queues tasks in INBOX
- Assigns to available agents

### 2. Claim a Task

```bash
mc claim --agent my-agent
# Output: Task ID: task_xyz789
```

**Behind the scenes:**
- Fetches task from INBOX
- Assigns to agent
- Transitions to IN_PROGRESS

### 3. Submit a Content Drop

```bash
mc drop --task task_xyz789 --file ./results.md
# Output: Drop ID: drop_def456
```

**Behind the scenes:**
- Uploads content to Convex
- Links to task
- Updates task status

### 4. Update Budget

```bash
mc spend --agent my-agent --amount 0.50
# Output: Budget remaining: $9.50
```

**Behind the scenes:**
- Records spend in Convex
- Updates agent budget
- Alerts if budget exceeded

### 5. See Status

```bash
mc status --run run_abc123
# Output:
# Run: run_abc123
# Status: IN_PROGRESS (3/7 steps)
# Tasks: 2 done, 1 in progress
# Agents: 2 active
```

---

## Acceptance Criteria

### For CLI (`mc`)
- [ ] `mc doctor` returns PASS/FAIL in <30s
- [ ] `mc run <workflow>` creates run and returns run_id
- [ ] `mc status --run <id>` shows current state
- [ ] `mc logs --run <id>` shows structured logs

### For Simplification
- [ ] Package count: 17 → 8
- [ ] Dead packages removed: voice, agent-runner
- [ ] Task states: 9 → 5
- [ ] All tests pass
- [ ] E2E tests pass (mc-smoke, mc-doctor)

### For Logging
- [ ] Every log has: timestamp, run_id, task_id, agent_id, step_id, status
- [ ] Logs are JSON format
- [ ] Logs include error_code on failure

### For Reliability
- [ ] Heartbeat has exponential backoff (1s, 2s, 4s, 8s)
- [ ] All creates use idempotencyKey
- [ ] No duplicate tasks created on retry

---

## Files to Touch

### Phase 1: Planning (this doc)
- `docs/SIMPLIFICATION_PLAN.md` ✅

### Phase 2: Verification Harness
- `docs/E2E_TEST_PLAN.md` — Update with new acceptance criteria
- `scripts/mc-smoke.sh` — Ensure covers simplified system
- `scripts/mc-doctor.sh` — Ensure covers simplified system
- `scripts/mc-seed-e2e.sh` — Seed for testing
- `.github/workflows/ci.yml` — CI pipeline

### Phase 3: Implementation
- `packages/` — Consolidate packages
- `apps/orchestration-server/` — Simplify, add CLI entrypoint
- `convex/` — Simplify task states
- `package.json` — Update scripts for `mc` CLI

### Phase 4: Documentation
- `docs/MISSION_CONTROL_RUNBOOK.md` — Simplified operations
- `docs/INTEGRATION_REPORT.md` — What changed
- `README.md` — Simplified setup

---

## Next Steps

1. **Phase 2:** Verify current system works (smoke + doctor)
2. **Phase 3:** Implement simplifications (small commits)
3. **Phase 4:** Seed backlog tasks in Mission Control INBOX

---

**Status:** Phase 1 Complete ✅  
**Ready for:** Phase 2 (Verification)
