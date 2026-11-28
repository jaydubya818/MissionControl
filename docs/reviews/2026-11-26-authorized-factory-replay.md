# Authorized factory replay implementation

## Outcome and qualification boundary

This change adds a frozen, attributable replay executor to the existing
experiment, WorkOrder, Attempt and verification system. It does not establish
live provider execution or unattended application delivery in this environment.
The original no-touch application qualification remains open.

The source change is available for independent review in
`mc-authorized-replay`, based on
`b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a` plus the previously reviewed repair
set. No commits, external writes, live evaluation launches or deployments were
performed. Existing measurement-direction and quality-regression repairs were
preserved.

## Implemented behavior

- Freeze complete dataset rows, expected outcomes, source WorkOrder contracts,
  full evaluator definitions, expected evaluator implementation/model identity,
  exact Factory Versions, the explicit pair threshold and retry bound.
- Reject duplicate cases, mismatched source summaries, unsupported mutable
  revisions, cross-project records, excessive snapshots and invalid limits.
- Prepare fresh WorkOrders using the existing creation engine and normal
  approval policy, without copying Mission authority or prior approval decisions.
- Bind fresh matching WorkOrders and dispatch through the existing canonical
  helper with the real authenticated actor. Current approval, scope, Task,
  capability, readiness, worker and budget guards remain authoritative.
- Process a bounded batch with per-case blocked reasons and continuation. No
  automatic failed-attempt retries, model calls or separate worker queue exists.
- Verify the actual selected version, source revision, frozen linkage and
  WorkOrder contract in the dispatch transaction. A routing substitution or
  changed contract rolls back before work is committed.
- Reuse the canonical current-verification evaluator and require live,
  independent, exact-candidate receipt/evidence lineage. Newer failed/running
  verifier Attempts invalidate the usefulness of an older pass.
- Retain failed Attempts and include them in measured cost and retry reporting.
  Missing Attempt costs remain null; external evaluator provider costs remain
  explicitly unattributed.
- Attribute reported owner and outside-factory assistant interventions
  separately. Reports bind to the exact retained Attempt set and become stale
  when that set or its cost/intervention identity changes.
- Compare matched cases while retaining all frozen cases in the denominator.
  Missing evidence and declared sample shortfalls hold positive recommendations;
  individual quality regressions remain rejecting even when an average improves.
- Reconcile current evidence idempotently into existing experiment summaries.
  Learning and governed promotion read current evidence again, so stored
  COMPLETED status cannot mask stale, incomplete or regressed replay results.

Automatic promotion, statistical-significance claims, release acceptance, and
unattended-completion claims remain disabled in this advisory projection.

## Verification

The final focused command covers seven suites and 149 tests:

```text
convex/__tests__/factoryReplay.test.ts
convex/__tests__/factoryReplayHandlers.test.ts
convex/__tests__/factoryMeasurementSemantics.test.ts
convex/__tests__/observabilityGoldenPath.test.ts
convex/__tests__/factoryLearning.test.ts
convex/__tests__/evalControlPlaneGoldenPath.test.ts
convex/__tests__/executionRoutingRollout.test.ts
```

The new tests run actual registered handlers, authorization, canonical
WorkOrder creation, canonical verification currentness, existing duration
evaluation, Learning projections and promotion checks against transactional
fixtures. Successful factory admission and dispatch are controlled test
boundaries. One test invokes the actual canonical dispatcher and proves its
capability-admission refusal is preserved. Tests do not launch a provider or
claim a real worker replay.

Negative controls cover anonymous/demo and cross-project access, viewer writes,
contract/revision/approval drift, canonical dispatch identity substitution,
duplicate/reused cases, failed retries and exhausted bounds, stale/expired
receipts, synthetic evidence and fixture judges, wrong evaluator/type/version/
variant, missing costs, hidden per-case quality regression, and stale promotion.

Convex and UI TypeScript checks pass. The authorization ratchet passes with no
new unauthorized public entry points. `git diff --check` passes. Exact source
hashes, command logs and a decision trail are retained in the replay audit set.
An initial fixture omitted its source repository identity; the real canonical
currentness helper refused it. That fixture was corrected. The UI TypeScript
check also exposed unsupported `.at`/`.replaceAll` syntax through generated
API types; the implementation now uses the supported language target.

Independent review found that project permission alone did not preserve the
source WorkOrder's team/owner visibility. The repair reuses the canonical
delivery-record guard across initial/repeated freeze, manifest operations,
direct replay reads and Learning. It checks frozen ownership scope plus current
source and bound WorkOrders. The entire case set is denied when any record is
inaccessible or removed; cases are never filtered out of the denominator.
Permanent real-handler regressions cover these paths and ownership changes.
The shared test helper is named `factoryReplay.fixture.ts`: the installed
Convex bundler excludes multiple-dot basenames while it does not exclude
`__tests__` directories. Local official entrypoint discovery verifies that the
replay server module is included and no test helper is bundled as a server
entrypoint. No backend deployment is required for that check.

## Integration notes

`convex/workOrders.ts` changes only by exporting the existing non-registered
`dispatchWorkOrder` helper. Schema integration adds the replay table import and
spread; the existing `targetDirection` schema repair must remain intact. The
generated API adds `factory/replay` and should be regenerated/reconciled with
other concurrent modules using the repository's local codegen process.

`convex/observability.ts` rejects aggregate and deterministic-fixture completion
for a frozen replay experiment. `convex/factory/learning.ts` preserves existing
variant-document shapes while adding fresh replay detail. `convex/factory/
metaLoop.ts` adds the current replay promotion requirement and retains the prior
measurement-direction correction.

The API configuration, invocation example, result fields, approval semantics,
cost limitations and existing Learning/WorkOrder navigation integration are
documented in `docs/testing/factory-replay.md`. This worktree contains no UI
changes for replay; the integration owner is adding the existing-navigation
Preview controls and will perform their browser verification.

## Remaining qualification

An authenticated control plane, two currently admitted production Factory
Versions, and suitable workers must execute the frozen workload. Runtime host,
worktree/branch, optional Child Task and capability permit bindings pass through
the ordinary dispatcher. Existing evaluator producers must provide current
scores, accounting must be complete, and intervention reports must cover the
retained Attempt set. Independent review and the separate live no-touch
application qualification remain necessary before describing the factory as
proven end to end.
