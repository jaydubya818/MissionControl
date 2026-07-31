---
title: Runtime contract CI guard
status: active
date: 2026-07-31
owner: Codex
scope: bounded-ci-contract-safety
---

# Runtime contract CI guard plan

## Acceptance criteria

- Public Convex function additions, removals, argument-validator changes, and
  explicit return-validator changes are detected against a Git base revision.
- Formatting-only and handler-only changes do not trigger the guard.
- Internal Convex functions are excluded.
- A detected public contract change passes only when
  `RUNTIME_CONTRACT_VERSION` is greater than the base version.
- Failure output identifies affected functions and the required remediation.
- Pull-request and push CI provide an explicit base SHA to the guard.
- Focused tests cover pass, fail, exclusion, and formatting cases.
- The design, findings, test results, limitations, and next recommendation are
  mirrored in Mission Control Docs.

## Execution checklist

- [x] Research repository patterns and relevant institutional learning.
- [x] Select and document the Git-base AST comparison design.
- [x] Implement reusable public-contract extraction and comparison logic.
- [x] Add the executable Git-base guard.
- [x] Add focused unit and temporary-repository integration tests.
- [x] Wire the command into package scripts and the existing lint CI job.
- [x] Publish repository and Mission Control Docs evidence.
- [ ] Run bounded validation, commit, open a PR, monitor CI, and merge to `main`.

## Bounded validation

Run only the new guard tests, Docs configuration tests, the guard against the
current base, script syntax checks, diff hygiene, and the normal pull-request CI.
The full local repository suite remains excluded under the product owner's
cost-control direction.
