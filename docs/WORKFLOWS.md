# Workflows — Multi-Agent Orchestration

Mission Control's workflow system enables deterministic, multi-agent task execution inspired by [Antfarm](https://github.com/snarktank/antfarm). Workflows define a sequence of steps, each executed by a specific agent, with automatic retries, verification gates, and escalation to humans when needed.

## Core Principles

### 1. Deterministic Workflows
Same workflow, same steps, same order. No "hopefully the agent remembers to test." Every execution follows the exact same path.

### 2. Agent Verification
Agents verify each other's work. The developer doesn't mark their own homework — a separate verifier checks every story against acceptance criteria.

### 3. Fresh Context Per Step (Ralph Loop)
Each agent gets a clean session with fresh context. No context window bloat. No hallucinated state from 50 messages ago. Output from previous steps is passed as structured data via template variables.

### 4. Retry and Escalate
Failed steps retry automatically (configurable limit). If retries exhaust, the workflow pauses and escalates to human approval. Nothing fails silently.

## Built-in Workflows

### Feature Development (`feature-dev`)
**7 agents**: plan → setup → implement → verify → test → PR → review

Drop in a feature request, get back a tested PR.

- **Planner** (Strategist) decomposes your task into stories
- **Setup** (Operations) prepares the development environment
- **Developer** (Coder) implements each story in isolation
- **Verifier** (QA) checks implementation against acceptance criteria
- **Tester** (QA) runs comprehensive tests
- **PR Creator** (Operations) creates the pull request
- **Reviewer** (Coordinator) approves for merge

**Example:**
```bash
mc workflow run feature-dev "Add user authentication with OAuth"
```

### Bug Fix (`bug-fix`)
**6 agents**: triage → investigate → setup → fix → verify → PR

Paste a bug report, get back a fix with regression test.

- **Triager** (QA) reproduces the bug
- **Investigator** (Coder) finds root cause
- **Setup** (Operations) prepares fix environment
- **Fixer** (Coder) patches the issue
- **Verifier** (QA) confirms the fix
- **PR Creator** (Operations) creates the pull request

**Example:**
```bash
mc workflow run bug-fix "Users can't log in after password reset"
```

### Security Audit (`security-audit`)
**7 agents**: scan → prioritize → setup → fix → verify → test → PR

Point it at a repo, get back a security fix PR with regression tests.

- **Scanner** (Compliance) scans for vulnerabilities
- **Prioritizer** (Compliance) ranks by severity
- **Setup** (Operations) prepares fix environment
- **Fixer** (Coder) patches each vulnerability
- **Verifier** (Compliance) re-audits after fixes
- **Tester** (QA) runs regression tests
- **PR Creator** (Operations) creates the pull request

**Example:**
```bash
mc workflow run security-audit "Scan codebase for vulnerabilities"
```

## How It Works

### 1. Workflow Definitions (YAML)
Workflows are defined in `workflows/*.yaml` files with:
- **Agents**: Persona assignments (Strategist, Coder, QA, etc.)
- **Steps**: Sequential tasks with input templates, expectations, retry limits, and timeouts

Example step:
```yaml
- id: implement
  agent: developer
  input: |
    Implement the following stories:
    {{planOutput}}
    
    Reply with STATUS: done and IMPLEMENTATION: ...
  expects: "STATUS: done"
  retryLimit: 3
  timeoutMinutes: 45
```

### 2. Workflow Runs (Execution State)
When you start a workflow, Mission Control creates a `workflowRun` that tracks:
- Current step index
- Step statuses (PENDING, RUNNING, DONE, FAILED)
- Context variables (passed between steps)
- Retry counts
- Errors and outputs

### 3. Context Passing
Steps communicate via Mustache-style template variables:
```yaml
input: |
  Verify the implementation:
  {{implementOutput}}
```

The `{{implementOutput}}` variable is populated with the output from the `implement` step.

### 4. Status Markers
Agents signal completion with explicit status markers:
```
STATUS: done
STORIES: 5 stories defined
COST: $0.25
```

The workflow engine parses these markers to:
- Confirm step completion
- Extract structured data for next steps
- Determine if retry is needed

