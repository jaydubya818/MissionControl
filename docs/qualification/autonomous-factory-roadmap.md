# Autonomous factory roadmap — execution record

Living record for the nine-phase program (Mission Control → MyEve/Sofie).
Resume from this file, not from chat history. Companion record for PR #251:
[2026-11-28 qualification continuation](../reviews/2026-11-28-factory-qualification-continuation.md).
No secret values belong here. Last updated: 2026-11-28 (session 2).

## Ownership

| Resource | Owner | Notes |
| --- | --- | --- |
| PR #251 line (`codex/mission-control-transcript-qualification`, contract 64) | Claude (principal) | head `163decb`; all 14 listed checks pass, merge state CLEAN, not merged |
| Qualification control plane `adept-goldfish-756` + Vercel `mission-control-factory-qualification` | Claude | dedicated, `productionAuthority:false` |
| PR #248 line (`codex/integration-reconcile-20261104`, contract 72, MyEve integration) | Codex | draft; staging `rightful-grasshopper-709` — do not redeploy from #251 |
| Main checkout `sofie/factory-skillz-and-dispatch` | Owner | unrelated uncommitted work; do not touch |
| Convex `gallant-cassowary-27` (PR preview, resolves `prod:`) | — | unchanged; no worker identity |
| Convex `different-gopher-55` | — | legacy dev; unchanged |

Commit rules (AGENTS.md): operator's Git identity, no AI co-author trailers.

## Phase status

| Phase | Status | Basis |
| --- | --- | --- |
| 0 Security/runtime blockers | IN PROGRESS | hono 2.1.11 pin + TMPDIR launcher committed; CI green on `163decb`; independent hono-v2 and Codex-binary verification running |
| 1 Hosted control plane | IN PROGRESS | deployment and UI live; bootstrap vars set (this session); **owner Clerk sign-in pending** |
| 2 Mac worker admission | BLOCKED | needs Phase 1 bootstrap, then Project/Repository/Factory Version bindings |
| 3–8 | NOT RUN | critical path; preparation only |

## Corrections to earlier record

- The 2026-11-28 continuation said first-owner bootstrap variables were set on
  `adept-goldfish-756`. They were not present (only the two service variables).
  `MC_BOOTSTRAP_OWNER_SUBJECT` and `MC_BOOTSTRAP_TENANT_SLUG` were set this
  session (subject copied from the staging deployment, same Clerk issuer
  `dear-sunbird-98`; tenant slug matches the seeded tenant, zero operators).
- `~/.mission-control/qualification-20261128/worker.env` (mode 600) holds only
  the two service variables. `CONVEX_URL`, project/repository/Factory Version
  bindings and the accounting journal path are still to be added.
- Qualified Codex is pinned at `~/.mission-control/codex-0.146.0`; the shell
  `codex` on PATH is 0.163.0 and is not the qualified runtime.
- The qualification UI sits behind Vercel deployment protection (SSO) in front
  of the Clerk sign-in; both are intact.

## Workstreams (engineering agents)

| Agent | Package | Status |
| --- | --- | --- |
| Security & Governance | Phase 0: verify hono 2.x upgrade and Codex binary reference on `163decb` | running, read-only |
| Infrastructure & Cloud | Phase 5 prep: inventory existing sandbox/cloud worker work, Linux runtime qualification needs, hosting options | running, read-only |
| MyEve/Sofie Integration | Phase 6 prep: gap analysis vs required contract; contract 64 vs 72 divergence | running, read-only |

Findings are appended below when each agent reports; none are treated as
verified until reproduced or cited to source.

## Intervention ledger

| Category | Entries |
| --- | --- |
| Human owner | none yet after workload submission (no workload submitted) |
| External Claude | session 1: hono pin, readiness diagnostic, environment provisioning; session 2: bootstrap variable correction, this record |
| Factory-managed recovery / repair | none (no factory run) |
| Governance approvals pending | none yet |

## Blocker and smallest human action

**Owner Clerk sign-in** on the qualification UI (Clerk dev mode, email +
credential/code). Completes first-owner bootstrap. Everything in Phase 2+ that
needs authenticated admin access waits on it.

## Next executable actions

1. After sign-in: verify one operator row, then create the Project, Repository
   (`CODEX_WORKER_REPOSITORY_ID`), Factory Definition/Version and Execution
   Profile bindings in `adept-goldfish-756`.
2. Complete `worker.env` (names only in docs), launch via
   `scripts/factory-worker-launch.sh` with the 0.146.0 runtime, confirm
   registration, heartbeat and the Phase 2 negative tests.
3. Submit the to-do request through the canonical Mission intake (Phase 3).

## Scorecard

All mandatory items are NOT RUN or BLOCKED except dependency security (PASS on
`54a36ed`, audit gate 0 advisories) and Phase 0 CI (PASS on `163decb`).
Overall qualification: **not successful**.
