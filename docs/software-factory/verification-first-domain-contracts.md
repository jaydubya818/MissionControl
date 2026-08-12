---
title: Quality Contract and Verification Domain Contracts
status: PROPOSED_NORMATIVE
last_verified: 2026-08-11
baseline_commit: 2b1a7c4
---

# Quality Contract and Verification Domain Contracts

This document defines ownership and invariants for the verification-first
domain. “Implemented” refers to the baseline schema and code. “Target” is a
normative recommendation requiring a future reviewed change.

## Contract map

| Contract | Owner | Mutability | Baseline status |
| --- | --- | --- | --- |
| Mission | Product/business owner | Versioned through lifecycle | Implemented |
| Mission Plan | Human plan authority | Immutable after approval; fork to revise | Implemented |
| Quality Contract | Plan compiler plus human approval | Immutable version and digest | Target; P0 uses WorkOrder contract |
| WorkOrder specification | Control plane | Versioned; frozen into manifest | Implemented |
| Change Budget | WorkOrder authority | Changes require governed revision | Implemented |
| Execution Manifest | Control plane | Immutable after dispatch | Implemented |
| WorkflowRun/Attempt | Runtime/control plane | Append-oriented execution try | Implemented |
| Candidate Revision | Executor produces; verifier identifies | Immutable Git commit/digest | Implemented in runtime projection |
| Verification Run | Verification plane | Immutable result set after completion | Implemented |
| Evidence Envelope | Evidence plane | Append-only; supersede or invalidate | Implemented |
| Verification Receipt | Control plane | Append-only verdict/criterion observation | Implemented |
| Quality Gate Decision | Policy authority | Append-only, superseding decisions | Target |
| Verification Proof Package | Read model | Derived, never independent authority | Partial review package exists |

## Quality Contract — target

A Quality Contract compiles one approved Plan revision, active Factory
Configuration, governance policy, risk assessment, and repository scope into a
canonical assurance specification.

Required identity:

```yaml
quality_contract:
  schema_version: 1
  id: qc_...
  revision: 1
  mission_id: mission_...
  mission_plan_id: plan_...
  factory_definition_version_id: factory_version_...
  governance_policy_id: policy_...
  repository_id: repository_...
  canonical_digest: sha256:...
  status: ACTIVE
```

It owns Mission-level requirements, assertions, cross-WorkOrder invariants,
required assurance profiles, approval policy, validity, and projection rules.
It does not dispatch work or contain runtime results.

## WorkOrder specification — implemented

The `workOrders` record owns scoped requirements, acceptance criteria, positive
and negative constraints, data boundaries, Change Budget, risk reasons,
autonomy ceiling, required approvals, and `verificationContract`. The
specification version is frozen into `workflowRuns.executionManifest`.

Invariants:

- execution uses the current approved WorkOrder revision;
- criteria IDs and requirement IDs are unique within the version;
- every required criterion maps to at least one evidence category;
- denied paths override allowed paths;
- absence of an enforced contract cannot be presented as verified;
- revisions invalidate affected receipts and approvals according to policy.

## Change Budget — implemented

The budget limits files, lines, paths, command classes, dependency changes,
schema changes, migrations, and infrastructure changes. Enforcement uses the
approved base and committed candidate, not executor narration.

Counting rules requiring explicit policy before wider use:

- renames count as one affected file but both old and new paths are evaluated;
- lockfiles are dependency evidence and never ignored automatically;
- generated files count unless the contract names a deterministic generator and
  generated scope;
- symlinks are evaluated using repository path and resolved-target escape
  prevention;
- submodule pointer changes are dependency changes;
- binary files count as files; line budgets are not applicable and must not be
  treated as zero-risk;
- deleted protected files are protected-path modifications.

## Execution Manifest — implemented

The manifest binds WorkOrder/revision, repository and base revision, worktree,
allowed tools, executor/version, policy envelope, Change Budget, verification
contract, time/cost/retry limits, and canonical digest. A worker may reject the
manifest; it may not broaden it.

## Verification Run — implemented

`verificationRuns` binds engine version, WorkOrder/revision, WorkflowRun,
source and candidate revisions, checks, criterion coverage, verdict, reasons,
risk, timing, and idempotency.

Lifecycle invariants:

- one semantic result per idempotency key;
- check results retain the registered verifier and method version;
- required unavailable checks return `NOT_CONFIGURED`;
- completion freezes the result set;
- later runs supersede reliance, not history.

## Evidence Envelope — implemented

`evidenceEnvelopes` binds an evidence category and result to WorkOrder,
WorkflowRun, VerificationRun, candidate, criterion/check, producer, provenance,
artifact references, hash, and time.

Required hardening:

- explicit classification and retention enforcement;
- independence level and producer identity type;
- validity interval and revocation/supersession reason;
- native artifact media type and digest;
- contradiction relationships;
- subject kind plus digest algorithm, rather than candidate string alone.

Evidence never accepts work. It supports or refutes a claim evaluated by policy.

## Verification Receipt — implemented

Criterion-scope receipts preserve one criterion observation. WorkOrder-scope
receipts preserve the server-recomputed P0 verdict, checks, coverage, risk,
violations, approvals, source/candidate revisions, and evidence IDs.

Receipts are immutable historical records. A later run creates a new receipt;
revision, reopen, expiry, or contradictory proof can invalidate reliance while
retaining the original.

## Quality Gate Decision — target

The gate decision should evaluate the active Quality Contract, WorkOrder
projection, candidate, current evidence, waivers, approvals, and policy mode.

```yaml
quality_gate_decision:
  id: qgd_...
  subject_digest: sha256:...
  contract_digest: sha256:...
  policy_revision: policy_...
  evidence_set_digest: sha256:...
  state: AWAITING_HUMAN
  reasons: []
  blocking_finding_ids: []
  required_approval_ids: []
  mode: ENFORCED
  evaluated_at: 0
```

States are `ELIGIBLE`, `INELIGIBLE`, `UNKNOWN`, `STALE`, `WAIVER_REQUIRED`, and
`AWAITING_HUMAN`. The record is append-only and superseded on re-evaluation.

## Verification Proof Package — derived

The proof package is a read model combining approved intent, contract and
candidate digests, diff summary, check results, criterion coverage, evidence,
findings, risk, waivers, approvals, gate decision, PR lineage, and remaining
human action. UI, API, CLI, and PR summaries should project the same source
records.

## Cross-contract invalidation

Re-evaluation is required when Plan, WorkOrder, Factory Configuration, policy,
risk, verifier, source/candidate, dependency graph, environment, or evidence
validity changes. Impact analysis should retain unaffected evidence only when
its subject, method, criterion, and policy dependencies are unchanged and the
active contract explicitly permits reuse.

## Authorization ownership

| Action | Required authority |
| --- | --- |
| Approve Plan/Quality Contract | Human plan approver |
| Revise WorkOrder or Change Budget | WorkOrder owner plus policy-required approval |
| Execute verifier | Registered verifier service identity |
| Ingest evidence | Authorized service capability; no acceptance authority |
| Evaluate gate | Control-plane policy authority |
| Waive a finding | Named risk owner; never the builder alone |
| Publish PR | Candidate-bound publication permit |
| Merge | Human repository authority in V1 |
