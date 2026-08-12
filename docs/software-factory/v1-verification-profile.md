---
title: V1 Verification Profile
status: PROPOSED_FOR_ACCEPTANCE
last_verified: 2026-08-11
baseline_commit: 2b1a7c4
profile_id: mission-control-v1-verified-pr
profile_version: 1
---

# V1 Verification Profile

This profile defines the minimum enforced assurance for the controlled
Governed Issue to Verified Pull Request path. It does not define production
deployment eligibility.

## Applicability

- One registered GitHub repository.
- One mutating WorkOrder and candidate branch/worktree.
- TypeScript/React/Node lab with deterministic build and test commands.
- Human merge authority retained.
- Risk `LOW` through `HIGH`; `CRITICAL` is out of V1 autonomous execution.

## Universal hard gates

| Check | Required evidence | Failure behavior |
| --- | --- | --- |
| Contract and revision identity | Active specification version, manifest digest | Missing/mismatch blocks dispatch or verification |
| Repository and base identity | Repository ID, base SHA, clean approved base | Mismatch blocks |
| Candidate identity | Committed head SHA, clean worktree | Change after verification invalidates proof |
| Changed-file manifest | Paths, additions/deletions, diff hash | Missing blocks |
| Change Budget | File/line/path and change-type evaluation | Violation returns `BLOCKED` |
| Negative constraints | Finding set for every typed prohibition | Violation blocks or invokes explicit non-waivable policy |
| Verification integrity | Test/config weakening comparison | Material change requires separate review |
| Secrets | Real configured secrets scan | Finding blocks; unavailable verifier is `NOT_CONFIGURED` |
| Criterion coverage | Every mandatory criterion has categorized evidence | Missing proof returns `NOT_VERIFIED` |
| Independent validation | Required independence level for selected criteria | Insufficient independence returns `NOT_VERIFIED` |
| PR lineage | GitHub repository, branch, head SHA equal verified candidate | Mismatch blocks publication/verified label |

## Baseline deterministic checks

For the controlled lab, configure direct-argv commands for:

1. formatting or lint verification;
2. TypeScript typecheck;
3. production build;
4. unit tests;
5. focused integration/API tests;
6. one browser test for the acceptance path;
7. secrets scan;
8. dependency and lockfile change detection; and
9. Change Budget/negative constraint verification.

The first implementation may run some commands through the existing
`factory-command/v1` verifier, but each check retains its own ID, category,
command digest, result, and evidence mapping.

## Result policy

| Result | Mandatory check | Optional check |
| --- | --- | --- |
| `PASS` | Satisfies check | Satisfies check |
| `FAIL` | Ineligible | Recorded; policy determines impact |
| `SKIPPED` | Ineligible | Allowed only with contract reason |
| `NOT_CONFIGURED` | Ineligible | Honest capability gap |
| `ERROR` | Ineligible | Retry per verifier policy |

No aggregate score overrides a hard gate.

## Risk overlays

### LOW

Human Plan approval may be streamlined by policy. Human merge remains required.
Baseline checks and exact lineage remain mandatory.

### MEDIUM

Human Plan approval, independent criterion validation, and human merge are
required. Dependency, API, or shared business-logic changes add focused tests.

### HIGH

Named technical and domain/security reviewer, stronger independence, adversarial
negative tests, explicit rollback, and protected-path review are required.
Authentication, authorization, customer data, public APIs, migrations, and
infrastructure elevate to at least HIGH.

### CRITICAL

No autonomous mutation under this V1 profile. Create a specialized profile with
multiple approvals, restricted environment, and additional evidence.

## Non-waivable V1 conditions

- candidate/PR SHA mismatch;
- unauthorized repository, tenant, or WorkOrder revision;
- fabricated, tampered, or unauthenticated evidence;
- secret exposure or permission bypass;
- denied-path modification without a newly approved WorkOrder revision;
- unavailable required identity/lineage control; and
- inability to establish a clean committed candidate.

## Evidence freshness

Code-derived evidence is valid only for the exact candidate. Environment or
time-sensitive evidence uses the active governance validity window. A changed
candidate invalidates all artifact-dependent checks; documentation-only proof
cannot be reused for executable behavior unless explicitly independent of the
artifact.

## Profile exit criteria

The profile is accepted only after the golden-path manifest proves all success
and failure cases through supported interfaces and the retained package is
reviewed by the named technical and executive reviewers.
