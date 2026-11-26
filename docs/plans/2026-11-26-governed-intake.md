# Governed external work intake

## Purpose

Accept eligible GitHub issues and signed application-error reports into existing
Mission and incident records. Receipt of an event does not approve a plan, start
an Attempt, accept a candidate, or establish application restoration.

## Design decision

The direct extension adds repository-scoped policies and a durable delivery
ledger. It uses the current Mission draft model, planning API, incident lifecycle,
and release evidence. A separate coordinator would duplicate execution and
approval state, so it is excluded. Root reviewed this choice before implementation.

An authenticated operator with factory automation permission configures a policy.
The policy binds the project, repository, owner, team, code scopes, budgets,
eligible external actors, and source configuration. Ingress checks signatures
before it records accepted work. Each delivery retains a digest of its exact
body and a bounded, scrubbed snapshot. Processing is transactional and retries
converge on the same canonical records. A new provider event can correlate with
an existing active Mission without creating another Mission.

GitHub issue intake extends the existing App route and installation binding.
Application errors use a documented normalized, signed envelope. This endpoint
does not claim to be a native Sentry or Grafana integration. A provider adapter
must map its identifiers to the configured application and canonical release.

## Authority and lifecycle

Intake creates DRAFT Missions with complete delivery scope and configured budget.
An authenticated action calls the existing `missionPlanning.request` entry point.
The existing planning worker and plan approval path own later transitions.
The intake query projects associated plans and WorkOrders from canonical records.
No external issue text can grant approval or expand scope.

Application errors also create canonical incidents in CLARIFY. Later occurrences
correlate with active work. A reopened source after completed work can create a
bounded follow-up. Provider resolution is only source evidence. Restoration
requires a current canonical release, matching verified repair WorkOrder, and
independent browser evidence. It never advances the incident's restoration or
resolution authority automatically.

## Failure and replay

The normalized intake ledger stores RECEIVED before scheduling processing.
Processing commits Mission, incident, and linkage together. A separate failure
record preserves a failed attempt and schedules a bounded retry. Operator replay
uses existing stored input and current policy. An exhausted delivery is visible.

GitHub redelivery can retry a failed or expired received record when the exact
body and source bindings match and the attempt limit remains. A processing
generation fences late completions. Rejected signatures do not reserve a
provider delivery ID.

## Verification

Behavioral tests cover signature and timestamp checks, scoped permissions,
untrusted or mismatched inputs, duplicate delivery, conflicting replay, policy
revocation, crash recovery, active-work correlation, recurrence, budgets,
canonical Mission linkage, and restoration evidence. Test fixtures do not prove
a live provider connection or an admitted worker run.
