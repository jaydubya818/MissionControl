# Workflow Examples

Practical examples of workflows for common development scenarios.

## Code Review Workflow

**Use case**: Automated code review with security, style, and logic checks.

**Workflow**: `code-review` (4 agents)

**Steps**: analyze → security → style → approve

### When to Use

- Before merging PRs
- After completing a feature
- For security-sensitive changes
- When onboarding new code

### Example Usage

```bash
mc workflow run code-review "Review PR #123: Add OAuth authentication"
```

### What It Does

1. **Analyzer** (QA) checks for logic errors, edge cases, performance issues
2. **Security Checker** (Compliance) scans for vulnerabilities (injection, XSS, auth issues)
3. **Style Checker** (QA) verifies code follows project conventions
4. **Reviewer** (Coordinator) makes final approval decision

### Expected Output

```
STATUS: done
DECISION: approved
SUMMARY: Code is well-structured with proper error handling.
No security issues found. Follows all project conventions.
```

Or if changes needed:

```
STATUS: done
DECISION: changes-requested
REQUIRED_CHANGES:
- Fix SQL injection risk in user query (line 45)
- Add error handling for API timeout (line 78)
OPTIONAL_IMPROVEMENTS:
- Consider extracting validation logic to separate function
- Add JSDoc comments for public methods
```

---

## Data Migration Workflow

**Use case**: Safe database schema changes with rollback capability.

**Workflow**: `data-migration` (5 agents)

**Steps**: plan → backup → migrate → verify → rollback-plan

### Example Definition

```yaml
id: data-migration
name: Data Migration
description: "Safe database migrations with verification and rollback"

agents:
  - id: planner
    persona: Strategist
  - id: backup-agent
    persona: Operations
  - id: migrator
    persona: Coder
  - id: verifier
    persona: QA
  - id: rollback-planner
    persona: Operations

steps:
  - id: plan
    agent: planner
    input: |
      Plan the database migration:
      {{task}}
      
      Reply with STATUS: done and PLAN: ...
      
      Include:
      - Migration steps
      - Data affected
      - Downtime estimate
      - Risk assessment
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 15

  - id: backup
    agent: backup-agent
    input: |
      Create backup before migration:
      {{planOutput}}
      
      Reply with STATUS: done and BACKUP: ...
      
      Backup:
      - Database snapshot
      - Affected tables
      - Verification checksum
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 20

  - id: migrate
    agent: migrator
    input: |
      Execute the migration:
      {{planOutput}}
      
      Backup: {{backupOutput}}
      
      Reply with STATUS: done and MIGRATION: ...
      
      Execute migration steps carefully.
      Log each step.
      Stop on first error.
    expects: "STATUS: done"
    retryLimit: 0
    timeoutMinutes: 30

  - id: verify
    agent: verifier
    input: |
      Verify migration success:
      {{migrateOutput}}
      
      Reply with STATUS: done and VERIFICATION: ...
      
      Check:
      - All data migrated correctly
      - No data loss
      - Constraints valid
      - Application still works
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 15

  - id: rollback-plan
    agent: rollback-planner
    input: |
      Document rollback procedure:
      {{planOutput}}
      {{migrateOutput}}
      
      Reply with STATUS: done and ROLLBACK_PLAN: ...
      
      Create rollback steps in case issues arise later.
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 10
```

---

## Documentation Generation Workflow

**Use case**: Generate comprehensive documentation from code.

**Workflow**: `doc-gen` (3 agents)

**Steps**: analyze → generate → review

### Example Definition

```yaml
id: doc-gen
name: Documentation Generation
description: "Generate docs from code with examples and diagrams"

agents:
  - id: analyzer
    persona: Coder
  - id: writer
    persona: Strategist
  - id: reviewer
    persona: QA

steps:
  - id: analyze
    agent: analyzer
    input: |
      Analyze the codebase:
      {{task}}
      
      Reply with STATUS: done and STRUCTURE: ...
      
      Document:
      - Module structure
      - Key functions/classes
      - Dependencies
      - Entry points
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 20

  - id: generate
    agent: writer
    input: |
      Generate documentation:
      {{structureOutput}}
      
      Reply with STATUS: done and DOCS: ...
      
      Create:
      - README with overview
      - API documentation
      - Usage examples
      - Architecture diagrams (mermaid)
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 30

  - id: review
    agent: reviewer
    input: |
      Review documentation quality:
      {{docsOutput}}
      
      Reply with STATUS: done and REVIEW: ...
      
      Check:
      - Accuracy
      - Completeness
      - Clarity
      - Examples work
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 10
```

---

## Dependency Update Workflow

