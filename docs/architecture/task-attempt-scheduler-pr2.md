# Governed Task Attempt Scheduler PR 2

Date: 2026-07-30
Branch: `codex/task-attempt-scheduler-pr2`
Design sources: PR #41 and PR #45

## Outcome

Mission Control now schedules execution against an explicit governed Child
Task:

`Mission → Work Order → Task → Attempt`

Work Order dispatch remains the only execution authority. The scheduler adds
Task identity and Task-level retry rules to that existing transaction; it does
not create a second execution API or bypass approval, revision, risk, model,
active-run, or verification gates.

## Scheduling contract

When canonical Child Tasks exist, the operator must choose one. The backend
rejects a missing, deleted, cross-Work-Order, cross-workspace, Ungoverned,
Inbox, Review, Done, or Canceled Task. Only `ASSIGNED` and `IN_PROGRESS` Tasks
are schedulable.

Work Orders without canonical Child Tasks retain the legacy dispatch path.
Historical legacy WorkflowRuns also retain their existing recovery path instead
of being reclassified as canonical Task Attempts.

### Narrow Task-less pre-execution recovery

An explicit retry may atomically establish the missing canonical boundary only
when the control plane can prove that a Task-less failed run stopped before the
executor boundary. V1 recognizes only the historical stored-manifest digest
mismatch: the frozen manifest recomputes to a different digest, the terminal
failure is the exact manifest-validation failure, recorded spend is zero, and
there is no executor execution event, sandbox allocation, or artifact. The
claim-time `executorInvocationId` marker is not execution-start evidence.

The retry transaction creates one system-owned governed Child Task, advances
it from `INBOX` to `READY` with an audited transition, reconciles only the
failed run's reservation to proven zero spend, and creates the replacement
Attempt under the new Task. If routing or any later dispatch gate fails, the
entire recovery rolls back. The failed WorkflowRun remains Task-less and its
manifest, status, events, and failure evidence are never rewritten. The new
run is the first canonical Task Attempt while retaining explicit Work Order
retry causation to the historical run and reusing its exact frozen Factory
Version.

If that first canonical Attempt fails at the same pre-execution validation
boundary, recovery reuses the existing Task rather than materializing another
one. The only currently recognized Task-linked case is the claim-envelope
transport defect: the stored manifest digest must validate, its Task causation
and frozen executor identity must match the run, the exact event history must
contain only start, claim checkpoint, and manifest-validation failure, spend
must be zero, and no artifact, sandbox, or credential grant may exist. The
claim response carries `executorAdapter` and `executorVersion` so the worker can
validate the manifest against the same immutable identity. A qualifying retry
releases only that Attempt's reservation and starts the next Attempt under the
same Task and exact Factory Version; any later admission failure rolls the
entire transaction back.

## Attempt identity and retry

Each successful dispatch creates one immutable WorkflowRun with:

- canonical `parentTaskId`;
- Task Attempt number;
- retry number;
- retry source and operator recovery reason when applicable.

The first dispatch is allowed only when the Task has no Attempt. Retry is
allowed only for the latest failed Attempt, under the same Task and Work Order,
with no active Attempt and a reason of at least ten characters. A retry creates
a new WorkflowRun; the failed run remains available as evidence.

Idempotency is enforced before event creation. Replaying the same dispatch key
returns the existing WorkflowRun and does not duplicate Task or Work Order
events.

## Operator experience

- Work Order detail provides an accessible `Task to execute` selector.
- Dispatch remains disabled until an eligible Child Task is selected.
- Linked execution runs show the Task title.
- Task detail shows total Attempts, retry count, status, timestamp, and run ID.
- Start and retry controls are shown only when the current Work Order and Task
  state permit them.
- Retry failure is rendered inline and the recovery reason is associated with
  its field.
- Refresh and browser history preserve the stored hierarchy and Attempt
  history.

## Deliberate boundaries

- One active WorkflowRun per Work Order remains authoritative.
- Attempt status does not silently move Task state.
- Task completion does not accept the Work Order.
- No historical backfill or destructive migration is performed.
- No general reservation refund or legacy Task backfill is introduced; the
  pre-execution recovery predicate is intentionally exact and fail-closed.
- Parallel Child Task execution, automatic Task selection, and Kanban redesign
  remain separate product decisions.

## Rollback

Remove the Task selector and Task detail scheduling controls, stop forwarding
`taskId`, and revert Task policy checks and metadata in `workOrders.dispatch`.
Existing Task-scoped WorkflowRuns remain readable through the PR #45
projection. No stored Task or WorkflowRun must be deleted.

## Monitoring

For the first 24 hours, monitor failed Task selection, active-run collisions,
stale/non-failed retry rejection, idempotent replay, Attempts per Task, and
WorkflowRuns missing canonical `parentTaskId`. Roll back if a cross-Task link,
duplicate Attempt, or governance bypass is observed.

## References

- `docs/plans/2026-07-30-feat-task-attempt-scheduler-plan.md`
- `docs/testing/task-attempt-scheduler-results.md`
- `convex/lib/taskAttemptScheduler.ts`
- `convex/workOrders.ts`
- `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`
- `apps/mission-control-ui/src/TaskDrawerTabs.tsx`
