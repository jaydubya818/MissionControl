---
status: complete
priority: p1
issue_id: "039"
tags: [software-factory, research-lab, continuous-learning, loop-engineering, evidence, workflow]
dependencies: ["038"]
---

# Bind Continuous Research to Frozen Observation Evidence

## Problem Statement

A verified manual source run can seed a frozen Loop Engineering Research Brief,
but the current `loop-engineering` graph performs new broad research. Dispatching
that graph would break the exact observation-to-artifact-to-receipt provenance
boundary established by todo 038.

## Findings

- The generic WorkOrder dispatcher creates an immutable workflow snapshot but
  injects only a free-form Task string into run context.
- The workflow renderer already supports structured JSON context and the
  executor already enforces read-only Task handoffs, explicit `COMPLETED`
  outputs, bounded step output, bounded run context, retries, and checkpoints.
- A verified Research Brief source row retains the exact source run,
  observation, artifact, receipt, provider item, content hash, and safety status.
- The existing projector trusts broad lane URLs and cannot deterministically
  prove that an accepted claim cites one of the frozen observations.
- The generic public dispatcher must not gain arbitrary context-injection
  authority.
- Continuous scheduling and repository mutation remain outside this slice.

## Proposed Solutions

### Option 1: Put observation excerpts into the canonical Task description

**Pros:** Minimal dispatcher changes.

**Cons:** Mixes untrusted external content with canonical intent, duplicates
evidence, and makes provenance difficult to revalidate at dispatch.

**Risk:** High.

### Option 2: Let the browser pass an arbitrary workflow context object

**Pros:** Flexible and fast to implement.

**Cons:** Lets a client invent observation, artifact, and receipt lineage and
weakens the server-owned authority boundary.

**Risk:** High.

### Option 3: Governed server-side evidence packet dispatch

**Pros:** Reopens the cycle and every retained evidence record server-side,
freezes a bounded packet and digest into the workflow run, keeps the public
dispatcher narrow, and supports deterministic projection.

**Cons:** Adds one internal dispatch context and a dedicated workflow snapshot.

**Risk:** Low.

## Recommended Action

Implement Option 3. Add a manual `continuous-research` workflow containing one
claim extractor and one distinct claim verifier. A Loop Engineering action must
revalidate the exact Research Brief, source runs, observations, artifacts, and
receipts before dispatch. Only passed, active observations may expose bounded
excerpts to the extractor; rejected or quarantined observations remain visible
as excluded evidence without exposing instruction-like content. The projector
must accept a claim only when it exists in the extractor output and the verifier
cites exact frozen observation and artifact IDs.

## Agent-Native Architecture Decisions

- **Parity:** The UI dispatch outcome is exposed through a governed server
  action; no browser-only authority is introduced.
- **Granularity:** Evidence loading and state writes remain deterministic
  primitives; claim judgment stays in the extractor and verifier prompts.
- **Composability:** The behavior is a versioned workflow snapshot rather than
  hard-coded recommendation logic.
- **Completion:** Both stages require an explicit `status: COMPLETED` contract.
- **Partial progress:** Existing workflow step states, retries, and checkpoints
  provide resumable progress.
- **Context limits:** Observation count, excerpt length, and total packet size
  are bounded before dispatch.
- **Shared state:** Workflow results project into the same reactive Convex cycle
  viewed by operators.
- **Approval:** Claim verification grants no recommendation, implementation,
  scheduling, or repository-write authority.

## Acceptance Criteria

- [x] A versioned `continuous-research` workflow has distinct extractor and
  verifier identities, read-only isolation, explicit output contracts, and no
  web-discovery, gate, recommendation, or repository-write step.
- [x] A governed Loop Engineering action revalidates the exact cycle, Research
  Brief, source runs, observations, artifacts, receipts, workspace, safety
  state, and evidence completeness immediately before dispatch.
- [x] Only active, safety-passed observations enter the extractor packet;
  quarantined or rejected observations remain visible as excluded evidence
  without their raw excerpt.
- [x] The immutable workflow run context retains the exact observation packet,
  Research Brief, evidence digest, cycle ID, and source-run IDs within bounded
  count and byte limits.
- [x] The generic public WorkOrder dispatcher cannot inject arbitrary workflow
  context.
- [x] Deterministic projection accepts a claim only when the extractor emitted
  it and the distinct verifier cites allowed observation and artifact IDs.
- [x] Rejected, unsupported, invented, incompletely cited, and conflicting
  claims remain rejected or unsupported with reasons.
- [x] A verified no-new-evidence result is a clean stop; accepted claims advance
  only to recommendation drafting and never create a recommendation themselves.
- [x] The executor automatically projects completed `continuous-research` runs
  and records projection failures against the linked cycle.
- [x] Evidence-bound cycles route the operator's graph action through the new
  governed dispatcher and explain the frozen-evidence boundary in the UI.
- [x] Workflow loader, packet validation, projection, executor, and UI tests
  cover the success, quarantine, invented-claim, citation-mismatch,
  no-evidence, idempotency, and error paths.
- [x] Focused tests, Convex/UI typechecks, lint, production build, workflow seed,
  browser verification, and `git diff --check` pass.
- [x] Continuous scheduling and repository-changing execution remain disabled.

## Work Log

### 2026-08-11 - Design approved and implementation started

**By:** Codex

**Actions:**
- Reconciled the requested Phase 3B boundary against the current dispatcher,
  workflow renderer, executor, projector, and completed todo 038.
- Selected the server-owned bound-context design and rejected browser context
  injection and canonical Task-content duplication.
- Applied the repository learning that Convex contracts and their consumers
  must ship atomically.

