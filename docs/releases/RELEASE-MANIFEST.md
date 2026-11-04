# Mission Control release manifest

This is the release manifest of record for Mission Control. It records exact
canonical `main` SHAs, CI receipts, review results and deployment receipts.
A merge to `main` proves neither a deployment nor live qualification
(see [source-release-policy.md](../software-factory/source-release-policy.md)).
Add new entries at the top. Do not edit past entries except to correct facts.

Times are UTC unless marked PT (America/Los_Angeles).

## Current state (as of 2026-11-03 18:00 UTC)

| Field | Value |
| --- | --- |
| Canonical `main` | `c651cd7848966e2d074d9f90e7117b6d33e23483` (PR #245 merge) |
| Post-merge CI on `main` | [run 41687698098](https://github.com/jaydubya818/MissionControl/actions/runs/41687698098), success, 10/10 jobs |
| Production deployment | **Unchanged.** No deployment was created for `c651cd78` or `e8cb7d42`. |
| GitHub `Production` environment, latest | deployment `6343171227`, sha `c511b543`, 2026-09-09 |
| Vercel `mission-control-ui` production, latest | `dpl_3rVmTvXkapPhdf19TVvfH21CrMhP`, READY, created 2026-10-14 23:01 UTC (no Git metadata) |
| Main deploy guard | `vercel.json` `git.deploymentEnabled.main = false` |
| MCP SDK | `@modelcontextprotocol/sdk` 1.32.2 |
| Phase 4 MCP qualification on 1.32.2 | `COMPLETE_IN_FIXTURE`; live isolated qualification **PENDING** |
| Unqualified execution | **Not enabled** |
| Execution and tester activation holds | **Unchanged** |
| Factory work orders WO-001..014 | Paused; not touched |

## 2026-11-03: PR #245, Phase 4 MCP SDK 1.32.2 requalification (fixture)

- PR: [#245](https://github.com/jaydubya818/MissionControl/pull/245),
  "Qualify Phase 4 MCP grants against SDK 1.32.2 (fixture only)".
- Merge commit: `c651cd7848966e2d074d9f90e7117b6d33e23483`, merged
  2026-11-03 17:47:53 UTC (9:47 AM PT) with owner approval.
- Base: `e8cb7d4279517d5a0536369fff374f22f700dd25`.
- Reviewed head: `1e492395da664b40735ff838a14d3bb43f14b94f`. The head did not
  change between review and merge.
- Independent review: 5/5 on correctness, test coverage, security and intent fit.
- Pre-merge CI: run 41588937506, 15/15 checks green, including all required
  branch-protection checks.
- Post-merge CI: [run 41687698098](https://github.com/jaydubya818/MissionControl/actions/runs/41687698098),
  success, 10/10 jobs (Lint, Eval Integrity, Smoke Test, E2E Tests, Unit Tests,
  Release Security Gates, TypeScript Type Check, Browser Security and
  Accessibility, System Qualification V2, Build).
- Security: `@hono/node-server` pinned to **1.19.18**, closing
  GHSA-jpvv-r467-5p4w (`serve()` backslash path). See
  [2026-11-03-hono-node-server-1243661.md](../security/2026-11-03-hono-node-server-1243661.md).
- Accepted risk retained: moderate advisory **1243661**
  (GHSA-rmxm-3fg6-px4f, `serveStatic` double decode) on `@hono/node-server`
  1.19.18. Scope and controls are unchanged; review by 2026-11-16, expires
  **2026-12-15**. Recorded in
  [dependency-risk-acceptances.json](../security/dependency-risk-acceptances.json).
- MCP requalification: **COMPLETE_IN_FIXTURE** for the Context7 Tool Version,
  Tool Grant and Execution Profile against SDK 1.32.2. Evidence:
  [sdk-1.32.2-requalification.md](../testing/evidence/governed-mcp-phase4-recovery/sdk-1.32.2-requalification.md).
- Live qualification: **PENDING** an isolated environment. It needs owner
  approval to start the local Phase 4 backend, GitHub App installation binding
  on that workspace, an operator with `factory.approve`, and confirmation that
  the target is not production Convex.
- Deployment: **none.** No GitHub deployment and no Vercel deployment exist for
  `c651cd78`. Production is unchanged.
- Holds: execution and tester activation holds are unchanged. Unqualified
  execution is not enabled.

## 2026-11-03: PR #244, high-severity dependency remediation

- PR: [#244](https://github.com/jaydubya818/MissionControl/pull/244),
  "fix(security): patch high-severity dependency advisories".
- Merge commit: `e8cb7d4279517d5a0536369fff374f22f700dd25`, merged
  2026-11-03 05:50:47 UTC (Nov 2, 9:50 PM PT) with owner approval.
- Head: `fb5e90097874af19d5e04b800acaf613dc4518ce`.
- PR CI: 15/15 checks green.
- Post-merge CI: [run 41586272505](https://github.com/jaydubya818/MissionControl/actions/runs/41586272505),
  success.
- Change: `@modelcontextprotocol/sdk` moved to 1.32.2 and high-severity
  advisories were patched. See
  [2026-11-02-dependency-high-remediation.md](../security/2026-11-02-dependency-high-remediation.md).
- Deployment: **none.** Production is unchanged.
