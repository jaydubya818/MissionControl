# Frozen factory replay

## Contract and design

Replay compares the same frozen workload set through two admitted Factory
Versions. It extends canonical experiments, WorkOrders, Attempts, verification
and accounting. It does not execute models or create a separate worker queue.

The manifest stores dataset contents, source workload contracts, evaluator
definitions, and exact Factory Version identities with digests. Each
case/variant binds one fresh WorkOrder. Preparation calls the existing
creation engine with no copied Mission or approval record. Canonical policy
derives READY/NOT_REQUIRED when approval is unnecessary, or AWAITING_APPROVAL/
PENDING when a current approval is required. A fresh matching WorkOrder can also
be bound. An explicit pending, revoked, rejected or expired decision still
blocks dispatch; replay does not introduce an extra owner approval round.
Dispatch calls the
existing engine in the same transaction as contract checks, so its current
authorization, approval, runtime, scope, and budget gates still apply.

A separate action-based coordinator was rejected because a read followed by a
dispatch mutation would introduce a contract-check race. A new provider runner
would also duplicate authority already held by the factory. The direct
transactional extension is the selected design, reviewed with the parent agent
before implementation. A bounded action iterates this mutation; each mutation
rechecks the contract after the batch read and validates the actual dispatched
Factory Version, repository base and WorkOrder contract before committing.
If Guarded Auto selects another version, the transaction is rolled back. The
operator can use the existing exact execution-route pin when authorized.

## Public operations

- `factory/replay:freeze` freezes a draft two-version experiment. The caller
  supplies an explicit minimum matched-pair count and maximum attempts per case.
- `prepareCase` creates a fresh WorkOrder with canonical policy-derived approval.
- `bindCase` binds a fresh matching WorkOrder without copying approval.
- `dispatchCase` dispatches or retries through canonical WorkOrder authority.
- `getDispatchBatch` returns one to ten frozen case/variant slots and a stable
  numeric cursor. Slots can be unbound, pending, already dispatched, or require
  an explicit failed-attempt retry.
- `dispatchPending` executes that bounded batch through `dispatchCase`. It
  returns dispatched, already-dispatched and blocked counts, per-slot reasons,
  and the next cursor. One blocked case does not hide other cases or erase its
  prior Attempts. The action does not automatically retry failures.
- `recordInterventions` records an operator-attributed count for the exact
  retained attempt set. Later Attempts make that report stale. It is reported
  evidence, not proof that no unobserved intervention occurred.
- `getReview` derives current per-case results and paired comparison from
  canonical records. Source, candidate, evaluator, verifier, cost, and coverage
  mismatches remain visible. It grants no acceptance or promotion authority.
- `reconcile` persists derived variant metrics and marks the experiment complete
  only when every frozen pair has current comparable evidence. Repeating an
  unchanged reconciliation writes nothing. A completed experiment is historical
  state; `getReview` and Learning rederive current evidence on every read.

All operations require authenticated project access. Mutation permissions follow
the existing factory improvement and delivery assignment/dispatch permissions.
Anonymous demo access does not authorize this path. Writes are audited.
Every frozen source scope, current source WorkOrder and bound WorkOrder must
also pass the existing team/owner delivery-record visibility check. That check
applies to the first freeze, repeated freeze, manifest operations, direct review
and the existing Learning review. An inaccessible or removed record rejects the
entire case set, preserving its frozen denominator.

## Boundaries

A manifest freezes at most 50 cases and 20 numeric or boolean Attempt/Trace
evaluators. Two distinct Factory Versions must pass the current production
admission check. Their existing per-WorkOrder budgets remain authoritative;
replay adds a maximum attempt count, never a larger allowance.

An original source WorkOrder requires a fixed repository revision and an
enforced version-2 independent verification contract. Dataset source summaries
must still match that workload when frozen. New runs must use the frozen source
revision. A revised contract requires a new experiment rather than rewriting
the old manifest.

The comparison retains every frozen case in its denominator. Missing cases,
scores, current independent verification, measured cost, or intervention reports
hold positive recommendations. Known regressions remain visible. Sample
sufficiency is the caller's declared coverage threshold, not statistical proof.
Automatic promotion and statistical-significance claims remain disabled.

Unbound cases stay in that denominator. `matchedPairs` counts cases for which both variants have complete current
evidence. Metrics compare only those matched pairs. A positive recommendation
requires the entire set and the explicitly declared minimum. Per-case evaluator
regressions remain rejecting even when another case improves the average.

Evaluator definition revision and producer implementation version are stored
separately. The existing human score producer uses `v<definition revision>`;
duration evaluation uses `duration-threshold/v1`; Factory Memory evaluation
uses `factory-memory-v1`. Other producers require an immutable
`configuration.evaluatorVersion`, plus `configuration.model` for a judge. A
frozen definition, expected producer version and model must match the score.
Fixture-judge scores and synthetic observations never qualify.

`costUsd` is explicitly scoped to all retained Attempts, including failed
implementations and verifier Attempts. `knownCostUsd` is the measured subtotal;
any missing cost keeps `costUsd: null` and lists `unknownCostAttempts`. Existing
LLM/external evaluator records do not carry an authoritative per-case provider
accounting link. Such costs remain listed in `unattributedEvaluatorCostIds` and
hold a complete positive comparison, rather than being counted as zero.
Estimated trace/observation prices are not silently substituted for measured
Attempt cost. Operator-reported labor/intervention counts remain distinct from
provider cost and do not prove unattended work.

