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

### 2026-09-04 - Capability convergence Phase 0/1 kickoff

**Actions:**
- Fetched origin/main at `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38` and started `codex/fdlc-pilot-readiness` from that revision.
- Reusing merged independent model/harness/runtime/backend identities and Eval Control Plane.
- Requested owning team, champion, human FDE/operator and incident commander; no identity inferred from demo data.
- Added the WorkOrder readiness contract before implementation.
- Phase 2+ and todo 060–063 dependency changes remain outside this task.

**Current checklist:**
- [x] Fetch and record current main; inspect recent execution-identity changes.
- [x] Reconcile eight capability families with exact scope and evidence.
- [x] Implement and verify WorkOrder-specific readiness (local regression and scoped browser evidence; real-pilot acceptance remains open).
- [ ] Select and baseline a justified real workflow after identities are supplied.
- [ ] Record incident preflight and run a bounded drill before real execution.
- [ ] Run one complete governed lineage and then the existing ten-outcome gate.
- [x] Record required test/browser outcomes and explicit pilot decision (18 local qualifier gates PASS; real pilot NO-GO to start).

**2026-09-04 qualification:** Fresh local evidence is in `docs/testing/evidence/fdlc-phase0-readiness-2026-09-04-final/`; 18/18 gates passed. Earlier sandbox IPC, stale documentation and negative-control failures are retained separately. Pilot record: `docs/software-factory/fdlc-phase1-pilot-record.md`. Named humans remain unknown; 0/10 real accepted WorkOrders. This todo stays in_progress; downstream dependencies and historical evidence are unchanged.

### 2026-09-05 UTC — named identities and final preexecution proposal

- Recorded FDLC / Mission Control as owning team; Jarrett West as champion,
  human FDE/operator and Incident Commander. Distinct lifecycle approvals and
  independent technical verification remain mandatory.
- Recommended documentation maintenance, with an exact one-line broken-link
  correction for WorkOrder 1 and ten evidenced candidate workflow defects.
- Two isolated pinned preparation worktrees passed offline frozen dependency
  installation, package builds, typecheck and cleanup. Four local cancellation/
  fencing checks passed; an initial wrong test-path failure is retained.
- Live configured backend 3214 refused connection. Actual scope IDs, Factory
  tuple, budget and host/credential containment remain unqualified. No fake
  WorkOrder was created to obtain a readiness response.
- Existing four-workload-class preflight is incompatible with treating ten
  documentation defects alone as complete qualification; no relabeling,
  validator change or dependency reorder performed.
- Phase 0 review commit: f82fe1d98b156278c4fa0c0e2032008e2f010f39; dedicated branch
  pushed. New Phase 1 proposal/evidence remains separate and uncommitted.
- Recommendation NO_GO. Stop before WorkOrder 1, model calls, pilot PR or merge.
  See docs/software-factory/fdlc-phase1-execution-proposal.md.

### 2026-09-05 UTC — independent execution qualification gates

- Recorded Product Owner decision: documentation may be WO1; four classes
  remain mandatory across overall ten accepted outcomes. Cohort-design blocker
  resolved; documentation backlog is not the full pilot cohort.
- Started original configured Convex control plane 3214 from its retained
  config/database, bound to loopback; no alternate backend, seed, code push,
  execution worker or pilot dispatch. Identity/read queries pass, contract v40.
- Live Research Lab scope resolved: project sn71gskbdemgf4z1trt9zdmm5h8bde69,
  repository k17wswvrva7ky172eej2w1nj858cbzt7. Its retained Factory definition is
  DRAFT with no versions/receipts. Composition returns zero admissible model
  routes/code scopes/execution profiles; scoped host and verifier lists empty.
- Installed native codex 0.153.3 does not match proposed pinned 0.146.0; source
  adapter cannot enforce an exact maxTokens setting. No identity substitution,
  budget waiver, qualification receipt or fake WorkOrder created.
- Earlier preparation/cancellation evidence preserved without unnecessary
  reruns. It does not qualify the different installed runtime or absent host.
- Latest preflight: docs/software-factory/fdlc-workorder-01-preflight.md.
  Recommendation NO_GO, independently identifying remaining authority/runtime/
  containment/verifier/budget gates. Control plane left up for inspection;
  execution remains stopped. No Phase 0 commit changes or Phase 2 work.

### 2026-09-05 — Admission bootstrap stops at containment and budget

- Reproduced official Codex 0.146.0 package and exact pinned native digest in isolated temporary storage; global runtime unchanged.
- Retained actual read-only containment results and invalid mutation diagnostic without overstating qualification.
- Refreshed original control-plane scope; no eligible dependent identities or receipts.
- Four bounded adapter tests passed; candidate-tuple controls remain unqualified.
- Added `docs/software-factory/fdlc-workorder-01-admission-report.md`; NO_GO, no model calls or WO1 execution.

### 2026-09-05 — Mutation and budget closure evaluation

