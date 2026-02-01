# STATE_MACHINE.md - Task State Machine

## Status Definitions

| Status | Description | Who Can Enter | Exit To |
|--------|-------------|---------------|---------|
| **INBOX** | New task, not yet assigned | System, Human | ASSIGNED, CANCELED |
| **ASSIGNED** | Task assigned to agent(s) | Human, Lead Agent | IN_PROGRESS, INBOX, CANCELED |
| **IN_PROGRESS** | Agent actively working | Assigned Agent | REVIEW, BLOCKED, NEEDS_APPROVAL |
| **REVIEW** | Submitted for review | Assigned Agent | IN_PROGRESS (revisions), DONE, BLOCKED |
| **NEEDS_APPROVAL** | Waiting for human approval | System, Agent | Any (after approval) |
| **BLOCKED** | Cannot proceed | System, Human | IN_PROGRESS, NEEDS_APPROVAL, CANCELED |
| **DONE** | Completed and approved | Human (default), Lead (if policy allows) | — |
| **CANCELED** | Abandoned | Human | — |

---

## Transition Matrix

```
                    INBOX  ASSIGNED  IN_PROGRESS  REVIEW  NEEDS_APPROVAL  BLOCKED  DONE  CANCELED
From INBOX            —      ✓           —          —          —            —       —       ✓
From ASSIGNED         ✓      —           ✓          —          —            —       —       ✓
From IN_PROGRESS      —      —           —          ✓          ✓            ✓       —       ✓
From REVIEW           —      —           ✓          —          ✓            ✓       ✓*      ✓
From NEEDS_APPROVAL   ✓      ✓           ✓          ✓          —            ✓       ✓       ✓
From BLOCKED          —      ✓           ✓          —          ✓            —       —       ✓
From DONE             —      —           —          —          —            —       —       —
From CANCELED         —      —           —          —          —            —       —       —

✓* = Requires human approval by default
```

---

## Transition Rules

### INBOX → ASSIGNED
- **Who:** Human or Lead Agent
- **Required:** `assigneeIds` must be non-empty
- **Artifacts:** None

### ASSIGNED → IN_PROGRESS
- **Who:** Assigned Agent
- **Required:** 
  - `workPlan` with 3-6 bullets
  - `assigneeIds` still non-empty
- **Artifacts:** WorkPlan comment posted

### IN_PROGRESS → REVIEW
- **Who:** Assigned Agent
- **Required:**
  - `deliverable` attached
  - `reviewChecklist` completed (self-review)
  - Cost summary (auto-calculated from runs)
- **Artifacts:** Deliverable + Checklist attached

### REVIEW → IN_PROGRESS
- **Who:** Reviewer (Agent or Human)
- **Required:** Revision feedback provided
- **Artifacts:** Review comment with requested changes
- **Note:** Increments `reviewCycles` counter

### REVIEW → DONE
- **Who:** Human (default), Lead Agent (if policy allows)
- **Required:**
  - Approval record
  - Deliverable confirmed acceptable
  - Decision note
- **Artifacts:** Approval comment

### Any → NEEDS_APPROVAL
- **Who:** System or Agent
- **Trigger:** 
  - Budget exceeded
  - RED action requested
  - YELLOW action (for Intern)
  - Manual escalation
- **Required:** Approval request created

### Any → BLOCKED
- **Who:** System or Human
- **Trigger:**
  - Loop detected
  - Repeated tool failures (≥3)
  - External dependency unavailable
  - Manual block
- **Required:** Block reason documented

---

## Required Artifacts by Status

### Entering IN_PROGRESS
```typescript
interface WorkPlan {
  bullets: string[];      // 3-6 action items
  estimatedCost?: number;
  estimatedDuration?: string;
}
```

### Entering REVIEW
```typescript
interface ReviewSubmission {
  deliverable: {
    content: string;
    artifacts: Artifact[];
  };
  reviewChecklist: {
    type: TaskType;
    items: ChecklistItem[];
  };
  // Auto-populated:
  costSummary: {
    totalCost: number;
    runCount: number;
    tokenCount: number;
  };
}
```

### Entering DONE
```typescript
interface CompletionRecord {
  approvalId?: string;      // If approval was required
  approvedBy: string;       // User or agent ID
  approvedAt: string;       // ISO timestamp
  decisionNote?: string;    // Why approved
}
```

---

## Agent Permissions

| Role | Can Transition |
|------|----------------|
| **Intern** | ASSIGNED→IN_PROGRESS, IN_PROGRESS→REVIEW only |
| **Specialist** | Above + IN_PROGRESS→BLOCKED (self), claim from INBOX |
| **Lead** | Above + REVIEW→DONE (if policy allows), INBOX→ASSIGNED |
| **Human** | All transitions |
| **System** | Any→BLOCKED, Any→NEEDS_APPROVAL |

---

## Validation Errors

If a transition is invalid, the API returns:

```json
{
  "success": false,
  "errors": [
    { "field": "workPlan", "message": "Work plan required for IN_PROGRESS" },
    { "field": "assigneeIds", "message": "Must have at least one assignee" }
  ],
  "allowedTransitions": ["BLOCKED", "NEEDS_APPROVAL"]
}
```

---

## Review Cycle Limits

- **Max review cycles:** 3 (configurable)
- After 3 cycles: Task moves to BLOCKED with Loop Summary
- To continue: Human must unblock and clarify requirements

---

## Idempotency

All transitions support idempotency via `X-Idempotency-Key` header:

- Same key + same transition = returns original result (no duplicate)
- Same key + different transition = error (conflict)
- Different key = processes normally

---

## State Diagram

```
                    ┌──────────┐
                    │  INBOX   │
                    └────┬─────┘
                         │ assign
                         ▼
                    ┌──────────┐
          ┌────────│ ASSIGNED │
          │        └────┬─────┘
          │             │ start (+ work plan)
          │             ▼
          │        ┌──────────────┐
          │   ┌───▶│ IN_PROGRESS  │◀───┐
          │   │    └──────┬───────┘    │
          │   │           │            │ revisions
          │   │           │ submit     │
          │   │           ▼            │
          │   │    ┌──────────┐        │
          │   │    │  REVIEW  │────────┘
          │   │    └────┬─────┘
          │   │         │ approve
          │   │         ▼
          │   │    ┌──────────┐
          │   │    │   DONE   │
          │   │    └──────────┘
          │   │
          │   │         ┌───────────────────┐
          │   └─────────│ NEEDS_APPROVAL    │◀── budget/risk
          │             └───────────────────┘
          │
          │             ┌───────────────────┐
          └────────────▶│     BLOCKED       │◀── loops/errors
                        └───────────────────┘
```
