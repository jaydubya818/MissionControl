---
title: Software Factory Capability Maturity Ledger
status: active
last_verified: 2026-09-05
baseline_commit: ed77c46c9d975a2ed0c666cdaf0a3f0e12e77d4d
owners:
  - product
  - platform
---

# Software Factory Capability Maturity Ledger

This is the canonical current-status ledger for Mission Control's AI Software
Factory. Architecture documents define intended contracts. Plans describe
proposed work. Evidence packages prove behavior at an exact revision. This
ledger connects those sources without turning a plan or demonstration into a
broader production claim.

When this ledger conflicts with current source or retained evidence, source and
evidence win and the ledger must be corrected. Historical assessments and
plans remain immutable except for explicit status and supersession notices.

## Factory definition

**Builder loop**

`Intent → Plan → Configure agents, harnesses, skills, and tools → Execute → Verify and evaluate → Deliver → Observe → Improve`

**Governed delivery lifecycle**

`Mission → approved Plan → WorkOrder → Task → Attempt → candidate → independent evidence → pull request → human decision → release → observed outcome → governed learning`

Agent definitions, skills, tools, and harnesses are versioned configuration and
execution inputs. They are not separate lifecycle states and do not gain
approval, verification, acceptance, merge, release, or promotion authority.

## Status vocabulary

- **Qualified:** implemented and backed by deterministic system or browser
  evidence at a cited revision.
- **Production-pilot eligible:** qualified for bounded, human-governed use under
  the listed constraints; not general production certification.
- **Implemented, gated:** production code exists, but a policy switch, evidence
  threshold, or unresolved control prevents broader use.
- **Partial:** useful implementation exists, but a material authority,
  lifecycle, telemetry, or real-world proof gap remains.
- **Preview:** available only under an explicitly non-production contract.
- **Experimental:** supported for evaluation and disabled by default.
- **Future or missing:** no admitted production implementation exists.

These labels are not interchangeable. A deterministic fixture proves a
contract; it does not prove real-team adoption, provider economics, fleet
scale, or general production safety.

## Current capability ledger

