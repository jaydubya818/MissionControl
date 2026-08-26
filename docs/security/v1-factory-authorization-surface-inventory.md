# V1 Factory Authorization Surface Inventory

- **Status:** APPROVED — operator and Reasonix review gates complete
- **Inventory date:** 2026-08-22
- **Code baseline:** `af534ae`
- **Candidate branch:** `codex/v1-factory-safety-golden-path-closeout`
- **Parent plan:** `docs/plans/2026-08-22-fix-v1-factory-safety-and-golden-path-closeout-plan.md`
- **Authorization ratchet at inventory:** scan-derived and reproducible with
  `node scripts/check-convex-authorization.mjs`: 920 public functions, 283
  authorized, 637 open, baseline 637 (ratchet passes). The 637-entry baseline
  is statically present in `scripts/convex-authorization-baseline.json`; the
  total and authorized counts are computed by the scanner.

## Purpose and boundary

This inventory is the review gate required by section 2 of the closeout plan.
It classifies every public function in `approvals`, `executorRouter`,
`agentDocuments`, and `alerts`, then traces the additional Task and Attempt
functions reached by the V1 browser path:

`Mission -> approved Plan -> WorkOrder -> Task -> Attempt -> evidence -> PR`

The classification is based on static repository call sites in the UI, Convex,
packages, scripts, crons, tests, and seed code. A function with no repository
caller is a **dead candidate**, not proof that an unversioned external client
does not call it. Documented external contracts are called out explicitly.

This is not a platform-wide authorization sweep. It does not make the 112
optional `tenantId` fields required and does not expand into unrelated
`agents`, `messages`, or administration surfaces.

## Authority patterns to use

The implementation should use these named patterns consistently.

| Pattern | Intended caller | Required authority | Audit behavior |
| --- | --- | --- | --- |
| **H-READ** | Browser operator | Resolve the record's or selected workspace on the server, then call `requireAuthorizedDeliveryScope` for delivery records or `requireWorkspacePermission(..., FACTORY_PERMISSIONS.VIEW)` for Factory surfaces. Never return a global cross-workspace list after authorization is active. | Queries remain read-only; do not manufacture read audit records. |
| **H-WRITE** | Browser operator | Require the narrow delivery permission (`UPDATE_DELIVERY`, `ASSIGN_DELIVERY`, `VERIFY_DELIVERY`, or `APPROVE_DELIVERY`). Derive the operator ID from the authenticated membership and ignore/remove caller-supplied human actor labels. | Append the domain change record and consequential decision/event using the derived operator ID. |
| **S-CMD** | Orchestration server or supported agent runtime | Add a named capability to the existing `serviceCommands` signed envelope, validate exact workspace/record scope and replay, then call an `internalMutation`. Do not treat an arbitrary agent ID, bot username, lease owner string, or `SYSTEM` label as authentication. | `serviceCommandReceipts` records accepted, succeeded, failed, denied, and replayed commands; the internal mutation records the domain event. |
| **I-ONLY** | Cron, scheduler, or same-transaction server code | Convert the lifecycle operation to `internalMutation`/`internalQuery` and call it only through generated `internal.*` references. | Record the deterministic system actor and domain event for writes. |
| **RETIRE** | No supported caller | Remove the public function and its cron/config reference if applicable. Update generated contracts and compatibility docs in the same change. | No runtime audit required; preserve removal evidence in tests and this inventory. |

### Denied-action durability constraint

Convex rolls back database writes when a mutation throws. Therefore a helper
cannot append a durable denial record and then rethrow from the same
transaction. The closeout must not claim durable denied-action audit by writing
an event that is rolled back.

For **S-CMD**, the existing action/envelope boundary already persists denied
receipts outside the domain mutation. For direct **H-WRITE** entry points, the
implementation must choose one explicit mechanism: a structured denial result
that commits an audit record, or an authenticated action wrapper that catches a
failed internal mutation and persists a sanitized denial. This is a review
decision because it changes public return/error behavior. Successful mutations
and consequential decisions can be audited in their existing transactions.

## Explicit legacy modules

### `convex/approvals.ts`

The legacy approval model remains active in the operator UI and older workflow
engine. It is distinct from the governed WorkOrder `approvalDecisions` path.

