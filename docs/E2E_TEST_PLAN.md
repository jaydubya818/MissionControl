# E2E Test Plan — Mission Control (Deterministic Seed)

**Version:** 2.0  
**Date:** 2026-02-21  
**Purpose:** Validate full system end-to-end with deterministic seed data

---

## Overview

This test plan uses a **deterministic seed dataset** that is created, validated, and cleaned up automatically. All objects are prefixed with `E2E_<timestamp>_<shortid>` for isolation and cleanup.

**Lifecycle:**
1. **Seed** — Create test data via `./scripts/mc-seed-e2e.sh`
2. **Validate** — Run assertions against seeded data
3. **Cleanup** — Remove all E2E objects via `./scripts/mc-cleanup-e2e.sh`

---

## Seed Dataset

### A) Agents (2)

| Name | Role | Capabilities |
|------|------|--------------|
| `e2e_scout_<runId>` | SPECIALIST | repo_scan, workflow_boot, reporting |
| `e2e_executor_<runId>` | SPECIALIST | task_claim, state_advance, content_drop, budget_write |

### B) Inbox Tasks (3)

| Title | Type | Expected States |
|-------|------|-----------------|
| E2E: Verify inbox claim/complete | e2e_inbox_roundtrip | INBOX → ASSIGNED → IN_PROGRESS → DONE |
| E2E: Submit content drop | e2e_content_drop | drop exists + retrievable |
| E2E: Budget ledger write/read | e2e_budget_roundtrip | ledger entry exists + totals match |

### C) Content Drops (2)

| Title | Kind | Metadata |
|-------|------|----------|
| e2e-drop: hello | note | source: doctor, run_id |
| e2e-drop: structured | json | source: doctor, run_id, payload: {a:1,b:2} |

### D) Budget Ledger (2 entries)

| Entry | Amount | Expected Total |
|-------|--------|----------------|
| Credit | +1.00 | +0.75 |
| Debit | -0.25 | |

### E) Workflow Run (1)

- **Workflow:** feature-dev (or minimal e2e workflow)
- **Goal:** "Add a README line in /work/mc-e2e/toy-repo"
- **Must:** Not require external credentials

---

## Test Execution

### Quick Run

```bash
# 1. Seed data
./scripts/mc-seed-e2e.sh
# Output: RUN_ID=E2E_...

# 2. Run validation (uses seed data)
./scripts/mc-doctor.sh --e2e $RUN_ID

# 3. Cleanup
./scripts/mc-cleanup-e2e.sh $RUN_ID
```

### Full Validation (mc-doctor.sh)

**With E2E flag, doctor will:**
1. Skip placeholder warnings for CONVEX_URL
2. Seed data if not already present
3. Run all validations against seeded data
4. Report PASS/FAIL per subsystem
5. Cleanup on success (optional)

---

## Test Suite

| ID | Name | Command | Expected |
|----|------|---------|----------|
| S1 | Seed Creation | `mc-seed-e2e.sh` | 2 agents, 3 tasks, 2 drops, budget entries |
| V1 | Convex Ping | `convex run api.health.ping` | HTTP 200 |
| V2 | Agents Retrievable | `convex run api.agents.get` | Both agents exist with metadata |
| V3 | Inbox Roundtrip | Task lifecycle transitions | INBOX→ASSIGNED→IN_PROGRESS→DONE |
| V4 | Content Drops | `convex run api.e2e.validate` | 2 drops retrievable, metadata preserved |
| V5 | Budget Total | Calculate from activities | +0.75 units for run_id |
| V6 | Workflow Run | Check workflowRuns table | Run exists, reaches terminal state |
| C1 | Cleanup | `mc-cleanup-e2e.sh $RUN_ID` | All E2E objects deleted |

---

## Detailed Validation Steps

### V1: Convex Ping

```bash
npx convex run api.health.ping
```

**Expected:**
```json
{"status": "healthy", "timestamp": 1708544400000}
```

---

### V2: Agents Retrievable

```bash
npx convex run api.agents.get --arg '{"agentId": "<scout_id>"}'
npx convex run api.agents.get --arg '{"agentId": "<executor_id>"}'
```

**Expected:**
- Both agents exist
- metadata.e2eRunId matches RUN_ID
- Role is SPECIALIST
- Status is ACTIVE

---

### V3: Inbox Roundtrip

```bash
# Get inbox task
TASK_ID=$(npx convex run api.tasks.list --arg '{"status": "INBOX"}' | \
  jq -r '.[] | select(.metadata.e2eRunId == "'$RUN_ID'") | ._id')

# Claim
npx convex run api.tasks.assign --arg \
  '{"taskId": "'$TASK_ID'", "assigneeIds": ["<executor_id>"]}'

# Advance to IN_PROGRESS
npx convex run api.tasks.transition --arg \
  '{"taskId": "'$TASK_ID'", "toStatus": "IN_PROGRESS", "actorType": "AGENT"}'

# Complete
npx convex run api.tasks.transition --arg \
  '{"taskId": "'$TASK_ID'", "toStatus": "DONE", "actorType": "AGENT"}'

# Verify
npx convex run api.tasks.get --arg '{"taskId": "'$TASK_ID'"}'
```