| Capability | Owner | Status | Evidence | Current limitation | Next promotion gate |
| --- | --- | --- | --- | --- | --- |
| Governed intent, Plans, and WorkOrders | Product + Platform | **Qualified** | [System Factory E2E V2](../testing/evidence/system-factory-e2e-v2/README.md) | One-repository V1 golden path; consequential actions remain separately gated | Complete a real product-repository pilot through human acceptance |
| Agent definitions and Factory binding | Platform | **Qualified** | [System Factory E2E V1](../testing/evidence/system-factory-e2e-v1/README.md) | Builder-facing configuration is primarily developer/operator oriented | Add role-aware contributions to the same Mission/Plan model after the pilot |
| Skills, context, and Factory Memory | Platform | **Qualified; advisory** | [System Factory E2E V2](../testing/evidence/system-factory-e2e-v2/README.md) | Retrieval is deliberately non-authoritative and phase-gated | Prove relevance, isolation, and stale-context handling on real work |
| Generic Harness Contract | Platform | **Qualified architecture** | [Generic Harness plan](../plans/2026-08-16-feat-generic-harness-contract-v1-plan.md) | Each harness/model/backend tuple still requires exact admission | Retain one adapter lifecycle and qualify every new tuple independently |
| Codex harness | Platform | **Production admission** | [Production Factory Pilot V3](../testing/evidence/production-factory-pilot-v3/README.md) | Qualification used disposable workload repositories | Complete accepted work on a controlled product repository |
| Fab harness | Platform | **Experimental; explicit opt-in** | [Fab Phase 3 evidence](../testing/evidence/fab-phase3/README.md) | macOS 26 arm64 local mode; injected model/control-plane/publication evidence only; no whole-agent containment claim | Enroll and authorize an exact live model, non-production MC deployment and controlled publication target |
| DeepSeek harness | Platform | **Experimental; default off** | [Harness manifests](../../packages/workflow-engine/src/harnessManifests.ts) | Pinned local persistent-worker path only | Independent admission, recovery, security, and quality evidence |
| Model/harness/backend routing | ML/AI + Platform | **Implemented, gated** | [Autonomous Execution Routing V1](../plans/2026-08-17-feat-autonomous-execution-routing-v1-plan.md) | Advisory by default; remote tuple has three verified samples and incomplete costs | At least five verified Attempts, 60% component coverage, five-point margin, and complete hard eligibility |
| Durable execution and recovery | Platform + SRE | **Qualified** | [Worker Runtime Operations](../software-factory/worker-runtime-operations.md) | Fleet-scale restart and provider-failure operation are not claimed | Real pilot failure injection across restart, cancellation, late events, and provider outage |
| Independent verification and Quality Gates | QA + Platform | **Qualified** | [System Factory E2E V2](../testing/evidence/system-factory-e2e-v2/README.md) | V1 verifier profiles and repository scope | Preserve exact-subject currentness and expand only from risk-based evidence |
| Observability, traces, and evals | ML/AI + Platform | **Qualified diagnostic system** | [Observability/Evals V1 evidence](../testing/evidence/observability-evals-v1/README.md) | Diagnostic only; no acceptance authority; OpenTelemetry GenAI conventions are not canonical IDs | Add a versioned export adapter when an external telemetry consumer is selected |
| Factory Learning | ML/AI + Product | **Qualified; advisory** | [Factory Learning plan](../plans/2026-08-16-feat-factory-learning-continuous-improvement-v1-plan.md) | Fixture and qualification signals dominate; promotion is intentionally manual | Feed real accepted outcomes, incidents, corrections, and rollbacks into proposals |
| Remote Sandbox | Security + Platform | **Production-pilot eligible; Preview** | [Production Factory Pilot V3](../testing/evidence/production-factory-pilot-v3/README.md) | Unrestricted outbound egress, ephemeral Codex install, three live samples | Provider-enforced egress or explicit bounded-risk acceptance plus sustained real-work evidence |
| Native tool authorization | Security + Platform | **Partial** | [Governed MCP ADR](../decisions/governed-mcp-tool-capability.md) | Exact Tool Version/Grant identity and immutable receipts cover the fixture and one real read-only operation; native harness tools still lack the same canonical authority | Reuse the proven grant/receipt boundary for one separately reviewed native capability |
| Tools/MCP runtime | Security + Platform | **Experimental; one real read-only operation qualified** | [Phase 4 evidence](../testing/evidence/governed-mcp-phase4-recovery/README.md) | Local fixture plus exact Context7 `query-docs` for one fixed public React query; Codex/DeepSeek manifests remain `UNSUPPORTED` and no write or generalized connector authority exists | Gather operational evidence without adding another service or operation |
| Supply-chain provenance | Security + Platform | **Strong partial** | [Production Factory Pilot V3](../testing/evidence/production-factory-pilot-v3/README.md) | Attestations are not yet normalized into every release consumption boundary | Verify immutable image, SBOM, vulnerability, provenance, tool, and candidate identities at use time |
| Release and production feedback | Product + SRE | **Partial** | [README delivery contract](../../README.md#the-delivery-contract) | Human merge remains outside V1 authority; no full production observation/rollback proof | Observe one real release and feed rollback/customer outcome into governed learning |
| Factory incident response | Security + SRE | **Missing canonical lifecycle** | [Production convergence plan](../plans/2026-08-25-feat-software-factory-production-convergence-plan.md) | Alerts, op events, traces, and run failures are fragmented | Implement Clarify → Contain → Observe → Isolate → Restore → Correct → Prevent → Measure with browser and drill evidence |
| Cost per accepted outcome | ML/AI + Product | **Partial** | [Production Factory Pilot V3](../testing/evidence/production-factory-pilot-v3/README.md) | Model/provider cost and cost per accepted workload remain `null` | Achieve attributable model, compute, sandbox, and human-attention coverage on real work |
| Multi-tenant enterprise operation | Security + Platform | **Partial** | [System Factory E2E V2](../testing/evidence/system-factory-e2e-v2/README.md) | Company/workspace scoping exists; public cross-company operation is not qualified | Complete live cross-company denial and service-identity tests before a second organization |
| Adoption and builder outcomes | Product + FDE | **Documented; not production-proven** | [V1 Product Strategy](mission-control-v1-product-strategy.md) | No sustained product-team cohort, onboarding baseline, or satisfaction series | Run one design-partner cadence and measure repeat use, onboarding, trust, correction, and retired bespoke paths |

## Current production claim

Mission Control is a strong, human-governed production-pilot architecture. The
V3 evidence proved 15/15 accepted deterministic workloads, 15/15 first-pass
independent verification, 17 fail-closed failure injections, and a 3/3 live
Remote Sandbox cohort. It did not publish or merge work in an external product
repository, establish complete provider cost, certify provider-enforced egress,
or authorize Guarded Auto.

Mission Control must not claim fleet-scale autonomous delivery across thousands
of engineers until real-team operation, cross-company denial, complete outcome
economics, incident response, tool authority, and sustained reliability are
independently demonstrated.

## Promotion priorities

1. **P0 — Real product-repository pilot and measurement closure.** Prove the
   existing system on consequential but bounded work before adding breadth.
2. **P0 — Factory Incident Command.** Add a thin incident aggregate over existing
   evidence and make containment, restoration, correction, and follow-up explicit.
3. **P1 — Governed Tool/MCP operations.** Preserve the fixture and single exact
   Context7 qualification; gather operational evidence without adding another
   service, operation, write capability, or connector catalog.
4. **P1 — Shared builder intent and paved paths.** Extend the same governed
   intent model to QA, product, and design rather than building persona silos.
5. **P1 — Outcome economics and routing calibration.** Optimize for accepted,
   verified outcomes, not token volume or agent activity.
6. **P2 — Production feedback and governed improvement.** Let production signals
   propose changes while human-governed evaluation and promotion remain intact.

The detailed sequence, acceptance criteria, threat drills, rollout model, and
Product Owner decisions are in the
[Software Factory Production Convergence plan](../plans/2026-08-25-feat-software-factory-production-convergence-plan.md).

## Operating-contract integration — 2026-09-05

The [operating contract evidence map](../software-factory/operating-contract-evidence-map.md)
connects existing source and tests at `aa8c12b` to FDLC and the Guide. This is a
documentation refinement, not a new admission or maturity promotion. The local
read-only MCP fixture and separately qualified fixed Context7 operation remain
experimental; general side-effecting tool
reconciliation, full outcome economics and production trajectory coverage are
not qualified by those bounded operations. Historical qualification identities remain
unchanged. Future gates should reuse the existing Attempts, receipts, evals and
learning records rather than introduce parallel systems.

## Update rule

Every status change must record an exact baseline, evidence link, limitation,
owner, and next promotion gate. Promotion requires relevant authorization,
failure recovery, evidence currentness, refresh/restart durability, and
browser-operable proof. Demotion is immediate when a security, authority,
reliability, or evidence-currentness regression invalidates the claim.
