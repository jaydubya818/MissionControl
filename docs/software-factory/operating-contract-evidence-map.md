---
title: Software Factory Operating Contract Evidence Map
status: ACTIVE
last_verified: 2026-09-05
baseline_commit: aa8c12b
---

# Software Factory operating contract evidence map

This map connects [FDLC's six architecture areas](https://fdlc.ai/architecture) to existing Mission Control implementation and tests. It is an implementation guide, not a replacement schema, admission decision, or maturity ledger. Source paths below were reconciled at `aa8c12b` after the separately qualified read-only service landed; retained qualification proves only its cited revisions and scope.

The governed Mission is the unit of intent. Plans, WorkOrders, Tasks and Attempts preserve the delivery contract while models, skills and tools can change through existing configuration gates. Execution, verification, acceptance, release and Factory promotion retain separate authority.

## Existing implementation and limits

| Operating contract | FDLC owner | Implementation and evidence | Maturity boundary |
| --- | --- | --- | --- |
| Intent and acceptance criteria become a governed Plan | Intent | [Mission planning](../../convex/missionPlanning.ts), [Mission/Plan tests](../../convex/__tests__/missionPlan.test.ts), [System V2 evidence](../testing/evidence/system-factory-e2e-v2/README.md) | Qualified bounded golden path; replaceable planning does not relax Plan approval |
| Durable execution, fencing and reconciliation | Harness | [Recovery](../../convex/lib/executionRecovery.ts), [recovery tests](../../convex/__tests__/executionRecovery.test.ts), [worker operations](./worker-runtime-operations.md) | Qualified within existing Attempt/repository contracts; generic side-effecting tool reconciliation is PLANNED |
| Capability qualification precedes economical routing | Capability, Model, Trust | [Execution routing](../../convex/lib/executionRouting.ts), [routing evidence tests](../../convex/__tests__/executionRoutingEvidence.test.ts), [routing cost tests](../../convex/__tests__/executionRoutingCost.test.ts) | Model/harness/backend routing is implemented and gated; a universal tool/skill/human router is PLANNED |
| Context is current, attributable and scoped | Capability, Trust | [Factory Memory](../../convex/factoryMemory.ts), [memory tests](../../convex/__tests__/factoryMemory.test.ts) | Qualified advisory records and frozen packages; production retrieval relevance and general source-conflict resolution remain partial |
| Tool output is validated data, never authority | Capability, Trust | [Broker](../../apps/orchestration-server/src/governedMcpBroker.ts), [contract validation](../../apps/orchestration-server/src/governedMcpContracts.ts), [broker tests](../../apps/orchestration-server/src/__tests__/governedMcpBroker.test.ts), [Convex tests](../../convex/__tests__/governedMcp.test.ts) | EXPERIMENTAL: local fixture plus exact Context7 `query-docs` for one fixed public React query; no write or general connector authority |
| Independent verification binds exact criterion and subject | Trust | [Verification Subject](../../packages/workflow-engine/src/verificationSubject.ts), [Quality Gate tests](../../convex/__tests__/qualityGateDecision.test.ts), [verification contracts](./verification-first-domain-contracts.md) | Qualified contracts; neither diagnostic scores nor a producing worker can accept its own result |
| Traces diagnose path and outcome separately | Harness, Trust, Learning | [Observability persistence](../../convex/lib/observabilityPersistence.ts), [observability tests](../../convex/__tests__/observabilityGoldenPath.test.ts) | Qualified diagnostic system; complete production trajectory evaluation is not claimed |
| Outcomes propose changes without promoting them | Learning | [Factory Learning](../../convex/factory/learning.ts), [learning tests](../../convex/__tests__/factoryLearning.test.ts) | Qualified advisory behavior; production learning coverage and promotion remain separately governed |

The [capability maturity ledger](../product/software-factory-capability-maturity.md) owns status. This map adds no runtime, schema, API, permission, navigation surface or new status enum.

## Tool boundary: historical fixture and current read-only qualification

The [Phase 3 completion record](../testing/evidence/governed-mcp-phase3/completion-record.md) cites implementation qualification at `37953e4d2879` and clean-main qualification at `6611a03c6025`. Keep those historical identities unchanged.

- The control plane binds project, WorkOrder, Attempt, live lease/generation, Execution Profile, Tool Grant, Tool Version and exact operation. The host requires an affirmative durable reservation before transport.
- The Phase 3 fixture grant is limited to one public, read-only local stdio operation with no credentials, network destination or write authority. General harness-native MCP remains unsupported.
- The broker checks implementation identity, output shape, required fields, bounded size and selected secret patterns. Hostile content remains untrusted data. Pattern matching is not a general proof that arbitrary output is safe.
- Output is withheld if completion is not newly committed or the live authority became stale. Cancellation, timeout, replay, grant revocation, schema substitution and malformed output have negative controls.
- Receipts identify the attempted operation and its result; they do not establish that a WorkOrder meets its business acceptance criteria. Cost is recorded as UNKNOWN where no accounting evidence exists.

The separately landed [Phase 4 recovery evidence](../testing/evidence/governed-mcp-phase4-recovery/README.md) adds one fixed public React query through Context7 `query-docs`. The canonical browser-dispatched Attempt received host-brokered durable receipts and separate verification; the earlier direct transport was diagnostic only. Verified `LOCAL_GIT` subjects remain non-accepting without trusted publication evidence. The two recorded external service operations belong to that prior qualification; this documentation integration makes no new service or model call. This remains experimental and does not admit another operation, write authority or general connector support.

The runtime reuses the existing tool boundary. Broader operation or service claims require separate authority and evidence; this integration does not expand them.

## Operator decisions under uncertainty

| Condition | Inspect in existing records | Safe decision |
| --- | --- | --- |
| Worker reports completion but verification is missing or stale | Attempt, candidate, Verification Subject and Quality Gate | Keep the WorkOrder ineligible; obtain current independent evidence |
| A PR operation times out after a possible effect | Logical operation identity, repository/head, publication evidence and provider state | Reconcile before any new effect; inability to prove absence is not permission to retry |
| Memory says approved but current records differ | Current Plan/approval, scope, source version and Context Package | Use the authoritative record and surface the stale-memory conflict |
| A fallback is available but lacks required qualification | Frozen profile, policy and routing rejection reasons | Block or select a separately qualified route within existing authority |
| A favorable diagnostic score conflicts with a hard gate | Exact criterion-level evidence and gate decision | Preserve the failure; a score cannot override the gate |
| Spend is incomplete | Attempt usage, routing cost coverage and component provenance | Show a known subtotal and missing components, not zero or a complete actual total |

Unknown external outcome is an evidence condition on an operation. It is not a new Mission or Task status and does not change the current broker's read-only contract. The detailed reference decision table is in [Guide Chapter 14](https://ai-software-factory-mastery.vercel.app/docs/03-build/14-durable-execution).

## Measurement and future qualification

Use the existing Attempt, trace, evaluation and learning records. For a declared admitted-work cohort, cost per verified outcome uses independently verified outcomes; cost per accepted outcome requires verification and acceptance. Include failed work and retries in spend, publish the cutoff, and keep ACTUAL, ESTIMATED and UNKNOWN component coverage visible. Zero outcomes make the ratio undefined. A ratio over incomplete cost is not a complete-cost benchmark.

Work amplification counts declared downstream operation invocations per admitted Mission, including retries without double-counting parent trace spans. Critical-path latency includes queueing, execution, retry delay, verification and decision waits. These are recommended measurement contracts, not claims that Mission Control currently computes complete fleet-wide metrics. [Guide Chapter 9](https://ai-software-factory-mastery.vercel.app/docs/02-design/09-tokenomics-and-factory-economics) owns the detailed calculation and [FDLC Benchmarks](https://fdlc.ai/benchmarks) owns the framework definition.

Before expanding the reference capability, require:

1. Provider-specific evidence for safe retries, delayed visibility, conflicting effects, cancellation and stale completion; do not generalize the read-only fixture to writes.
2. Representative retrieval cases proving relevance, currentness, authorization, compaction integrity and correct use of the retrieved source; use [Guide Chapter 20](https://ai-software-factory-mastery.vercel.app/docs/03-build/20-context-engineering).
3. Versioned negative cases with redacted evidence, owner, expected result, forbidden effect and a baseline comparison. Reuse current evaluations and [Guide Chapter 29](https://ai-software-factory-mastery.vercel.app/docs/04-prove/29-evaluation-engineering); do not add a parallel evaluation service.
4. Real accepted work with complete model, tools, retrieval, compute, verification and human-attention coverage before economics-based promotion.
5. The existing approved rollout and rollback process. Learning produces candidates; humans and policy retain promotion authority.

No capability advances in maturity because this map exists. Runtime changes, real service admission and production rollout require their existing qualification and authority gates.
