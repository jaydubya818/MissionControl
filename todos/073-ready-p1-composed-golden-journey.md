---
status: ready
priority: p1
issue_id: "073"
tags: [security, integration, browser, qualification]
dependencies: []
---

# Composed Golden Journey

## Problem Statement
The independently qualified Result consumer and exact-owner isolation must work together through an authenticated owner browser conversation, actual execution, acceptance and durable reconnect.

## Findings
The dependency uses signed application commands and a shared Mission creation helper predating frozen owner principals. Existing MyEve browser fixtures can run the real Eve session stack with deterministic model output. Existing Result tests use a synthetic direct tool session and cannot establish the browser gate.

## Proposed Solutions
Reconcile the exact sources and extend existing lifecycle hooks. Rebuilding a separate execution/UI demonstration would lose canonical lineage and is rejected.

## Recommended Action
Execute docs/enterprise-golden-journey/COMPOSED_PLAN.md sequentially. Status: in progress.

## Acceptance Criteria
- [x] Exact sources reconciled, original commits preserved, canonical isolation maintained.
- [ ] Browser authenticates, Sofie proposes, owner authorizes, same Mission executes.
- [ ] Native/delegated verification, gates, Result consumption, owner acceptance and reconnect exercised.
- [ ] Isolation/accounting/concurrency/recovery/accessibility qualified with explicit fixture boundaries.
- [ ] Fresh-clone, hosted CI and independent review recorded against exact source.
- [ ] Advisory report and retained failure evidence delivered.

## Work Log
2026-10-10: User authorized composed qualification. Read handoff, exact-source reports, backend boundaries and existing MyEve browser harness. Implementation begins from clean isolation branch 6761c0c1.

2026-10-10: Reconciled dependency with canonical exact-owner authorization; seven cache/concurrency tests and 34 real-database isolation checks pass. Independent Codex review reproduced two cache races and batch-write regression; fixes independently rechecked PASS. Composed runs execute native/delegated work and actual completed Result tool, but hit canonical one-second Result projection timeouts and native custody expiry. Browser harness remains deterministic; no owner proposal authorization UI exists. Full product gate is still blocked.
