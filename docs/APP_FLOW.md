# Mission Control -- App Flow

**Last Updated:** February 8, 2026  
**App:** apps/mission-control-ui  
**Type:** Single-page application (no URL routing, all navigation via state)

---

## Overview

Mission Control is a single-page React app with no traditional URL routing. All navigation happens through modals, drawers, sidebar actions, and header buttons. The main view is always the Kanban board.

---

## 1. App Launch

1. App loads at root URL
2. Convex connection established
3. Projects list fetched
4. First project auto-selected (if no project previously selected)
5. Main layout renders: Header + Sidebar + Kanban + Live Feed

---

## 2. Main Layout

```
+-------------------------------------------------------------------+
| HEADER                                                              |
| [Mission Control] [Project v] [Search...] [Agents Active] [Tasks]  |
| [Agents] [Costs] [Analytics] [Health] [Monitor] [Overview]         |
| [Activity] [Shortcuts] [Docs] [Clock] [+ New Task]                 |
+----------+----------------------------------+-----------------------+
| SIDEBAR  | MAIN CONTENT                     | LIVE FEED            |
| (260px)  | (Kanban Board)                   | (320px)              |
|          |                                  |                      |
| Agent 1  | [Filters: Agent | Priority | Type]                     |
| Agent 2  |                                  | Activity 1           |
| Agent 3  | INBOX | ASSIGNED | IN_PROGRESS   | Activity 2           |
| ...      | REVIEW | NEEDS_APPROVAL          | Activity 3           |
|          | BLOCKED | DONE | CANCELED         | ...                  |
|          |                                  |                      |
| Actions: | [Task Cards in columns]          | [Filter chips]       |
| Notifs   |                                  |                      |
| Approvals|                                  |                      |
| Standup  |                                  |                      |
| Policy   |                                  |                      |
| Pause    |                                  |                      |
+----------+----------------------------------+-----------------------+
```

---

## 3. Core Flows

### 3.1 Create Task

**Triggers:**
- Header: "+ New Task" button
- Command Palette (Cmd+K): "Create New Task"
- Quick Actions Menu (bottom-right floating button): "New Task"
- Keyboard shortcut: Cmd+N

**Flow:**
1. Create Task modal opens
2. Fill in: Title (required), Description, Type, Priority, Assignees
3. Click "Create Task"
4. Task appears in INBOX column on Kanban
5. Modal closes

### 3.2 View Task Details

**Trigger:** Click any task card on the Kanban board

**Flow:**
1. Task Drawer slides in from the right (~50% viewport width)
2. Six tabs available:
   - **Overview:** Description, assignees, work plan, deliverable, blocked reason, quick actions
   - **Timeline:** Unified view of transitions, messages, runs, tool calls, approvals
   - **Artifacts:** Deliverable artifacts and artifact messages
   - **Approvals:** All approval requests for this task
   - **Cost:** Budget vs. actual spend, run cost breakdown, run history
   - **Reviews:** Peer review panel (praise, refute, changeset, approve)
3. Comment box at bottom for adding messages
4. Edit mode toggle in header
5. Status transition buttons (context-dependent)
6. Click outside drawer or X to close

### 3.3 Move Task (Drag-and-Drop)

**Trigger:** Drag a task card from one Kanban column to another

**Flow:**
1. Pick up task card
2. Drag to target status column
3. Drop card
4. State machine validates transition
5. If valid: task moves, transition logged, undo button appears
6. If invalid: card snaps back, error shown
7. Undo button available for 5 seconds

### 3.4 Project Switching

**Trigger:** Project dropdown in header

**Flow:**
1. Click project dropdown
2. Select project (or "All Projects")
3. All views re-filter: Kanban, Sidebar agents, Live Feed, all modals
4. Project context propagated via React Context

### 3.5 Search

**Triggers:**
- Click search bar in header
- Keyboard shortcut: Cmd+K

**Flow:**
1. Command Palette opens (modal overlay)
2. Type search query
3. Results shown: tasks, agents, commands
4. Click result to navigate (open task drawer, open modal, execute command)

### 3.6 Approve/Deny Action

**Triggers:**
- Sidebar: "Approvals" button (badge shows pending count)
- Command Palette: "View Approvals"
- Keyboard shortcut: Cmd+A

**Flow:**
1. Approvals modal opens
2. Shows pending approvals with: action summary, risk level (YELLOW/RED), requesting agent, justification, estimated cost
3. Click "Approve" or "Deny"
4. Enter decision reason
5. Approval recorded, task/agent unblocked if approved
6. Activity logged

### 3.7 Emergency Controls

**Pause Squad:**
1. Sidebar: "Pause Squad" button (red/danger)
2. Confirmation dialog
3. All ACTIVE agents set to PAUSED
4. Alert created
5. "Resume Squad" button appears

**Resume Squad:**
1. Sidebar: "Resume Squad" button (appears when agents are paused)
2. All PAUSED agents set to ACTIVE

---

## 4. Modal Inventory

| Modal | Trigger | Content |
|---|---|---|
| Create Task | Header "+ New Task", Cmd+N | Task creation form |
| Approvals | Sidebar, Cmd+A | Pending approval queue |
| Notifications | Sidebar | Recent notifications |
| Standup | Sidebar | Daily standup report |
| Policy | Sidebar | Policy configuration |
| Agent Dashboard | Header "Agents", Cmd+E | Agent performance grid |
| Cost Analytics | Header "Costs" | Cost breakdowns by agent/model/time |
| Analytics Dashboard | Header "Analytics" | Forecasting, efficiency, bottlenecks |
| Health Dashboard | Header "Health" | System health checks, auto-refresh 30s |
| Monitoring Dashboard | Header "Monitor" | Errors, performance, audit log (3 tabs) |
| Dashboard Overview | Header "Overview" | High-level metric cards |
| Activity Feed | Header "Activity" | Full-screen activity stream |
| Command Palette | Search bar, Cmd+K | Search tasks/agents/commands |
| Keyboard Shortcuts | Header keyboard icon | Shortcut reference |

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+K | Open Command Palette / Search |
| Cmd+N | Create New Task |
| Cmd+A | Open Approvals |
| Cmd+E | Open Agent Dashboard |
| Escape | Close active modal/drawer |

---

## 6. Data Flow

```
User Action (click, drag, type)
    |
    v
React Component (useState for local UI state)
    |
    v
Convex useMutation (write to database)
    |
    v
Convex Backend (validate, enforce state machine, log activity)
    |
    v
Convex useQuery (reactive subscription auto-updates all subscribed components)
    |
    v
UI Re-renders (Kanban, Live Feed, Sidebar, Modals all update in real-time)
```

All data flows through Convex. There is no local data store, no Redux, no Zustand. Convex reactive subscriptions are the single source of truth for all displayed data.

---

## 7. Error Handling

- Invalid state transitions: Card snaps back, error toast shown
- Budget exceeded: Task moves to NEEDS_APPROVAL, approval request created
- Loop detected (cron): Task moves to BLOCKED, alert created, blockedReason set
- Network errors: Convex handles reconnection automatically
- Stale approvals: Expired by cron job every 15 minutes