- Retained three actual native sandbox mutation matrices; outside `/tmp` writes and writable runtime opens fail admission even with explicit temporary-root restrictions.
- Verified fixture cleanup and all seven package hashes; original backend and WO1 bytes preserved.
- Added regression proof that a hard-token request cannot start the producing process. 44 policy/routing tests and 3 focused adapter tests passed.
- Generic cost/runtime/Attempt policy does not waive the pilot hard-token prerequisite. No budget authority or dependent records issued.
- Closure report: `docs/software-factory/fdlc-workorder-01-admission-closure-report.md`. NO_GO; containment and enforceable budget remain blocked.

### 2026-09-05 — Final budget-policy decision and structural containment evaluation

- Preserved failed outer OS boundary evidence: exact native startup can pass, nested sandbox fails with sandbox_apply EPERM; no worker qualification claimed.
- Traced original budget instructions, correcting global/input/output hard-cap overstatement; proposed explicit resource envelope without inventing provider limits.
- Final report requests BUDGET_POLICY_DECISION_REQUIRED; containment remains BLOCKED_CONTAINMENT. No dependent admission or execution.

### 2026-09-05 — Execution path audit with retained hard budget

- Human rejected resource-only equivalence; hard pre-spend liability contract retained.
- Audited live Docker/remote capacity and exact scoped options; ran one existing pinned no-network local doctor canary with verified cleanup.
- Controlled nesting diagnosis shows permissive nesting works; restricted outer profile is the differing cause, specific primitive unidentified.
- Recommended one Docker-backed provider candidate; current provider types/integration do not support it as a Factory Attempt.
- Provider docs disclose possible spend-limit overrun; generic router estimates are not a strict bound.
- Added execution-path report; BLOCKED_EXECUTION_ENVIRONMENT and no dependent authority.

### 2026-09-05 — Docker worker closure implementation (pilot still in progress)

- Added internal Docker provider through existing Factory worker and RemoteSandboxRuntime; fixed probe only, inference denied.
- Built immutable Linux x64 Codex 0.146.0 image; captured 26 container boundary probes, actual worker result/cancel, recovered teardown and stale-label rejection.
- Added durable offline liability ledger and 23 budget tests. No production price/route/reservation authority or provider behavior certification.
- Independent security and data-integrity reviews retained original findings and follow-up corrections. Full producing runtime, hostile lifecycle and hard budget remain blocked.
- Required repository gates run; default upstream runtime guard divergence preserved, explicit starting-SHA guard passes without API changes or version bump.
- New report: docs/software-factory/fdlc-phase1-docker-execution-path-qualification-report.md. NO_GO; no WO1, model calls, candidate, PR, deployment or readiness.

### 2026-09-05 — Docker closure continuation

- Preserved original 13/14 and all failures under closure history; current-main
  integration retains v39 → v40 → v41 and planned seven-change v42 contract.
- Current System Qualification: 19/19 PASS; final Docker/offline ledger: 49 PASS;
  liability transition/handler regressions: 42 PASS; actual isolated Convex OCC
  permits exactly one competing creation and one full-balance request.
- Actual offline Codex tool call, cancellation, timeout, and SIGKILL worker-death
  deadline/recovery evidence now exist. No external provider calls occurred.
- Independent review fixes: unique WorkOrder monetary authority, immutable usage
  identity, v3 admission timestamp propagation, separate Docker digest identities.
- Exact approved provider/model route remains absent. Live broker, complete
  lifecycle/profile admission, cohort/suballocation, independent verifier and
  readiness remain unqualified. No issued reservation or Factory Version.
- Continue after MODEL_ROUTE_SELECTION_REQUIRED is resolved; route selection is
  not model-spend approval. No WO1 dispatch. Merge remains uncommitted; recovery
  stash retained. See updated Docker qualification report for exact evidence.

### 2026-09-05 — lost Docker creation reply recovery

- Continued provider-independent engineering while exact route selection remains
  pending. A REQUESTED journal can now recover a discovered Docker resource using
  exact name, image, lease and manifest, without relying on a returned create ID.
- Reconciliation validates the versioned proof against the inactive canonical
  Attempt and journal; an already-known ID cannot be replaced.
- Security review identified that empty lookup cannot exclude late creation.
  Both provider and backend now keep that outcome unresolved: no fabricated ID,
  no terminal absence certificate. Existing known-ID absence recovery remains.
- Added actual Docker wrong-lease/lost-reply controls and twelve proof negatives.
  No provider calls, WO1, registration, dispatch or merge occurred.

### 2026-09-05 — approved Bedrock selection, administrative identity audit

- Provider/model selection is resolved: AWS Bedrock, us-east-1,
  anthropic.claude-sonnet-4-6, exact user-supplied foundation-model ARN.
- No dedicated qualification account/project/role binding found in inspected
  local or repository environment configuration. No ambient or Production AWS
  credentials used, no AWS invocation, no model call, no WO1 dispatch.
- AWS documentation lists Converse/Invoke, not Responses, and does not list
  in-region us-east-1 availability. Inference-profile substitution remains
  prohibited. Exact compatibility must be resolved without silently changing
  the approved tuple. Historical route-selection blocker is superseded.
- Current external boundary: QUALIFICATION_AWS_IDENTITY_REQUIRED. Preserve the
  original full goal; request only the missing administrative identity/config.