| Function | Reachability and actor | Classification | Disposition |
| --- | --- | --- | --- |
| `list` | Council UI and E2E shell | ACTIVE — human/read | **H-READ**; require a selected workspace and remove global fallback. |
| `listPending` | Command Center, panels, dashboards, navigation counts, Telegram bot | ACTIVE — mixed human/service read | Browser callers use **H-READ** and must skip without a workspace. Telegram requires a scoped service query or is disabled with Telegram decisions. |
| `listEscalated` | No repository caller | DEAD CANDIDATE | **RETIRE** unless an external compatibility owner is identified during review. |
| `listByStatus` | Approvals modal | ACTIVE — human/read | **H-READ**; make `projectId` required for the browser path. |
| `listByTask` | Legacy workflow engine | ACTIVE — service/read | Move behind a task-scoped **S-CMD** query or internal workflow-engine command; no arbitrary task lookup. |
| `listByRequestor` | No repository caller | DEAD CANDIDATE | **RETIRE** unless an external compatibility owner is identified. |
| `get` | Loop Engineering Convex code | ACTIVE — server/read | **I-ONLY** for the current server caller. Add a separately authorized public read only if a browser caller appears. |
| `getDecisionChain` | No repository caller | DEAD CANDIDATE | **RETIRE**. Its useful projection can be rebuilt later behind **H-READ** if required. |
| `request` | Task drawer, autonomous script, OpenClaw SDK, legacy workflow engine | ACTIVE — mixed human/service write | Split the browser request into **H-WRITE** and agent/runtime requests into a named **S-CMD** capability. Validate Task, agent, project, and tenant relationships. Do not accept `requestorAgentId` as authority. |
| `approve` | Multiple browser views and Telegram bot | ACTIVE — mixed human/integration decision | Browser decision uses **H-WRITE** with `APPROVE_DELIVERY` and server-derived operator identity. Disable Telegram approval in V1 until a Telegram account is durably bound to an active operator; a Telegram username/ID is not human authorization. Preserve RED two-person separation using operator IDs. |
| `deny` | Multiple browser views and Telegram bot | ACTIVE — mixed human/integration decision | Same as `approve`; require a reason and derived operator. Disable Telegram denial until operator binding exists. |
| `cancel` | No repository caller | DEAD CANDIDATE | **RETIRE** unless a concrete browser lifecycle requirement is approved. |
| `expireStale` | Cron | ACTIVE — internal lifecycle | Convert to **I-ONLY** and update the cron reference. |
| `escalateOverdue` | Cron | ACTIVE — internal lifecycle | Convert to **I-ONLY**; remove caller-supplied `escalatedBy`. |

Compatibility impact:

- The Task drawer and dashboards remain supported through human entry points.
- `packages/workflow-engine`, `packages/openclaw-sdk`, and
  `scripts/autonomous-agent.sh` cannot keep calling the same public mutation
  after human authentication is enforced; supported production callers need
  named service commands.
- Telegram approval decisions are unsafe today because they self-assert human
  identity. Read-only Telegram approval listing can remain only through a
  scoped service boundary.

### `convex/executorRouter.ts`

This router operates on the old `executionRequests` queue. Repository search
finds no caller of any public router function. The only live reference is the
five-minute cron for `autoRoute`; the sibling `executionRequests.ts` public API
also has no repository callers and its header calls the flow a V1 manual stub.
The canonical V1 worker uses signed `serviceCommands` and leased Factory
Attempts instead.

| Function | Reachability and actor | Classification | Disposition |
| --- | --- | --- | --- |
| `autoRoute` | Cron only; routes an otherwise unconsumed queue | ACTIVE REFERENCE / ORPHANED FLOW | **RETIRE** the cron and router after a runtime-contract check. Do not keep background writes for a queue with no supported consumer. |
| `onExecutionStart` | No repository caller | DEAD CANDIDATE | **RETIRE**; do not add a second callback authentication scheme beside signed Attempt reports. |
| `onExecutionComplete` | No repository caller | DEAD CANDIDATE | **RETIRE**; canonical completion is `serviceCommands.reportFactoryAttempt` / `finalizeExecution`. |
| `getQueueForExecutor` | No repository caller | DEAD CANDIDATE | **RETIRE**. |
| `claimExecution` | No repository caller | DEAD CANDIDATE | **RETIRE**; canonical claims are signed, scoped, leased, and replay-protected. |

Compatibility impact:

- Historical docs describe Cursor/OpenClaw polling, but no executable caller
  exists in the repository.
- Before removal, run the runtime-contract guard and search generated API
  consumers. If an operator identifies a real external consumer, migrate it to
  the existing signed Factory Attempt boundary rather than hardening this
  parallel router.
- `convex/executionRequests.ts` is outside the four-file count but should be
  retired in the same compatibility change if the router retirement is
  approved; leaving an unauthenticated producer API would preserve the orphan.

### `convex/agentDocuments.ts`

