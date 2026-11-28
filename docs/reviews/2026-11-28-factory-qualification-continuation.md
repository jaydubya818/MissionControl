# Factory qualification continuation — 2026-11-28

Continues PR #251 (`codex/mission-control-transcript-qualification`). This
record separates what was verified in this session from what remains unproven.
It does not claim that the factory generated the to-do application.

## Overall state

**BLOCKED at P0.** The authenticated control plane has no worker service
identity, so no real workload has been dispatched. All unblocked work was
completed first (P1 and a diagnostic repair).

## Evidence gathered

| Item | Result | Evidence |
| --- | --- | --- |
| Dependency-policy gate | Repaired | Advisory 1243661 (`@hono/node-server` `serveStatic` double decode, patched `>=2.1.3`). Pin moved 1.19.19 → 2.1.11 in `package.json` and `apps/orchestration-server/package.json`; no risk acceptance added (`docs/security/dependency-risk-acceptances.json` unchanged, empty). `scripts/check-dependency-audit.mjs`: production and all scopes 0/0/0/0. Orchestration server uses only `serve()`; `@modelcontextprotocol/sdk` 1.32.2 accepts `^1.19.9 \|\| ^2.0.5`. Commit `54a36ed`. |
| Release gates on `54a36ed` | Release Security Gates passes in CI; `pnpm run release:security` passes locally (audit, authorization ratchet 591 vs baseline 592, secret scan, factory docs) | PR #251 check rollup |
| Orchestration regression | `tsc --noEmit` clean; 855 passed, 11 skipped (same counts as the previous head) | local run on the worktree |
| Worker host readiness | All local checks PASS with `TMPDIR` set; `service-registration` and `dispatch-admission` UNVERIFIED by design | `pnpm run factory:readiness --json` |
| Codex runtime | Version `codex-cli 0.146.0` and native SHA-256 match the evaluated Darwin arm64 digest | adapter `health()` READY under `TMPDIR=/var/folders/...` |
| Hosted control plane | Preview uses `VITE_AUTH_MODE=clerk` and Convex `gallant-cassowary-27`; its environment has no `MISSION_CONTROL_SERVICE_ID` or `MISSION_CONTROL_SERVICE_COMMAND_SECRET` | `convex env list` (names only); `convex/serviceCommands.ts` validates worker envelopes against those two settings |
| Local control plane | `.env.local` targets a local backend (`127.0.0.1:3214`) with `VITE_AUTH_MODE=demo` and anonymous company context. It is not running and is not an authenticated operator session | `.env.local` setting names; `convex/lib/companyAccess.ts` |

## Failure → root cause → correction (learning loop)

| Failure | Root cause | Correction | Regression check |
| --- | --- | --- | --- |
| `codex-runtime` FAIL on a correct binary | `TMPDIR` unset in a tool-launched shell; `/tmp` is inside the sandbox minimal-read set, so the containment probe's outside fixture stayed readable | Diagnostic now names `TMPDIR` / `getconf DARWIN_USER_TEMP_DIR` (macOS only); probe itself unchanged, so verification was not weakened | `factoryStartupReadiness.test.ts` new case fails on the old code and passes on the fix |
| Audit gate red on both Release Security Gates and System Qualification V2 | Registry flags 1.19.19 under the advisory; the earlier PR text assumed the upstream "patched" statement would clear it | Upgrade to the first supported patched major line | audit gate and `release:security` |

Retain both: neither widens any permission or weakens a gate.

## Intervention ledger

| Category | Entries |
| --- | --- |
| Human owner after workload submission | None (no workload submitted) |
| External assistant (Claude) | Dependency pin repair `54a36ed`; readiness diagnostic and docs (this commit) |
| Factory-managed recovery | None — no factory run exists |
| Mandatory governance approvals | **Pending:** create a worker service identity on the hosted deployment (see below) |
| Infrastructure configuration | None applied to hosted systems. Worker launch requires `TMPDIR` as documented |

## Remaining blocker and smallest action

The worker authenticates to the control plane with a signed service command.
Hosted deployment `gallant-cassowary-27` has no service ID or command secret,
so the Mac worker cannot be admitted there. The smallest action is to set
`MISSION_CONTROL_SERVICE_ID` and a newly generated
`MISSION_CONTROL_SERVICE_COMMAND_SECRET` in that deployment's environment and
use the same pair in the worker's environment, then confirm the Project,
Repository (`CODEX_WORKER_REPOSITORY_ID`) and Factory Version bindings exist
there. Reusing the local backend's existing secret on the hosted deployment is
not proposed: that value belongs to a different deployment.

## Scorecard

| Requirement | Result | Basis |
| --- | --- | --- |
| Authenticated control plane | BLOCKED | Clerk-mode preview exists; no worker identity on it |
| Admitted worker and runtime | BLOCKED | Runtime checks pass locally; admission unverified |
| Real model execution | NOT RUN | |
| Factory-generated plan / tasks / assignments | NOT RUN | |
| Dependency-aware and parallel execution | NOT RUN | |
| Candidate integration | NOT RUN | |
| Independent verification, running-app acceptance, browser verification | NOT RUN | |
| Factory-managed repair, recovery, durable execution, duplicate protection | NOT RUN | |
| Clean repeat | NOT RUN | |
| Required integration checks | IN PROGRESS | Release Security Gates passes; remaining jobs were still running when written |
| Dependency-policy gate | PASS | audit gate 0 advisories on `54a36ed` |
| GitHub commits and pushes | PASS (for work done) | `54a36ed` pushed; this record's commit follows |
| Accessible application and evidence | NOT RUN | no application generated |

Overall qualification: **not successful**; mandatory requirements remain
BLOCKED or NOT RUN.