### 2026-09-05 — explicit offline identity and topology hold

- Recorded QUALIFICATION_AWS_IDENTITY_REQUIRED with the four missing approved
  account, project/environment, role/configuration and topology inputs. Preserved
  the exact Bedrock Sonnet 4.6 route and foundation-model-only restriction.
- Documented the cross-region inference conflict and the explicit owner decision
  required; no inference profile or replacement route was selected.
- Added a pure offline document checker. It grants no authority even when all
  fields are populated. Current exit 2 is the expected unresolved hold.
- Offline regressions: 73/73 PASS, including 19 prerequisite checks, 42 liability
  checks and 12 recovery checks. Documentation and runtime contract guards passed;
  no additional public contracts were introduced by this hold work.
- Evidence: docs/testing/evidence/fdlc-phase1-docker-execution-path/offline-hold-2026-09-05/.
- No local AWS credential/profile/session discovery, AWS calls, model calls, WO1,
  readiness issuance, merge or publication during this continuation. These actions
  remain prohibited; supplying inputs alone does not authorize them.

### 2026-09-05 — finish independent Bedrock qualification engineering

Implementation plan: docs/software-factory/fdlc-bedrock-offline-implementation-plan.md.
Using file-todos tracking; full pilot remains in progress and unqualified.

- [x] Reconcile approved configuration records and record external identifiers.
- [x] Implement exact route/profile policy and negative controls.
- [x] Implement text/tool Converse and InvokeModel adapter and usage attribution.
- [x] Compose price contracts, budget reservation/settlement and unknown outcomes.
- [x] Prepare IAM specifications and deterministic resumption checker.
- [x] Run affected offline, Docker, contract, docs and System gates.
- [x] Preserve evidence and update authoritative hold report.


Completed offline implementation and tests: 60 adapter + 92 contract/budget/checker
cases; 51 existing actual Docker/ledger cases; reviewed System 19/19 on preserved
v41 baseline. Current-main default guard fails after upstream advanced to v42;
this separate integration gate remains open and is not hidden by the pinned run.
No merge, publication, readiness, real reservation, AWS credential discovery or
model call. See final hold report and verification-summary.json. Pilot remains
in progress; no identity-only/full-readiness claim is made.


### 2026-09-05 — current-main reconciliation

- [x] Preserve source and history; create isolated current-main worktree.
- [x] Audit both initial and later upstream advancement; preserve main behavior.
- [x] Write exact v42 → v43 public diff before bump; authoritative codegen.
- [x] Reconcile canonical route/price identity and safe bootstrap handoff.
- [x] Preserve focused/Docker coverage; run current System qualification.
- [x] Perform source reviews and document their limited offline scope.
- [ ] Owner decision on separately versioned Bedrock-compatible harness.
- [ ] Qualify exact producing/verifier/Factory composition after that decision.
- [ ] Approved AWS identity and read-only account qualification.

Explicit architectural stop, not completion: codex/v1 rejects Bedrock. No readiness,
WO1, model call, merge, push or publication. See current qualification report and
fdlc-bedrock-harness-reconciliation-decision.md. Pilot remains in progress.

### 2026-09-05 — approved codex/bedrock-v1 closure

- [x] Owner architectural decision approved; preserve historical hold evidence.
- [x] Versioned harness manifest and adapter.
- [x] Canonical pre-send authority and bounded protocol bridge.
- [x] Docker integration and actual offline tool-cycle qualification.
- [x] Structural fixture profile/Factory composition and independent-verifier regressions.
- [x] Independent reviews; fix findings.
- [x] Current-main 6d7146d semantic patch reconciliation; no Git merge.
- [x] Final full System qualification record: 19/19 PASS against 6d7146d.
- [x] Direct chat local-commit approval; implementation cb373ee36d1645cad4f277f59c75cb7b1cac57f5 and associated closure evidence.
- Later origin/main e9d2f52 (v45) remains outside this reviewed v43 candidate; reconcile and requalify before future integration.

AWS identity and all live admission/execution gates remain open. Historical unchecked
architecture items above are superseded by the approved continuation, not erased.


### 2026-09-06 — current-main Phase 1 continuation

- [x] Preserve historical local candidate; fresh isolated e9d2f52/v45 worktree.
- [x] Audit and classify 26 overlaps; public contract plan written before v46 change.
- [x] Inspect approved AWS handoff records; identity fields remain null; requested authoritative location while engineering continues.
- [x] Complete semantic union preserving Fab, inference accounting, recovery and verifier.
- [x] Authoritative codegen and exact current-main public diff.
- [x] Full deterministic qualification: latest 4434cc5 System 19/19 PASS; net UI unchanged.
- [x] Independent reviews and findings resolved.
- [ ] Recheck main, focused commits, push, PR, CI and qualified merge.
- [ ] Exact-main postmerge qualification.
- [ ] AWS identity/topology/pricing and separately authorized live-call qualification.
- [ ] Exact profiles/Factory/readiness and authorized Phase 1 pilot execution.

Scope/contract: docs/software-factory/fdlc-bedrock-current-main-20260906/contract-plan.md.
