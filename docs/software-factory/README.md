---
title: Software Factory Documentation Map
status: ACTIVE
last_verified: 2026-08-26
baseline_commit: b3dfcee
---

# Software Factory Documentation Map

This page is the entry point and authority map for Mission Control's AI
Software Factory documentation. When documents disagree, use the precedence
below and open a reconciliation change; do not silently choose the newest prose.

## Authority order

1. **Product doctrine:** what Mission Control exists to accomplish.
2. **Accepted decisions:** architectural choices and rejected alternatives.
3. **Normative contracts:** fields, ownership, states, and invariants.
4. **Current implementation guides:** behavior supported by a cited commit.
5. **Implementation plans:** proposed changes, never current capability.
6. **Validation evidence:** what was actually exercised at an exact revision.
7. **Historical material:** context only; not an authority for new work.

## Canonical documents

| Concern | Canonical source | Status | Purpose |
| --- | --- | --- | --- |
| Product North Star | [Mission Control North Star](../product/mission-control-north-star.md) | Active | Enduring product doctrine and ship gate |
| V1 scope | [Mission Control V1 Product Strategy](../product/mission-control-v1-product-strategy.md) | Active | Golden path, users, priorities, and non-goals |
| Capability maturity | [Software Factory Capability Maturity Ledger](../product/software-factory-capability-maturity.md) | Active | Current status, evidence, limitations, and promotion gates |
| Operating contract evidence | [Operating Contract Evidence Map](./operating-contract-evidence-map.md) | Supporting implementation guide | FDLC/Guide concepts mapped to current source, negative controls and remaining qualification gaps |
| Source/release policy | [Source Integration and Production Release](./source-release-policy.md) | Approved | Main-branch Git deployment guard; Preview qualification and separate Production release authority |
| Real product pilot | [Real Product-Repository Pilot Operations](./production-pilot-operations.md) | Active | Named entry gate, incident drill, portfolio, measures, failure drills, and exit decision |
| Pilot gates | `pnpm run pilot:preflight -- <manifest>` and `pnpm run pilot:assess -- <manifest>` | Implemented | Deterministic admission and evidence-completeness checks without granting production authority |
| Core decisions | [AI Software Factory V1 Decisions](../decisions/ai-software-factory-v1-decisions.md) | Accepted | Existing product decisions |
| Verification decisions | [Verification-First Architecture Decisions](../decisions/verification-first-architecture-decisions.md) | Accepted | Verification-specific ownership and boundaries |
| Authoritative domain | [Domain Contracts](./domain-contracts.md) | Implemented, evolving | Existing Mission, WorkOrder, run, approval, and receipt contracts |
| Verification domain | [Quality Contract and Verification Domain Contracts](./verification-first-domain-contracts.md) | Implemented, evolving | Normative mapping for contracts, runs, evidence, and gate decisions |
| Verification architecture | [Verification-First AI Software Factory](./verification-first-ai-software-factory.md) | Partial P0 implemented | Current architecture and target evolution |
| P0 operator contract | [Verification-First WorkOrder Contract](./verification-first-workorder-contract.md) | Implemented | Supported P0 workflow and interfaces |
| State semantics | [Verification and Gate State Machines](./verification-and-gate-state-machines.md) | Accepted | Cross-record lifecycle and transition rules |
| Security | [Verification Plane Threat Model](../security/verification-plane-threat-model.md) | Proposed | Trust boundaries, abuse paths, and mitigations |
| Recovery | [Verification Failure, Recovery, and Reconciliation](./verification-failure-recovery-reconciliation.md) | Proposed | Failure ownership, retries, stale events, and operator recovery |
| V1 verifier set | [V1 Verification Profile](./v1-verification-profile.md) | Accepted | Minimum mandatory checks and risk overlays |
| Demonstration | [Golden-Path Demonstration Manifest](../validation/verification-first-golden-path-manifest.md) | Draft | Reproducible browser and runtime proof contract |
| Remaining work | [Verification-First Completion Plan](../plans/2026-08-11-feat-verification-first-completion-plan.md) | Accepted, in progress | Work after implemented P0 |

## Evidence and implementation status

- P0 source and tests are merged at or before baseline `2b1a7c4`.
- [P0 retained evidence](../testing/evidence/verification-first-p0/README.md)
  proves contract authoring, deterministic verification semantics, UI states,
  and component/runtime behavior.
- [Durable Codex to GitHub PR](./durable-codex-github-pr.md) documents the real
  execution and publication path.
- Component proof is not the accepted browser-initiated Mission-to-verified-PR
  capstone. The demonstration manifest defines that higher evidence bar.

## Status vocabulary

- `ACTIVE` or `ACCEPTED`: current authority.
- `IMPLEMENTED`: supported by cited source and tests.
- `PARTIAL`: some behavior exists; listed gaps remain.
- `PROPOSED`: design or plan only.
- `DRAFT`: incomplete and not approved.
- `SUPERSEDED`: retained for history; follow its replacement link.

## Documentation rules

- Every implementation claim cites a commit plus source, test, or browser proof.
- Proposed fields and states are labeled; examples do not imply schemas exist.
- A plan cannot override an accepted ADR or normative contract.
- Changed contracts require impact analysis for WorkOrders, Attempts, evidence,
  approvals, APIs, CLI, UI, migrations, and retained validation.
- Update this map when a canonical document is created, accepted, replaced, or
  superseded.

## Historical and supporting material

The remaining files in this directory provide UI history, changed-file
inventories, demonstrations, Loop Engineering, Graph Engineering, and earlier
assessments. They remain useful evidence or context, but they do not replace the
canonical sources above. Documents under `docs/plans/` are proposals unless
their frontmatter explicitly records completion and evidence.
