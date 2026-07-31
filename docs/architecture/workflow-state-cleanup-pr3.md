# Truthful Task workflow states — PR 3

Date: 2026-07-31  
Branch: `codex/workflow-state-cleanup-pr3`

## Outcome

Mission Control now treats assignment as Task metadata and `READY` as the
canonical state for executable work. Existing `ASSIGNED` documents remain
valid and render in the Ready lane without being rewritten.

Review and Blocked states now retain structured decision context instead of
depending on transient UI state or a single loose string. The change is
additive and does not alter Work Order or Mission acceptance authority.

## Runtime contract

- New Inbox assignment enters `READY`.
- Readers project legacy `ASSIGNED` as Ready while preserving its raw status in
  event and transition history.
- Schedulers, agent heartbeat processing, health checks, SDKs, and pipeline
  views accept both values during the compatibility window.
- Every new Task writer records `stateEnteredAt`.
- Direct system writers for executor failure/completion, loop detection,
  stale-agent quarantine, budget gates, review messages, and duplicate
  cancellation now record state-entry time and a Task transition.

`tasks.review` retains owner, entry and completion timestamps, result, reason,
findings, decision actor, resubmission count, and decision history.

`tasks.blocker` retains type, reason, owner, required action, entry timestamp,
optional dependency/escalation, and resolution evidence. `reviewerId` and
`blockedReason` remain as compatibility fields.

## Guardrails

- Inbox → Ready requires an assignee.
- Ready → In Progress still requires a valid work plan.
- Review → In Progress is human-only and requires a reason of at least ten
  characters.
- Entering Blocked requires structured blocker context and a meaningful reason.
- Leaving Blocked for Ready or In Progress requires a resolution category and
  meaningful reason.
- Review → Done still uses the existing approval/policy gate; this PR does not
  introduce another acceptance path.
- Mutation idempotency and workspace ownership checks remain authoritative.

## Compatibility report

`tasks.getWorkflowStateCompatibilityReport` is workspace-scoped and read-only.
It returns raw and canonical counts, legacy Assigned eligibility/exclusions,
and Review/Blocked records without structured context. Its response explicitly
declares `mutatesData: false`.

The 2026-07-31 Software Factory Research Lab report found:

- 106 Tasks total;
- 20 legacy Assigned records, displayed with two native Ready records as 22
  Ready Tasks;
- zero legacy records eligible for automatic migration;
- 12 exclusions missing an assignee and 8 missing a canonical Work Order;
- 34 legacy Review records without structured context;
- zero current Blocked records missing structured context.

These numbers prohibit an automatic backfill in this cycle. The next data
cycle must first classify legacy relationships and define an idempotent repair
for Review history; it must not infer historical decisions.

## Operator experience

The Kanban board replaces Assigned with Ready and labels raw Assigned Tasks as
legacy. Task detail adds accessible, reasoned dialogs for Request changes,
Block, and Unblock. Empty or short reasons cannot be submitted. The Why tab
shows the read-only compatibility report beside the existing transition dry
run, making invalid requirements visible before mutation.

The Docs navigation also removes a duplicate Software Factory Enhancement
section and keeps all three bounded delivery cycles in one operator-facing
collection.

## Data integrity and rollback

No backfill, delete, or enum conversion ran. New schema fields are optional,
legacy validators remain available, and new writers dual-write compatibility
fields. Rolling back the UI and Ready writers leaves all additive data readable;
no restoration is needed.

Rollback is required for schema rejection, unexplained lane-count changes,
cross-workspace context, duplicate transition events, or an approval bypass.
Monitor transition failures mentioning Ready, Review, Blocked, or structured
context for 24 hours after merge.

## References

- `docs/plans/2026-07-31-feat-workflow-state-cleanup-plan.md`
- `docs/testing/workflow-state-cleanup-results.md`
- `convex/lib/taskWorkflowState.ts`
- `convex/tasks.ts`
- `apps/mission-control-ui/src/TaskDrawerTabs.tsx`
