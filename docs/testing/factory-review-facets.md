# Review questions and operational observations

The existing review evidence package now groups its supporting evidence into
alignment, impact, verification, rollback cost, and error detection. Each item
shows evidence availability or an explicit unknown. These fields are advisory.
They do not calculate a risk score, approve a WorkOrder, or grant publication.

The same change fixes a reproduced stale-review defect. A Policy V2 review
could display READY from an older passing receipt even when the canonical
current-verification evaluator rejected that receipt. The review now consumes
that evaluator's result. A rejection blocks review readiness; a missing current
assessment leaves it incomplete. Acceptance continues to use its existing
canonical evaluator.

Rollback instructions do not establish rollback cost or exercised restoration.
Factory infrastructure logs do not establish application-error detection.
Operational claims require LIVE envelopes tied to the current WorkOrder,
revision, source Attempt, verifier Attempt, verification run, subject, contract,
plan, source revision, and candidate revision. The current gate and a passed
criterion must both link the envelope. Synthetic, expired, superseded,
candidate-produced, unlinked, or malformed observations remain unknown.

An independent verifier can emit one line in its existing command output:

```text
MC_REVIEW_OBSERVATION={"schema":"factory-review-observation/v1","rollback":{"estimatedMinutes":12,"operatorSteps":3,"requiresDataRestore":false,"requiresRedeployment":true,"restorationTest":"NOT_RUN"},"errorDetection":{"mechanism":"visible persistence failure","faultInjected":true,"signalObserved":true}}
```

The verifier must derive these values from its actual check. An estimate remains
an estimate. Restoration is separately PASS, FAIL, or NOT_RUN. Detection needs
both a deliberately injected fault and an observed application signal. A
producer can also use the same object in its `reviewObservation` metadata.
The Policy V2 persistence path wraps producer output and host fields in
`envelope.metadata.verifierMetadata`; the projection consumes that canonical
wrapper while retaining the envelope's authority and fixture restrictions.
Legacy flat producer metadata remains readable only when the same exact evidence
conditions hold. Mixed wrapped/flat fields, simultaneous structured and output
observations, unknown schema versions, malformed fields, and multiple output
markers remain unknown. There is no new mutable evidence store or write API.

The command verifier records its actual host platform, architecture, and Node
version. The review labels this as the verifier host. It does not substitute that
host for the generated application's browser or runtime acceptance evidence.

The alternative design was a separate set of mutable facet records and public
write endpoints. The selected projection reuses immutable evidence and avoids a
second source of review authority. Independent design review specifically
required full currentness, exact tuple matching, explicit restoration, and
tests that favorable observations cannot erase a failed mandatory gate.

Behavioral tests cover malformed observations, synthetic provenance, mismatched
identity fields, stale or rejected verification, missing links, failed
detection, and the distinction between estimates and restoration. Browser
verification is a separate required gate and is not established by component
tests.

Independent source review reproduced a producer/projection integration defect:
the initial positive fixtures were flat, while actual Policy V2 persistence used
the wrapper. The retained negative control failed before normalization and passes
after it. Permanent regressions cover the real wrapper and ambiguous shapes.
