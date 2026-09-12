---
title: Inference Gateway and Outcome Economics Qualification
status: planned
owner: ML/AI + Platform + Product
roadmap_todo: "063"
depends_on: "none for bounded first slice; 062 for broader workflow semantics"
created: 2026-09-05
---

# Inference Gateway and Outcome Economics Qualification

## Objective

Qualify one shared, governed inference boundary that attributes every physical
provider attempt and its cost confidence to the canonical Attempt, then measure
one frozen route comparison against a versioned accepted-outcome definition.
The phase proves accounting and decision reproducibility; it does not enable
autonomous routing, broaden tool authority, or optimize for token volume.

This plan implements the existing Phase 5 section of the
[production convergence plan](2026-08-25-feat-software-factory-production-convergence-plan.md)
and existing [todo 063](../../todos/063-ready-p1-outcome-economics-routing.md).
It is the bounded inference-accounting qualification slice of that larger todo;
it creates no parallel roadmap item and does not complete todo 063's compute,
sandbox, platform, human-attention, adoption, or customer-outcome economics.

## Start gate

Planning is complete independently of implementation authorization.
The Product Owner approved the bounded first slice to proceed ahead of todo
`062`. That sequencing exception is limited to the governed inference boundary,
exact route identity, pricing, provider receipts, hard reservations,
accounting, settlement, cost coverage, and verified-outcome economics
primitives. Todo `062` remains required for shared builder intent,
product/QA/design contribution semantics, and broader outcome-workflow
semantics. A later execution authorization must separately approve any
provider, credentials, spend, synthetic workload, and maximum physical-call
budget. This closure authorizes none of those actions.

## Existing capabilities to reuse

- `Mission → Plan → WorkOrder → Task → Attempt → evidence → pull request → release`
  remains the only lifecycle.
- Execution Profiles bind harness/runtime/backend without conflating them with
  model-route identity.
- Model-route admission already provides exact route, qualification,
  cost-policy, hard-eligibility, and conservative fallback decisions.
- Attempt reservations and durable observations already exist; missing cost is
  represented as unknown rather than zero.
- Independent verification, immutable evidence, policy decisions, leases,
  cancellation, replay protection, and tenant/workspace scoping remain
  authoritative.
- Existing provider adapters and the model router may supply normalized inputs,
  but the current direct key-owning router is not itself the qualified shared
  inference gateway.

## Exact gaps

1. No sole governed boundary records every physical provider call, including
   failed retries and fallbacks, under one logical request lineage.
2. Reservations do not yet freeze maximum physical calls, tokens, money,
   deadline, fallback set, and price-book identity together.
3. Provider usage dimensions, cache behavior, service tier, batch mode,
   resolved model, retry, and provider request identity are not normalized into
   an immutable receipt with explicit completeness.
4. Estimated price is not distinguished strongly enough from measured or
   reconciled provider cost.
5. Accepted, merged, deployed, production-verified, rolled-back, rejected, and
   abandoned outcomes lack one versioned projection with durable lineage.
6. Routing comparisons cannot yet reproduce cost per accepted outcome with
   sample, coverage, freshness, bounds, and confidence.

## Architecture

```text
Attempt + qualified Model Route + Execution Profile
                    |
             Admission Policy
                    |
       immutable Inference Reservation
                    |
      shared governed Inference Gateway
                    |
       one receipt per physical attempt
                    |
     raw usage/cost observations (immutable)
                    |
 versioned outcome projection + frozen comparison
                    |
       evidence; advisory routing only
```

The gateway is the sole network boundary for admitted inference after cutover. Harnesses call
the boundary through a provider-neutral contract; they do not own provider
credentials or silently retry. Logical model route, resolved provider model,
harness, runtime, and backend remain separate identities.

## Contracts

### Inference reservation

An immutable reservation extends the canonical Attempt budget/admission record;
it is not a new execution lifecycle. It owns no execution status, retry state,
lease, verification, or acceptance state. WorkOrder retry creates a new Attempt;
provider retry creates a physical child attempt within the same logical request.

