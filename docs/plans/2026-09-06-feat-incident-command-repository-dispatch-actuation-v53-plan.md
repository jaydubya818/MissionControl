---
status: active
date: 2026-09-06
owner: Mission Control
runtime_contract: 53
---

# Incident Command repository-dispatch actuation v53

## Objective

Close the single remaining Incident Command production gate with one bounded,
repository-scoped actuator. Incident Command remains the authority and lifecycle
aggregate; a repository-dispatch executor changes admission state; a distinct
observer reads the authoritative state and alone emits effect evidence.

## Public contract delta: v52 → v53

Runtime v53 is additive and introduces exactly five public operations. The
request and restoration-authorization operations were added during independent
pre-release review so authority is durable before actuation and requested state
is not visually or semantically collapsed into execution:

1. `factory/incidentControls:getRepositoryDispatchControl` reads the durable
   admission projection and its receipt history for one authorized exact
   incident/repository pair.
2. `factory/incidentControls:authorizeRepositoryDispatchRestoration` records a
   current, expiring, incident/repository/commander-scoped resume grant before
   any restoration actuation.
3. `factory/incidentControls:requestRepositoryDispatchControl` records the
   authorized command request without changing dispatch admission.
4. `factory/incidentControls:executeRepositoryDispatchControl` accepts only
   `PAUSE_REPOSITORY_DISPATCH` or `RESUME_REPOSITORY_DISPATCH`, requires the
   exact incident sequence, repository, commander, bounded expiry, and request
   identity, changes only that repository's admission projection, and emits
   distinct `COMMAND_ISSUED` and `ACKNOWLEDGED` receipts.
5. `factory/incidentControlObserver:observeRepositoryDispatchControl` reads the
   durable admission projection independently and emits `EFFECT_OBSERVED` only
   when the requested state is actually present.

The Incident Command evidence reference validator adds `CONTROL_RECEIPT`.
`factory/incidents:advance` accepts command/effect references only when their
canonical receipt rows match the incident, project, repository, control,
operation, expected roles, request lineage, current phase entry, and observation
time. An acknowledgment can never occupy the effect role.

## Durable model

- `repositoryDispatchControls` is the single restart-safe admission projection,
  keyed by repository.
- `factoryIncidentControlAuthorizations` records separate restoration authority
  before resume; `factoryIncidentControlReceipts` is append-only evidence for
  request, executed command, acknowledgment, and observed effect. Neither
  contains secrets.
- Pause and resume use the same controlled capability but separate operation,
  request, authority, currentness, and receipt identities.
- Canonical WorkOrder dispatch and automatic Verification Attempt scheduling
  consult the durable projection before creating a new Attempt.

## Execution sequence

1. Add pure validation and receipt-lineage rules with negative tests.
2. Add schema, bounded executor, independent observer, and dispatch gate.
3. Wire the Incident Command UI to persisted executor/observer results while
   keeping manual evidence inputs available for unsupported controls.
4. Run the focused backend/UI suites, runtime guard, security, and qualification.
5. Complete the named non-production pilot, retain attributable evidence, and
   verify refresh/restart behavior.
6. Commit, push, review, merge, and requalify exact main.
7. Deploy the backend and UI exact candidate through the governed production
   contract; run bounded production acceptance or roll back to the recorded
   known-good deployment.

## Non-goals

- No arbitrary command runner.
- No workspace-global pause.
- No executor-authored effect receipt.
- No implicit restoration, incident closure side effect, or weakening of
  `containment-observed-effect-required`.
- No support for the other Incident Command control enum values in this slice.

## Post-deploy monitoring and validation

- Search runtime logs for `repository-dispatch-paused`, receipt scope/currentness
  rejection, replay rejection, and observer mismatch.
- Healthy: exact target dispatch is denied while paused, unrelated repositories
  remain admitted, and separately authorized resume restores admission.
- Rollback trigger: any cross-repository effect, missing dispatch denial,
  self-certified effect, receipt replay acceptance, or failed restoration.
- Validation owner: Jay West — Product Owner; window: immediate bounded
  production acceptance plus the first 30 minutes after promotion.
