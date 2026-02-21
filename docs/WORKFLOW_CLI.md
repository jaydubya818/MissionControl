# Workflow CLI Guide

Command-line interface for managing Mission Control workflows.

## Installation

The `mc` CLI is part of the Mission Control monorepo:

```bash
cd packages/cli
pnpm install
pnpm build

# Make globally available (optional)
npm link
```

Or use directly via pnpm:
```bash
pnpm --filter @mission-control/cli dev
```

## Configuration

Set your Convex URL:

```bash
export CONVEX_URL=https://your-deployment.convex.cloud
```

Or create `.env` in project root:
```bash
CONVEX_URL=https://your-deployment.convex.cloud
```

## Commands

### `mc workflow list`

List all available workflows.

**Usage:**
```bash
mc workflow list
mc workflow list --all  # Include inactive workflows
```

**Example Output:**
```
┌──────────────────┬────────────────────┬────────┬───────┬────────┐
│ ID               │ Name               │ Agents │ Steps │ Status │
├──────────────────┼────────────────────┼────────┼───────┼────────┤
│ feature-dev      │ Feature Development│ 7      │ 7     │ Active │
│ bug-fix          │ Bug Fix            │ 6      │ 6     │ Active │
│ security-audit   │ Security Audit     │ 7      │ 7     │ Active │
│ code-review      │ Code Review        │ 4      │ 4     │ Active │
└──────────────────┴────────────────────┴────────┴───────┴────────┘

Total: 4 workflow(s)
```

### `mc workflow run`

Start a new workflow run.

**Usage:**
```bash
mc workflow run <workflow-id> "<task description>"
mc workflow run <workflow-id> "<task>" --project <project-id>
```

**Examples:**
```bash
# Feature development
mc workflow run feature-dev "Add user authentication with OAuth"

# Bug fix
mc workflow run bug-fix "Users can't log in after password reset"

# Security audit
mc workflow run security-audit "Scan codebase for vulnerabilities"

# Code review
mc workflow run code-review "Review PR #123: Add payment integration"
```

**Output:**
```
✔ Workflow started: a1fdf573

Workflow: Feature Development
Run ID: a1fdf573
Steps: 7

Use mc workflow status a1fdf573 to check progress
```

### `mc workflow status`

Check the status of a workflow run.

**Usage:**
```bash
mc workflow status <run-id>
mc workflow status <search-query>
```

**Examples:**
```bash
mc workflow status a1fdf573
mc workflow status "OAuth"  # Search by task description
```

**Output:**
```
Run ID: a1fdf573
Workflow: Feature Development
Status: RUNNING
Progress: 3/7 steps

┌───┬───────────┬─────────┬─────────┬──────────────┐
│ # │ Step      │ Status  │ Retries │ Duration     │
├───┼───────────┼─────────┼─────────┼──────────────┤
│ 1 │ plan      │ DONE    │ -       │ 45s          │
│ 2 │ setup     │ DONE    │ -       │ 23s          │
│ 3 │ implement │ RUNNING │ -       │ 120s (running)│
│ 4 │ verify    │ PENDING │ -       │ -            │
│ 5 │ test      │ PENDING │ -       │ -            │
│ 6 │ pr        │ PENDING │ -       │ -            │
│ 7 │ review    │ PENDING │ -       │ -            │
└───┴───────────┴─────────┴─────────┴──────────────┘

Running for 188s
```

### `mc workflow runs`

List all workflow runs.

**Usage:**
```bash
mc workflow runs
mc workflow runs --status RUNNING
mc workflow runs --workflow feature-dev
mc workflow runs --limit 50
```

**Options:**
- `-s, --status <status>` — Filter by status (RUNNING, COMPLETED, FAILED, PAUSED)
- `-w, --workflow <id>` — Filter by workflow ID
- `-l, --limit <number>` — Limit results (default: 20)

**Example Output:**
```
┌──────────┬─────────────┬───────────┬──────────┬─────────────────────┐
│ Run ID   │ Workflow    │ Status    │ Progress │ Started             │
├──────────┼─────────────┼───────────┼──────────┼─────────────────────┤
│ a1fdf573 │ feature-dev │ RUNNING   │ 3/7      │ 2/9/2026, 10:30 AM  │
│ b2e4c891 │ bug-fix     │ COMPLETED │ 6/6      │ 2/9/2026, 9:15 AM   │
│ c3f5d9a2 │ code-review │ FAILED    │ 2/4      │ 2/8/2026, 4:20 PM   │
└──────────┴─────────────┴───────────┴──────────┴─────────────────────┘

Total: 3 run(s)
```

### `mc workflow resume`

Resume a paused workflow run.

**Usage:**
```bash
mc workflow resume <run-id>
```

**Example:**
```bash
mc workflow resume a1fdf573
```

**Output:**
```
✔ Workflow resumed: a1fdf573

Use mc workflow status a1fdf573 to check progress
```

## Workflow Lifecycle

### Starting a Workflow