| Function | Reachability and actor | Classification | Disposition |
| --- | --- | --- | --- |
| `set` | No repository caller; documented OpenClaw-style compatibility surface | COMPATIBILITY CANDIDATE — service/write | Prefer **RETIRE**. If a real runtime owner is identified, replace it with a named **S-CMD** upsert. The current function silently reads a nonexistent `projectId` argument and can create unscoped records. |
| `get` | No repository caller; compatibility surface | COMPATIBILITY CANDIDATE — service/read | Prefer **RETIRE** or add an exact agent/workspace-scoped service query with the upsert command. |
| `list` | Memory UI | ACTIVE — human/read | **H-READ** with required selected workspace; never permit global listing. |
| `listByAgent` | Organization UI | ACTIVE — human/read | Resolve the Agent first, derive its workspace, then **H-READ** and verify the Agent belongs to that workspace. |
| `getWorkingMd` | No repository caller; compatibility convenience | COMPATIBILITY CANDIDATE — service/read | Prefer **RETIRE** with `get`; otherwise alias inside the scoped service boundary, not as a public unauthenticated query. |
| `getDailyNote` | No repository caller; compatibility convenience | COMPATIBILITY CANDIDATE — service/read | Same as `getWorkingMd`. |
| `create` | Memory UI | ACTIVE — human/write | **H-WRITE** with `UPDATE_DELIVERY`; derive project from the selected workspace and Agent, reject mismatches, derive operator actor, append change/activity records. |
| `update` | Memory UI | ACTIVE — human/write | Load the document and Agent, derive workspace, then **H-WRITE**. Audit before/after metadata without copying document content into audit logs. |
| `remove` | Memory UI | ACTIVE — human/write | Record-derived **H-WRITE**; append a tombstone/change record before deletion and use the derived operator actor. |

Compatibility impact:

- The active Memory and Organization screens remain supported.
- Removing `set`/`get` convenience APIs may affect an untracked OpenClaw
  client. Review must name an owner and production launcher before retaining
  them. A documentation mention alone is not sufficient authority.

### `convex/alerts.ts`

| Function | Reachability and actor | Classification | Disposition |
| --- | --- | --- | --- |
| `listOpen` | Command Center and several operator views; some callers omit `projectId` | ACTIVE — human/read | **H-READ** with required workspace. Update every active UI caller to pass the selected project or skip. |
| `listBySeverity` | No repository caller | DEAD CANDIDATE | **RETIRE**. Add a project-scoped filter to `listOpen` later if product demand appears. |
| `listByAgent` | No repository caller | DEAD CANDIDATE | **RETIRE**. |
| `create` | QC action and orchestration-server stuck-task loop | ACTIVE — server/service write | Make the domain insert **I-ONLY**. QC calls it internally. Add a narrow `alerts.create` **S-CMD** capability for orchestration, deriving workspace from the Task and validating optional Agent/Task/Run relationships. |
| `acknowledge` | Loop Detection UI | ACTIVE — human decision | Record-derived **H-WRITE** with `UPDATE_DELIVERY`; remove `acknowledgedBy` from public args and use the derived operator. Append a consequential decision/change record. |
| `resolve` | Loop Detection UI | ACTIVE — human decision | Same record-derived **H-WRITE**; require a meaningful resolution note for V1 operational evidence. |
| `ignore` | Loop Detection UI | ACTIVE — human decision | Same record-derived **H-WRITE**; require a reason and audit the decision. |

Compatibility impact:

- `apps/orchestration-server` currently calls `alerts:create` directly and
  sometimes omits `projectId`; switching the mutation to human auth without a
  service command would silently break stuck-task alerting.
- `convex/qcRuns.ts` is server code and should call the internal alert mutation
  directly.

## Golden-path reachability beyond the four legacy modules

### Mission and WorkOrder

The canonical Mission and WorkOrder browser functions already use
`requireAuthorizedDeliveryScope` and/or `requireWorkspacePermission` with
named permissions. PR #130 also derives the authenticated human for WorkOrder
acceptance. These surfaces require regression tests, not a second authorization
model.

Disposition: **KEEP CANONICAL**, verify cross-workspace denial and actor
derivation while implementing the adjacent gaps.

### Task

`convex/tasks.ts` imports no delivery/workspace authorization helper. The live
browser path reaches Task reads and writes directly, and the same public
mutations are also called by scripts, Telegram, OpenClaw, GitHub ingestion,
Loop Engineering, and the legacy workflow engine. Actor type and IDs are
currently caller-provided.

