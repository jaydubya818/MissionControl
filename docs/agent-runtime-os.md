# Agent Runtime Operating System

**Version:** 1.0  
**Date:** February 8, 2026  
**Scope:** How Mission Control's autonomous agents behave at runtime  
**Canonical Source:** [PRD_V2.md](PRD_V2.md) (Sections 5, 6, 7)

> This document defines the operational rules for Mission Control's autonomous agents.
> It does NOT govern how AI assistants (Cursor, Claude) operate across the portfolio --
> see [Portfolio OS](portfolio-os.md) for that.

---

## Architecture Context

- **Backend:** Convex serverless (source of truth: `convex/schema.ts`)
- **Real-time:** Convex reactive subscriptions (no WebSocket/SSE)
- **Background jobs:** Convex cron jobs (`convex/crons.ts`)
- **Orchestration server:** Express/Hono process for long-running agent loops (Phase 2, planned)
- **Full tech stack:** See [TECH_STACK.md](TECH_STACK.md)
- **API surface:** See [BACKEND_STRUCTURE.md](BACKEND_STRUCTURE.md)

---

## Agent Taxonomy (11 Agents)

All agent specializations are defined as YAML persona files in `agents/*.yaml`. Agents are instances of a generic runtime configured by these personas -- not separate codebases.

| Agent | Role | Trigger Patterns | Risk Profile |
|---|---|---|---|
| Coordinator | Task decomposition, delegation, conflict resolution, progress monitoring | Always active | GREEN |
| Research | Source synthesis, pattern analysis, literature review | research, analyze, find out, compare | GREEN |
| Coder | Code generation, iteration, refactoring, debugging | build, code, implement, fix bug | YELLOW |
| Operations | Documentation, process management, follow-ups | document, organize, schedule, track | GREEN |
| QA | Edge case testing, adversarial review, quality gates | test, verify, review, check | GREEN |
| Storyteller | Narratives, marketing copy, grant writing, pitches | write, pitch, story, marketing | GREEN |
| Designer | UI/UX direction, wireframes, creative review | design, layout, UI, wireframe | GREEN |
| Compliance | Contract review, security audit, regulatory check | legal, compliance, contract, security | RED |
| Finance | Deal analysis, pricing models, financial projections | pricing, budget, financial, ROI | YELLOW |
| Learner | Win/error/fix scanning, memory updates, pattern detection | Runs on schedule + post-task | GREEN |
| Strategist | Mission breakdown, dependency mapping, resource planning | plan, strategy, roadmap, decompose | GREEN |

---

## Coordinator Logic

The Coordinator is the central orchestrator. It does NOT execute domain work. It decomposes, delegates, monitors, and resolves.

**Workflow:**

```
User Input
  |
  v
Coordinator: Decompose into subtasks
  |
  +-> Strategist: Architecture and milestones
  +-> Research: Market analysis, API options
  +-> Coder: Implementation (parallel tracks possible)
  +-> Designer: UI/UX mockups
  +-> QA: Test plans, edge cases
  +-> Finance: Cost projections
  |
  v
Coordinator: Monitor progress, resolve blockers, compile results
  |
  v
Learner: Extract wins/errors/fixes -> update memory
```

**Decision logging:** All Coordinator decisions (decomposition plans, delegation choices, conflict resolutions, escalations) are logged to the `activities` table with `action: 'COORDINATOR_DECISION'`.

**Conflict resolution:** When two agents produce contradictory outputs, the Coordinator routes to consensus mode (multi-model vote, Phase 5) or escalates to the human operator.

---

## Inter-Agent Communication Protocol

Agents communicate through a mediated protocol. There are NO direct agent-to-agent calls.

1. **Task artifacts:** Results are attached to tasks as deliverables (structured data, files, summaries).
2. **Messages table:** The `messages` table in Convex is the communication channel. Agents post messages of type `ARTIFACT`, `PROGRESS`, or `COMMENT` to task threads.
3. **Dependencies:** Subtask dependencies enforce execution ordering. An agent cannot start work until its dependency subtasks are `DONE`.
4. **Coordinator mediation:** The Coordinator reads outputs from completed subtasks and provides relevant context when delegating downstream tasks.
5. **Mentions:** Agents can @-mention other agents in task threads. The `notifications` table delivers these.

---

## Task State Machine

8 states, enforced by `packages/state-machine`:

```
INBOX -> ASSIGNED -> IN_PROGRESS -> REVIEW -> DONE
                  \-> BLOCKED ---/
                  \-> NEEDS_APPROVAL --/
                  \-> CANCELED
```

| State | Description | Terminal |
|---|---|---|
| INBOX | New task, not assigned | No |
| ASSIGNED | Assigned to agent(s), not started | No |
| IN_PROGRESS | Agent actively working | No |
| REVIEW | Agent submitted work for review | No |
| NEEDS_APPROVAL | Waiting for human approval (budget exceed, RED action) | No |
| BLOCKED | Cannot proceed (loop detected, recoverable failure) | No |
| DONE | Completed and approved | Yes |
| CANCELED | Abandoned | Yes |

