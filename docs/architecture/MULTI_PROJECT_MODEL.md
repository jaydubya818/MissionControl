# Multi-Project Model

**Version:** 1.0  
**Last Updated:** 2026-02-01

---

## Overview

Mission Control supports **multi-project workspaces**, allowing you to manage multiple business/product contexts with isolated tasks, agents, approvals, and policies. Every entity in the system is scoped to a project.

---

## Data Model

### Projects Table

```typescript
projects: {
  name: string;           // Display name (e.g., "OpenClaw")
  slug: string;           // Unique identifier (e.g., "openclaw")
  description?: string;   // Optional description
  policyDefaults?: {      // Per-project policy overrides
    budgetDefaults?: object;
    riskThresholds?: object;
  };
  metadata?: any;         // Custom metadata
}
```

### ProjectId on Entities

The following tables include an optional `projectId` field:

- **agents** - Agents can be scoped to a project or global
- **tasks** - Every task belongs to a project
- **taskTransitions** - Audit trail includes project context
- **messages** - Thread messages inherit project from task
- **runs** - Execution runs include project context
- **toolCalls** - Tool calls include project context
- **approvals** - Approval requests include project context
- **activities** - Audit log includes project context
- **alerts** - Alerts include project context
- **notifications** - Notifications include project context
- **threadSubscriptions** - Subscriptions include project context
- **agentDocuments** - Agent documents include project context
- **policies** - Policies can be global or project-specific

---

## Project Scoping Behavior

### Queries

All list queries accept an optional `projectId` parameter:

```typescript
// List tasks for a specific project
tasks.listAll({ projectId: "..." })

// List agents for a specific project
agents.listAll({ projectId: "..." })

// List pending approvals for a specific project
approvals.listPending({ projectId: "..." })
```

If `projectId` is omitted, queries return all records (for backward compatibility).

### Mutations

Mutations that create new entities accept an optional `projectId`:

```typescript
// Create a task in a specific project
tasks.create({ 
  projectId: "...",
  title: "...",
  type: "ENGINEERING",
  // ...
})

// Register an agent in a specific project
agents.register({
  projectId: "...",
  name: "Scout",
  role: "INTERN",
  // ...
})
```

### Indexes

Composite indexes enable efficient project-scoped queries:

- `tasks.by_project` - All tasks in a project
- `tasks.by_project_status` - Tasks by project and status
- `agents.by_project` - All agents in a project
- `agents.by_project_status` - Agents by project and status
- `approvals.by_project_status` - Approvals by project and status
- `activities.by_project` - Activities in a project
- `messages.by_project` - Messages in a project
- `runs.by_project` - Runs in a project

---

## UI Behavior

### Project Switcher

The UI header includes a project dropdown that:
1. Lists all available projects
2. Stores the selected project in React state
3. Passes `projectId` to all data queries

### Filtering

When a project is selected:
- **Kanban** shows only tasks from that project
- **Sidebar agents** shows only agents from that project
- **Approvals modal** shows only pending approvals from that project
- **Live Feed** shows only activity from that project
- **Standup report** generates stats for that project only

### Creating Entities

When creating tasks or registering agents, the current project is automatically assigned.

---

## Sofie as CAO (Chief Agent Officer)

**Sofie** is the Chief Agent Officer for OpenClaw and the top-level authority for Mission Control execution.

### CAO Responsibilities

1. **Task triage + assignment** - Sofie reviews inbox and assigns to appropriate agents
2. **Approval decisions** - Sofie approves or denies requests (directly or via policy)
3. **Dispute resolution** - Sofie resolves refute loops and conflicting recommendations
4. **Escalation handling** - Sofie handles budget spikes, policy violations, and incidents

### CAO Authority

- All agents (specialists, reviewers, challengers, interns, sub-agents) report to Sofie
- No agent may self-promote autonomy
- No agent may execute RED actions without an approval record authorized by Sofie/policy
- No agent may spawn sub-agents unless the spawn request is logged and authorized per Sofie's governance rules

### Conflict Resolution

- DB is canonical; Telegram/threads are collaboration only
- Every agent output must be posted back to Mission Control as canonical artifacts
- If instructions conflict, Sofie wins

---

## Per-Project Policy Defaults (Future)

Projects can have their own `policyDefaults` that override global policy settings:

```typescript
{
  policyDefaults: {
    budgetDefaults: {
      INTERN: { daily: 3.00, perRun: 0.30 },
      SPECIALIST: { daily: 8.00, perRun: 1.00 },
      LEAD: { daily: 20.00, perRun: 2.50 },
    },
    riskThresholds: {
      yellowRequiresApprovalForIntern: true,
      maxReviewCycles: 5,
    },
  },
}
```

When evaluating policy, the system merges project-specific defaults with global policy.

---

## Migration

For existing data without `projectId`:

1. Create a default project (e.g., "OpenClaw" with slug "openclaw")
2. Backfill existing records with the default project's ID
3. Or make `projectId` optional and gradually migrate

The seed script automatically creates an "OpenClaw" default project and assigns all seeded entities to it.

---

## API Examples

### Create a Project

```typescript
const result = await convex.mutation(api.projects.create, {
  name: "SiteGPT",
  slug: "sitegpt",
  description: "AI-powered website assistant",
});
```

### List Projects

```typescript
const projects = await convex.query(api.projects.list);
```

### Get Project Stats

```typescript
const stats = await convex.query(api.projects.getStats, {
  projectId: "...",
});
// Returns: { tasks: {...}, agents: {...}, approvals: {...} }
```

### Switch Project Context in UI

```typescript
const { projectId, setProjectId } = useProject();

// In project switcher dropdown
<select onChange={(e) => setProjectId(e.target.value)}>
  {projects.map(p => (
    <option key={p._id} value={p._id}>{p.name}</option>
  ))}
</select>
```

---

## Related Documentation

- [RUNBOOK.md](RUNBOOK.md) - Operational procedures including Sofie as CAO
- [GETTING_STARTED.md](../GETTING_STARTED.md) - Project setup and development
- [STATE_MACHINE.md](openclaw-bootstrap/operating-manual/STATE_MACHINE.md) - Task state transitions
