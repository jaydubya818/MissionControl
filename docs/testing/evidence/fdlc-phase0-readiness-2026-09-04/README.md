# Phase 0 readiness verification

Scope: uncommitted changes based on origin/main
`9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`. This directory contains local
regression/fixture evidence, not a real pilot. Runtime contract: 40.

Environment: macOS; Node 24.18.1; pnpm 9; frozen offline dependency install with
lifecycle scripts disabled. UI localhost:5203 and disposable Convex
localhost:3260 (instance `fdlc-readiness-test`). Shared Research Lab at 5199 was
not changed. Only fictitious seed data was used; no real execution credentials
or real pilot dispatch. Backend admin credentials remain outside the repository.

## Gates and retained failures

`gate-first-pass-results.json` records all requested command exit codes from the
first complete unrestricted sequence. Test, lint, build, ci:typecheck,
ci:runtime-contract, eval:mission-control and diff checks passed. The security
and Factory gates initially failed on a stale v39 reference in docs/OVERVIEW.md.
That reference is corrected; `security-corrected.log` records the passing rerun.

The next Factory run failed because its docs negative-control fixture still
mutated/expected v39→v38. It now mutates v40→v39 and asserts the exact mismatch;
no assertion was removed. Failed run output is retained in
`negative-control-failure.log` and the sibling `-qualified` evidence directory.
The final qualifier writes only to sibling
`fdlc-phase0-readiness-2026-09-04-final`; use its automated-checks.json for final
per-gate status, scenario-evidence.json and eval-receipt.json.

The earliest restricted test run failed on EPERM opening local test IPC/socket
listeners and was interrupted before completion. Its failure tail is retained.
Rerunning with local IPC permitted passed the full suite. This environmental
failure is not a real pilot Attempt and has not been relabeled as one.

Existing deterministic coverage includes WorkOrder dispatch/revision, Factory
attempt/worker leases, duplicate active execution, stale completion, routing
and identity mismatches, budget/recovery bounds, revocation/cancel, independent
verification subject/currentness and PR-head drift. The new readiness suite
adds stale/foreign/superseded/unreleased Plan cases, empty/unknown admission,
pending preparation and multiple precise Factory blockers. These are scoped
regression tests, not live provider outage or production incident proof.

Final result: **18 / 18 qualifier gates PASS**, completed 2026-09-05T05:32:57Z.
The explicit ci:typecheck and eval commands also passed in the recorded sequence.
The qualifier’s composed scenario retains a synthetic runtime-28 identity; it is
not evidence of a deployed v40 real-pilot tuple. Runtime-v40 API compatibility
is covered separately by the passing runtime guard and disposable backend push.

## Actual backend observations

`stale-workorder-query.json` is the actual disposable Convex query response for
WorkOrder `sx7prk22x2y32t0r9j0ch9pyfh8dtbkf` with expected revision 0, while the
stored revision is 1. It returns admissionEligible=false, authoritative=false,
and the specific work-order-revision blocker, alongside other real seed-data
blockers. This is not a mocked UI projection.

`denied-query.log` records authorization rejection after disabling anonymous
demo compatibility in this disposable instance. Compatibility was restored for
UI recovery and no shared deployment was changed. This proves anonymous denial;
it is not an expired authenticated-token test.

## Browser acceptance record

Actual Mission Control UI was inspected using browser automation, including
rendered screenshots and accessibility/DOM observations in this task.

| Case | Result / exact scope |
| --- | --- |
| Desktop | PASS for new panel: explicit approval, Factory selection, team/owner/host blockers; repository badge remains separate. |
| 390px mobile | PASS for new panel: wrapped text/buttons, stacked navigation, readable check reasons; verified at 390×844. Viewport restored afterward. |
| Keyboard | PASS: focused Refresh checks activated with Enter; visible focus ring and loading→blocked result. |
| Refresh persistence | PASS: URL-selected governed WorkOrder survives reload; checks are recomputed, not persisted as authority. |
| Loading | OBSERVED: Checking current WorkOrder authority; dispatch unavailable until a projection exists. |
| Blocked / degraded configuration | PASS: missing selected Factory, human owner/team and host are visible, preparation/evidence remains pending. |
| Denied / empty | OBSERVED: after anonymous access removed, workspace data disappeared and existing shell showed workspace-unavailable / Create a workspace. This is ambiguous existing copy, not proof of a valid empty authorized workspace. |
| Recovery | PASS: restoring isolated demo access and reloading restored the same WorkOrder and blockers. |
| Snapshot expiry | PASS: after 30 seconds the panel requires refresh; frontend admission action is disabled for an expired snapshot. |
| Expired authenticated token | NOT RUN: no real authenticated pilot session provisioned. |
| Duplicate dispatch clicks | NOT RUN in live browser: no admitted pilot; deterministic dispatch tests remain separate. |
| Successful real completion / release | NOT RUN: named humans and pilot preflight absent. |

The browser coverage above is deliberately incomplete against the real-pilot
acceptance matrix. No backend behavior is inferred from component tests.

## Pilot deliverables and decision

1. Current-main reconciliation: docs/research/2026-09-04-fdlc-capability-audit/current-main-reconciliation.md.
2. Canonical matrix: docs/product/software-factory-capability-maturity.md.
3. Readiness contract: docs/software-factory/workorder-readiness-contract.md.
4–6. Selection comparison, UNKNOWN baseline, incident contract/drill NOT RUN:
docs/software-factory/fdlc-phase1-pilot-record.md.
7–9. Real execution, corrective Attempt, ten outcomes: NOT RUN; 0/10 accepted.
10. Cost coverage: UNKNOWN pilot components in the pilot record; no invented dollars.
11. Local eval: final qualifier receipt; real pilot receipt NOT CREATED.
12. Real pilot decision: NO-GO to start, required named identities missing.
13. Next slice: complete todo 059 admission and real lineage; no measured reason
to advance Phase 2 or reorder existing dependencies.

Final browser follow-up caught an explanatory-message omission: implicit
high-risk RISK_REVIEW was not named when explicit requiredApprovals was empty.
The message now uses the existing requiredApprovalTypes helper. After this
copy-only correction, 22 readiness/governance tests passed, Convex deployment
with typechecking passed, and the browser explicitly displayed RISK_REVIEW.
No admission behavior changed. Temporary browser tab and isolated servers were
closed after verification.
