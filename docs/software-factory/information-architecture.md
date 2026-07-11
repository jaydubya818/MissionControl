# MissionControl Software Factory Information Architecture

## Product north star

MissionControl should answer, in order:

1. What outcome was requested?
2. What execution is happening against it?
3. What is blocked or risky?
4. What evidence proves completion?
5. What requires Jay’s attention?
6. What should be learned and reused?

## Primary entities

### 1. WorkOrder

The requested unit of value and the new primary UI object.

Owns:

- title
- desired outcome
- context
- repository
- branch/worktree strategy
- risk and priority
- acceptance criteria
- dependencies
- required approvals
- source-of-truth declarations
- current lifecycle state

### 2. ExecutionRun

A governed execution attempt linked to a WorkOrder.

Owns:

- execution status
- runtime, model, tools, permissions
- worktree
- step timeline
- logs and artifacts
- retries and failure reasons
- human interventions

### 3. VerificationReceipt

Criterion-level proof that acceptance criteria were met.

### 4. ApprovalDecision

Human/policy decision records for risky or blocking work.

### 5. OutcomeMetrics

Operator-facing measures of delivery efficiency and quality.

### 6. LearningCandidate

Candidate reusable lesson for Agentic-KB.

## View architecture

## A. Factory Overview

Purpose: exception-first command surface.

Shows:

- active WorkOrders
- blocked WorkOrders
- runs requiring attention
- approval queue
- verification failures
- recently accepted outcomes
- human attention consumed

Not in first slice.

## B. Work Queue

Purpose: the main list surface for requested value.

Primary row fields:

- work order title
- desired outcome summary
- repository
- lifecycle state
- linked execution status
- risk
- verification status
- blocking issue
- required human action

This **is** in the first slice.

## C. WorkOrder Detail

Purpose: operator workspace for a single unit of requested value.

Sections for first slice:

- outcome and context
- acceptance criteria
- constraints and source of truth
- linked execution runs
- run timeline summary

Deferred sections:

- approvals
- pull request and checks
- verification receipts
- learning candidates
- outcome metrics

## D. Run Inspector

Purpose: inspect a linked ExecutionRun without mixing it into the request object.

First slice support:

- embedded linked run timeline on WorkOrder detail

Deferred:

- standalone run inspector view

## E. Approval Center

Existing approvals center can remain, but should become WorkOrder-aware.

## F. Verification Center

Deferred until VerificationReceipt exists.

## G. Factory Analytics

Deferred.

## H. Factory Configuration

Deferred.

## Navigation proposal

### Near-term incremental navigation

Keep the current shell. Add the software-factory slice under the existing control-plane area.

- `Control > Work Orders` — real data
- `Control > Fleet` — existing demo/data adapter surface
- `Control > Approvals` — existing approval surface
- `Control > Portfolio` — existing demo surface until replaced

This avoids a broad rewrite while establishing the correct center of gravity.

## Existing-to-target mapping

| Existing concept | Near-term role | Long-term role |
| --- | --- | --- |
| `tasks` | compatibility source for old work items | execution-level or legacy work item |
| `workflowRuns` | backing store for first ExecutionRun adapter | retained as workflow execution backbone |
| `approvals` | backing store for approval queue | backing store for ApprovalDecision-compatible views |
| `runs` + `toolCalls` | low-level execution telemetry | run inspector depth layer |
| `projects` | repo/workspace context | repo registry/configuration |

## First-slice IA decision

Implement:

1. first-class WorkOrder list
2. WorkOrder detail
3. linked ExecutionRuns shown as a timeline card stack

Do **not** attempt full overview, analytics, verification center, or KB ingestion in slice one.
