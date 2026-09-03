# Model Routing Operations

## Fleet-owner operating standard

Each developer owns the quality and cost of an agent fleet. A routing policy is
healthy when it chooses the lowest-cost approved route that meets the task's
risk, complexity, capability, evidence, and availability requirements.

## Activation checklist

- Every lane has at least one healthy approved route.
- Plan, Review, and Long-running lanes have a powerful fallback.
- Long-running work has at least two independent providers before unattended
  execution is treated as resilient.
- Newly approved models begin in a 5–10% canary cohort.
- Daily and monthly lane spend envelopes match the workspace budget.
- The simulator proves low-, medium-, and high-risk behavior before enforcement.

## Monitoring and validation

Local provider discovery is diagnostic only. Catalog synchronization is an
internal Convex operation and has no browser write path. Keep it unavailable
until the orchestration service can submit a signed, replay-resistant command
that names the workspace and is authorized for that workspace. Internal sync
records use the `orchestration-service` system actor; they never accept a human
actor label from a client.

Validation window: the first 25 comparable routed runs per lane and the first
seven days after a policy activation. The workspace fleet owner is responsible.

Watch:

- selection count, estimated spend, latency, retry count, and provider health;
- validation pass rate, review outcome, approval outcome, and fallback rate;
- exhausted routes, unavailable providers, budget rejections, and canary use;
- long-running queues with fewer than two healthy providers.

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
