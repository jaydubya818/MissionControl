# Creating Custom Workflows

This guide walks you through creating your own multi-agent workflows in Mission Control.

## Workflow Anatomy

A workflow consists of:
1. **Metadata**: ID, name, description
2. **Agents**: Persona assignments for each role
3. **Steps**: Sequential tasks with inputs, expectations, and retry logic

## Basic Structure

Create a new YAML file in `workflows/`:

```yaml
id: my-workflow
name: My Custom Workflow
description: "Brief description of what this workflow does"

agents:
  - id: researcher
    persona: Strategist
    workspace:
      files:
        AGENTS.md: agents/strategist/AGENTS.md

steps:
  - id: research
    agent: researcher
    input: |
      Research {{task}} and report findings.
      Reply with STATUS: done and FINDINGS: ...
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 15
```

## Agents Section

Define each agent role in your workflow:

```yaml
agents:
  - id: planner           # Unique ID within this workflow
    persona: Strategist   # Maps to agents/*.yaml persona
    workspace:            # Optional: agent-specific files
      files:
        AGENTS.md: agents/strategist/AGENTS.md
        CONTEXT.md: workflows/context/planning.md
```

### Available Personas

Mission Control includes these built-in personas:

- **Strategist**: Planning, decomposition, high-level design
- **Coder**: Implementation, code generation, refactoring
- **QA**: Testing, verification, quality assurance
- **Operations**: Setup, deployment, infrastructure
- **Compliance**: Security, audits, policy enforcement
- **Coordinator**: Orchestration, delegation, review

## Steps Section

Define the workflow sequence:

```yaml
steps:
  - id: step-name
    agent: agent-id
    input: |
      Multi-line input template.
      Use {{variables}} for context passing.
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 30
```

### Step Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique step identifier (lowercase, hyphens) |
| `agent` | string | Agent ID from the `agents` section |
| `input` | string | Template for step input (supports `{{variables}}`) |
| `expects` | string | Success criteria (e.g., "STATUS: done") |
| `retryLimit` | number | Max retry attempts on failure (0-5 recommended) |
| `timeoutMinutes` | number | Max execution time before timeout |

### Input Templates

Use Mustache-style variables to pass data between steps:

```yaml
steps:
  - id: plan
    agent: planner
    input: |
      Create a plan for: {{task}}
      Reply with STATUS: done and PLAN: ...
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 10

  - id: implement
    agent: developer
    input: |
      Implement the following plan:
      {{planOutput}}
      
      Reply with STATUS: done and IMPLEMENTATION: ...
    expects: "STATUS: done"
    retryLimit: 3
    timeoutMinutes: 45
```

**Available variables:**
- `{{task}}`: Initial workflow input
- `{{<stepId>Output}}`: Output from a previous step (e.g., `{{planOutput}}`)
- Any structured data extracted from previous steps (e.g., `{{STORIES}}`, `{{FINDINGS}}`)

### Status Markers

Agents must include explicit status markers in their output:

```
STATUS: done
KEY: value
KEY2: value2
```

The workflow engine parses these to:
- Confirm step completion (`STATUS: done`)
- Extract structured data (`KEY: value` pairs)
- Pass data to subsequent steps

**Example agent output:**
```
STATUS: done
STORIES: 5 stories defined
COST: $0.25

Story 1: User authentication
- Acceptance: Users can log in with OAuth
- Depends on: none

Story 2: Session management
- Acceptance: Sessions persist across page reloads
- Depends on: Story 1
```

### Retry Logic

Configure retry behavior per step:

```yaml
- id: flaky-step
  agent: developer
  input: "..."
  expects: "STATUS: done"
  retryLimit: 3        # Retry up to 3 times
  timeoutMinutes: 30   # 30 minutes per attempt
```