| Function group | Golden-path use | Classification | Disposition |
| --- | --- | --- | --- |
| `list`, `listAll`, `get`, `getByIdentifier`, `getWithTimeline`, `getUnifiedTimeline`, `listByWorkOrder` | Task board, Task drawer, Mission/WorkOrder projections | ACTIVE — human/read plus server compatibility | Browser calls use **H-READ** with required or record-derived workspace. Server callers move to internal/scoped service reads. Global list fallback is not valid after authorization is active. `getByIdentifier` and `getUnifiedTimeline` have no repository caller and are dead candidates unless a runtime-contract owner is identified. |
| `getAllowedTransitionsForHuman` | Task UI static transition map | ACTIVE — public constant read | Declare explicitly public or move the rules client-side; it reads no persisted tenant data. Do not count it as an authorization gap. |
| `simulateTransition`, `getWorkflowStateCompatibilityReport`, `validateOutputForReview` | Task drawer planning/review | ACTIVE — human/read | Record/workspace-derived **H-READ**. Caller-supplied `actorType` is simulation input only and must not confer authority. |
| `create`, `update`, `linkToWorkOrder`, `transition` | Browser Task creation/editing/lifecycle | ACTIVE — mixed human/service write | Split browser **H-WRITE** (`UPDATE_DELIVERY`) from named **S-CMD**/internal paths. Derive human actor and validate Task/WorkOrder/Agent workspace equality. |
| `assign` | Task drawer and worker/scripts | ACTIVE — mixed human/service write | Browser **H-WRITE** with `ASSIGN_DELIVERY`; service assignment gets a named scoped command. Never accept `actorType` as authority. |
| `resolveApprovedWorkflowGate`, `supersedeWorkflowAttempt` | Legacy workflow engine | ACTIVE — service lifecycle | Move to **I-ONLY** behind an authenticated workflow service command, preserving exact run/step/approval binding. |
| `updateThreadRef` | Telegram bot | ACTIVE — integration write | Disable until Telegram service identity and task/workspace scope are authenticated, or add a narrow **S-CMD** capability. |

Additional server callers that must move with the Task authority split are
`convex/missionChat.ts` (`tasks.create`), `convex/planning.ts`
(`tasks.transition`), and `convex/factory/metaLoop.ts` (`tasks.create`). They
must call exact internal Task operations rather than the authenticated browser
entry points.

`taskRouter.autoAssign` is also an active unauthorized service mutation. The
orchestration server calls it from its delegation loop. Add it to the scoped
service slice as a named **S-CMD** capability backed by an **I-ONLY** mutation;
the command must derive the Task workspace and cannot accept `actorType` as
authority.

This Task gap is material and must be added to the scoped authorization target.
Hardening only the four originally named files would leave the browser golden
path open and would allow callers to self-assert `HUMAN`, `AGENT`, or `SYSTEM`.

### Attempt, evidence, and PR

The V1 Factory worker path is canonical through signed `serviceCommands`:
`claimFactoryAttempt`, `renewFactoryAttempt`, `reportFactoryAttempt`, and the
verification/publication commands. `factory/prChecks.ts` uses workspace
permissions for browser paths and a signed GitHub App boundary for provider
evidence.

`convex/workflowRuns.ts` still mixes canonical reads with a legacy public
executor API:

| Function group | Reachability | Classification | Disposition |
| --- | --- | --- | --- |
| `getInspector`, `requestCancellation`, `linkArtifactToVerificationReceipt` | Canonical operator/evidence path | ACTIVE — human | Keep and regression-test existing delivery authorization. Derive the cancellation actor instead of persisting caller `actorId`. |
| `list`, `get`, `getById`, `listEvents`, `listArtifacts`, `search` | Operator dashboards, CLI, orchestration reads, legacy worker | ACTIVE — mixed reads | Add **H-READ** to browser projections. Give orchestration/worker exact scoped service or internal queries. Eliminate global listing for authenticated users. |
| `claimExecution`, `heartbeatExecution`, `releaseExecution`, `updateStep`, `updateStatus`, `updateContext`, `incrementRetry` | Legacy workflow engine/CLI; not the Factory Attempt path | ACTIVE COMPATIBILITY — service writes | Migrate supported execution to existing `executions.*` **S-CMD** capabilities and internal mutations, then retire public compatibility mutations. Lease strings fence concurrency but do not authenticate the caller. |
| `createArtifact`, `recordEvent`, `advance`, `checkpointExecution` | No repository caller at `af534ae` | DEAD CANDIDATES — public writes | **RETIRE** after the runtime-contract guard and an external-consumer check. Do not leave unauthenticated write APIs merely because older executor code may once have used them. |
| `start` | CLI and legacy workflow UI | ACTIVE — mixed human/service create | Split browser-authorized start from a named service start command, or remove the legacy workflow launch from the V1 operator path. |

