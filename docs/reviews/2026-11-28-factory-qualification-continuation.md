# Factory qualification continuation — 2026-11-28

Continues PR #251 (`codex/mission-control-transcript-qualification`). This
record separates what was verified in this session from what remains unproven.
It does not claim that the factory generated the to-do application.

## Overall state

**IN PROGRESS at P0.** A dedicated authenticated control plane now exists (below);
no real workload has been dispatched yet. The next step needs the owner's
Clerk sign-in, which only the human can complete.

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

## Environment determination and provisioning (authorized 2026-11-28)

| Candidate | Finding | Decision |
| --- | --- | --- |
| `gallant-cassowary-27` (PR preview backend, resolves as `prod:`) | No worker service identity; hosts the real preview | Not used; unchanged |
| `rightful-grasshopper-709` / `mission-control-integration-staging` | Exists and accessible; Clerk mode with a `pk_test_` key; anonymous access off; no WorkOrders. It holds the MyEve integration tenant/project and its backend is runtime contract **72** from PR #248's line (109 commits ahead of PR #251's base, 20+ overlapping files including `schema.ts` and `runtimeContract.ts`) | Not reused: deploying PR #251 (contract 64) would downgrade a deployment built for MyEve qualification, and a v64 worker cannot speak v72. Two service-identity variables were added and then removed; its variable set is back to the original seven |
| `different-gopher-55` | Dev deployment, empty environment, documented as the legacy UI backend | Not used |
| **New: `adept-goldfish-756`** (Convex project `mission-control-factory-qualification`, dev-type, no expiration) | PR #251 backend pushed (`convex dev --once`), contract **64** confirmed; anonymous access unset; Clerk dev issuer from `convex/auth.config.ts`; one tenant (`mission-control-factory-qualification`, `productionAuthority:false`) seeded through admin import; first-owner bootstrap variables set for the verified owner subject | Qualification control plane |
| **New: Vercel project `mission-control-factory-qualification`** | PR #251 UI deployed with `VITE_AUTH_MODE=clerk`, `VITE_CONVEX_URL` set to the new deployment, deployment protection left at its default | Qualification UI |

PR #248 and PR #251 are diverged histories. The staging environment and this
one are intentionally separate so MyEve can be qualified later against #248's
line without interference. Reconciling the two lines is a separate task.

The worker service identity (`MISSION_CONTROL_SERVICE_ID`, generated
`MISSION_CONTROL_SERVICE_COMMAND_SECRET`) lives only in the new deployment's
environment and in a mode-600 worker file outside the repository. Revoking it
means removing those two variables from the deployment.

`scripts/factory-worker-launch.sh` loads the worker file (refusing modes other
than 600/400) and supplies the macOS per-user `TMPDIR` before executing the
worker. Verified under `env -i` (no `TMPDIR`), the way a service manager starts
it: it exported the per-user directory and the real Codex adapter reported
READY with the containment probe unchanged.

Open item: the owner must complete Clerk sign-in on the qualification UI to run
the one-time first-owner bootstrap.

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
| Authenticated control plane | IN PROGRESS | Dedicated Clerk-mode deployment live; owner sign-in/bootstrap pending |
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
