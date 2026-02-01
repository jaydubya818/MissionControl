# HEARTBEAT.md - Idempotent Heartbeat Checklist

Execute this checklist on every heartbeat. Each step is idempotent — safe to repeat.

---

## Heartbeat Checklist

### 1. ✅ Check In with Mission Control
```bash
RESPONSE=$(mc heartbeat --status HEALTHY --json)
```

**If error:** Log and continue with local-only operations.

---

### 2. ✅ Process Pending Notifications

```bash
NOTIFICATIONS=$(echo $RESPONSE | jq '.pendingNotifications')
```

For each notification:
- [ ] Read the notification content
- [ ] Navigate to referenced task if applicable
- [ ] Take appropriate action (respond, acknowledge, etc.)
- [ ] Mark as handled (auto on acknowledgment)

**Idempotency:** Re-processing a notification should not create duplicate responses. Check if you've already responded before posting.

---

### 3. ✅ Check Assigned Tasks

```bash
ASSIGNED=$(echo $RESPONSE | jq '.assignedTasks')
```

**If you have an IN_PROGRESS task:**
- [ ] Resume work on it
- [ ] Post progress update if significant time passed

**If you have ASSIGNED tasks but no IN_PROGRESS:**
- [ ] Pick highest priority ASSIGNED task
- [ ] Create work plan
- [ ] Transition to IN_PROGRESS

**If no assigned tasks:**
- [ ] Check INBOX for claimable tasks matching your role

---

### 4. ✅ Check Pending Approvals (if Lead)

```bash
APPROVALS=$(echo $RESPONSE | jq '.pendingApprovals')
```

If you can approve (Lead role, appropriate domain):
- [ ] Review approval request
- [ ] Verify justification and rollback plan
- [ ] Approve or deny with reason

---

### 5. ✅ Check Budget Status

```bash
mc agent status --json | jq '{spendToday, budgetDaily, remaining}'
```

- [ ] If >80% spent: Be conservative with remaining work
- [ ] If >95% spent: Wrap up current task, avoid starting new work
- [ ] If exceeded: You're likely paused — check for approval requests

---

### 6. ✅ Resume or Start Work

**If resuming IN_PROGRESS task:**
1. Read last progress comment
2. Continue from where you left off
3. Post progress if making significant headway

**If starting new task:**
1. Post work plan (3-6 bullets)
2. Transition ASSIGNED → IN_PROGRESS
3. Begin first action item

---

### 7. ✅ Check for Loops/Blocks

Before taking action:
- [ ] Am I repeating the same action that failed before?
- [ ] Have I been on this task through multiple heartbeats without progress?
- [ ] Am I in a back-and-forth with another agent?

**If yes to any:** Stop, post Loop Summary, request human help.

---

### 8. ✅ Report Status

After completing work or if nothing to do:

**If work completed:**
```bash
mc task comment $TASK_ID --type PROGRESS "
## What I Did
- [Actions taken]

## Next Step
- [What happens next]
"
```

**If nothing actionable:**
```
HEARTBEAT_OK - No pending tasks or notifications. [Brief status note if relevant]
```

---

## Idempotency Rules

| Action | Idempotency Key | Behavior if Repeated |
|--------|-----------------|---------------------|
| Heartbeat | `agent_id + timestamp(minute)` | Returns cached response |
| Claim task | `agent_id + task_id` | No-op if already assigned |
| Post comment | User-provided or auto-gen | Returns existing if match |
| Transition | `task_id + to_status + timestamp(5min)` | Returns existing transition |
| Create approval | `task_id + action_type` | Returns existing if pending |

---

## Error Recovery

### MC API Unreachable
1. Log the error
2. Continue with local-only work if safe
3. Retry MC connection next heartbeat
4. After 3 failed heartbeats: Alert locally, reduce operations

### Task State Conflict
1. Refresh task state from MC
2. If your transition was already made: Continue
3. If different transition happened: Abort your action, reassess

### Budget Error Mid-Task
1. Do not start new expensive operations
2. Save progress to comment
3. Submit partial work if applicable
4. Request budget override if needed

---

## Heartbeat Frequency

| Situation | Recommended Interval |
|-----------|---------------------|
| Active work | 5-10 minutes |
| Waiting for review | 15-30 minutes |
| Idle | 30-60 minutes |
| Night/weekend | 60+ minutes or paused |

---

## Quick Heartbeat Template

```markdown
# Heartbeat: [TIMESTAMP]

## MC Check
- Notifications: [N] pending
- Tasks: [ASSIGNED: X, IN_PROGRESS: Y]
- Approvals: [N] pending

## Current Focus
- Task: [task_id] - [title]
- Status: [status]
- Progress: [brief note]

## Actions This Heartbeat
- [Action 1]
- [Action 2]

## Next Heartbeat
- [What I'll do next]

## Budget
- Spent today: $X.XX / $Y.YY
```
