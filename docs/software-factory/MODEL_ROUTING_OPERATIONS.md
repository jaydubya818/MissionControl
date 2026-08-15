# Model Routing Operations

## Fleet-owner operating standard

Each developer owns the quality and cost of an agent fleet. A routing policy is
healthy when it chooses the lowest-cost approved route that meets the task's
risk, complexity, capability, evidence, and availability requirements.

## Authorization boundary

Model Routing is workspace-scoped even though the V1 catalog is stored globally.
Every public catalog, policy, simulator, override, and decision read must first
authorize `factory.read` for the selected workspace. Policy activation, catalog
initialization, and enforcement changes require `factory.automation.manage`.
Agent override changes require `factory.improve`; Work Order overrides require
`factory.approve` plus the existing delivery approval authority.

Write attribution is resolved from the authenticated operator on the server.
Clients must never provide an actor identity for routing changes. Provider health
and catalog synchronization are internal service operations, not public browser
mutations.

Local discovery remains read-only until the orchestration server has a signed,
workspace-scoped command path. The UI must show this as unavailable rather than
claiming that a browser-triggered sync is trusted.

## Activation checklist

- Every lane has at least one healthy approved route.
- Plan, Review, and Long-running lanes have a powerful fallback.
- Long-running work has at least two independent providers before unattended
  execution is treated as resilient.
- Newly approved models begin in a 5–10% canary cohort.
- Daily and monthly lane spend envelopes match the workspace budget.
- The simulator proves low-, medium-, and high-risk behavior before enforcement.

## Monitoring and validation

Validation window: the first 25 comparable routed runs per lane and the first
seven days after a policy activation. The workspace fleet owner is responsible.

Watch:

- selection count, estimated spend, latency, retry count, and provider health;
- validation pass rate, review outcome, approval outcome, and fallback rate;
- exhausted routes, unavailable providers, budget rejections, and canary use;
- long-running queues with fewer than two healthy providers.
- authorization failures, cross-workspace denials, and routing writes attributed
  to placeholder actors instead of authenticated operator IDs.

Healthy signals:

- at least 95% of bounded runs resolve without fallback;
- canary validation is no worse than five percentage points below the stable
  lane baseline;
- no high-risk task is routed below the POWERFUL quality floor;
- lane spend remains inside both daily and monthly envelopes.

Mitigation triggers:

- Suspend a canary after three validation failures in ten comparable runs.
- Return a lane to its previous policy version if fallback or retry rate doubles.
- Enable the routing kill switch if high-risk eligibility or evidence is wrong.
- Pause unattended long-running dispatch when provider diversity falls below the
  configured minimum.

## Evidence-based ranking roadmap

Do not train ranking behavior on raw activity. After a lane has 25 comparable
receipts, calculate a conservative quality score from validation pass rate,
retry-free completion, approval outcome, and verified latency. Cost should break
ties only among routes that clear the quality threshold. Keep the scoring inputs,
sample size, confidence, and selection explanation visible to the operator.

Recommended next improvements:

1. Connect provider-native model identities and prices instead of generic
   `operator-*` routes.
2. Add automatic canary suspension once receipt outcomes are normalized.
3. Add per-provider concurrency and rate-limit capacity to overnight routing.
4. Add policy diff and rollback controls beside immutable policy history.
5. Add cost avoided, quality-adjusted cost, and escalation-rate trends by lane.