```bash
$ mc workflow run feature-dev "Add OAuth"
✔ Workflow started: a1fdf573
```

Creates a workflow run with:
- Status: PENDING
- All steps: PENDING
- Context: `{ task: "Add OAuth" }`

### Execution

Executor picks up the run:
1. Status → RUNNING
2. Step 1 → RUNNING (creates task)
3. Waits for task completion
4. Step 1 → DONE (extracts output)
5. Updates context with step output
6. Step 2 → RUNNING
7. ... continues until all steps complete

### Monitoring

```bash
$ mc workflow status a1fdf573
```

Shows real-time progress:
- Current step
- Step statuses
- Retry counts
- Errors
- Elapsed time

### Completion

When all steps are DONE:
- Status → COMPLETED
- Activity logged
- Metrics updated

### Failure Handling

If a step fails:
1. Retry (up to `retryLimit`)
2. If retries exhausted:
   - Status → PAUSED
   - Approval request created
   - Human reviews and decides

Resume after approval:
```bash
$ mc workflow resume a1fdf573
```

## Advanced Usage

### Filtering Runs

```bash
# Show only running workflows
mc workflow runs --status RUNNING

# Show only feature-dev runs
mc workflow runs --workflow feature-dev

# Show last 100 runs
mc workflow runs --limit 100

# Combine filters
mc workflow runs --status COMPLETED --workflow bug-fix --limit 10
```

### Searching Runs

```bash
# Search by run ID
mc workflow status a1fdf573

# Search by task description
mc workflow status "OAuth"
mc workflow status "authentication"
```

### Monitoring Multiple Runs

Use `watch` to monitor in real-time:

```bash
watch -n 2 "mc workflow runs --status RUNNING"
```

Or create a monitoring script:

```bash
#!/bin/bash
while true; do
  clear
  mc workflow runs --status RUNNING
  sleep 5
done
```

## Scripting

### Start Workflow from Script

```bash
#!/bin/bash
RUN_ID=$(mc workflow run feature-dev "Add OAuth" | grep "Run ID:" | awk '{print $3}')
echo "Started workflow: $RUN_ID"

# Wait for completion
while true; do
  STATUS=$(mc workflow status $RUN_ID | grep "Status:" | awk '{print $2}')
  
  if [ "$STATUS" = "COMPLETED" ]; then
    echo "Workflow completed successfully!"
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo "Workflow failed!"
    exit 1
  fi
  
  sleep 10
done
```

### Batch Workflow Execution

```bash
#!/bin/bash
TASKS=(
  "Add user authentication"
  "Add password reset"
  "Add email verification"
)

for TASK in "${TASKS[@]}"; do
  mc workflow run feature-dev "$TASK"
  echo "Started: $TASK"
done
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Run Workflow

on:
  workflow_dispatch:
    inputs:
      workflow_id:
        description: 'Workflow ID'
        required: true
      task:
        description: 'Task description'
        required: true

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build CLI
        run: pnpm --filter @mission-control/cli build
      
      - name: Run workflow
        env:
          CONVEX_URL: ${{ secrets.CONVEX_URL }}
        run: |
          mc workflow run ${{ inputs.workflow_id }} "${{ inputs.task }}"
```

## Troubleshooting

### "CONVEX_URL not set"

**Error:**
```
Error: CONVEX_URL environment variable not set
```

**Solution:**
```bash
export CONVEX_URL=https://your-deployment.convex.cloud
```

Or add to `.env` file.

### "Workflow not found"

**Error:**
```
Workflow not found: feature-dev
```

**Solution:**
Seed workflows first:
```bash
pnpm workflows:seed
```

### "Command not found: mc"

**Error:**
```bash
mc: command not found
```

**Solution:**
Either:
1. Run via pnpm: `pnpm --filter @mission-control/cli dev workflow list`
2. Link globally: `cd packages/cli && npm link`
3. Add to PATH: `export PATH=$PATH:./packages/cli/dist`

## Best Practices

1. **Use descriptive task descriptions** — Helps with searching and context
2. **Monitor long-running workflows** — Check status periodically
3. **Review failed runs** — Learn from failures to improve workflows
4. **Clean up old runs** — Archive completed runs after 30 days
5. **Use project IDs** — Scope workflows to specific projects

## Examples

### Daily Security Scan

```bash
#!/bin/bash
# Run daily security audit
mc workflow run security-audit "Daily security scan" --project prod
```

### Bug Triage Pipeline

```bash
#!/bin/bash
# Process bug reports from issue tracker
for BUG in $(gh issue list --label bug --json number,title --jq '.[] | "\(.number):\(.title)"'); do
  mc workflow run bug-fix "$BUG"
done
```

### Feature Development Pipeline

```bash
#!/bin/bash
# Process feature requests
FEATURES=$(cat features.txt)
while IFS= read -r FEATURE; do
  mc workflow run feature-dev "$FEATURE"
  sleep 60  # Rate limit
done <<< "$FEATURES"
```

---

**Next**: [Workflow Metrics Guide](./WORKFLOW_METRICS.md)