### 5. Automatic Retry
If a step fails (task fails, output doesn't meet expectations, or timeout), the workflow:
1. Increments retry count
2. Waits with exponential backoff
3. Re-executes the step with fresh context

If retries exhaust (e.g., 3 attempts), the workflow pauses and escalates.

### 6. Escalation to Human
When a step fails after all retries:
1. Workflow status → `PAUSED`
2. Approval request created in Mission Control
3. Human reviews the error and decides:
   - Approve retry (workflow resumes)
   - Cancel workflow
   - Modify and retry

## Architecture

### Database Schema

**`workflows` table**
```typescript
{
  workflowId: string;
  name: string;
  description: string;
  agents: Array<{ id, persona, workspace }>;
  steps: Array<{ id, agent, input, expects, retryLimit, timeoutMinutes }>;
  active: boolean;
  version: number;
}
```

**`workflowRuns` table**
```typescript
{
  runId: string;
  workflowId: string;
  projectId: Id<"projects">;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  currentStepIndex: number;
  steps: Array<{ stepId, status, taskId, agentId, retryCount, error, output }>;
  context: Record<string, any>;
  initialInput: string;
  startedAt: number;
  completedAt?: number;
}
```

### Workflow Engine (`@mission-control/workflow-engine`)

**Executor** (`executor.ts`)
- Polls for workflow runs in PENDING/RUNNING status
- Executes current step by creating a task
- Waits for task completion
- Extracts output, updates context, advances to next step
- Handles retries and escalation

**Renderer** (`renderer.ts`)
- Renders step input templates with context variables
- Uses Mustache syntax: `{{variable}}`
- Validates that all required variables are present

**Parser** (`parser.ts`)
- Parses agent outputs for "STATUS: done" markers
- Extracts structured data (KEY: value pairs)
- Checks if output meets expectations

**Loader** (`loader.ts`)
- Loads workflow definitions from YAML files
- Validates workflow structure
- Provides type-safe workflow objects

## UI Components

### Workflow Dashboard
- Lists all workflow runs with filtering (status, workflow type)
- Real-time progress via Convex subscriptions
- Click to view detailed run panel

### Workflow Run Panel
- Step-by-step progress indicators
- Live status updates (PENDING, RUNNING, DONE, FAILED)
- Retry counts and error messages
- Elapsed time per step
- Context variables display

### Workflow Selector
- Modal for choosing and starting a workflow
- Pre-filled examples for each workflow type
- Input validation

## CLI Commands

```bash
# List available workflows
mc workflow list

# Start a workflow run
mc workflow run <workflow-id> "<task description>"

# Check run status
mc workflow status <run-id or query>

# List all runs
mc workflow runs

# Resume a paused run (after approval)
mc workflow resume <run-id>
```

## Creating Custom Workflows

See [CREATING_WORKFLOWS.md](./CREATING_WORKFLOWS.md) for a guide on defining your own workflows.

## Integration with Coordinator

The Coordinator can automatically trigger workflows based on task characteristics:

```typescript
import { analyzeForWorkflow, shouldAutoTrigger } from "@mission-control/coordinator";

const analysis = analyzeForWorkflow(task);

if (shouldAutoTrigger(analysis)) {
  // Start workflow run automatically
  await startWorkflowRun({
    workflowId: analysis.suggestedWorkflow,
    projectId: task.projectId,
    initialInput: task.description,
  });
}
```

Patterns recognized:
- **Feature development**: "add feature", "implement feature", "new feature"
- **Bug fixes**: "fix bug", "bug fix", "broken", "not working"
- **Security**: "security", "vulnerability", "audit", "CVE"

## Comparison to Traditional Task Decomposition

| Aspect | Traditional Decomposition | Workflow-Based |
|--------|--------------------------|----------------|
| **Consistency** | Varies by agent | Same steps every time |
| **Verification** | Optional | Built-in verification gates |
| **Context** | Accumulates over time | Fresh per step (Ralph loop) |
| **Failure Handling** | Manual intervention | Automatic retry + escalation |
| **Predictability** | Low (agent-dependent) | High (deterministic) |
| **Complexity** | Good for simple tasks | Ideal for complex, multi-step workflows |

## Best Practices

1. **Use workflows for repeatable processes**: Feature development, bug fixes, security audits
2. **Use traditional decomposition for one-off tasks**: Ad-hoc research, exploratory work
3. **Define clear expectations**: Use explicit "STATUS: done" markers
4. **Keep steps focused**: Each step should have a single, clear deliverable
5. **Set realistic timeouts**: Allow enough time for complex steps
6. **Test workflows thoroughly**: Run through the full workflow before production use
7. **Monitor and iterate**: Review failed runs to improve workflow definitions

## Troubleshooting

### Workflow stuck in RUNNING
- Check if the current step's task is blocked
- Verify agent is online and claiming tasks
- Check for timeout issues (increase `timeoutMinutes` if needed)

### Step keeps failing
- Review the step's `expects` criteria — is it too strict?
- Check agent output format — does it include "STATUS: done"?
- Increase `retryLimit` if transient failures are expected

### Context variables missing
- Ensure previous steps output the required data
- Check template variable names match exactly (case-sensitive)
- Use `{{stepIdOutput}}` convention for step outputs

## Future Enhancements

- **Parallel steps**: Execute independent steps concurrently
- **Conditional branching**: Skip steps based on previous outputs
- **Workflow composition**: Nest workflows within workflows
- **Custom retry strategies**: Exponential backoff, jitter, custom delays
- **Workflow templates**: Generate workflows from high-level descriptions
- **Metrics and analytics**: Track workflow success rates, step durations, bottlenecks

---

**Next**: [Creating Custom Workflows](./CREATING_WORKFLOWS.md)