**Use case**: Update dependencies with testing and rollback.

**Workflow**: `dep-update` (5 agents)

**Steps**: audit → plan → update → test → verify

### Example Definition

```yaml
id: dep-update
name: Dependency Update
description: "Safe dependency updates with testing"

agents:
  - id: auditor
    persona: Compliance
  - id: planner
    persona: Strategist
  - id: updater
    persona: Operations
  - id: tester
    persona: QA
  - id: verifier
    persona: QA

steps:
  - id: audit
    agent: auditor
    input: |
      Audit current dependencies:
      {{task}}
      
      Reply with STATUS: done and AUDIT: ...
      
      Run: npm audit or pnpm audit
      
      Report:
      - Vulnerabilities found
      - Outdated packages
      - Breaking changes
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 10

  - id: plan
    agent: planner
    input: |
      Plan dependency updates:
      {{auditOutput}}
      
      Reply with STATUS: done and PLAN: ...
      
      Prioritize:
      - Security fixes first
      - Breaking changes
      - Minor updates
      
      Include migration steps for breaking changes.
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 15

  - id: update
    agent: updater
    input: |
      Update dependencies:
      {{planOutput}}
      
      Reply with STATUS: done and UPDATES: ...
      
      Execute:
      - Update package.json
      - Run install
      - Fix breaking changes
      - Update lock file
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 30

  - id: test
    agent: tester
    input: |
      Run full test suite:
      {{updateOutput}}
      
      Reply with STATUS: done and TEST_RESULTS: ...
      
      Run:
      - Unit tests
      - Integration tests
      - Type checking
      - Linting
      - Build verification
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 25

  - id: verify
    agent: verifier
    input: |
      Final verification:
      {{testOutput}}
      
      Reply with STATUS: done and VERIFICATION: ...
      
      Confirm:
      - All tests pass
      - No new warnings
      - Application runs
      - No regressions
    expects: "STATUS: done"
    retryLimit: 1
    timeoutMinutes: 10
```

---

## Performance Optimization Workflow

**Use case**: Identify and fix performance bottlenecks.

**Workflow**: `perf-opt` (4 agents)

**Steps**: profile → analyze → optimize → benchmark

### Key Features

- Profiles application performance
- Identifies bottlenecks (CPU, memory, network)
- Implements optimizations
- Benchmarks improvements

### Example Usage

```bash
mc workflow run perf-opt "Optimize dashboard load time"
```

---

## Refactoring Workflow

**Use case**: Safe refactoring with comprehensive testing.

**Workflow**: `refactor` (5 agents)

**Steps**: analyze → plan → refactor → test → verify

### Key Features

- Analyzes code structure
- Plans refactoring strategy
- Executes refactoring incrementally
- Tests after each change
- Verifies no regressions

### Example Usage

```bash
mc workflow run refactor "Extract authentication logic to separate module"
```

---

## API Integration Workflow

**Use case**: Add external API integration with error handling.

**Workflow**: `api-integration` (6 agents)

**Steps**: research → design → implement → test → document → review

### Key Features

- Researches API documentation
- Designs integration architecture
- Implements with proper error handling
- Tests edge cases and failures
- Documents usage
- Reviews security and reliability

### Example Usage

```bash
mc workflow run api-integration "Integrate Stripe payment API"
```

---

## Creating Your Own Workflow

See [CREATING_WORKFLOWS.md](./CREATING_WORKFLOWS.md) for a complete guide on defining custom workflows.

### Quick Template

```yaml
id: my-workflow
name: My Workflow
description: "Brief description"

agents:
  - id: agent1
    persona: Coder

steps:
  - id: step1
    agent: agent1
    input: |
      Do something with: {{task}}
      Reply with STATUS: done and RESULT: ...
    expects: "STATUS: done"
    retryLimit: 2
    timeoutMinutes: 15
```

---

## Best Practices from Examples

### 1. Clear Success Criteria
Every step has explicit "expects" criteria (usually "STATUS: done").

### 2. Structured Output
Agents output structured data (KEY: value) for next steps.

### 3. Verification Gates
Critical steps (implement, migrate) are followed by verification steps.

### 4. Reasonable Timeouts
- Analysis: 10-20 minutes
- Implementation: 30-45 minutes
- Testing: 20-30 minutes
- Review: 5-10 minutes

### 5. Appropriate Retry Limits
- Critical operations (migrations): 0 retries
- Standard operations: 1-2 retries
- Flaky operations (external APIs): 3 retries

### 6. Context Passing
Pass only necessary context to each step using `{{variables}}`.

---

**Next**: [Creating Custom Workflows](./CREATING_WORKFLOWS.md)
