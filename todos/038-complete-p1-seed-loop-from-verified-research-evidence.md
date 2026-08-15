---
status: complete
priority: p1
issue_id: "038"
tags: [software-factory, research-lab, continuous-learning, loop-engineering, evidence]
dependencies: ["032"]
---

# Seed a Research Brief from Verified Observation Evidence

## Problem Statement

Manual Web/RSS ingestion now produces an immutable artifact, verified
observations, a cursor checkpoint, and an independent receipt. Loop Engineering
still starts from a blank cycle, so the operator must manually re-enter source
records and the resulting claims cannot retain observation- and artifact-level
provenance.

## Findings

- Phase 0 operational controls, Phase 1 source authority, the Web/RSS adapter,
  and atomic manual ingestion are complete and independently proven.
- `loopEngineeringCycles.researchBrief` already captures the bounded question,
  scope, exclusions, freshness window, output, approval policy, and stop
  condition required by Phase 3.
- The existing Loop Engineering source ledger records URLs and source
  decisions, but it cannot identify the originating `researchObservation`,
  source run, artifact, or verification receipt.
- A verified ingestion receipt proves integrity and lineage, not the truth of a
  material claim. Non-quarantined observations must therefore enter the cycle
  as pending evidence; quarantined observations must remain visible and
  rejected.
- Continuous scheduling and repository mutation are outside this slice.

## Proposed Solutions

### Option 1: Copy observations into a cycle from the browser

**Pros:** Minimal backend work.

**Cons:** Cannot make provenance binding atomic, trusts client-supplied lineage,
and risks duplicate or incomplete evidence.

**Risk:** High.

### Option 2: Automatically run the entire continuous-research workflow

**Pros:** Advances directly toward unattended learning.

**Cons:** Bundles evidence binding, model extraction, workflow execution, and
scheduling authority before the first boundary is proven.

**Risk:** High.

### Option 3: Governed server-side Research Brief handoff

**Pros:** Reuses the current source run, receipt, Loop cycle, Task, and
WorkOrder contracts; binds provenance atomically; keeps claim extraction and
recommendations behind their existing verification and approval phases.

**Cons:** Adds a narrow schema extension and one operator dialog.

**Risk:** Low.

## Recommended Action

Implement Option 3. From one verified manual source run, let an authorized
operator create a bounded Research Brief and Loop Engineering cycle. A
server-side mutation must reopen the exact run, artifact, observations, and
receipt before atomically adding the evidence ledger. The action is idempotent
and grants no scheduling, model, messaging, or repository-write authority.

## Acceptance Criteria

- [x] Loop Engineering source records can retain typed links to the originating
  research source, source run, observation, artifact, and verification receipt.
- [x] Only a `VERIFIED` source run with a passing independent receipt in the
  same workspace can seed a cycle.
- [x] One authorized action creates or reuses the governed Loop cycle and
  atomically binds every retained observation from the selected run.
- [x] Non-quarantined observations enter as pending evidence; quarantined or
  rejected observations remain visible with their rejection reason and cannot
  support claims.
- [x] Replay with the same idempotency key creates no duplicate cycle, Task,
  WorkOrder, or source-ledger rows.
- [x] The Research Watchlist offers a clear `Start research brief` action only
  when verified observations exist, with loading, validation, success, and
  error states.
- [x] The newly created cycle becomes selected in Loop Engineering and shows
  its frozen brief and provenance-linked source ledger after refresh.
- [x] Backend and UI tests cover authority mismatch, incomplete evidence,
  quarantine handling, and the operator handoff; a live replay proves the
  end-to-end idempotency boundary.
- [x] Focused tests, Convex/UI typechecks, production build, browser verification,
  and `git diff --check` pass.
- [x] Continuous scheduling and repository-changing execution remain disabled.

## Work Log

### 2026-08-11 - Plan review and authorized start

**By:** Codex

**Actions:**
- Reconciled the earlier plan against merged PRs and validation packets.
- Confirmed the recovery canary, source registry, Web/RSS adapter, and atomic
  manual-ingestion gate are already complete.
- Selected the smallest unfinished Phase 3 boundary: verified evidence to a
  bounded Research Brief, without starting continuous execution.

**Learnings:**
- Re-running the completed Phase 0 canary would not reduce activation risk.
- Integrity verification must not be confused with claim acceptance.

### 2026-08-11 - Implemented and independently exercised

**By:** Codex

**Actions:**
- Added typed source-run, observation, artifact, receipt, provider-item,
  content-hash, and safety-scan lineage to the Loop Engineering evidence ledger.
- Added a server-side verified-evidence handoff that reopens the exact workspace,
  source, run, artifact, receipt, and observations before binding the ledger.
- Kept safe observations pending claim review and retained quarantined or
  rejected evidence as rejected with its reason.
- Added the Research Watchlist operator dialog and selected the resulting cycle
  after a successful handoff.
- Updated the README and continuous-learning contract to describe the current
  manual boundary and the next claim-verification gate accurately.

**Verification:**
- Created cycle `zn7a6yj6zyn8tq5mcms226ja6d8cap7w`, Task
  `wh7c05nhbsk5hc4txzc20t0ww58cb03e`, and WorkOrder
  `yh7c1xjajgktm3scv1d2dwf0n98cbjj6` from verified source run
  `n57jn9h7w1866zcz9s4hs0f5m98c8vfh` in the canonical Research Lab.
- Bound 20 observations. Replaying the same handoff returned the existing cycle
  with one Task, one WorkOrder, and the same 20 source rows.
- Backend tests: 9 passed. Research Watchlist UI tests: 9 passed.
- Convex and UI typechecks, repository lint, production build, browser reload,
  browser error scan, server health check, and `git diff --check` passed.
- Browser evidence:
  `docs/testing/evidence/governed-continuous-learning/2026-08-11-research-brief-handoff.png`.

**Remaining boundary:**
- The existing broad research graph does not yet read the frozen observation
  IDs. Do not dispatch it for this cycle. Implement bounded claim extraction
  and a distinct claim verifier before enabling graph dispatch or scheduling.

## Notes

- Do not edit the approved continuous-learning plan.
- Do not enable automatic or recurring scheduling in this todo.
- Do not let ingestion evidence authorize recommendations or code changes.