The reservation binds `workspaceId`, `workOrderId`, `taskId`,
`attemptId`, logical request key, exact qualified route/version, allowed
providers and fallbacks, maximum physical calls, input/output token ceilings,
money ceiling and currency, deadline, price-book version, policy decision, and
lease identity. The frozen reservation is immutable. Consumption uses
append-only entries and a derived balance; every physical call atomically
claims a slot and budget before transport.

The money limit is a conservative dispatch-exposure ceiling, calculated before
transport from frozen maximum calls/tokens and the worst applicable price-book
rates. Admission is denied when no finite upper bound exists. Reconciled actual
cost may exceed the estimate; that is retained as a variance/breach and never
misrepresented as proof that actual provider billing was capped.

### Physical-attempt intent and observation

Before transport, the gateway atomically consumes the slot and persists an
immutable physical-attempt intent with its ordinal, route, endpoint, limits,
deadline, and idempotency identity. An append-only dispatch claim is the atomic
winner against cancellation and authorizes transport exactly once. Only an
unclaimed intent may be cancelled or resumed; a claimed intent is never
redispatched.
A terminal observation is appended after transport; it never rewrites the
intent. A crash, database outage, lease loss, cancellation race, or streaming
disconnect after possible dispatch is reconciled as delivery/usage/cost
`UNKNOWN` and never causes implicit redispatch.

### Physical inference receipt

Persist one immutable receipt for every transport attempt, including failures:

- logical request key and physical-attempt ordinal;
- Attempt/reservation/route/profile identity;
- requested route/model and provider-observed resolved model;
- provider, endpoint/API/SDK versions and provider request ID;
- start/end/status, timeout/cancel/error classification;
- retry/fallback parentage and policy decision;
- raw and normalized input/output/reasoning/cache token dimensions;
- batch/service-tier facts;
- transport-time raw usage and a price-book estimate with provenance and
  completeness, never a mutable reconciliation state;
- redaction-safe evidence digest.

A timeout after transport is ambiguous: delivery, usage, and cost remain
`UNKNOWN`. A retry is an explicitly authorized new physical intent, slot,
ordinal, and receipt. The logical request key is unique on
`{workspaceId, attemptId, stepId, requestOrdinal}`. Concurrent duplicates
return the existing terminal result or `IN_PROGRESS`; they do not consume a
second slot. Two physical calls are never collapsed into one.

### Price book

An immutable PriceBookVersion records provider source, effective interval,
currency, digest, model/snapshot, service tier, batch/cache/reasoning dimensions,
and formula. Historical receipts never change price-book identity. Provider
billing reconciliation adds a new observation rather than rewriting history.
The projection may select a newer interpretation, but provenance and
completeness remain independent dimensions: a billing-reconciled fact may
still be partial.

### Outcome projection

Raw outcome events remain immutable. A versioned projection distinguishes at
least verification, human acceptance, merge, deployment, production
verification, incident, rollback, rejection, and abandonment. Each derived
metric records projection/formula version, lineage, compatible cohort, sample,
coverage, freshness, bounds, and confidence. All physical spend in the lineage,
including failed retries and fallbacks, contributes to the outcome economics.

For the bounded comparison, freeze before dispatch a qualification projection:
the terminal outcome is an independent-verifier pass followed by explicit
human acceptance of the synthetic result. Freeze its projection version,
formula version, cohort, observation cutoff, denominator, tie rule,
abandonment rule, and `UNKNOWN` treatment. Merge, deploy, production,
incident, rollback, and customer outcomes remain distinct and absent—not
`false`—because this qualification does not exercise them.

## Authority

- An approved WorkOrder and current Attempt do not alone authorize inference;
  an exact qualified route, current policy decision, active lease, and available
  reservation are also required.
- Provider aliases discovered at runtime do not create route authority.
- Fallback requires explicit pre-admission; no provider/model substitution is
  implicit.
- The gateway owns provider credentials; harnesses receive no reusable secret.
- Receipt persistence is mandatory before a call can be considered complete.
- Outcome economics is advisory. Guarded Auto, RED actions, merge, deployment,
  and production changes remain disabled.
- MCP discovery and tool authority are unchanged and outside this phase.

