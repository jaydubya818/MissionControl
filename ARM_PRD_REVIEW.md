# ARM PRD v2.1 — Technical Review & Fork Analysis

**Reviewer:** Claude (Opus 4.6)
**Date:** February 9, 2026
**Baseline:** Mission Control v0.9.0 codebase + ARM PRD v2.1 draft

---

## 1. Overall Assessment

The ARM PRD is strong. The vision is clear — "HCM for AI agents" — and the scope discipline is good (P1/P2/P3 ladder, explicit non-goals). The canonical data model is well-thought-out and the lifecycle state machines are deterministic and auditable. You've learned the right lessons from Mission Control about safety-first design and operator controls.

**Three things the PRD gets right that most agent governance docs miss:**

1. **Genome immutability** — treating agent versions as immutable build artifacts with hashed genomes is the right primitive. This is what makes lineage, rollback, and audit actually work.
2. **Federation as first-class** — not bolting on multi-runtime later. The "Governed" provider label with enforcement attestation is smart.
3. **Evidence artifacts as a trust product** — Agent Card, Lineage Sheet, Audit Pack. This is the compliance moat.

**Three areas that need work before development starts:**

1. **The fork boundary is underspecified** — what MC code carries over, what gets gutted, what's net-new.
2. **The data model jumps from MC's task-centric schema to ARM's version-centric schema** without addressing the migration path or dual-use period.
3. **Federation protocol is described at requirements level but needs at least a wire-level sketch** before P1.7 is buildable.

---

## 2. Fork Mapping: Mission Control → ARM

### Direct Reuse (Carry Forward)

| MC Component | ARM Concept | Notes |
|---|---|---|
| `convex/` infra + schema pattern | ARM backend | Convex reactive model is a good fit for ARM's real-time dashboards. Keep it. |
| `packages/policy-engine/` | PolicyEnvelope enforcement | Risk classification (GREEN/YELLOW/RED), autonomy rules, budget caps, allowlists, loop detection — all reusable. Needs refactoring from task-scoped to version/instance-scoped. |
| `packages/state-machine/` | Version + Instance lifecycle state machines | Validator pattern, transition rules matrix, append-only log — all carry over. States change completely though. |
| `convex/approvals.ts` | ApprovalRecord system | Request/approve/deny/escalate/expire workflow is directly reusable. Add TTL, scope constraints, policy link. |
| `convex/lib/riskClassifier.ts` | Tool risk classification | 59-tool risk map, secret detection, production impact detection — carry forward, extend. |
| `convex/lib/operatorControls.ts` | Kill switches + emergency postures | NORMAL/PAUSED/DRAINING/QUARANTINED maps directly to ARM's instance lifecycle. |
| `apps/mission-control-ui/` | ARM UI shell | React+Vite+Convex reactive pattern, dark theme, sidebar nav, drawer pattern, modal system. Gut the views, keep the shell. |
| `packages/shared/` | ARM shared types | Type pattern carries over. Types themselves get replaced. |
| `convex/activities.ts` | Audit logging | Append-only activity log → ARM's tamper-evident event log. |
| Alerts system | Anomaly alerts | Severity-based alerts with threshold triggers. |

### Needs Significant Refactoring