**Expected:**
- Final status: DONE
- Assignee: e2e_executor
- State transitions logged

---

### V4: Content Drops Retrievable

```bash
npx convex run api.e2e.validate --arg '{"runId": "'$RUN_ID'"}'
```

**Expected:**
```json
{
  "contentDrops": {"found": 2, "expected": 2, "valid": true},
  "drops": [
    {"title": "e2e-drop: hello", "kind": "note"},
    {"title": "e2e-drop: structured", "kind": "json", "payload": {a:1,b:2}}
  ]
}
```

---

### V5: Budget Total

```bash
npx convex run api.e2e.validate --arg '{"runId": "'$RUN_ID'"}'
```

**Expected:**
```json
{
  "budget": {"total": 0.75, "expected": 0.75, "valid": true}
}
```

**Calculation:**
- Entry 1: +1.00 (credit)
- Entry 2: -0.25 (debit)
- Total: +0.75 ✓

---

### V6: Workflow Run State

```bash
# Get workflow run
npx convex run api.workflowRuns.get --arg '{"runId": "<workflow_run_id>"}'
```

**Expected:**
- Workflow ID: feature-dev
- Status: PENDING, RUNNING, or COMPLETED
- metadata.e2eRunId matches RUN_ID

---

### C1: Cleanup

```bash
./scripts/mc-cleanup-e2e.sh $RUN_ID
```

**Expected:**
```
Agents deleted: 2
Tasks deleted: 3
Content drops deleted: 2
Activities deleted: N
Workflow runs deleted: 1
```

**Verify:**
```bash
npx convex run api.e2e.validate --arg '{"runId": "'$RUN_ID'"}'
# Should return all counts as 0
```

---

## Scripts

### mc-seed-e2e.sh

Creates deterministic seed data with unique RUN_ID.

**Output:**
- RUN_ID
- Agent IDs
- Task IDs
- Content Drop IDs
- Budget total
- Workflow Run ID

**Artifacts:**
- Saves to `/tmp/mc-e2e-seed-${RUN_ID}.json`

### mc-doctor.sh --e2e $RUN_ID

Validates system using seeded data.

**Checks:**
- Convex reachable
- All seed objects exist
- State transitions work
- Budget totals match
- Workflow runs exist

**Output:**
- PASS/FAIL per subsystem
- Detailed error messages
- Summary statistics

### mc-cleanup-e2e.sh $RUN_ID

Deletes all E2E objects for given RUN_ID.

**Safety:**
- Only deletes objects with matching e2eRunId
- Logs all deletions
- Cannot delete non-E2E data

---

## CI Integration

### GitHub Action

```yaml
- name: E2E Test
  run: |
    # Seed
    RUN_ID=$(./scripts/mc-seed-e2e.sh | grep "RUN_ID=" | cut -d= -f2)
    
    # Validate
    ./scripts/mc-doctor.sh --e2e $RUN_ID
    
    # Cleanup
    ./scripts/mc-cleanup-e2e.sh $RUN_ID
  env:
    CONVEX_URL: ${{ secrets.CONVEX_URL }}
```

### Local Development

```bash
# Full cycle
./scripts/mc-seed-e2e.sh
# Copy RUN_ID from output
./scripts/mc-doctor.sh --e2e $RUN_ID
./scripts/mc-cleanup-e2e.sh $RUN_ID
```

---

## Success Criteria

### Seed Phase
- [ ] 2 agents created with E2E prefix
- [ ] 3 tasks created in INBOX
- [ ] 2 content drops created
- [ ] 2 budget entries (+1.00, -0.25)
- [ ] 1 workflow run created

### Validation Phase
- [ ] Convex ping returns 200
- [ ] Both agents retrievable with correct metadata
- [ ] Inbox task completes full lifecycle
- [ ] Content drops retrievable with metadata
- [ ] Budget total is +0.75
- [ ] Workflow run exists

### Cleanup Phase
- [ ] All E2E agents deleted
- [ ] All E2E tasks deleted
- [ ] All E2E drops deleted
- [ ] All E2E activities deleted
- [ ] E2E workflow runs deleted

---

## Failure Response

1. **Log** the RUN_ID and error context
2. **Diagnose** which validation failed
3. **Fix** root cause in source code
4. **Re-seed** and re-run validation
5. **Commit** fix with regression test
6. **Cleanup** after success

---

## Files

- `convex/e2e.ts` — Seed, cleanup, validate mutations
- `scripts/mc-seed-e2e.sh` — Seed script
- `scripts/mc-cleanup-e2e.sh` — Cleanup script
- `scripts/mc-doctor.sh` — Validation script (with --e2e flag)
- `docs/E2E_TEST_PLAN.md` — This document