## Golden-path actor map

| Transition | Authoritative actor | Boundary |
| --- | --- | --- |
| Mission draft, plan submission, plan approval | Authenticated operator | **H-WRITE**, workspace permission; approval uses `APPROVE_DELIVERY` |
| WorkOrder creation, human dispatch, revision, acceptance | Authenticated operator | Existing governed WorkOrder public mutations; server-derived operator |
| Task create/edit/assign/transition from browser | Authenticated operator | New Task **H-WRITE** entry points; ignore browser actor labels |
| Task transition or approval request from worker | Registered service identity plus exact Task/WorkOrder scope | Named **S-CMD** -> **I-ONLY** domain mutation |
| Attempt claim/renew/report | `orchestration-server` service identity plus exact Factory tuple and lease | Existing signed Factory Attempt commands |
| Verification evidence ingestion | Registered verifier/service or authenticated operator, depending on source | Existing signed receipt/provider boundaries or authorized human mutation |
| GitHub PR evidence | Registered GitHub App installation and exact repository | Signed webhook -> internal ingestion |
| Final evidence review and acceptance | Authenticated operator distinct from service execution | Existing governed human decision; merge and promotion remain human |
| Cron expiration/escalation | Internal scheduler | **I-ONLY** with deterministic system actor |

## Recommended implementation slices after approval

1. **Identity helpers and demo contract:** add the explicit backend deployment
   class, derive operator actor IDs once, and add focused authorization tests.
2. **Operator read/write slice:** approvals browser views, Task browser path,
   Agent Documents, and Alerts. Fix unscoped UI callers in the same slice.
3. **Service split:** add only the named commands required by supported V1
   launchers (Task transition/assignment/approval request and Alert create).
   Convert cron/QC paths to internal functions.
4. **Retirement slice:** remove `executorRouter` and orphaned
   `executionRequests` only after runtime-contract verification; remove
   no-caller convenience functions approved by the operator.
5. **Ratchet and regression:** update the baseline only with the same atomic
   code/tests/generated-contract change. Golden-path scoped open count must be
   zero; total baseline may only stay flat or decrease.

## Review decisions required

The operator and independent reviewer must explicitly decide these before
behavior changes begin:

1. **Telegram approval decisions — recommended: disable for V1.** Building a
   durable Telegram-account-to-operator binding is a separate authentication
   feature; accepting usernames or chat IDs is not safe.
2. **OpenClaw Agent Documents compatibility — recommended: retire no-caller
   convenience functions.** Retain only if a real production launcher and
   owner are named; then use a narrow signed service capability.
3. **Legacy executor router — recommended: retire.** Do not create a second
   signed callback protocol beside the canonical leased Factory Attempt path.
4. **Task authority split — recommended: implement now.** It is on the browser
   golden path and is the largest newly confirmed gap.
5. **Durable human denial audit — use authenticated action wrappers.** Preserve
   current success/error semantics at the UI boundary, route authorized writes
   to internal mutations, and persist a sanitized denial if the internal write
   rejects. Do not weaken fail-closed behavior or claim rolled-back audit.
6. **Legacy workflow engine — recommended: compatibility only, not V1
   canonical.** Migrate its supported writes to existing signed execution
   commands; do not let it dictate the Factory golden-path contract.

## Gate acceptance checklist

- [x] Every public function in the four explicit legacy modules is classified.
- [x] Golden-path call paths and actor types are documented.
- [x] Each active function has a named authorization/audit pattern.
- [x] Each dead candidate has removal evidence and compatibility impact noted.
- [x] Operator approves the disposition matrix and the six review decisions
  (2026-08-22).
- [x] Reasonix independently reviewed the matrix against `af534ae` and approved
  it with four corrections, folded into this revision (2026-08-22).

The inventory gate is complete. Authorization implementation may proceed on the
candidate branch.

## Implemented compatibility disposition

Runtime Contract v33 completed the approved split:

- browser Task, Approval, Alert, Agent Document, and selected WorkflowRun writes
  are authenticated actions with server-derived human actors;
- canonical Factory workers continue through signed, scoped, replay-protected
  `serviceCommands` and leased Attempts;
- the orphaned executor/task routers and public legacy workflow callbacks were
  removed;
- the standalone workflow executor, legacy workflow CLI, OpenClaw SDK,
  Telegram control runtimes, and autonomous Task worker scripts now fail
  explicitly instead of calling human actions with self-asserted identities;
  and
- the scoped authorization gate scans active application, package, script,
  skill, and test sources so retired public callbacks or direct mutation calls
  to human actions cannot silently return.
