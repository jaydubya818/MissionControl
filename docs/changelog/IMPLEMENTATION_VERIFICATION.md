# Implementation Verification (vs Claude Cowork Assessment)

This document verifies the MissionControl repo against the “what’s implemented / what’s not” summary and corrects inaccuracies.

---

## Corrections to Claude Cowork’s Summary

### 1. Schema: no “documents” table

**Claimed:** “Convex database with full schema (agents, tasks, messages, activities, **documents**)”

**Actual:** The Convex schema has **no `documents` table**. Tables present:

- `agents`, `tasks`, `taskTransitions`, `messages`, `runs`, `toolCalls`, `approvals`, `activities`, `alerts`, `policies`

So “documents” should be removed from the “what is implemented” list.

---

### 2. AGENTS.md: doc exists; “operational” = agents following it

**Claimed (under “NOT implemented”):** “AGENTS.md operational manual”

**Actual:** **AGENTS.md exists** at `docs/openclaw-bootstrap/operating-manual/AGENTS.md`. It defines the operating manual (heartbeat loop, task lifecycle, approvals, budget, etc.). What is **not** in this repo is the **runtime**: actual OpenClaw instances running and following that manual (heartbeat cron, `mc` CLI, etc.). So:

- **Implemented:** The AGENTS.md manual (documentation).
- **Not implemented:** Agents that run the loop described in AGENTS.md (that lives in OpenClaw / agent layer).

---

### 3. Seed agents: 10 agents, different names

**Claimed:** “The 10 specialized agents (Jarvis, Shuri, Fury, etc.)”

**Actual:** The seed (`convex/seed.ts`) creates **10 agents** with names: **Scout, Scribe, Fetch, Echo, Pixel, Atlas, Nova, Sage, Prime, Relay** (and roles INTERN/SPECIALIST/LEAD). So “10 specialized agents” is correct; “Jarvis, Shuri, Fury” are **not** the seed names—those are from a different reference (e.g. the UI mock). No SOUL.md files exist in this repo; those would live in OpenClaw agent workspaces.

---

## What IS Implemented (verified)

| Item | Status | Where |
|------|--------|--------|
| Convex schema | ✅ | `convex/schema.ts` — agents, tasks, taskTransitions, messages, runs, toolCalls, approvals, activities, alerts, policies (no “documents”) |
| React UI | ✅ | Kanban, task drawer, sidebar (agents), Live Feed, Create task, Approvals/Policy modals, Pause squad |
| Agent registration API | ✅ | `convex/agents.ts` — `register` mutation |
| Agent heartbeat API | ✅ | `convex/agents.ts` — `heartbeat` mutation (returns agent, budgetRemaining, pendingTasks, claimableTasks, pendingApprovals) |
| Task state machine | ✅ | `convex/tasks.ts` — transitions INBOX → … → DONE/CANCELED; `getAllowedTransitionsForHuman`; rules in code |
| Message/comment system | ✅ | `convex/messages.ts` — post, postWorkPlan, postProgress, postReview; messages have type (COMMENT, WORK_PLAN, etc.) and optional `mentions` |
| Budget tracking per agent | ✅ | `convex/agents.ts` — spendToday, budgetDaily, budgetPerRun, spendResetAt; heartbeat accepts spendSinceLastHeartbeat |
| Agent roles | ✅ | INTERN, SPECIALIST, LEAD in schema and seed |
| Approval system | ✅ | `convex/approvals.ts` — request, approve, deny, cancel, listPending, etc. |
| Policy engine | ✅ | `convex/policy.ts` — getActive, listAll, evaluate (tool/transition/spawn); policies table |
| Operating manual (AGENTS.md) | ✅ | `docs/openclaw-bootstrap/operating-manual/AGENTS.md` — how agents should behave |
| HEARTBEAT.md | ✅ | `docs/openclaw-bootstrap/operating-manual/HEARTBEAT.md` — checklist for heartbeat loop |

---

## What Was Added (Completion Pass)

The following were implemented in MissionControl so the “office” is complete:

| Item | Status | Where |
|------|--------|--------|
| Notifications table + API | ✅ | `convex/schema.ts` — `notifications`; `convex/notifications.ts` — create, createForAgents, listByAgent, markRead, markAllReadForAgent, listPendingForAgent |
| Heartbeat returns pendingNotifications | ✅ | `convex/agents.ts` — heartbeat response includes `pendingNotifications` (unread for agent) |
| Create notifications on assign | ✅ | `convex/tasks.ts` — when transitioning to ASSIGNED, insert TASK_ASSIGNED for each assignee |
| Create notifications on @mentions | ✅ | `convex/messages.ts` — postMessageInternal creates MENTION notifications for each mention (resolve by agent name) |
| Thread subscriptions | ✅ | `convex/schema.ts` — `threadSubscriptions`; `convex/subscriptions.ts` — subscribe, unsubscribe, listByAgent, listByTask, getSubscribedTaskIds |
| Agent documents (memory) | ✅ | `convex/schema.ts` — `agentDocuments`; `convex/agentDocuments.ts` — set, get, listByAgent, getWorkingMd, getDailyNote (types: WORKING_MD, DAILY_NOTE, SESSION_MEMORY) |
| Daily standup report | ✅ | `convex/standup.ts` — generate (query), save (mutation), runDaily (mutation for cron) |
| Convex crons | ✅ | `convex/crons.ts` — expire stale approvals every 15 min; daily standup at 09:00 UTC |

---

## What is NOT Implemented (verified)

| Item | Status | Note |
|------|--------|------|
| OpenClaw instances as agents | ❌ | No OpenClaw repo/config in MissionControl; agents would run elsewhere and call Convex |
| SOUL.md per agent | ❌ | Not in this repo; would live in each OpenClaw agent workspace |
| Heartbeat cron / scheduler (in agent runtime) | ❌ | No cron in this repo that “wakes” agents; heartbeat is an API agents call from their own cron/scheduler |
| REST API at localhost:3100 | ❌ | Backend is Convex, not the REST API described in `docs/.../API_SURFACE.md`; INTEGRATION_CONTRACT refers to that future/alternate API |

---

## Implementation percentage and next steps

- **~40%** is a reasonable ballpark: Mission Control **backend + UI + orchestration** are in place; **agent-layer** (OpenClaw instances, heartbeat loop, memory, notifications, standup, subscriptions) is not in this repo.
- **Phase 1 (single agent):** Configure one OpenClaw instance with Convex client, implement heartbeat loop calling `agents.heartbeat`, and test task claim → work → transition. That work belongs in the OpenClaw/agent side; MissionControl already exposes the APIs.
- **Phase 2 (multi-agent):** Multiple OpenClaw instances, SOUL.md per agent, staggered cron for heartbeats, basic @mention handling. Again, agent-side + possibly new Convex queries/mutations for “notifications for agent.”
- **Phase 3 (polish):** Notification delivery, memory system, daily standup, thread subscriptions would likely require new Convex tables/functions and/or daemons; none of that exists in the repo today.

---

## Short verdict

- **Correct:** Infrastructure (Convex schema minus “documents”), React UI, agent/heartbeat/task/message/approval/policy APIs, task state machine, budget, roles, and the existence of AGENTS.md/HEARTBEAT.md as docs.
- **Incorrect or misleading:** Schema does **not** include “documents”; AGENTS.md **is** present (manual is implemented as docs, not as running agents); seed agents are 10 but named Scout/Scribe/etc., not Jarvis/Shuri/Fury.
- **Accurate:** All “agent layer” items (OpenClaw instances, SOUL.md, heartbeat cron in agent runtime) are **not** implemented in MissionControl; they are the right “next steps” for the OpenClaw repo. Memory (agent documents), notifications (table + delivery via heartbeat), thread subscriptions, daily standup, and Convex crons **are** now implemented in MissionControl.

---

## Quick reference for agents (new APIs)

- **Heartbeat** (`api.agents.heartbeat`): Returns `pendingNotifications` (unread MENTION, TASK_ASSIGNED, etc.).
- **Notifications** (`api.notifications.*`): `listByAgent`, `listPendingForAgent`, `markRead`, `markAllReadForAgent`.
- **Subscriptions** (`api.subscriptions.*`): `subscribe(agentId, taskId)`, `unsubscribe(agentId, taskId)`, `listByAgent`, `getSubscribedTaskIds`.
- **Memory** (`api.agentDocuments.*`): `set(agentId, type, content)` / `get(agentId, type)` with types `WORKING_MD`, `DAILY_NOTE`, `SESSION_MEMORY`; `getWorkingMd(agentId)`, `getDailyNote(agentId)`.
- **Standup** (`api.standup.generate`): Query for daily summary (agents, tasks by status, pending approvals).
- **Crons**: Expire approvals every 15 min; daily standup report at 09:00 UTC (saved to activities).