**Learnings:**
- The existing executor already supplies explicit completion, bounded context,
  retries, checkpoints, and read-only Task lifecycle controls.
- The missing boundary is authoritative context binding and deterministic
  citation projection, not another autonomous scheduler.

### 2026-08-11 - Phase 3B implemented and proven in the Research Lab

**By:** Codex

**Actions:**
- Added the versioned two-step `continuous-research` workflow with Research
  Scout extraction and a distinct Evidence Reviewer verification step. Both
  are read-only; topology is LINEAR and concurrency is one.
- Added a server-owned frozen evidence packet and digest. Dispatch reopens and
  revalidates the cycle, source runs, observations, artifacts, receipts,
  workspace, content hashes, and safety state in the dispatch transaction.
- Added deterministic projection that rejects invented or mismatched citations,
  preserves rejected/quarantined evidence, and advances accepted claims only
  to recommendation drafting without creating recommendations.
- Routed the Loop Engineering UI to the governed action and made its boundary
  explicit: no discovery, recommendation generation, messaging, scheduling,
  or repository mutation.
- Browser testing caught a legacy broad WorkOrder objective. The first proof
  run `m3sl013j` and its empty extractor Task SFRL-119 were canceled before a
  deliverable. The broad WorkOrder was then superseded, not silently edited.
- Created bounded replacement WorkOrder `yh74rf0hrqv109anxe4kq2w35n8ca7tr`,
  dispatched live run `s6qm3txf`, and manually ticked the executor once to
  create read-only extractor Task SFRL-120. The executor was stopped
  immediately afterward; recurring scheduling remains off.

**Verification:**
- Workflow engine: 99 tests passed.
- Mission Control UI: 225 tests passed.
- Continuous-research evidence/projection lineage: 12 focused tests passed.
- Repository lint and all workspace typechecks passed; all 10 skills scored
  100/100.
- Full workspace production build passed. Vite reported its pre-existing
  large-chunk advisory only.
- Workflow seeding registered `continuous-research` with two agents and two
  steps.
- Repeated live dispatch returned idempotent replay for run `s6qm3txf` with
  evidence digest
  `sha256:9be366bc16c4da5fc24fe84d874824830545e73897ef736b41f15e8384da796e`.
- Browser evidence:
  `docs/testing/evidence/governed-continuous-learning/2026-08-11-phase-3b-frozen-evidence-graph.png`.
- `git diff --check` passed and `http://localhost:5199` returned HTTP 200.

**Operational state:**
- Live run `s6qm3txf` is COMPLETED. SFRL-120 and SFRL-121 are both in REVIEW,
  retain their structured deliverables, and were executed by distinct Research
  Scout and Evidence Reviewer identities over exactly 20 frozen observations.
- The independent verifier accepted six claims, rejected one over-interpreted
  claim, and decided all 20 retained observations. The deterministic projector
  advanced the cycle to RECOMMEND with six supported claims, one unsupported
  claim, and zero generated recommendations.
- Continuous scheduling is disabled; the Research Lab profile is running
  without an autonomous workflow executor.

**Learnings:**
- A safe step prompt is insufficient when the WorkOrder's immutable desired
  outcome grants broader authority. The WorkOrder revision and the workflow
  prompt must express the same boundary.
- Compatibility recovery must create and audit a replacement WorkOrder when
  authority changes materially. Reclassifying a dispatched WorkOrder in place
  would invalidate its evidence.

### 2026-08-11 - Live extractor and independent verifier completed

**By:** Codex with separate Research Scout and Evidence Reviewer agents

**Actions:**
- Transitioned SFRL-120 through IN_PROGRESS to REVIEW with a structured
  seven-claim deliverable derived only from the frozen observation packet.
- Materialized SFRL-121 only after the extractor handoff was durable, then used
  a distinct Evidence Reviewer identity to adjudicate every claim and all 20
  observations.
- Rejected the scam-related claim because its Mission Control operator-safety
  interpretation was not entailed by the excerpt; accepted the other six as
  reported source claims with explicit limitations.
- Allowed the deterministic executor to consume each reviewed deliverable,
  complete run `s6qm3txf`, and project the result before stopping the executor.

**Verification:**
- Workflow run `s6qm3txf`: COMPLETED, 2/2 steps DONE, distinct agent IDs.
- Cycle `zn7a6yj6zyn8tq5mcms226ja6d8cap7w`: PROJECTED to RECOMMEND with seven
  ledger entries, six supported and one unsupported.
- All 20 source rows have an ACCEPTED or REJECTED decision; recommendations
  remain empty.
- Extractor evidence:
  `docs/testing/evidence/governed-continuous-learning/2026-08-11-sfrl-120-extracted-claims.json`.
- Verifier evidence:
  `docs/testing/evidence/governed-continuous-learning/2026-08-11-sfrl-121-verified-claims.json`.
- Final browser evidence:
  `docs/testing/evidence/governed-continuous-learning/2026-08-11-phase-3b-verified-claims-complete.png`.
- Runtime contract guard passed with the required v12 to v13 public-contract
  increment; the local Research Lab client and backend both report v13.

**Operational state:**
- No autonomous workflow executor or continuous scheduler is running.
- The broad `loop-engineering` research graph remains undispatched.
- The next safe slice is failure/recovery control proof; recommendation drafting
  remains a separate read-only proposal stage.

## Notes

- Do not modify the approved continuous-learning plan.
- Do not enable automatic or recurring scheduling.
- Do not expose quarantined excerpts to any agent prompt.
- Do not let verified claims authorize recommendations or repository changes.
