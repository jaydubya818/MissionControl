---
title: Verification-First Golden-Path Demonstration Manifest
status: DRAFT_VALIDATION_CONTRACT
last_verified: 2026-08-11
baseline_commit: 2b1a7c4
manifest_id: verification-first-golden-path-v1
---

# Verification-First Golden-Path Demonstration Manifest

This manifest defines the evidence required to demonstrate Mission Control's
browser-initiated path from governed intent to a review-ready, independently
verified pull request. It is a validation contract, not proof that the complete
path currently passes.

## Claim under test

A human operator can create a governed Mission, approve a versioned Plan,
authorize bounded repository work, execute that work as immutable Attempts,
verify the exact candidate independently, inspect a policy decision and proof
package, and publish a pull request whose GitHub head SHA matches the verified
candidate.

The demonstration does not claim autonomous merge, production deployment,
production validation, continuous learning, or Level 4 autonomy.

## Pinned test identity

Complete these values before execution. A run with placeholders cannot pass.

| Identity | Required value |
| --- | --- |
| Mission Control commit | Exact 40-character Git SHA |
| Mission Control deployment | Stable environment identifier |
| Lab repository | `mission-control-factory-lab` or approved replacement |
| Lab baseline | Immutable tag and exact commit |
| Factory configuration | Record ID and revision |
| Governance policy | Policy ID, version, and digest |
| Verification profile | `mission-control-v1-verified-pr@1` |
| Executor | Provider, adapter version, and capability attestation |
| Operator | Authenticated principal ID and roles |
| Clock window | Start and end in UTC |

## Controlled change

The preferred V1 issue is: add a required **Business Justification** field to
Mission creation. It must exercise the React UI, Convex persistence and
validation, deterministic tests, one browser assertion, independent
verification, evidence presentation, and GitHub publication while remaining
small enough to understand completely.

The approved specification must define:

- functional behavior and explicit acceptance criteria;
- non-functional, architecture, and security constraints;
- forbidden paths and the three-boundary Change Budget;
- expected failure and recovery behavior;
- required checks, evidence kinds, freshness, and subject identity;
- risk classification and human approval requirements.

## Preconditions

- Mission Control and the lab repository are free of uncommitted test changes.
- The GitHub App is installed with the least privileges needed for the lab.
- Repository registration, default branch, branch protection, and credentials
  are verified without printing secrets.
- A Factory Configuration and Governance Policy are active and versioned.
- The executor has a current capability attestation.
- The verification commands are deterministic from the pinned lab baseline.
- The operator can observe Missions, Plans, WorkOrders, Tasks, Attempts,
  Evidence, decisions, and the pull-request handoff in the supported UI.
- Raw recordings and sensitive traces have an approved private storage target.

## Successful-path procedure

| Step | Operator action or system event | Retained proof | Pass condition |
| --- | --- | --- | --- |
| 1 | Select Company, Workspace, Repository, and Factory Configuration | IDs and sanitized screenshot | All records resolve to the same tenant and repository |
| 2 | Create the Mission in the browser | Mission ID, specification revision, screenshot | Intent, constraints, acceptance criteria, risk, and owner persist |
| 3 | Generate and review a versioned Plan | Plan ID, revision, coverage review | Plan maps every acceptance criterion and identifies checks and rollback |
| 4 | Approve that exact Plan revision | Approval audit event | Approval subject and revision match the Plan used downstream |
| 5 | Create the WorkOrder | WorkOrder ID and contract digest | Authority, scope, Change Budget, and verification contract are frozen |
| 6 | Decompose into bounded Tasks | Task IDs and dependency links | Task scope is contained by WorkOrder authority |
| 7 | Dispatch one Task | Preflight and policy records | Identity, capability, policy, and budget checks pass |
| 8 | Create and run an immutable Attempt in an isolated worktree | Attempt ID, lease history, worktree and base SHA | Attempt never broadens its authorized scope |
| 9 | Produce a candidate commit | Commit SHA, changed-file manifest, diff statistics | Candidate satisfies all three Change Budget boundaries |
| 10 | Run verification independently | VerificationRun ID, check results, tool provenance | Checks execute against the exact candidate and manifest digest |
| 11 | Evaluate the quality gate | Decision ID and policy explanation | Required evidence is present, fresh, passing, and policy-compliant |
| 12 | Pause for required human review | Review request and decision | No publication occurs before the scoped decision |
| 13 | Issue publication authority and open the PR | Permit/receipt, PR URL, head SHA | Permit subject equals verified candidate; GitHub head equals that SHA |
| 14 | Render the review package | UI screenshot and evidence index | Reviewer can trace requirement to candidate, checks, findings, and decision |
| 15 | Explain acceptance semantics | Teach-back recording or notes | Task completion is distinguished from WorkOrder and Mission acceptance |

## Required failure-path procedure

Run at least one material failure without editing authoritative history. The
recommended first case is a GitHub head-SHA mismatch introduced after
verification and before publication.

The demonstration must show:

1. the mismatch is detected before merge eligibility;
2. the previously passing evidence remains attached to its original candidate
   but is not accepted for the new head;
3. the policy decision becomes blocked, stale, or superseded;
4. the operator sees the authoritative failure and recovery action;
5. recovery creates the required new Attempt or VerificationRun rather than
   mutating the old result;
6. duplicate or late completion events cannot advance the replacement subject;
7. the new candidate is independently reverified before publication.

An alternative failure may be used only when it proves comparable authority,
identity, evidence invalidation, and recovery semantics.

## Evidence index

Retain small, sanitized textual artifacts in Git. Store recordings, raw logs,
and sensitive traces externally and reference them by stable ID and SHA-256.

Required evidence:

- all hierarchy record IDs and revisions;
- exact Mission Control and lab repository commits;
- WorkOrder contract and Change Budget digest;
- Attempt, lease, heartbeat, cancellation, and terminal event excerpts;
- verification command identities, exit results, provenance, and timestamps;
- evidence-to-acceptance-criterion mappings;
- policy version, decision explanation, approval, and publication authority;
- pull-request URL, base branch, head branch, and exact GitHub head SHA;
- browser screenshots or recording of operator decisions;
- failure classification, reconciliation, retry, and recovery proof;
- agent-assistance disclosure and independent verification statement;
- retrospective and developer, executive, and CTO teach-backs.

Each external artifact reference must contain `id`, `classification`,
`external_location`, `sha256`, `created_at`, `sanitization_status`,
`reviewer_access`, and `retention`.

## Assertions

The reviewer must be able to answer yes to every assertion:

- Was execution authorized by the exact approved Plan and WorkOrder revision?
- Did policy run before each material side effect?
- Is the implementation candidate immutable and uniquely identified?
- Did validation run separately from implementation against that candidate?
- Can every required acceptance criterion be traced to sufficient evidence?
- Did missing, stale, skipped, or errored evidence fail closed?
- Did human review occur only where the active policy required it?
- Does GitHub identify the same head SHA the quality decision evaluated?
- Can failures, retries, late events, and exceptions be reconstructed?
- Can the operator explain why the PR is eligible without trusting agent prose?

## Acceptance and non-acceptance

The run passes only after both the successful and failure paths are reviewed by
the named technical reviewer and the executive reviewer. Component tests,
seeded demonstrations, screenshots without record lineage, or an agent-created
PR without verified candidate identity do not satisfy this manifest.

Record the result as `PASS`, `CONDITIONAL`, or `FAIL`. Conditional acceptance
must list expiring conditions and cannot be presented as complete mastery or a
production-capable factory.
