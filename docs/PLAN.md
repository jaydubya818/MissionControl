# Build Plan

Date: 2026-02-12  
Branch: `feat/prd-roadmap-impl-20260212`

## Milestone 1: Canonical Timeline Hardening (Roadmap "Now" / Control Plane Hardening)

Goal: make `taskEvents` reliable as the canonical timeline with deterministic IDs and backfill support.

### API Endpoints To Add/Modify

- Add `convex/taskEvents.ts`
  - `listByTask`
  - `backfillTask`
  - `backfillProject` (project-scoped batch)
- Modify `convex/lib/taskEvents.ts`
  - deterministic event ID generation helper
  - optional rule ID support
  - idempotent insert behavior by event ID
- Modify `convex/policy.ts`
  - optional `taskId` support on evaluation path
  - emit `POLICY_DECISION` task events when task context exists
- Add `convex/toolCalls.ts`
  - `start` tool call
  - `complete` tool call
  - emit `TOOL_CALL` events

### DB Schema Changes / Migrations

- Update `taskEvents` schema in `convex/schema.ts`:
  - add `eventId: string`
  - add `ruleId?: string`
  - add index `by_event_id`
- No destructive migration.
- Backfill handled through new mutation (`taskEvents.backfill*`) instead of offline script.

### UI Screens / Components

- Update `TaskDrawerTabs` timeline tab:
  - show `eventId` and `ruleId` for auditability
  - add timeline backfill action when canonical stream is empty or partial

### Tests To Add

- Add unit tests for deterministic event ID generation + idempotency helper behavior.
- Add tests for backfill mapping logic (transition/run/approval -> event stream).
- Add tests for policy decision event logging with/without task context.

### Acceptance Criteria

- Every new timeline event written via helper includes `eventId`.
- Policy evaluations with a task context emit `POLICY_DECISION` events.
- Tool call lifecycle writes both tool call records and `TOOL_CALL` timeline events.
- Backfill endpoint can populate canonical timeline for an existing task without duplicates.
- Task drawer timeline renders canonical events including event metadata.

---

## Milestone 2: Security + Tenancy Hardening (Roadmap "Next")

Goal: enforce project-scoped read/write behavior and baseline authz checks on sensitive mutations.

### API Endpoints To Add/Modify

- Add shared guard helpers for:
  - required project scope
  - mutation actor permission checks
- Apply guards to high-risk surfaces first:
  - task/approval list + search queries
  - policy and operator-control mutations
  - admin/org mutations

### DB Schema Changes / Migrations

- Add explicit project-scoped policy/auth metadata fields where missing.
- Add indexes needed for project-scoped query paths to avoid fallback `.collect()` scans.

### UI Screens / Components

- Project selector enforcement states:
  - clear empty/error states when no project selected
- Permission-aware disabled controls for sensitive actions.

### Tests To Add

- Cross-project access denial tests.
- Mutation authz path tests for operator-sensitive flows.
- Query coverage tests ensuring project filters are applied.

### Acceptance Criteria

- No sensitive list/search surface returns cross-project data without explicit scope.
- Sensitive mutations fail fast when actor does not satisfy authz checks.
- Existing primary operator flows remain functional with explicit project selection.

---

## Milestone 3: Query Performance + Workflow Operability (Roadmap "Next" + "Later")

Goal: reduce hot-path query overhead and close workflow execution usability gaps.

### API Endpoints To Add/Modify

- Replace hot `.collect()` + in-memory filter paths in:
  - dashboard aggregates
  - timeline/report queries
  - task/approval summary views
- Finish workflow install path:
  - implement `workflows.install` from YAML
  - add runtime validation + error reporting

### DB Schema Changes / Migrations

- Add/adjust indexes for hottest filtered query paths.
- No breaking schema changes expected.

### UI Screens / Components

- Wire workflow dashboard/selector into main nav flow.
- Add operator visibility into workflow failures/retries/escalations.

### Tests To Add

- Query performance smoke benchmarks (bounded data volumes).
- Workflow install/validation tests.
- Workflow run status transitions + retry behavior tests.

### Acceptance Criteria

- Critical dashboard queries avoid broad unindexed scans.
- Workflow install is operational (no stub path) with deterministic validation errors.
- Workflow UI surfaces are reachable from primary app navigation.

---

## Risks & Mitigations

- Risk: schema changes to `taskEvents` break timeline reads.
  - Mitigation: additive-only schema updates + backfill path + UI fallback retained initially.
- Risk: duplicate event writes during retries/backfill.
  - Mitigation: deterministic `eventId` + index-based idempotent insert checks.
- Risk: expanding project-scope enforcement causes UI regressions.
  - Mitigation: phase enforcement by surface + explicit empty/error UI states + integration checks.
- Risk: broad query refactors can cause hidden latency regressions.
  - Mitigation: index-first changes with before/after timing checks on representative queries.
