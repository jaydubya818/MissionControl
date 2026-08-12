---
title: Verification-First Software Factory Completion Plan
status: PROPOSED
date: 2026-08-11
baseline_commit: 2b1a7c4
owner: Mission Control Engineering
---

# Verification-First Software Factory Completion Plan

## Objective

Complete the governed Issue-to-Verified-Pull-Request product path on top of the
implemented P0 vertical slice, then prove it with a browser-operated success
path and one reconciled failure path.

This document is an implementation plan only. It does not authorize schema,
runtime, UI, policy, or GitHub changes and does not claim that the remaining
capabilities exist.

## Implemented baseline

At commit `2b1a7c4`, Mission Control already contains:

- typed requirements, negative constraints, Change Budgets, and WorkOrder
  verification contracts;
- deterministic verification semantics and persisted Verification Runs and
  Evidence Envelopes;
- candidate-bound evidence and WorkOrder-level verification receipts;
- a pre-publication human-review pause and durable continuation permit;
- a durable executor-to-GitHub pull-request path;
- retained P0 component and runtime evidence.

Source references include
[`verification.ts`](../../packages/workflow-engine/src/verification.ts),
[`factoryVerification.ts`](../../apps/orchestration-server/src/factoryVerification.ts),
[`factoryAttemptWorker.ts`](../../apps/orchestration-server/src/factoryAttemptWorker.ts),
[`attempts.ts`](../../convex/factory/attempts.ts), and
[`verificationPersistence.ts`](../../convex/lib/verificationPersistence.ts).

## Product slice and boundaries

The completion target is one browser-operable path:

`Mission -> approved Plan -> WorkOrder -> Task -> Attempt -> candidate ->`
`independent verification -> gate decision -> human review when required ->`
`review-ready pull request`

In scope: specification identity, policy ownership, subject-bound evidence,
quality decisions, operator explanation, GitHub lineage, retry and
reconciliation, and retained proof.

Out of scope for this plan: autonomous merge, production deployment,
production outcome validation, continuous learning promotion, organization-wide
numeric trust scoring, arbitrary multi-repository missions, and broad UI
reorganization.

## Phase 0 — accept contracts and remove ambiguity

**Goal:** establish one vocabulary and one ownership model before implementation.

- Review and accept the Verification-First ADR set.
- Reconcile proposed Quality Contract and Quality Gate concepts with existing
  Plan, WorkOrder, VerificationRun, EvidenceEnvelope, and receipt records.
- Choose whether the Quality Contract is a new durable record or a versioned
  projection embedded in the approved Plan and frozen into the WorkOrder.
- Define policy ownership for dispatch, verification, publication, exception,
  and evidence invalidation.
- Accept the V1 Verification Profile and threat-model assumptions.
- Resolve naming collisions and supersede older contradictory documents.

**Exit:** accepted decisions and contracts identify every authoritative record,
transition owner, current implementation mapping, and deferred capability.

## Phase 1 — specification and contract enforcement

**Goal:** make an approved specification—not free-form agent interpretation—the
source of quality authority.

- Capture functional and non-functional requirements, invariants, negative
  constraints, risks, failure expectations, and evidence requirements.
- Add completeness, contradiction, ambiguity, and testability review before
  Plan approval.
- Freeze exact specification, Plan, policy, profile, repository base, and
  Change Budget identities into dispatch authority.
- Reject execution when required contract material is absent or stale.

**Verification:** contract round-trip tests, revision mismatch tests, forbidden
scope tests, and a UI trace from Mission input through WorkOrder authority.

## Phase 2 — independent verification and gate decisions

**Goal:** separate observed check results from the policy decision they support.

- Enforce verifier isolation and least privilege appropriate to the V1 profile.
- Persist command identity, environment, tool version, timestamps, subject SHA,
  manifest digest, result, and provenance for every check.
- Introduce or formalize a durable Quality Gate decision with policy version,
  inputs, explanation, required approvals, and invalidation state.
- Treat missing, errored, stale, and unconfigured required checks as blocking.
- Implement risk overlays without allowing a weighted score to bypass a hard
  gate.

**Verification:** builder/validator separation tests, evidence substitution and
replay tests, missing-check tests, deterministic decision tests, and operator
explanation review.

## Phase 3 — policy, review, and publication integrity

**Goal:** ensure external side effects use scoped, current authority.

