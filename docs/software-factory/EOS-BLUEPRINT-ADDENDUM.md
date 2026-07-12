# EOS Blueprint — Architecture Addendum (Second-Pass Review)

**Version 1.0 · 2026-07-11 · Distinguished Engineer review of `EOS-BLUEPRINT.md`**
Scope: ten candidate concepts, each dispositioned. The blueprint text stands; this addendum amends it only where a verdict says so.

## Verdict Summary

| # | Concept | Verdict | Cost added |
|---|---|---|---|
| 1 | Organizational Decision Intelligence | **Merge** into context packages + approvals + lineage; entity ontology **rejected** | 1 edge convention, 1 query |
| 2 | Organizational Digital Twin | **Rejected** as architecture (it's a name for the lineage graph); one H4 *view* deferred | 0 |
| 3 | Strategic Reasoning | **Merge** as a 6th typed intelligence product ("Evidence Dossier"), H4 | 1 insight type |
| 4 | Organizational Simulation | **Rejected** (simulator); **replaced** by real experiments via rollout rings | binding principle |
| 5 | Factory Genome | **Merge** into Factory Health as a "Traits" family (quarterly windows, distributions) | 1 score family |
| 6 | Organizational Physics | **Rejected** | 0 |
| 7 | Agent Marketplace | **Merge** into registry/trust/dispatch; 1 new projection (AgentCapabilityProfile); external marketplace **deferred** | 1 projection, 1 view |
| 8 | Organizational Evolution | **Merge**: widen `FactoryImprovement.scope`; org-structure changes recommend-only forever | 1 enum, 1 rule |
| 9 | EOS Principles | **Accepted** — becomes §0 of the blueprint | 1 section |
| 10 | Product Vision (3 horizons) | **Accepted** — appended to §6 | 1 subsection |

Net: zero new bounded contexts, zero new services, one new projection, one enum widening, two document sections. That is the correct amount.

---

## 1. Organizational Decision Intelligence — MERGE (thin), ontology REJECTED

**Why the ontology fails:** Decision/Proposal/Alternative/Tradeoff/Objection/Assumption as first-class entities is structured reasoning collected *from humans* — precisely the anti-Jira failure mode the blueprint bans (§6). Nobody back-fills objection records; the schema would be a graveyard. Retrospective already exists as `Learning` (H3).

**Why the questions still get answered:** the repository already records decisions *where they are enforced*: `approvals` carry reasons and dual-control decision chains **[verified]**; `changeRecords` is an immutable governance log **[verified]**; `evaluationComparisons.recommendation` records APPROVE/BLOCK with recomputed evidence **[built-today]**; `FactoryImprovement` (H3) carries hypothesis→outcome. The blueprint (§17) already routes ADRs into `contextPackages` type `ARCHITECTURE_GUIDE` — versioned, content-hashed, immutable-per-version, deprecation with replacement pointers: a better ADR store than an ADR tool.

**Accepted delta:**
- Edge convention: an approval, work order, or improvement MAY carry `decisionRef` → an ARCHITECTURE_GUIDE package version; recorded as a `CAUSED_BY` lineage edge (kind exists, §9).
- One query: `decisionOutcomes(packageId)` = traceForward through CAUSED_BY → work orders → incidents/reverts/reopens. Answers "which decisions later proved incorrect / repeatedly create incidents" with receipts, not recollection.
- "Why did priorities change" = Mission budget/priority audit events (H2 Mission entity already emits `changeRecords`).

Migration impact: none (optional field + edges). Roadmap: rides H1 (edges) + H3 (query). Risk: ADR packages go stale — already covered by the freshness/drift program (approved PR 16).

## 2. Organizational Digital Twin — REJECTED as architecture

The twin is not a thing to build; it is what the lineage graph *is* once §9 + §24 land: agents, repos, packages, work, costs, evidence, and their edges, updated at write time. Naming it a "twin" and building toward the name invites entity sprawl (teams/services/capabilities modeled before any query needs them — the blueprint already defers Decision/Risk/Capacity entities on exactly this ground, §24).

Deferred remnant: one H4 *view* ("Systems Map") rendering the lineage graph — a presentation artifact over existing data, revisit only when a Phase-13 question demands it. No schema, no context, no roadmap slot now.

## 3. Strategic Reasoning — MERGE as "Evidence Dossier" (H4)

Correctly scoped by the prompt itself: not an AI executive, but *sufficient evidence assembly*. This is the existing `Insight` shape (§18) applied to a named strategic question. Accepted as the sixth typed intelligence product:

`EvidenceDossier { question (build|buy|rewrite|retire|invest|automate + subject), evidence: {lineage rollups, cost curves, friction rates, eval comparisons, incident links}, assumptions[], confidence, alternativesConsidered (free text), preparedFor, drillDowns[] }` — a *report*, not a stored entity; generated on demand, cached as a projection. The human judges; MC subpoenas the record.

Supports: §21 allocation questions, idea #8's org-change rule. Complexity: low (composition of existing queries). Risk: dossiers dressed as answers — mitigated by mandatory assumptions/alternatives fields and the §23 explainability rule.

## 4. Organizational Simulation — REJECTED; replaced by real experiments

What-if simulation of an engineering org requires a behavioral model nobody can validate; outputs would carry decimal-point confidence the underlying model doesn't have — violating Evidence-over-Claims at the architecture level.

The decisive repo fact: **the factory can run the counterfactual for real, cheaply.** Rollout rings (approved PR 17) + eval baseline/candidate comparisons **[built-today]** + matched-cohort friction analysis (§14) already constitute a controlled-experiment engine. "If approval gates are removed, what changes?" → remove the gate for ring-1 repos, measure approval-latency × incident rate deltas. "If repository readiness improves?" → the §13/§20 improvement loop *is* that experiment with before/after cohorts.

Accepted instead: binding principle (see #9): *"The factory experiments on itself before it simulates itself."* Arithmetic what-ifs over historical distributions (blueprint §21) remain the only "simulation," H4, assumptions visible.

## 5. Factory Genome — MERGE into Factory Health as the "Traits" family

The nine listed characteristics are all computable from existing/near-term streams: decision speed = approval-latency distribution **[verified: escalation/expiry events]**; verification rigor = receipt coverage + evidence completeness **[verified on main: `verificationReceipts`]**; risk tolerance = RED-work share × override rate; automation maturity = autonomous-completion rate; knowledge reuse = package installs × promoted-learning reuse; documentation maturity = readiness dimensions; architecture stability = SUPERSEDES/reopen rates; approval culture = gate-value report (§18 product 3); operational discipline = idempotency-violation and quarantine rates.

But a separate "Genome" concept duplicates Factory Health (§19) with a fancier noun. Verdict: **one new score family inside the existing `HealthScore` pattern** — `family: TRAIT`, quarterly windows, rendered as *distributions with trend*, never a single number, INSUFFICIENT_EVIDENCE first-class. "Organizational fingerprint" branding rejected (vanity-score gravity). Zero new entities; roadmap: H3 alongside the other late health families.

## 6. Organizational Physics — REJECTED

Test applied: does the metaphor produce a formula, a detector, or a decision that its plain-named equivalent does not? Every candidate fails: "approval drag" *is* approval latency (§18 product 3); "friction" already *is* a first-class event taxonomy (§14) — the one physics word that earned its place did so by having detectors; "momentum/entropy/technical gravity" have no operational definition, no denominator, no drill-down path — they would be §11's misuse-risk column with nothing above it. Renaming existing metrics with physics vocabulary adds translation cost for zero explanatory power. Nothing adopted; `friction` retains its name because it is defined by detectors, not metaphor.

## 7. Agent Marketplace — MERGE; one projection accepted; marketplace deferred

The primitives exist or are approved: immutable `agentVersions` with `genomeHash` + provenance **[verified]**; skills as versioned, scanned, scored context packages **[built-today]**; a working certification prototype (hiring pipeline: scorecards, assessments, autonomy recommendations **[verified]**); trust scoring (PR 15) and dispatch weighting (PR 14) approved. "Marketplace" adds economics and cross-org distribution that a single-tenant deployment cannot exercise — deferred until a second organization exists (same gate as AgentCertification formalization, §24).

**Accepted delta:** `agentCapabilityProfiles` — a projection (recomputable) keyed `(agentVersionId, taskType)`: verified-completion rate, cost distribution, trust component, sample size. It is the *data structure dispatch v2 already needs* (PR 14 inputs) and the backing for an "Agents" catalog view reusing the registry UI pattern (RegistryCard + ScoreBadge, both built). Compatibility/specialization = fields on the profile, not new entities. Roadmap: H2, inside the dispatch/trust work already sequenced.

## 8. Organizational Evolution — MERGE via scope widening + one inviolable rule

The FactoryImprovement loop (§20) generalizes without structural change: `scope: SKILL|INSTRUCTION|WORKFLOW|POLICY|APPROVAL_MODEL|MODEL_ROUTING|ENVIRONMENT|ORG_PRACTICE`. Better workflows/instructions/planning patterns are already its H3 payload; approval-model changes are already experimentable (idea #4's mechanism).

The rule, binding and permanent: **improvements whose subject is humans or organizational structure are recommend-only at every autonomy rung, forever, and must attach an Evidence Dossier (#3).** MC surfaces that a team boundary correlates with coordination friction; it never drafts the re-org. This extends §23's anti-surveillance posture from measurement to action. Cost: one enum, one policy check in the improvement pipeline, one sentence in §20's autonomy ladder.

## 9. Engineering Operating System Principles — ACCEPTED (becomes blueprint §0)

Each principle names its enforcing mechanism; a principle without an enforcement point was cut.

1. **Causation is recorded, never reconstructed.** Lineage edges written by the mutation that knows the cause (§9); INFERRED edges are labeled and excluded from intelligence by default.
2. **Verification precedes completion, structurally.** Executors cannot produce DONE (`mapBridgeState`); acceptance requires fresh receipts (`accept`, main).
3. **Evidence before opinion.** Every Insight/metric/score carries evidence refs, confidence, and a misuse-risk analysis, or it does not ship (§11 table pattern; Insight interface).
4. **Honest absence beats invented data.** Null statistics under minimum n (eval lib); INSUFFICIENT_EVIDENCE as a rendered status; no fake lift numbers in UI (registry precedent).
5. **The record is append-only; interpretations are disposable.** L3 streams immutable; every L4/L5 projection recomputable and versioned (`detectorVersion`); deleting a projection is always safe.
6. **Humans own irreversibility.** RED dual control; REVIEW→DONE human-only; org/personnel improvements recommend-only forever (#8); emergency stop unconditional.
7. **The factory experiments on itself before it simulates itself.** Rollout rings + matched cohorts are the counterfactual engine; simulators rejected (#4).
8. **Status is inferred from execution, never collected from humans.** No manual reporting surfaces; telemetry, artifacts, and events are the only inputs (anti-Jira invariant).
9. **Small, additive, reversible.** Additive schema, feature flags default-off, documented rollback per PR — the program's demonstrated discipline, now binding.
10. **Knowledge compounds only through versioned, governed artifacts.** Memory→candidate→evaluated package→ring rollout (Epic 9/13); no silent authority for learned content.
11. **Metrics serve subjects first.** Individuals see everything collected about them; aggregation thresholds; no rankings (§23).

## 10. Product Vision — ACCEPTED (appended to §6)

**Today:** the governed control plane of a one-operator autonomous software factory — risk-tiered approvals, versioned context, reproducible runs (CBOM), receipts-based verification, honest measurement. Real, running, demonstrable.

**Three years:** the causal system of record for a small engineering organization. Multi-user with enforced roles; every PR, deploy, and incident traceable to intent and cost in one query; the factory measurably improving itself through the closed loop (observe→improve→verify→standardize); allocation and gate decisions argued from dossiers rather than recollection; agents dispatched by evidenced capability, not label.

**Ten years:** the organization's engineering memory and operating substrate. A new engineer — human or agent — onboards by querying the recorded causal history: why systems are shaped as they are (decision packages + outcome edges), what works here (promoted learnings with lift evidence), what everything costs and returns. Strategy sessions open with evidence dossiers, not slide decks. The org's traits (#5) are known distributions, tracked across years. Not science fiction: every element is an extrapolation of a table, edge, or loop that exists in the repository today — compounded, not invented.
