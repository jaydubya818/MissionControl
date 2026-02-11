# Workflow Migration Guide

This guide helps you integrate the new workflow system into your existing Mission Control setup.

## What's New

Mission Control now includes a deterministic multi-agent workflow system inspired by [Antfarm](https://github.com/snarktank/antfarm). This adds:

- **2 new Convex tables**: `workflows`, `workflowRuns`
- **1 new package**: `@mission-control/workflow-engine`
- **3 new UI components**: `WorkflowDashboard`, `WorkflowRunPanel`, `WorkflowSelector`
- **3 built-in workflows**: `feature-dev`, `bug-fix`, `security-audit`
- **Enhanced coordinator**: Automatic workflow triggering based on task patterns

## Database Migration

### Step 1: Update Convex Schema

The schema has been updated with two new tables. Run:

```bash
npx convex dev
```

Convex will automatically apply the schema changes:
- `workflows` table (workflow definitions)
- `workflowRuns` table (execution state)

No data migration needed — these are new tables.

### Step 2: Seed Built-in Workflows

Load the 3 built-in workflows:

```bash
pnpm workflows:seed
```

This creates workflow definitions in your Convex database.

## Code Integration

### Frontend Integration

The workflow UI components are standalone and don't require changes to existing components. To add them to your UI:

1. **Add Workflow Dashboard to navigation** (optional):

```typescript
// In TopNav.tsx or Sidebar.tsx
import { WorkflowDashboard } from "./WorkflowDashboard";

// Add route
<Route path="/workflows" element={<WorkflowDashboard />} />
```

2. **Add Workflow Selector to task creation** (optional):

```typescript
// In task creation flow
import { WorkflowSelector } from "./WorkflowSelector";

const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);

// Show selector when appropriate
{showWorkflowSelector && (
  <WorkflowSelector
    projectId={projectId}
    onClose={() => setShowWorkflowSelector(false)}
    onStarted={(runId) => {
      console.log("Workflow started:", runId);
      navigate(`/workflows/${runId}`);
    }}
  />
)}
```

### Backend Integration

No changes required to existing Convex functions. The workflow system uses:
- Existing `tasks` table for step execution
- Existing `agents` table for agent lookup
- Existing `approvals` table for escalation
- New `workflows` and `workflowRuns` tables

### Coordinator Integration

The coordinator can now automatically trigger workflows. To enable:

```typescript
import { analyzeForWorkflow, shouldAutoTrigger } from "@mission-control/coordinator";

// In your task creation logic
const analysis = analyzeForWorkflow(task);

if (shouldAutoTrigger(analysis)) {
  // Start workflow run
  await ctx.runMutation(api.workflowRuns.start, {
    workflowId: analysis.suggestedWorkflow,
    projectId: task.projectId,
    parentTaskId: task._id,
    initialInput: task.description,
  });
}
```

## Workflow Executor Setup

The workflow executor polls for workflow runs and executes steps. Two deployment options:

### Option 1: Standalone Process (Recommended)

Run the executor as a separate process:

```typescript
// apps/workflow-executor/index.ts
import { createExecutor } from "@mission-control/workflow-engine";

const executor = createExecutor({
  convexUrl: process.env.CONVEX_URL!,
  pollIntervalMs: 5000,
});

executor.start();
```

Run with:
```bash
npx tsx apps/workflow-executor/index.ts
```

### Option 2: Convex Cron (Alternative)

Add a cron job to `convex/crons.ts`:

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "workflow-executor",
  { seconds: 10 },
  internal.workflows.executorTick
);

export default crons;
```

Then implement `executorTick` in `convex/workflows.ts`:

```typescript
export const executorTick = internalAction({
  handler: async (ctx) => {
    // Poll for workflow runs and execute steps
    // (simplified version of WorkflowExecutor logic)
  },
});
```

## Testing the Integration

### 1. Verify Workflows Loaded

```typescript
// In Convex dashboard or via query
const workflows = await ctx.runQuery(api.workflows.list, {});
console.log("Loaded workflows:", workflows.length);
// Expected: 3 (feature-dev, bug-fix, security-audit)
```

### 2. Start a Test Run

```typescript
const result = await ctx.runMutation(api.workflowRuns.start, {
  workflowId: "feature-dev",
  projectId: "...",
  initialInput: "Add user authentication",
});

console.log("Started workflow run:", result.runId);
```

### 3. Monitor Progress

Open the Workflow Dashboard in the UI and verify:
- Run appears in the list
- Status updates in real-time
- Steps progress sequentially
- Errors are displayed

## Backward Compatibility

The workflow system is **fully backward compatible**:

- Existing task decomposition still works
- Existing agent assignment still works
- Existing approval workflows still work
- No breaking changes to existing APIs

Workflows are **opt-in**:
- Only used when explicitly started via UI or API
- Traditional task decomposition remains the default
- Coordinator can suggest workflows but doesn't force them

## Performance Considerations

### Database Load

Workflows add minimal database load:
- 1 read per poll interval (default: 5 seconds)
- 1-2 writes per step transition
- No impact on existing queries

### Executor Resource Usage

The workflow executor is lightweight:
- ~10MB memory footprint
- Minimal CPU (polling + parsing)
- Scales to hundreds of concurrent workflow runs

### UI Performance

Workflow components use Convex subscriptions:
- Real-time updates with no polling
- Minimal re-renders (React.memo optimized)
- No impact on other UI components

## Rollback Plan

If you need to rollback:

1. **Stop the workflow executor** (if running as standalone process)
2. **Remove workflow routes** from UI navigation
3. **Keep the schema changes** (no harm in having empty tables)
4. **Remove workflow seed data** (optional):

```typescript
const workflows = await ctx.runQuery(api.workflows.list, {});
for (const workflow of workflows) {
  await ctx.runMutation(api.workflows.remove, {
    workflowId: workflow.workflowId,
  });
}
```

Existing functionality remains unaffected.

## Common Issues

### "Workflow executor not processing runs"

**Symptoms:**
- Workflow runs stuck in PENDING
- No step progression

**Solutions:**
1. Verify executor is running: `ps aux | grep workflow-executor`
2. Check executor logs for errors
3. Verify `CONVEX_URL` environment variable is set
4. Ensure agents exist with matching personas

### "Agent not found for step"

**Symptoms:**
- Step fails with "Agent persona not found: Strategist"

**Solutions:**
1. Verify agent personas exist: `agents/*.yaml` files
2. Check agent is registered in Convex: `agents` table
3. Ensure persona names match exactly (case-sensitive)

### "Context variable missing"

**Symptoms:**
- Step fails with "Missing context variables: planOutput"

**Solutions:**
1. Verify previous step completed successfully
2. Check previous step output includes "STATUS: done"
3. Ensure variable name matches step ID (e.g., `{{planOutput}}` for step `plan`)

## Next Steps

- [Workflows Quick Start](./WORKFLOWS_QUICKSTART.md) — Run your first workflow
- [Creating Workflows](./CREATING_WORKFLOWS.md) — Build custom workflows
- [Workflows Architecture](./WORKFLOWS.md) — Deep dive into the system

## Support

Questions? Issues? Check:
- [Workflows Documentation](./WORKFLOWS.md)
- [Architecture Guide](./ARCHITECTURE.md)
- GitHub Issues (for bugs/feature requests)

---

**Migration Status**: ✅ Complete — No breaking changes, fully backward compatible