- Complete and configure the factory Governance Policy and GitHub App needed by
  the golden path.
- Bind approvals and publication permits to WorkOrder revision, candidate SHA,
  manifest digest, gate decision, repository, action, and expiry.
- Revalidate the permit immediately before GitHub publication.
- Reconcile GitHub's observed PR head with the verified candidate.
- Surface evidence-centered approval summaries and validator disagreement.

**Verification:** expired permit, wrong repository, wrong candidate, revoked
approval, head-SHA mismatch, duplicate publication, and least-privilege tests.

## Phase 4 — recovery and reconciliation

**Goal:** make interruption and duplicate delivery safe and understandable.

- Apply the failure and reconciliation matrix to leases, retries, late events,
  verification reruns, approvals, permits, and GitHub receipts.
- Define idempotency keys and uniqueness constraints for every external effect.
- Preserve failed Attempts and superseded decisions while allowing bounded
  recovery through new records.
- Provide operator actions for retry, reverify, cancel, supersede, escalate, and
  quarantine with explicit authorization.

**Verification:** lost lease, stale heartbeat, duplicate receipt, late completion,
  cancellation race, ambiguous push, verifier compromise, and recovery budget
  scenarios.

## Phase 5 — operator experience and proof package

**Goal:** let a human decide from evidence without reading raw logs by default.

- Present requirement coverage, change scope, independent check results,
  findings, policy explanation, exceptions, candidate identity, and GitHub
  lineage in one review package.
- Prioritize missing evidence, disagreement, risk, stale subjects, and required
  decisions over agent activity.
- Generate a derived, reproducible proof-package index; do not create an
  unverifiable second source of truth.
- Add accessible loading, empty, failure, stale, success, and recovery states.

**Verification:** browser tests, refresh/restart durability, authorization tests,
  evidence-link navigation, and developer/executive usability review.

## Phase 6 — golden-path validation

**Goal:** prove the integrated path at pinned revisions.

- Provision the controlled lab repository and baseline.
- Complete every identity field in the golden-path manifest.
- Execute the successful browser path.
- Execute the required head-SHA mismatch or equivalent failure path.
- Retain sanitized Git evidence and checksum-referenced private artifacts.
- Obtain technical and executive review.

**Exit:** the manifest is accepted with exact commits, record lineage, GitHub
head identity, independent evidence, recovery proof, and teach-back.

## Cross-cutting requirements

- Tenant authorization and audit coverage apply to every new query and write.
- No raw prompt, token, credential, repository secret, or sensitive trace is
  stored in publishable evidence.
- Schema evolution includes migrations, backfill or compatibility behavior,
  retention, and rollback analysis.
- Every external action is idempotent and reconciled against observed reality.
- Documentation distinguishes current, partial, proposed, and future behavior.
- Product UI continues to center exceptions, evidence, and decisions.

## Sequencing and dependencies

1. Phase 0 blocks all contract-shaping implementation.
2. Phases 1 and 2 establish subject identity and decision semantics.
3. Phase 3 depends on an installed GitHub App and accepted Governance Policy.
4. Phase 4 must be complete before the golden-path failure run.
5. Phase 5 can begin with stable read models but cannot claim completion until
   integrated authorization, persistence, and recovery are proven.
6. Phase 6 is the release gate for the V1 verification-first claim.

## Principal risks

| Risk | Consequence | Required response |
| --- | --- | --- |
| Parallel domain models | Conflicting authority | Decide projection versus new record before schema work |
| Builder-controlled evidence | False confidence | Isolate verification and bind provenance to immutable subjects |
| Approval tokens outlive subjects | Unauthorized publication | Scope, expire, revoke, and revalidate permits |
| Green checks hide missing coverage | Invalid acceptance | Evaluate completeness separately from pass/fail |
| Retry mutates history | Lost auditability | Create new Attempts/runs and preserve superseded records |
| UI implies capability | Operator over-trust | Label state and require browser evidence before promotion |
| Broad V1 scope | Golden path never closes | Defer production and learning loops until verified PR works |

## Definition of done

The plan is complete only when the accepted demonstration manifest passes. Code
existence, unit tests, a seeded UI, or a manually opened pull request are
necessary but insufficient. The system must prove authority, candidate identity,
independent evidence, policy decision, human accountability, publication
lineage, and failure recovery as one reconstructable workflow.
