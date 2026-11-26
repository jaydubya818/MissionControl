# Warp course comparison with Mission Control

Date: November 26, 2026

Source baseline: `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`.

This is the historical comparison that led to the authorized implementation.
See the [current implementation report](2026-11-26-authorized-factory-improvements.md)
for the adapters, replay, readiness, and review changes now present in the
working tree. References below to capabilities not yet implemented describe
the inspected baseline, not the current patch.

## Decision

Keep Mission Control's existing lifecycle, immutable Factory Versions,
independent verification, scoped execution, and governed improvement process.
The additional material strengthens the case for qualifying the current
delivery path, connecting external work through that path, and measuring
improvements correctly.

The ten supplied URLs contain nine written lessons and one unit index. Their
available text and code examples were reviewed; this review does not claim to
have watched the embedded videos or completed the course exercises. The pages
introduce scoring and replay, but the detailed Unit 3 lessons were not supplied
or evaluated here.

The original live to-do run remains **NOT_STARTED**, and the application remains
**NOT_GENERATED**. This comparison does not add browser, recovery, or unattended
delivery evidence.

## Page-by-page mapping

| Supplied page | Useful lesson | Mission Control application |
| --- | --- | --- |
| [What is factory engineering?](https://www.warp.dev/learn/build-a-self-improving-software-factory/what-is-factory-engineering) | Improve the process that builds the product, including cost, quality, and review effort. | Use the existing learning and observability records. Judge changes by verified delivery and operator effort, with costs attributed to completed work. |
| [What is a software factory?](https://www.warp.dev/learn/build-a-self-improving-software-factory/what-is-a-software-factory) | Separate product delivery from the measurement and improvement loop. Replaying prior tasks under alternative configurations is a distinct capability. | Keep both existing loops. Add real workload replay through the existing experiment and Factory Version records after the first live qualification succeeds. |
| [Set up your factory](https://www.warp.dev/learn/build-a-self-improving-software-factory/set-up-your-factory) | Start with one repository and working execution environment; defer self-improvement during initial setup. | Provision an admitted worker and usable control-plane identity. The existing readiness checks should describe the same actual runtime that will execute the to-do workload. |
| [Tour the factory floor](https://www.warp.dev/learn/build-a-self-improving-software-factory/tour-the-factory-floor) | Make stages, worker assignments, environments, skills, and transitions inspectable as configuration. | Preserve immutable Factory Versions and execution-profile bindings. Use current workflow contracts; a configuration description must not be mistaken for an installed connector. |
| [Build your factory](https://www.warp.dev/learn/build-a-self-improving-software-factory/build-your-factory) | This page is the Unit 2 index, listing the progression through implementation, intake, specs, verification, and monitoring. | Use the progression as a qualification sequence. It is not a tenth independent technical lesson. |
| [Hello factory](https://www.warp.dev/learn/build-a-self-improving-software-factory/hello-factory) | Start with one small request and keep coordination separate from implementation. | Use the current stage and agent bindings. The lesson's introductory static-only verification is a teaching step, not the acceptance standard for this factory or the requested to-do app. |
| [Connect an issue backlog](https://www.warp.dev/learn/build-a-self-improving-software-factory/connect-an-issue-backlog) | Select which issue events enter the factory, preserve source context, and suppress self-triggered loops. | Harden the existing INBOX importer, then add a separate governed event adapter with repository/actor policy, deduplication, and active-work correlation. |
| [Route work with triage and specs](https://www.warp.dev/learn/build-a-self-improving-software-factory/tackle-larger-features-with-specs) | Distinguish answer, change, and unresolved intent; research facts before escalating actual behavior choices. | Retain Mission Spec clarifications and requirement-to-verification lineage. The prepared recipe-intent repair addresses clear advisory routing errors. Use existing authorization for the bounded to-do request rather than repeatedly requesting routine implementation approval. |
| [Add verification and merge risk](https://www.warp.dev/learn/build-a-self-improving-software-factory/add-verification-and-merge-risk) | Operate the actual app and show evidence; assess alignment, impact, verification, rollback, and error detection. | Extend the existing Review Evidence Package with explicit unknowns, tested runtime/platform, structured rollback cost, and application error-detection evidence. Keep deterministic acceptance gates and independent verification. |
| [Close the loop with alert monitoring](https://www.warp.dev/learn/build-a-self-improving-software-factory/close-the-loop-with-alert-monitoring) | An authenticated application-error event can initiate triage and a verified repair proposal. | Add a product-error adapter through existing incident/evidence and Mission/WorkOrder records. Define recurrence, release correlation, bounded retries, and restoration evidence before calling the loop operational. |

## Existing capability versus operational proof

### Readiness and configuration already exist

[`configuration.ts`](../../convex/factory/configuration.ts) evaluates repository,
workflow, execution profile, route, code scopes, agent bindings, policy, budget,
verifiers, worker, and recovery requirements. Version creation records exact
digests and qualification snapshots. Activation requires a current passing
assessment for that version. [`workOrders.ts`](../../convex/workOrders.ts) adds
WorkOrder and Mission requirements.

The gap in this session is a usable, connected runtime and identity. Creating
another readiness dashboard would not supply either prerequisite. The useful
enhancement is to make preparation reproducible and the existing readiness
result actionable from the session that will launch the workload.

### Specs and verification already have enforceable lineage

[`missionSpec.ts`](../../convex/lib/missionSpec.ts) represents requirements,
acceptance expectations, edge cases, source references, and clarifications.
Unanswered clarifications block evaluation. Browser and screenshot evidence
categories are already supported. [`missionWorkOrderContract.ts`](../../convex/lib/missionWorkOrderContract.ts)
carries this lineage into WorkOrders.

The remaining work is application-specific: define how to start the app, what
to exercise, which profile and platform to use, and what evidence proves each
criterion. A screenshot from another candidate, a jsdom assertion, or a test on
the wrong native platform cannot close the required browser gate.

The course's generic approval examples are not a request to add more approval
rounds for this already-authorized task. Existing authority still needs to be
represented through an authenticated, scoped control-plane identity. New facts
that research can resolve should be researched; only a material unresolved
product choice needs a new owner decision.

### Review risk should extend the current package

[`reviewPackage.ts`](../../convex/lib/reviewPackage.ts) already rejects missing,
stale, failed, or integrity-invalid criterion evidence and requires rollback
guidance. [`reviewIntelligence.ts`](../../convex/lib/reviewIntelligence.ts)
adds requirement mapping, semantic file groups, review judgments, and residual
risks. These are projections over canonical evidence.

Add an evidence link and an explicit unknown state for each relevant review
facet. A written rollback approach is useful, but it does not prove restoration
was exercised. Factory infrastructure logs do not establish that failures in
the generated application will be detected. For this to-do workload, failed
local persistence and browser runtime errors are concrete detection cases.

Any compact risk score remains advisory. It must not average away a failed
mandatory check, stale candidate identity, missing independent verification,
or absent browser proof. Existing acceptance and publication authority should
remain separate from the implementer's risk summary.

## Backlog and application-error intake need explicit adapters

The signed [`/github/webhook` route](../../convex/http.ts) and
[`githubAppConnections.ts`](../../convex/githubAppConnections.ts) verify the
delivery and installation, record delivery IDs, and process installation,
pull-request, CI, and review evidence. The inspected route does not route issue
events into canonical Mission/WorkOrder dispatch.

[`github.ts`](../../convex/github.ts) supplies a separate legacy issue importer.
It creates INBOX tasks and tracks GitHub state in metadata. Importing a task is
not proof of a Mission, approved plan, admitted WorkOrder, or autonomous Attempt.
The inspection found concrete authorization/project-scope and pagination defects
in this helper; their repair is separate from implementing event-driven delivery.

[`webhooks.ts`](../../convex/webhooks.ts) sends outbound event notifications.
[`monitoring.ts`](../../convex/monitoring.ts) and
[`alertRules.ts`](../../convex/alertRules.ts) monitor factory activity and cost.
Neither supplies the demonstrated product-error-to-repair pipeline.
[`factory/incidents.ts`](../../convex/factory/incidents.ts) is a useful existing
incident aggregate with scope, evidence, idempotency, transition, and restoration
controls. Extend it through a defined adapter rather than assuming a generic
webhook has already closed the loop.

[`docs/factory/configuration.md`](../factory/configuration.md) explicitly labels
its source configuration as an experimental agent-readable convention. A
provider label such as Sentry does not install a connector or grant access.

The first governed adapter should bind the installation, repository, project,
initiating actor, delivery ID, source item, and existing active work. It should
retain the source link, use an opt-in event policy, suppress factory-generated
feedback loops, and enter the existing lifecycle within its actual budget.

For product errors, also record the application, environment, release, provider
issue/fingerprint, alert class, occurrence window, and scrubbed diagnostic
references. Distinguish duplicate delivery from recurrence of an active bug,
regression after a fix, and a threshold change in urgency. Qualify received-but-
unprocessed and failed-processing recovery. A repair PR and passing tests do
not by themselves establish observed restoration of the deployed application.

## Improvement requires correct measurement and real replay

[`observability.ts`](../../convex/observability.ts) already supports traces,
evaluator definitions, regression datasets, and two-variant experiments.
[`evalControlPlane.ts`](../../convex/evalControlPlane.ts) retains integrity-checked
receipts and immutable baselines. [`learning.ts`](../../convex/factory/learning.ts)
derives reviewable improvement candidates, and
[`metaLoop.ts`](../../convex/factory/metaLoop.ts) routes accepted proposals into
governed work.

Two measurement defects were reproduced during this comparison:

- The measurement helper always treated larger values as meeting a target. A
  cost result of 4 against a target of 5 was marked missed, while a cost of 8
  was marked met. The correction needs an explicit target direction, preserved
  in the API and stored measurement; free-text unit names cannot reliably
  establish direction.
- Factory Learning omitted a recorded average quality score when comparing
  experiment variants. A cheaper candidate could receive an advisory promotion
  recommendation despite a known lower score. The existing score must reach
  the comparison, and a known regression must remain visible.

Both measurement repairs and the two GitHub intake repairs were integrated
after independent source review. Their focused and combined verification is
recorded in the main review. These results do not prove that a live factory has
improved itself.

The experiment API distinguishes human-recorded aggregate outcomes from
deterministic fixture experiments. Shared dataset/version/evaluator references
provide declared context, but manual aggregate entry does not prove identical
cases were replayed, establish statistical significance, or bind one score to
one evaluator among several definitions.

The next capability to qualify is real replay: select a frozen workload set,
run it through two admitted Factory Versions, preserve every Attempt and cost,
collect independent exact-candidate verification, and compare verified outcomes.
Keep sample sufficiency and missing evidence explicit. No generic dataset-to-
live-worker replay executor was found in the inspected paths; this is a scoped
source finding, not a claim about every possible external installation.

## Recommended execution order

1. Finish and independently verify the bounded defects found in this review.
2. Establish authenticated access to the existing admitted runtime and complete
   the real to-do build, browser acceptance, recovery drills, and clean repeat.
3. Add one governed issue-event adapter and prove duplicate, retry, and active-
   work correlation using the qualified application repository.
4. Add one application-error adapter and demonstrate detection, triage, bounded
   repair, new verification, and observed restoration on an isolated failure.
5. Replay a frozen workload set across two Factory Versions before expanding
   automated optimization or promoting a proposed improvement.

No new external webhook, issue, schedule, monitoring connection, or live repair
run was created during this comparison. The live qualification dependency and
the existing recipe browser-verification gate remain open.