**Transition rules:**
- Only valid transitions are allowed (state machine validator).
- `IN_PROGRESS -> REVIEW` requires a deliverable artifact.
- `REVIEW -> DONE` requires an approval record (auto-approve for GREEN, human for RED).
- `BLOCKED` tasks trigger escalation after configurable timeout.
- `NEEDS_APPROVAL` is entered when budget is exceeded or a YELLOW/RED tool call requires sign-off.
- All transitions are logged to `taskTransitions` with timestamp, actor, and reason.
- Transitions include an idempotency key to prevent duplicates.

---

## Agent Lifecycle

**Lifecycle:** Spawn -> Load persona -> Validate schema version -> Receive task -> Execute -> Return artifacts -> Update memory -> Terminate (or idle for reuse).

**Heartbeat and Recovery:**

Active agents emit a heartbeat every 30 seconds.

| Missed Heartbeats | Time | Action |
|---|---|---|
| 2 | 60s | Alert coordinator. Agent flagged "potentially stuck." |
| 3 | 90s | Attempt graceful termination. Send shutdown signal. |
| 4 | 120s | Force terminate. Reassign task to new agent instance. |
| Post-incident | -- | Log incident for Learner agent. Record `blockedReason` on task. |

**Idempotency:** Each agent run has an idempotency key. Tool calls are logged before execution and checked on retry to prevent duplicate side effects. For RED tools, an idempotency token is passed to the external service where supported.

---

## Safety Framework

### Risk Classification (Implemented)

| Level | Description | Approval Required |
|---|---|---|
| GREEN | Reversible, low-impact actions | Auto-approved |
| YELLOW | Potentially harmful, needs review for Intern-level agents | Human approval for Interns, auto for Senior |
| RED | External impact, irreversible | Always requires human approval |

Implemented in `packages/policy-engine`.

### Budget Enforcement (Implemented)

Three levels, enforced inline in `convex/runs.ts`:
1. **Agent daily budget:** `spendToday` vs `budgetDaily`
2. **Per-run budget:** `estimatedCost` vs `budgetPerRun`
3. **Task budget:** `task.actualCost` vs `task.budgetAllocated`

On exceed: agent paused OR task moved to `NEEDS_APPROVAL`.

### Loop Detection (Implemented)

Runs as Convex cron every 15 minutes (`convex/loops.ts`):
- Comment storm: >20 comments in 30 min
- Review ping-pong: >3 cycles
- Repeated tool failures: 5 in last 10 runs

On detection: task moved to `BLOCKED`, alert created, `blockedReason` set.

### Emergency Controls (Implemented)

| Control | Effect | Trigger |
|---|---|---|
| Pause Squad | All ACTIVE agents set to PAUSED | Sidebar button, Telegram command |
| Quarantine Agent | Single agent isolated | Agent dashboard |
| Drain | Graceful wind-down of in-progress work | Sidebar button |
| Hard Stop | Immediate termination | Emergency override |

---

## Memory System

Three tiers, stored in Convex:

| Tier | Scope | TTL | Table |
|---|---|---|---|
| Session | Single task execution | End of task | `agentDocuments` (type: SESSION_MEMORY) |
| Project | All tasks in a project | Manual cleanup | `agentDocuments` (type: WORKING_MD, DAILY_NOTE) |
| Global | Cross-project | Permanent | `agentLearning` |

**Learning loop:** After every task completion or failure:
1. Learner agent scans the task log, diffs, and agent communications
2. Extracts patterns: what worked, what failed, what was retried
3. Writes structured entries to `agentLearning`
4. At session start, agents load relevant lessons filtered by task type and role
5. High-confidence lessons (>0.8, applied 3+ times) are promoted to system prompt rules

**Retention policy:**
- Lessons with confidence < 0.3: pruned after 90 days of no application
- Lessons with confidence < 0.5 and never applied after 60 days: archived
- All memory writes are versioned for audit and rollback

---

## Tool Access (Per Agent)

| Tool | Available To | Description |
|---|---|---|
| `web_search` | Research, Finance, Compliance | Web search via API |
| `code_exec` | Coder, QA | Sandboxed code execution |
| `file_read` / `file_write` | All | Access to project workspace |
| `git_ops` | Coder, Operations | Git commit, branch, PR |
| `browser` | Research, Designer | Headless browser |
| `database` | All (read), Operations (write) | Convex queries and mutations |
| `notification` | Coordinator, Operations | Send alerts to operator |

---

## CHANGELOG

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-02-08 | Initial version. Extracted from combined OS doc. Aligned with PRD_V2.md agent taxonomy. |