The canonical version-2 prepublication gate can establish verified candidate
evidence while human review is pending. Replay exposes `humanReviewPending`
and can compare that independently verified evidence; it still returns
`releaseAcceptanceEstablished: false`. Approval, publication, and release
authority continue through the ordinary WorkOrder and Mission path.

Human-recorded aggregate and deterministic-fixture completion cannot overwrite a
frozen replay experiment. Learning reads replay evidence afresh, so a later
invalidated receipt cannot keep a stale promotion recommendation green.
`factory/metaLoop:resolve` also requires a current, complete, sufficient replay
comparison recommending promotion before creating governed implementation work.

Live replay remains unqualified until an authenticated control plane and admitted
worker execute these operations and the resulting exact candidates are verified.
Local controlled-handler tests do not establish provider execution or unattended
application delivery.

## Authenticated invocation and configuration

Use the normal authenticated Convex client or the factory agent's authenticated
control-plane client. No separate provider key or model executor is introduced.
The following illustrates API order; placeholders are actual scoped IDs from
the existing experiment, dataset, Factory Version and WorkOrder surfaces.

```ts
const frozen = await client.mutation(api.factory.replay.freeze, {
  experimentId,
  minimumPairs: 10,       // explicitly chosen; cannot exceed frozen case count
  maxAttemptsPerCase: 2,  // cannot exceed either admitted Factory Version budget
});

const prepared = [];
for (const item of frozen.manifest.definition.cases) {
  for (const variant of frozen.manifest.definition.variants) {
    prepared.push(await client.mutation(api.factory.replay.prepareCase, {
      manifestId: frozen.manifest._id,
      variantId: variant.id,
      caseKey: item.key,
    }));
  }
}

const batch = await client.action(api.factory.replay.dispatchPending, {
  manifestId: frozen.manifest._id,
  cursor: 0,
  limit: 2,
  runtimeBindings: [
    // Optional except where the selected canonical runtime requires them.
    { caseId: prepared[0]._id, executorHostId, worktree: baselineWorktree, branch: baselineBranch },
    { caseId: prepared[1]._id, executorHostId, worktree: candidateWorktree, branch: candidateBranch },
  ],
});
// Continue with batch.nextCursor; inspect blocked reasons and preserve failures.
// Independent workers and existing evaluator producers record their own results.
const current = await client.query(api.factory.replay.getReview, { experimentId });
const reconciled = await client.mutation(api.factory.replay.reconcile, {
  manifestId: frozen.manifest._id,
});
```

Each runtime binding may also carry the existing `capabilityPermits` pair when
capability control applies. The canonical capability verifier remains
authoritative. When the fresh WorkOrder already has canonical Child Tasks,
`taskId` selects one through the ordinary Task-to-WorkOrder authority checks.
Runtime bindings must be distinct, belong to that selected
batch, and number at most ten. A local worker may require an admitted host and
worktree; remote runtimes continue to use their admitted profiles. Replay never
changes the frozen workflow, model, scope, budget, or environment through these
arguments.

An explicit retry uses `dispatchCase` with `caseId`, the failed or canceled
`retryOfWorkflowRunId`, a canonical valid `retryReason`, and any required runtime
bindings. The stable initial/retry idempotency key prevents repeated submission
from creating another Attempt. A retry beyond the frozen maximum is refused.

After execution is quiescent, `recordInterventions` accepts `caseId`,
`ownerCount`, `assistantOutsideFactoryCount`, and one to twenty `evidenceRefs`.
It rejects a count below recorded human interventions and freezes the report to
the current retained Attempt set. Later Attempt/cost/intervention changes make
the old report stale. Recording zero is an explicit attributed report, not an
inferred proof that nobody intervened.

## Existing product integration and result fields

The Learning candidate's existing `getExperimentReview` keeps its original
`experiment`, `variants`, and `recommendation` fields and adds `replay` for a
frozen experiment. Its variant documents preserve `_id`, names, configurations,
and sample-size shape; their metrics are the current paired projection. The
existing dashboard's stored experiment rows are historical summaries. Consumers
showing a current replay result should subscribe to `factory/replay:getReview`
or `getExperimentReview`, rather than presenting stored metrics as current.

`manifest.definition` contains the exact dataset snapshot and rows, each case's
input/expected outcome/workload digest, evaluator definitions and expected
producer identity, and the two admitted Factory Version tuples. `manifest._id`
and `manifest.digest` identify that immutable experiment contract.

Every `cases` entry includes `caseKey`, `variantId`, optional `caseId` and
`workOrderId`, state, reasons, retained and failed Attempt IDs, the current
source/verifier/receipt/candidate identity, evaluator score IDs and values,
cost completeness, implementation attempt count, first-pass verification,
separate intervention counts, and `comparable`. Missing bindings are returned
as UNBOUND entries. Existing WorkOrder navigation can open `workOrderId` for
ordinary approval, dispatch history and evidence inspection.

`comparison` includes `denominator`, `matchedPairs`, `pairedCaseKeys`,
`minimumPairs`, `complete`, `sampleSufficient`, per-variant metrics and
per-evaluator scores, and the existing advisory recommendation object.
`autoPromote`, `statisticallySignificant`, and `acceptanceAuthority` remain
false. The review separately states that release acceptance and unattended
completion have not been established by this projection.

## Verification scope

The replay tests run actual registered handlers, project authorization,
canonical creation, canonical verification currentness, current Learning
projection and promotion guards against a transactional persistence fixture.
Factory admission and successful dispatch are controlled boundaries, clearly
marked as such. A real canonical dispatcher test proves capability admission
cannot be bypassed. An actual duration-evaluator handler test proves the
existing score producer integrates with frozen evaluator identity. These are
source-level behavioral integration tests; no provider or worker was launched.