| Actor | Permitted authority |
| --- | --- |
| Product Owner | Own the recorded sequencing exception; approve a later provider/spend qualification and its success definition |
| Operator | Start an already-approved bounded qualification and cancel future dispatch; cannot alter receipts or self-verify |
| Harness/runtime | Submit a logical request against its current Attempt; holds no provider credential and cannot choose an unapproved fallback |
| Gateway service identity | Authenticate to the workspace, validate admission, claim a reservation slot, persist intent, dispatch, and append observations; cannot accept outcomes |
| Reconciliation service identity | Append scoped provider billing observations; cannot dispatch, change reservations, or rewrite receipts |
| Independent verifier | Evaluate the frozen synthetic candidate; cannot dispatch inference or accept the outcome |
| Human acceptor | Accept or reject the exact synthetic result for the frozen projection; cannot rewrite cost facts |
| Read-only viewer | Inspect redacted evidence in its tenant/workspace only |

All service actions require authenticated service identity, tenant/workspace
binding, least privilege, and an auditable policy decision. Live-spend approval,
dispatch, verification, acceptance, and reconciliation remain separable roles.

## Runtime flows

1. Human approval freezes service selection, route/adapters, credential class,
   provider endpoints, spend/call caps, task set, verifier, and outcome formula.
2. Attempt admission creates the subordinate reservation. Gateway admission
   validates current route/profile/policy/lease and available balance.
3. The gateway atomically appends a physical intent and consumes its slot, then
   dispatches once and appends the terminal or ambiguous observation.
4. Retryable error classes, backoff, maximum calls, fallback order, and
   per-route token/money allocation are frozen in policy. Each retry/fallback
   repeats admission with a new intent and ordinal. SDK retries are disabled;
   only the gateway may retry after durably claiming the new slot and intent.
5. Cancellation before intent prevents dispatch. For an unclaimed intent,
   cancellation and the dispatch claim race atomically and exactly one wins.
   Cancellation, timeout, lease loss,
   disconnect, or crash after possible transport yields `UNKNOWN`, blocks
   implicit redispatch, and enters reconciliation.
6. Gateway restart may claim an unclaimed intent; it never resumes a claimed
   intent. Late provider or billing events append observations and
   refresh a versioned projection; they never rewrite the prior snapshot.
7. Route revocation blocks new intents. Existing evidence remains readable.
8. The frozen outcome projection combines verifier and human acceptance facts,
   then produces the comparison with coverage and bounds.

## Delivery slices

1. **Contract and schema slice.** Add reservation, physical receipt, price-book,
   reconciliation, and outcome-projection contracts with validators, indexes,
   queries, generated types, and schema-contract tests in the same change.
2. **Gateway enforcement slice.** Route one existing harness path through the
   shared boundary; enforce identity, policy, lease, budgets, deadline,
   credential isolation, explicit retry/fallback, and durable receipts.
3. **Accounting slice.** Normalize provider observations without converting
   missing dimensions to zero; preserve raw facts and calculate bounded costs
   against the frozen price book.
4. **Outcome slice.** Build the versioned projection from canonical evidence and
   expose accepted-outcome cost with coverage/confidence, not a vanity total.
5. **Comparison slice.** Run one explicitly authorized, synthetic, bounded,
   no-fallback comparison over two already qualified exact routes, the same
   frozen task set, verifier, policy, reservation limits, and outcome formula.
   If two routes are not independently qualified, stop rather than expanding
   scope inside this phase.

Before slice 1, a reviewed service-selection record must name the one harness
path, exact route and adapter versions, credential classes, endpoints, and
existing qualification evidence. Selection cannot be deferred to an
implementation default.

Each slice lands behind flags, begins read-only/advisory in operator surfaces,
and preserves old behavior until its deterministic checks pass. No production
deployment or customer data is part of qualification.

## Negative controls

Deterministic tests must deny or classify correctly:

- wrong tenant/workspace, Attempt, route, profile, or reservation;
- stale lease, revoked/unqualified route, exhausted/expired reservation;
- provider alias or resolved-model drift and endpoint/API substitution;
- duplicate logical dispatch, response replay, and duplicate provider event;
- unapproved fallback, fallback loop, and reservation overflow;
- hidden SDK retry and extra physical call;
- timeout after possible delivery, streaming disconnect, and cancellation race;
- missing usage, partial usage, missing billing identity, and unknown cost;
- price-book drift, currency mismatch, cache/batch/tier substitution;
- retry/fallback spend omitted from rejected, abandoned, or accepted outcomes;
- stale outcome projection, incompatible cohorts, and incomplete coverage used
  to promote a route.

## Qualification

Offline qualification runs contract, authority, lifecycle, concurrency,
recovery, provider-fixture, schema, accounting, projection, and reproducibility
tests in CI. Provider fixtures include exact versioned response shapes and
failure modes; they make no network calls.

The offline gate records an explicit `GO` or `NO_GO` and retains route/profile/
reservation digests, schema and fixture/API versions, every negative-control
result, physical-intent and receipt lineage, projection inputs and formula,
coverage calculation, and deterministic cleanup proof. Live qualification is
a separate manual command and must never be invoked by CI.

One later live qualification may run only after the start gate and explicit
provider/spend authorization. It uses synthetic non-customer inputs, exact
model snapshots, disabled SDK retries, capped physical calls
and money, isolated credentials, durable receipts, independent verification,
and post-run cleanup. The evidence must reproduce every comparison input and
must report measured/partial/unknown coverage honestly.

## Rollout

1. Land schemas and offline fixtures with all behavior disabled.
2. Shadow one existing route and compare gateway receipts with current
   observations; no routing decisions consume the result.
3. Enable the gateway for one explicitly qualified route in a disposable
   environment under a zero-default budget.
4. Perform the authorized frozen comparison if both routes meet admission.
5. Expose operator evidence and advisory metrics behind a flag.
6. Consider broader pilot admission only in a separate plan and decision.

Before gateway cutover, shadow rollback may restore existing behavior. After
qualification and cutover, rollback disables new gateway admission or selects
a previously qualified gateway adapter. It must never restore a direct,
credential-owning provider bypass. Rollback never deletes intents, receipts,
reservations, outcomes, or evidence.

The existing operator surface must show loading, empty, denied, stale,
in-progress, cancelled, partial, unknown-cost, reconciliation-failed,
comparison-ineligible, completed, and resumed-after-refresh states. No new
primary navigation domain is required.

## Stop conditions

Stop implementation or qualification when:

- work expands into todo `062`'s shared builder-intent or broader outcome-workflow semantics before that todo is complete;
- provider billing/request identity cannot be correlated safely;
- a physical call or retry can bypass reservation or receipt persistence;
- ambiguous delivery or missing usage would be labeled complete or zero-cost;
- outcome stages must be collapsed to make the comparison work;
- two physical calls can be counted as one, or retry/fallback spend is omitted;
- qualification requires production deployment, customer data, broad
  credentials, unbounded spend, an unqualified route, or unrelated MCP scope;
- the schema and consumer cannot land atomically with their validators,
  indexes, queries, generated types, and contract tests.

## Success criteria

- Every admitted logical request has one immutable reservation and every
  physical attempt has one durable, attributable receipt.
- Exact route identity remains separate from provider-resolved model and
  harness/runtime/backend identity.
- Budgets, deadlines, retries, and fallbacks fail closed and are reproducible.
- Usage and cost report provenance separately from `COMPLETE`, `PARTIAL`, or
  `UNKNOWN` completeness; missing data never becomes zero.
- Accepted-outcome cost includes all physical spend in its lineage and retains
  projection/formula version, sample, coverage, freshness, bounds, confidence,
  and immutable source facts.
- One frozen, independently verified route comparison is reproducible from
  evidence, or the phase records a bounded NO_GO without weakening controls.
- Guarded Auto, RED auto-routing, merge, deploy, production changes, and MCP
  writes remain unauthorized.

## Explicit non-goals

No production deployment, new external service, write-capable MCP, customer
data, broad credential grant, general model marketplace, autonomous route
promotion, or Phase 5 implementation is authorized by this plan.
