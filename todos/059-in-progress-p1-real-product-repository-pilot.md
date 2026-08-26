---
status: in_progress
priority: p1
issue_id: "059"
tags: [software-factory, pilot, qualification, outcomes, security]
dependencies: ["058"]
---

# Qualify a Real Product-Repository Pilot

## Problem Statement

Production Pilot V3 proves the governed Factory on disposable workloads, not a
real product repository with real reviewer decisions and attributable economics.

## Findings

- V3 achieved 15/15 accepted deterministic workloads and 17 fail-closed drills.
- Cost per accepted workload remains `null`.
- The current remote provider lacks provider-enforced egress, so sensitive
  repositories cannot use Remote Sandbox under the approved policy.
- The exact pilot repository and design-partner team still require explicit identification.

## Proposed Solutions

### Option 1: Controlled local pilot on a named product repository

Use the existing local governed worker for sensitive work, preserve all human
gates, and measure at least ten accepted WorkOrders.

**Pros:** Meets the approved egress boundary now; exercises the real product path.

**Cons:** Does not qualify a remote provider.

**Effort:** High

**Risk:** Medium

### Option 2: Wait for a provider with enforced egress

**Pros:** Produces stronger remote isolation evidence.

**Cons:** Blocks the real-work pilot on an external dependency.

**Effort:** Unknown

**Risk:** Medium

## Recommended Action

Use Option 1 for the pilot. Keep sensitive Remote Sandbox routing ineligible and
qualify a separate provider later rather than weakening the policy.

## Technical Details

- Existing Mission → Plan → WorkOrder → Attempt → verification → PR path
- `scripts/production-factory-pilot-v3.mts` as qualification-pattern reference
- cost/latency observations, routing decisions, Review Packages, and evidence packets
- manual preflight incident card using existing containment controls

## Acceptance Criteria

- [ ] Product Owner identifies the exact repository and design-partner team.
- [ ] A named incident commander completes the preflight drill before first dispatch.
- [ ] At least ten WorkOrders span bug fix, feature, refactor, and security/policy classes.
- [ ] Every accepted WorkOrder has exact intent-to-PR evidence and a human decision.
- [ ] Model, compute, sandbox, human-attention, retry, and correction costs are measured or explicitly `null`.
- [ ] Restart, outage, cancellation, stale evidence, PR drift, revocation, and cleanup failures fail closed.
- [x] Sensitive repositories cannot route to a remote profile without provider-enforced egress evidence.
- [ ] Pilot evidence records a go/no-go decision without enabling Guarded Auto, merge, deployment, or learning promotion.

## Work Log

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Confirmed local execution is the safe default under the approved egress requirement.
- Requested the exact repository and design-partner identity; no target was guessed.

**Learnings:**
- The current exe.dev controls are guest-enforced defense in depth, not provider-enforced isolation.

### 2026-08-26 - Admission boundary and deterministic preflight implemented

**By:** Codex

**Actions:**
- Added migration-safe repository classifications with an audited operator decision and an explicit default of `INTERNAL` for new connections.
- Enforced the frozen classification and provider-egress evidence at configuration creation, dispatch, worker claim, and independent-verification scheduling.
- Added a deterministic pilot-manifest gate for named ownership, ten planned WorkOrders across all four workload classes, the eight required failure drills, human gates, measured-or-null economics, and the prohibition on autonomous merge, deployment, Guarded Auto, and learning promotion.
- Added a separate deterministic exit assessor for ten accepted outcomes, exact intent-to-PR lineage, delivery/review/recovery metrics, measured-or-explained-null cost coverage, incident and rollback linkage, failure evidence, zero safety escapes, and an attributable `GO` or `NO_GO` decision.
- Added the reachable Settings UI, fail-closed Remote Sandbox control, runbook, example manifest, unit coverage, and browser evidence.
- Verified the local demo mutation persists across refresh; the demo repository now records `INTERNAL` with an operator reason.

**Learnings:**
- Admission must be re-evaluated at every authority boundary; freezing the value only at Factory-version creation is insufficient when a repository can be reclassified later.
- The pilot cannot start until the Product Owner supplies the exact repository, design-partner team, pilot champion, FDE, and incident commander. Those identities are deliberately not inferred from demo fixtures.