**Retry flow:**
1. Step fails (task fails, output doesn't match `expects`, or timeout)
2. Workflow engine increments retry count
3. Waits with exponential backoff (1s, 2s, 4s, 8s, ...)
4. Re-executes step with fresh context
5. If retries exhaust → escalate to human

## Example: Code Review Workflow

```yaml
id: code-review
name: Code Review
description: "Automated code review with security and style checks"

agents:
  - id: analyzer
    persona: QA
  
  - id: security-checker
    persona: Compliance
  
  - id: style-checker
    persona: QA
  
  - id: reviewer
    persona: Coordinator

steps:
  - id: analyze
    agent: analyzer
    input: |
      Analyze the code changes in: {{task}}
      
      Reply with STATUS: done and ANALYSIS: ...
      
      Check for:
      - Logic errors
      - Edge cases
      - Performance issues
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 10

  - id: security
    agent: security-checker
    input: |
      Review code for security issues:
      {{analyzeOutput}}
      
      Reply with STATUS: done and SECURITY: ...
      
      Check for:
      - Injection vulnerabilities
      - Authentication issues
      - Data exposure risks
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 10

  - id: style
    agent: style-checker
    input: |
      Check code style and conventions:
      {{analyzeOutput}}
      
      Reply with STATUS: done and STYLE: ...
      
      Verify:
      - Follows .cursorrules
      - Consistent naming
      - Proper documentation
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 5

  - id: review
    agent: reviewer
    input: |
      Final review and approval decision.
      
      Analysis: {{analyzeOutput}}
      Security: {{securityOutput}}
      Style: {{styleOutput}}
      
      Reply with STATUS: done and DECISION: approved/changes-requested
      
      If approved, state "DECISION: approved"
      If changes needed, list them clearly.
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 5
```

## Testing Your Workflow

### 1. Validate YAML Syntax

```bash
# Check YAML is valid
npx js-yaml workflows/my-workflow.yaml
```

### 2. Load into Mission Control

```typescript
import { loadWorkflow } from "@mission-control/workflow-engine";

const workflow = loadWorkflow("workflows/my-workflow.yaml");
console.log("Workflow loaded:", workflow.name);
```

### 3. Dry Run

Start a test run with a simple input:

```bash
mc workflow run my-workflow "Test input"
```

Monitor the workflow dashboard to see:
- Step progression
- Agent outputs
- Retry attempts
- Errors

### 4. Iterate

Based on test results:
- Adjust `expects` criteria if too strict/loose
- Increase `timeoutMinutes` for slow steps
- Add more context to `input` templates
- Refine agent instructions

## Best Practices

### 1. Clear Expectations
Be explicit about what constitutes success:

```yaml
expects: "STATUS: done"  # Good
expects: "done"          # Too vague
```

### 2. Structured Output
Guide agents to output structured data:

```yaml
input: |
  Research {{task}}.
  
  Reply with:
  STATUS: done
  FINDINGS: [summary]
  SOURCES: [list of sources]
  CONFIDENCE: [high/medium/low]
```

### 3. Reasonable Timeouts
Set timeouts based on step complexity:

- Simple checks: 5-10 minutes
- Implementation: 30-60 minutes
- Complex analysis: 15-30 minutes

### 4. Focused Steps
Each step should have one clear goal:

```yaml
# Good: focused
- id: implement-auth
  agent: developer
  input: "Implement OAuth authentication..."

# Bad: too broad
- id: implement-everything
  agent: developer
  input: "Implement all features..."
```

### 5. Verification Gates
Add verification steps after major work:

```yaml
- id: implement
  agent: developer
  input: "..."

- id: verify
  agent: verifier
  input: |
    Verify the implementation:
    {{implementOutput}}
    
    Check all acceptance criteria are met.
```

### 6. Context Passing
Pass only necessary context to each step:

```yaml
# Good: specific
input: "Implement: {{STORY_1}}"

# Bad: too much context
input: "{{planOutput}} {{setupOutput}} {{researchOutput}}"
```

## Advanced Patterns

### Sequential Dependencies

Steps execute in order by default:

```yaml
steps:
  - id: step1
    # ...
  - id: step2  # Depends on step1
    # ...
  - id: step3  # Depends on step2
    # ...
```

### Conditional Instructions

Use template variables for conditional logic:

```yaml
- id: deploy
  agent: ops
  input: |
    Deploy the application.
    
    {{#TESTS_PASSED}}
    All tests passed. Proceed with production deployment.
    {{/TESTS_PASSED}}
    
    {{^TESTS_PASSED}}
    Tests failed. Deploy to staging only.
    {{/TESTS_PASSED}}
```

### Multi-Agent Verification

Have multiple agents verify the same output:

```yaml
- id: implement
  agent: developer
  input: "..."

- id: verify-logic
  agent: qa
  input: "Verify logic: {{implementOutput}}"

- id: verify-security
  agent: compliance
  input: "Verify security: {{implementOutput}}"
```

## Troubleshooting

### "Agent not found" error
- Check that `persona` in `agents` section matches an existing persona
- Verify persona YAML files exist in `agents/` directory

### "Missing context variable" error
- Ensure the variable name matches the step ID (e.g., `{{planOutput}}` for step `plan`)
- Check that the previous step completed successfully

### Steps timing out
- Increase `timeoutMinutes` for complex steps
- Simplify the step's scope
- Split into multiple smaller steps

### Retries not working
- Verify `expects` criteria matches agent output format
- Check agent is outputting "STATUS: done"
- Review error logs for the specific failure reason

## Publishing Your Workflow

Once tested and refined:

1. **Document it**: Add comments explaining each step's purpose
2. **Add examples**: Include sample inputs in the description
3. **Test edge cases**: Try with various inputs to ensure robustness
4. **Share**: Commit to your repo or contribute to Mission Control

---

**Next**: [Workflow Architecture](./WORKFLOWS.md)