| MC Component | ARM Target | What Changes |
|---|---|---|
| `agents` table | `agentTemplates` + `agentVersions` + `agentInstances` | MC's flat agent model → ARM's 3-level hierarchy. This is the biggest schema change. MC agents are mutable runtime entities; ARM versions are immutable build artifacts. |
| `tasks` table + state machine | Removed or demoted | ARM isn't task-centric. Tasks become "EvaluationRun" or "operations" but not the core entity. The 9-state task lifecycle doesn't map to ARM. |
| `runs` + `toolCalls` | `TelemetryEvent` (normalized) | MC tracks runs/toolCalls per-task. ARM normalizes all telemetry into a unified event model linked to version/instance/policy. Broader scope. |
| Budget tracking (per-agent daily/per-run/per-task) | `CostLedgerEntry` with attribution tags | MC budgets are simple caps. ARM needs full ledger with tenant/env/project/cost-center/role/outcome/job-id attribution. |
| `agentIdentities` (IDENTITY/SOUL/TOOLS) | Agent Genome | MC's identity system is file-based (markdown templates). ARM's genome is a structured, hashed, versioned artifact. Keep the OpenClaw alignment but formalize the structure. |
| `policies` table (global/agent/task-type scope) | `PolicyEnvelope` (per-version/instance binding) | MC policies scope to projects. ARM policies bind to specific versions/instances with autonomy tiers 0-5 (vs MC's INTERN/SPECIALIST/LEAD/CEO). |
| `orgAssignments` + org hierarchy | Role entity + role mappings | MC's org model is positional (CEO/LEAD/SPECIALIST/INTERN in projects). ARM's Role is a capability requirement + autonomy tier + risk class + budgets. Different concept. |

### Net-New (No MC Equivalent)

| ARM Concept | Why It's New | Complexity |
|---|---|---|
| **AgentTemplate → Version → Instance hierarchy** | MC has flat agents. ARM needs a 3-level registry with immutable versions. | HIGH — core data model change |
| **Agent Genome (immutable, hashed)** | MC has no equivalent. Closest is `soulHash` on agents but that's a single field. | HIGH — needs schema, hashing, signing, validation |
| **EvaluationSuite + EvaluationRun + Promotion Gates** | MC has no eval system. `agentPerformance` tracks aggregate metrics but nothing like structured evaluation suites with gating. | HIGH — new subsystem |
| **Release Channels (dev → staging → prod)** | MC has no release/promotion concept. Agents are deployed, not released through channels. | MEDIUM — new workflow |
| **Rollout Controls (canary, phased, rollback)** | MC has no rollout system. | MEDIUM — orchestration logic |
| **Evidence Artifacts (signed, structured)** | MC has audit logs but no structured signed artifacts (Agent Card, Lineage Sheet, Audit Pack). | HIGH — crypto signing, structured generation, export |
| **Federation Protocol** | MC is single-runtime. No provider registration, inventory sync, command channel, or telemetry ingestion from external runtimes. | VERY HIGH — new protocol + connectors |
| **Certification system** | MC has no certification/recertification concept. | MEDIUM — new entity + expiry logic |
| **Cost attribution with outcome tagging** | MC tracks spend but no outcome-level attribution or job-id tagging. | MEDIUM — ledger schema + ingestion |
| **Capability taxonomy + evidence ladder** | MC has no skill taxonomy, proficiency levels, or trust-tiered evidence. | HIGH (P2) — new subsystem |
| **Onboarding lifecycle (Shadow → Limited → Probation → Active)** | MC has no onboarding pipeline. | MEDIUM (P2) — new state machine |
| **Remediation plans (PIP)** | MC has no equivalent. | LOW (P2) — CRUD + policy hooks |

---

## 3. PRD Feedback: Strengths

**Scope discipline is good.** The P3 exclusions (economy layer, on-chain identity, marketplace monetization) are correct for v2.1. These are distractions at this stage.

**The genome concept is the right abstraction.** Making AgentVersion immutable with a hashed genome solves the "what was actually running when X happened" problem that plagues every agent ops team. This is the foundation of auditability.

**Autonomy tiers 0-5 are better than MC's role-based model.** MC ties autonomy to positional roles (INTERN/SPECIALIST/LEAD/CEO). ARM's numeric tiers with per-tenant overlays are more flexible and composable. Good call.

**Evidence artifacts as a first-class product** — not just audit logs, but structured, signed, exportable artifacts (Agent Card, Lineage Sheet, Evaluation Report, Incident Dossier, Audit Pack). This is the differentiator. Most agent platforms have observability; none have compliance-grade evidence.

**Federation as P1** — not P2 or "later." If ARM is serious about heterogeneous runtimes, federation can't be deferred. Getting the protocol right early shapes everything.

---

## 4. PRD Feedback: Gaps & Concerns

### 4.1 Data Model Gaps

**Missing: Tenant/Organization entity.** The PRD mentions multi-tenancy throughout but never defines a Tenant or Organization entity in the canonical data model (Section 5). ARM needs this as a top-level entity that scopes everything — templates, versions, instances, policies, cost ledgers, evidence.

**Missing: Environment entity.** The PRD references "dev/staging/prod" environments and release channels but doesn't define Environment as a first-class entity. Environments need to be explicit: they scope instance provisioning, policy binding, telemetry partitioning, and cost attribution.

**Missing: User/Operator entity.** Who approves? Who triggers kill switches? Who exports audit packs? The PRD assumes human actors but doesn't model them. MC has `orgMembers` with roles and permissions — ARM needs an equivalent with RBAC/ABAC bindings.

**Genome completeness vs. practicality.** The genome spec requires 9 sub-profiles (base model, prompt bundle, tool manifest, memory config, behavior profile, spawn constraints, provenance, etc.). For P1, consider which fields are REQUIRED vs RECOMMENDED. An MVP genome might be: model config + prompt hash + tool manifest + provenance. The full spec is P1.5-worthy but risks blocking P1.1 if enforced strictly.

**Role entity is overloaded.** A Role is defined as "capability requirement + autonomy tier + risk class + budgets + SLO targets" AND "maps to one or more agent versions/instances." This conflates the job description with the staffing assignment. Consider splitting: `RoleDefinition` (what the role requires) vs `RoleAssignment` (which version/instance fills it).

### 4.2 Lifecycle Gaps

**Version lifecycle has no "Testing" state.** Draft → Candidate requires eval suite pass, but there's no explicit state for "currently being evaluated." Consider: `Draft → Testing → Candidate → Approved → Deprecated → Retired`. This makes it visible in the UI when a version is under evaluation vs. waiting for human review.

**Instance lifecycle doesn't cover "Draining."** MC has DRAINING (stop accepting new work, finish current). ARM's PRD has Paused/ReadOnly/Quarantined but no drain state. Draining is critical for graceful rollouts — you drain the old version before retiring it.

**No explicit "Rollback" state or entity.** Rollback is mentioned as an action but not modeled. When you rollback, what happens? Does the old version get re-approved? Does the rolled-back version get auto-deprecated? Does a new instance get provisioned or does the existing instance rebind to the prior version? This needs to be specified.

### 4.3 Federation Concerns

**The federation protocol is the hardest part of ARM and it's underspecified.** Section P1.7 lists requirements (provider registration, capability declaration, inventory sync, command channel, telemetry ingestion, enforcement attestation) but doesn't sketch the protocol. Before building:

- Define the API contract between ARM control plane and provider adapters
- Specify sync semantics: push vs pull? Polling interval? Webhook? Event stream?
- Define the "Governed" minimum requirements quantitatively (what telemetry fields are required? What command latency is acceptable? What enforcement proof is sufficient?)
- Address the consistency problem: ARM says "quarantine this instance" but the provider takes 30 seconds to enforce. What's the trust model during that window?

**Recommendation:** Write a separate Federation Protocol Spec before coding P1.7. It should include wire format, auth model, sync semantics, failure modes, and the "Governed" certification checklist.

### 4.4 Security Gaps

**Evidence signing is mentioned but not specified.** What signing scheme? JWS/JWK? X.509? Ed25519? Who holds the keys? How are they rotated? "Org-managed vs AR-managed vs hybrid" is listed as an open question — this needs to be answered before P1.6.

**RBAC/ABAC model is mentioned in NFRs but not defined.** The PRD says "tenant, environment, role, risk class, action type" but doesn't specify the permission model. What roles exist? What can each role do? Can a GRC user trigger a kill switch or only request one?

**API authentication is unspecified.** Federation APIs, reporting APIs, core APIs — all need auth. mTLS for federation? OAuth2 for UI? API keys for telemetry ingestion? This affects architecture.

### 4.5 Missing from the PRD

**Migration strategy from MC.** If you're forking MC, how do existing MC data (agents, tasks, policies, runs) map into ARM entities? Is this a clean break or do you need data migration?

**Multi-model routing.** MC has a model-router package. ARM's genome includes "base model(s) + configuration" but the PRD doesn't discuss how ARM handles multi-model agents (primary + fallback) or model-specific eval suites.

**Telemetry schema.** The PRD defines TelemetryEvent conceptually but doesn't specify the schema. What fields are required? What's the cardinality model? How does cost attribution bind to telemetry events? A telemetry schema spec is needed before P1.4.

---

## 5. Enhancement Recommendations

### 5.1 Architecture Enhancements

**Keep Convex but add a federation gateway.** The Convex reactive model works well for the ARM control plane UI (real-time dashboards, live scorecards). But federation needs a separate ingestion layer that can handle high-throughput telemetry from multiple providers. Consider:

```
┌─────────────────────────────────────────────┐
│                ARM Control Plane             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐ │
│  │ Convex   │  │ Federation│  │ Evidence  │ │
│  │ (state + │  │ Gateway   │  │ Signing   │ │
│  │  UI)     │  │ (Hono)    │  │ Service   │ │
│  └──────────┘  └───────────┘  └──────────┘ │
└─────────────────────────────────────────────┘
```

The Hono orchestration server from MC can be repurposed as the Federation Gateway. It already uses ConvexHttpClient — add provider adapter endpoints, telemetry ingestion, and command dispatch.

**Evidence signing as a separate service.** Don't embed signing in Convex mutations. Signing is computationally distinct and needs key management. Run it as a sidecar or microservice that Convex actions call.

### 5.2 Data Model Enhancements

**Add a `ChangeRecord` entity.** Every policy edit, genome change, approval decision, and kill switch action should produce a typed, immutable ChangeRecord. This is stronger than generic activity logs — it's the spine of the audit trail.

**Add `DeploymentSlot` to model instance-version binding.** When you rollout a new version, you're rebinding a deployment slot (environment + role + provider) from version N to version N+1. Making this explicit simplifies rollback (rebind to N-1) and canary (bind 10% of slots to N+1).

**Cost model needs a `CostModel` entity.** Different providers charge differently. ARM needs a way to define cost models per provider/model so the ledger can normalize costs. Without this, cross-provider cost comparison is meaningless.

### 5.3 Evaluation System Enhancements

**Eval suites should support "regression" vs "capability" vs "safety" categories.** Not all evals gate the same way:
- Regression: must not degrade from baseline (blocker)
- Capability: must meet threshold for role fit (blocker for role assignment)
- Safety: must pass 100% (blocker for any promotion)

**Eval results should produce a "Version Scorecard"** that persists as an evidence artifact. This becomes the trust signal for approvers and auditors.

**Consider "continuous evaluation" as a P1 feature, not just promotion gates.** Drift detection is in the PRD but framed as a trigger for re-evaluation. Make it stronger: production instances should run lightweight eval probes on a schedule, with degradation triggering automatic restriction (ReadOnly) before humans notice.

### 5.4 UI/UX Enhancements

**The ARM UI should lead with the fleet overview, not individual entities.** MC's Kanban is task-centric. ARM's primary view should be a fleet health dashboard: how many instances, what states, any incidents, any cost anomalies, any eval failures. Drill-down from there.

**Policy Simulator should be a first-class view, not buried.** "Given version X under policy Y, what actions are allowed/blocked/approval-required?" — this is the most powerful governance tool in ARM. Make it prominent. Let operators test policy changes before applying them.

**Evidence Center should show completeness.** For each production version, show a checklist: Agent Card ✓, Lineage Sheet ✓, Eval Report ✓, Incident Dossier (if applicable). Missing artifacts should be flagged. This is the "audit readiness" signal.

### 5.5 Fork Strategy Recommendation

**Phase the fork in 3 stages:**

1. **Stage 1 — Skeleton Fork (Week 1-2):** Fork MC repo. Gut task-centric code (Kanban, task state machine, task views). Keep: Convex infra, UI shell, policy engine, approval system, operator controls, shared package pattern, Hono server. Rename to ARM. Set up new schema with Template/Version/Instance hierarchy.

2. **Stage 2 — Kernel Build (Week 3-8):** Implement P1.1-P1.6 on the new schema. Refactor policy engine from task-scoped to version/instance-scoped. Build genome storage, version lifecycle, eval gates, telemetry model, cost ledger, evidence artifacts. Build new UI views (Directory, Policy Center, Release Console, Incident Center, Cost Center, Audit Center).

3. **Stage 3 — Federation (Week 6-10, overlapping):** Design and implement federation protocol. Provider registration, inventory sync, command channel, telemetry ingestion. Build at least one reference adapter (e.g., for a self-hosted runtime).

---

## 6. Open Questions — My Recommendations

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Evidence trust chain: org-managed vs AR-managed vs hybrid? | **Hybrid.** AR manages signing keys by default (lower friction for adoption). Orgs can bring their own keys for higher assurance. Support both from day 1. |
| 2 | Minimum requirements for "Governed Provider"? | **Start strict, relax later.** Require: heartbeat (≤60s), telemetry linkage (version_id + instance_id on all events), command acknowledgment (≤30s), enforcement proof (state confirmation after command). |
| 3 | Reporting API: REST first? | **Yes, REST aggregates first.** GraphQL adds complexity without proportional value at P1 scale. Add it in P2 if customers demand it. |
| 4 | Outcome attribution: required vs optional? | **Required at request time.** Optional tagging means inconsistent data. If it's not required, nobody will do it, and cost-per-outcome reporting breaks. |
| 5 | Autonomy tier standardization? | **Global semantics + tenant overlays.** Define tiers 0-5 with default meanings (0=no autonomy, 5=full autonomy). Tenants can customize tool/action bindings per tier but can't redefine the tier semantics. |

---

## 7. Suggested P1 Build Order

Based on dependency analysis, I'd build P1 in this order:

```
P1.1 Directory + Genome + Lineage     ← Foundation (everything depends on this)
  ↓
P1.2 Policies + Approvals + Kill Switches  ← Governance layer
  ↓
P1.3 Evaluation + Promotion Gates      ← Quality gates (needs P1.1 for versions, P1.2 for approvals)
  ↓
P1.4 Telemetry + Scorecards + Incidents ← Observability (needs P1.1 for linking)
  ↓
P1.5 Cost Ledger + Caps + Attribution   ← Economics (needs P1.4 for telemetry)
  ↓
P1.6 Evidence Artifacts + Audit Center  ← Trust product (needs all above as inputs)
  ↓
P1.7 Federation (MVP)                   ← Extension (needs P1.1-P1.5 stable first)
```

P1.6 and P1.7 can partially overlap — evidence artifact generation doesn't depend on federation, but federation telemetry needs to feed into evidence.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Genome schema is too rigid for early iteration | HIGH | MEDIUM | Start with required fields (model, prompt hash, tool manifest, provenance). Make remaining fields optional in P1, required in P2. |
| Federation protocol takes longer than expected | HIGH | HIGH | Build ARM control plane (P1.1-P1.6) assuming single-runtime first. Federation is additive — it shouldn't block the core product. |
| Convex scaling limits for telemetry ingestion at 1M events/day | MEDIUM | HIGH | Use Convex for state/queries. Consider a separate telemetry store (ClickHouse, TimescaleDB) for high-volume ingestion with Convex as the query layer via actions. |
| Evidence signing adds latency to promotion workflow | MEDIUM | LOW | Sign asynchronously. Promotion gate checks that signing is *initiated*; artifact becomes "verified" when signing completes. |
| Scope creep from "HR theater" constructs | MEDIUM | MEDIUM | The PRD warns against this but P2 features (Shadow/Probation/Remediation/PIP) feel HR-adjacent. Keep them if they improve reliability metrics; cut them if they become ceremony. |

---

## 9. Summary

The ARM PRD is a solid foundation for an enterprise agent governance platform. The core thesis (registry, policy, evaluation, telemetry, cost, evidence) is right. The MC fork gives you a 60-70% head start on infrastructure (Convex, UI shell, policy engine, approvals, operator controls) but the domain model shift from task-centric to version-centric is significant.

**Top 3 actions before writing code:**

1. **Define the ARM Convex schema** — Template/Version/Instance hierarchy with genome, policy envelope bindings, and telemetry linkage. This is the foundation.
2. **Write the Federation Protocol Spec** — even a 3-page doc covering wire format, auth, sync semantics, and "Governed" requirements.
3. **Decide the evidence signing approach** — key management, signing scheme, and whether signing is sync or async in the promotion pipeline.

The PRD is ready for development with these clarifications. I'd start coding P1.1 (Directory + Genome + Lineage) this week.
