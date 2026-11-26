# Public configuration authorization

## Scope and design

The authorization unit protects org-member profiles, outbound webhook
configuration, and legacy scheduled jobs. Their public handlers previously
trusted record IDs or optional project filters without consistently resolving
the caller. Org-member project access is consulted by the workspace access
resolver, so writes require company-level `members.manage`.

The chosen design extends the existing company/workspace permission model with
small module-local boundary helpers. A generic function wrapper was rejected
because it would conceal the different meanings of company-scoped members,
project-scoped hooks, internal delivery, and internal scheduled execution.

Public handlers require a real identity even in anonymous demo mode. Existing
record IDs supply their scope. Lists without a project filter include only
accessible records. Unbound legacy hooks and jobs cannot be publicly managed or
used as an implicit global scope. References cannot cross companies. Webhook
secrets remain internal and actor attribution comes from authenticated records.

No canonical operator roles or role assignments are edited by this unit.
Canonical last-owner protection remains in `companyMembers`. The org profile's
legacy `systemRole` field does not become an authorization source.

## Verification contract

Drive the actual registered handlers with the real company/workspace permission
helpers and a controlled database. Cover anonymous callers with demo enabled,
wrong company/project, insufficient permission, valid administration, spoofed
actor attribution, linked-record mismatches, and internal delivery/scheduling.
Denied calls must not write or schedule work. Retain baseline failures and final
results. These tests do not contact an external provider or prove hosted access.

## Separate execution defects

The original legacy scheduler records execution for job types that have no
executor. After the authorization unit passed, a separate behavioral correction
made unsupported types report that no execution occurred and stopped them from
stamping a successful run. This does not add executor implementations.

Independent review then traced the `mission_prompt` queueing path into the real
public `mission.reversePrompt` action. Its authenticated boundary rejects the
scheduled context, and its body supplies fixed mock suggestions. Queue acceptance
therefore did not establish usable execution. The reviewer's cross-boundary
failure remains retained with its original test and output.

The correction removes this legacy public-action queueing path. `mission_prompt`
returns `NOT_EXECUTED` with `DELEGATED_HANDLER_UNAVAILABLE`; the other stored kinds
return `UNSUPPORTED_JOB_TYPE`. No scheduler kind in this module currently has a
governed delegated executor. Public run and dry-run requests must not enqueue,
stamp `lastRun`, or report success. Internal polling records only
`SCHEDULED_JOB_SKIPPED` and advances `nextRun` using the existing cadence when
the run policy allows evaluation. The readiness query reports execution
unavailability separately from the stored policy's eligibility.

Creating an enabled job or explicitly enabling one is rejected before writes.
Disabled creation, metadata editing, disabling, and removal remain available
under the existing permissions. Stored legacy jobs are preserved for migration.
Future execution must use governed Mission planning with persisted, bounded
service authority and real completion evidence. This repair does not weaken the
public action's authentication, invent an operator identity, or add an executor.
Other scheduler modules and job kinds are outside this change.

A second observed scheduler defect made `run_if_idle` always report busy by
testing arrays instead of their lengths. Its task and conflict queries also
crossed workspace boundaries. The repair checks nonempty results in the stored
workspace only. It does not change the intended policy cadence or add a new
execution engine.

## Delivery and legacy scope

The webhook delivery worker remains internal. It refuses disabled, unbound,
cross-project, tenant-conflicting, or retargeted queued bindings before sending.
Those deliveries receive a terminal failure, and a valid current binding still
uses HMAC. Redirects are rejected. Public list/get responses omit the signing
secret. This is not a network egress or DNS-rebinding policy implementation.

A separate retry-selection defect left `RETRYING` records stranded because the
worker only selected `PENDING`. Selection now includes due retries through the
existing retry-time index, excludes exhausted attempts and completed records,
and returns at most ten deliveries per batch. The existing backoff, attempt cap,
delivery ID, and current project/destination binding checks remain in force.
The controlled failure-to-retry-to-delivery tests do not prove exactly-once
provider delivery or recovery from a process crash after a remote response.

New hooks and scheduled jobs require an explicit workspace. Existing unbound
records remain stored for separately authorized reconciliation; they are not
treated as global authority. Company-scoped member profiles with a real tenant
retain their company scope. New member creation requires an explicit workspace.
Member administration cannot modify canonical operator role assignments.

## Retained verification

The completed baseline against the new authorization tests had 78 failures and
3 passes. The first unbounded hierarchy-cycle probe caused a worker exit; a
bounded fixture write limit then produced the complete baseline. That harness
failure is retained separately and does not count as a product assertion.

The initial authorization unit passed all 81 cases. Eleven additional controls
then failed against unsupported scheduling and stale outbound delivery behavior,
and passed after repair. The idle-policy controls reproduced two failures and
three valid busy-work controls before their correction. Additional allowed-call
and malformed-record cases cover every public handler, trusted actor identity,
and immutable scope.

The enqueue baseline also contained a direct-handler test of a thrown manual
mutation. It was removed because the fixture does not emulate Convex transaction
rollback; its apparent persisted write was not evidence of production behavior.
The retained internal-scheduler baseline exercises the real catch-and-continue
path that previously committed a false execution record. Independent review then
showed that the public target rejected scheduled authentication after a successful
enqueue. The final correction removes that queueing path entirely. Its revised
handler suite had 34 failures and 128 passes before the correction and 162 passes
afterward. These include a real downstream authentication rejection and controls
that require no enqueue, execution count, or successful execution stamp.

The source scan recognizes 24 additional guarded exports. Together with the
already-recognized but incomplete `orgMembers.create`, this unit protects 25
public handlers. The static unrecognized count falls from 615 to 591 at this
snapshot. Only those 24 baseline entries are removed; the earlier unrelated
`workflowRuns.recordEvent` inventory gain is left unchanged. Scanner recognition
is not a substitute for the behavioral tests or a full deployed access audit.

The final focused command passes 189 tests across five files: 162 new handler
cases, 18 existing authorization/public-action controls, and nine scanner tests.
The authorization ratchet and whitespace check pass. The parent's combined
backend suite will include the new handler cases; these counts are not additive
to that combined suite. Final test and compiler results are retained under
`.audit/scheduler-delegation-*`. The original handoff evidence remains under
`.audit/public-configuration-handoff-*` and is superseded for the changed scheduler
source. The source manifest records the exact files and hashes submitted for
independent re-review.

The tests exercise actual registered handlers and actual permission helpers with
controlled database/provider boundaries. They do not emulate database transaction
rollback, concurrent provider delivery, hosted membership configuration, or a live
application workload. No legacy scheduled job in this module currently executes
work. Independent review identified the authentication/delegation defect; review
of the correction remains pending before integration.
