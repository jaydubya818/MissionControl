# V0 Reconciliation — Bootstrap Kit vs Existing Repo

## A) Constraints from Bootstrap Kit (Source of Truth)

### State Machine Constraints
- **8 Statuses:** INBOX, ASSIGNED, IN_PROGRESS, REVIEW, NEEDS_APPROVAL, BLOCKED, DONE, CANCELED
- **Terminal states:** DONE, CANCELED (no transitions out)
- **Required artifacts:**
  - ASSIGNED → IN_PROGRESS: `workPlan` (3-6 bullets), `assigneeIds` non-empty
  - IN_PROGRESS → REVIEW: `deliverable`, `reviewChecklist`
  - REVIEW → DONE: Human approval only (default)
- **Idempotency:** All transitions use `X-Idempotency-Key` header
- **task.status ONLY changes via transition endpoint** (never direct mutation)

### Policy Constraints
- **Roles:** INTERN, SPECIALIST, LEAD
- **Risk levels:** GREEN, YELLOW, RED
- **Approval rules:**
  - RED always requires approval
  - YELLOW requires approval for INTERN
  - Budget exceeded → NEEDS_APPROVAL
- **Budget defaults:**
  - Intern: $2/day, $0.25/run
  - Specialist: $5/day, $0.75/run
  - Lead: $12/day, $1.50/run

### Schema Constraints (Required Fields)
- `idempotencyKey` on: tasks, taskTransitions, runs, messages, approvals
- `redactedFields` on: tasks, messages
- Actor tracking: `actorAgentId` + `actorUserId` (one or other)
- `sessionKey` reference on: taskTransitions, runs
- `soulVersionHash` on agents for tracking SOUL.md changes

### API Constraints
- `POST /tasks/:id/transition` — canonical transition endpoint
- `POST /policy/evaluate` — returns `allow | deny | needs_approval` + explanation
- `POST /agents/:id/heartbeat` — agent check-in, returns pending work

---

## B) Diff List — Existing vs Bootstrap

### Schema Differences

| Table | Field | Existing | Bootstrap | Action |
|-------|-------|----------|-----------|--------|
| agents | role | lowercase ("intern") | UPPERCASE enum | **Change to UPPERCASE** |
| agents | workspacePath | missing | required | **Add** |
| agents | soulVersionHash | `soulHash` | `soulVersionHash` | **Rename** |
| agents | allowedTaskTypes | missing | array | **Add** |
| agents | budgetDaily/budgetPerRun | nested in `budgets` | flat fields | **Flatten** |
| agents | spendToday | `todaySpend` | `spendToday` | **Rename** |
| agents | emoji | missing | optional | **Add** |
| tasks | idempotencyKey | missing | required | **Add** |
| tasks | creatorAgentId | missing | optional | **Add** |
| tasks | reviewerId | `reviewerIds[]` | single `reviewerId` | **Keep array, add single** |
| tasks | reviewChecklist | missing | JSONB | **Add** |
| tasks | reviewCycles | missing | integer | **Add** |
| tasks | estimatedCost/actualCost | missing | decimal | **Add** |
| tasks | startedAt/submittedAt/completedAt | missing | timestamps | **Add** |
| tasks | redactedFields | missing | array | **Add** |
| taskTransitions | actorUserId | missing | string | **Add** |
| taskTransitions | validationResult | missing | JSONB | **Add** |
| taskTransitions | artifactsSnapshot | missing | JSONB | **Add** |
| taskTransitions | sessionKey | missing | string | **Add** |
| messages | type | missing | enum | **Add** |
| messages | replyToId | missing | optional ref | **Add** |
| messages | artifacts | missing | JSONB array | **Add** |
| messages | idempotencyKey | missing | unique | **Add** |

### State Machine Differences

| Issue | Existing | Bootstrap | Action |
|-------|----------|-----------|--------|
| DONE→REVIEW | allowed | not allowed (terminal) | **Remove** |
| DONE→CANCELED | allowed | not allowed (terminal) | **Remove** |
| CANCELED transitions | none | none | ✅ Correct |

### API Differences

| Endpoint | Existing | Bootstrap | Action |
|----------|----------|-----------|--------|
| POST /tasks/:id/transition | not implemented | required | **Implement** |
| POST /policy/evaluate | not implemented | required | **Implement** |
| POST /ingest/run | not implemented | required | **Implement** |
| POST /ingest/toolcall | not implemented | required | **Implement** |

---

## C) V0 Implementation Plan

### 1. Update Convex Schema
- Add missing fields to match bootstrap
- Use UPPERCASE enums for roles/risks
- Add idempotencyKey indexes

### 2. Convex Functions
- `tasks.create`, `tasks.get`, `tasks.listByStatus`
- `tasks.transition` — validates via state-machine, enforces idempotency
- `taskTransitions.append` — immutable audit log
- `messages.post` — with type, mentions, artifacts
- `agents.register`, `agents.heartbeat`

### 3. API Server (Fastify)
- `POST /api/v1/tasks/:id/transition`
- `POST /api/v1/policy/evaluate`
- `POST /api/v1/ingest/run`
- `POST /api/v1/ingest/toolcall`

### 4. React UI
- Kanban board with all 8 columns
- Agent list with status indicators
- Task detail drawer with Timeline

### 5. Seed Data
- 10 agents across roles
- 8 tasks across statuses

---

## D) V0 Acceptance Criteria

- [ ] Create task via UI/API
- [ ] Claim task (assign to agent)
- [ ] Post comment on task
- [ ] Transition ASSIGNED → IN_PROGRESS (with workPlan)
- [ ] Transition IN_PROGRESS → REVIEW (with deliverable)
- [ ] See timeline events in UI
- [ ] Invalid transitions rejected with clear error
- [ ] `task.status` cannot be mutated directly
- [ ] Duplicate idempotencyKey returns original (no duplicate transition)
