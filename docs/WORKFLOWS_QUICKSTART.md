# Workflows Quick Start

Get started with Mission Control's multi-agent workflows in 5 minutes.

## Prerequisites

- Mission Control running locally (`pnpm dev`)
- Convex dev server running (`npx convex dev`)
- At least one agent registered in the system

## Step 1: Seed Built-in Workflows

Load the 3 built-in workflows into your Convex database:

```bash
pnpm workflows:seed
```

This loads:
- `feature-dev` (7 agents)
- `bug-fix` (6 agents)
- `security-audit` (7 agents)

## Step 2: Start a Workflow Run

### Via UI

1. Open Mission Control UI (http://localhost:5173)
2. Navigate to Workflows Dashboard
3. Click "Start Workflow"
4. Select a workflow (e.g., `feature-dev`)
5. Enter task description: "Add user authentication with OAuth"
6. Click "Start Workflow"

### Via CLI (Coming Soon)

```bash
mc workflow run feature-dev "Add user authentication with OAuth"
```

## Step 3: Monitor Progress

The Workflow Dashboard shows:
- Real-time step progress
- Current step status (PENDING, RUNNING, DONE, FAILED)
- Retry counts
- Elapsed time per step

Click on a workflow run to see detailed step-by-step progress in the side panel.

## Step 4: Handle Escalations

If a step fails after all retries:
1. Workflow pauses (status: PAUSED)
2. Approval request appears in Approvals Center
3. Review the error and decide:
   - **Approve**: Resume workflow
   - **Reject**: Cancel workflow

## What's Happening Behind the Scenes?

1. **Workflow Executor** polls for PENDING/RUNNING workflow runs
2. For each step:
   - Creates a task assigned to the step's agent
   - Waits for task completion
   - Parses output for "STATUS: done"
   - Extracts structured data
   - Updates context variables
3. If step fails:
   - Retries with exponential backoff
   - Escalates to human after retry limit
4. When all steps complete:
   - Workflow status → COMPLETED
   - Activity logged

## Example: Feature Development Workflow

**Input:**
```
Add user authentication with OAuth
```

**Execution Flow:**

1. **Plan** (Strategist)
   - Breaks feature into 5 stories
   - Defines acceptance criteria
   - Outputs: `{{STORIES}}`

2. **Setup** (Operations)
   - Creates feature branch
   - Installs dependencies
   - Outputs: `{{SETUP}}`

3. **Implement** (Coder)
   - Implements each story
   - Follows .cursorrules
   - Outputs: `{{IMPLEMENTATION}}`

4. **Verify** (QA)
   - Checks against acceptance criteria
   - Outputs: `{{VERIFICATION}}`

5. **Test** (QA)
   - Runs test suite
   - Outputs: `{{TEST_RESULTS}}`

6. **PR** (Operations)
   - Creates pull request
   - Outputs: `{{PR_URL}}`

7. **Review** (Coordinator)
   - Final approval
   - Outputs: `{{DECISION}}`

**Result:** Tested PR ready for merge

## Common Issues

### "Agent not found"
- Ensure agents with the required personas exist in your database
- Check `agents/*.yaml` files are present
- Verify agent personas match workflow definitions

### "Workflow stuck in RUNNING"
- Check if current step's task is blocked
- Verify agent is online and claiming tasks
- Review task status in Kanban view

### "Step keeps failing"
- Review step's `expects` criteria (may be too strict)
- Check agent output includes "STATUS: done"
- Increase `retryLimit` in workflow YAML

## Next Steps

- [Create a custom workflow](./CREATING_WORKFLOWS.md)
- [Understand workflow architecture](./WORKFLOWS.md)
- [Integrate workflows with Coordinator](./WORKFLOWS.md#integration-with-coordinator)

## CLI Commands Reference (Coming Soon)

```bash
# List available workflows
mc workflow list

# Start a workflow run
mc workflow run <workflow-id> "<task>"

# Check run status
mc workflow status <run-id>

# List all runs
mc workflow runs

# Resume a paused run
mc workflow resume <run-id>
```

---

**Need help?** See [WORKFLOWS.md](./WORKFLOWS.md) for full documentation.
