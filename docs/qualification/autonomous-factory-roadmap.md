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
| 0 Security/runtime blockers | PASS | exact candidate `d0d0282`: 15/15 CI checks pass; hono 2.1.11 independently verified; Codex launcher defect fixed and re-verified (below). Known gaps, not blockers: no repo test binds `startServer()`, MCP transport over HTTP not exercised, Vercel Node 26.x setting unverified |
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
- The continuation record's "adapter READY under `env -i`" was not reproducible
  with the committed launcher: nothing set `CODEX_EXECUTABLE`, so the adapter fell
  back to `codex` on PATH (an unqualified install under a service manager).
  Reproduced FAIL, fixed, and re-verified below.
- The qualification UI sits behind Vercel deployment protection (SSO) in front
  of the Clerk sign-in; both are intact.

## Workstreams (engineering agents)

| Agent | Package | Status |
| --- | --- | --- |
| Security & Governance | Phase 0: verify hono 2.x upgrade and Codex binary reference on `163decb` | done; findings below |
| Infrastructure & Cloud | Phase 5 prep: inventory existing sandbox/cloud worker work, Linux runtime qualification needs, hosting options | done; findings below |
| MyEve/Sofie Integration | Phase 6 prep: gap analysis vs required contract; contract 64 vs 72 divergence | done; findings below |

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

All mandatory items are NOT RUN or BLOCKED except dependency security, runtime
compatibility, security regression checks and required CI, which PASS on
`d0d0282` (15/15 checks; audit gate 0 advisories).
Overall qualification: **not successful**.

## Phase 6 preparation findings (Integration agent, read-only)

Verified by the principal against source: PR #248 (`8b3e85b`) contains no
`sofieExecutionPermits` code. The permit/admission server (`sofieExecutionPermits`,
`sofieFactoryResults`, `sofiePermitControlDelivery`, `sofieConfirmations`) exists
only on the hosted line, branch `fix/hosted-capability-policy-owner-scope`
(`12e636d`, contract 64, base of PR #250). MyEve's consumer CI pins MC `f9bcd0d`,
which is not an ancestor of #248. There are therefore three MC lines, and #248
alone cannot serve MyEve's permit-gated execution path.

Reported by the agent, not yet reproduced (treat as leads):
- Contract numbers collide: #251 and the hosted line each bumped 63→64; #248 is at 72.
  Overlapping changed files: #248×#251 24, #248×hosted 105, #251×hosted 21.
- MyEve keeps its own Work scheduler (`lib/engineering/worker.ts`,
  `factory-work-driver.ts`) and a legacy path for unenrolled owners; MC also runs
  `factoryAttemptWorker.ts`. This conflicts with the single-scheduler boundary.
- Gaps still open: random `commandId` per call (no durable correlation record),
  poll-only status events, one-way (MC→MyEve) cancel, fixed project by env with no
  discovery, single agent per permit, no branch/worktree readback, no in-place
  resume, no agent-to-agent handoff, no live-provider run (deterministic mode is
  loopback-only). Seven of nine MyEve integration tests skip without Postgres.
- Not read: MyEve `1efc7071` (MyEveBot PR #112) is in no local checkout.

Proposed sequence (decision belongs to the owner and Codex, since #248 is Codex's
line): choose one canonical MC base; resolve the overlap in one sequenced merge
and set the contract once (max+1); land #251 on top; re-pin the MyEve consumer CI
to the merged SHA and make the Postgres tests non-skippable; then close the
correlation, cancel and event gaps. No MC-line merge is performed without owner
authorization.

## Phase 5 preparation findings (Infrastructure agent, read-only)

Verified by the principal: `CODEX_PINNED_NATIVE_DIGESTS` in
`apps/orchestration-server/src/codexExecutorAdapter.ts` pins only
`darwin-arm64`, and the native path resolver is darwin-only, so a Linux worker
reports the runtime UNAVAILABLE. A Mac digest or admission record must not be
reused for Linux.

Reported by the agent, not yet reproduced:
- Existing cloud evidence: exe.dev Remote Sandbox (per-Attempt disposable VM) was
  certified with limitations on 2026-08-17 (one real Codex Attempt; egress
  unrestricted/DEGRADED; Codex via ephemeral `npx`, not a pinned image; per-VM
  cost unknown; stays Preview and globally disabled). Hardening v1 decision is
  HOLD (live gate 0 of 3 first pass; image identity did not match the requested
  digest; no provider-enforced egress). Docker provider is offline-only and
  NOT_QUALIFIED. OpenSandbox spikes are HOLD with no code. The persistent worker
  is proven only on darwin-arm64.
- To qualify a Linux worker the repo needs: a `linux-x64` digest entry and path
  resolver; a digest-bound CONTAINER_IMAGE runtime artifact and Execution Profile
  (with SBOM, provenance, egress-policy and evidence digests); a Linux
  containment probe under namespaces; a reviewed pinned Codex image. A
  linux-amd64 Codex 0.146.0 build exists under `infra/remote-sandbox`.
- Authorization observed on the Mac (names only): `gh` and `vercel` authenticated;
  `gcloud` authenticated with no project set; `aws` has only `fdlc-*` Bedrock
  qualification profiles (restricted to that qualification); `railway` not
  authorized; Docker Desktop daemon unhealthy (HTTP 500); `fly`/`az` absent.
- Vercel functions are not recommended for long-running agent execution; no
  evidence supports it.

Hosting options, ranked by the agent: (1) exe.dev, already paid, only cloud target
with live evidence, with the control worker staying on the Mac and exe.dev
executing Attempts; (2) a GCP VM, which needs a named project and billing cap;
(3) the Mac under launchd as a bridge, which does not satisfy Phase 5.

**Pending owner decision (spend/authority):** choosing the hosting option and
authorizing any VM allocation or live canary. The repo requires explicit Product
Owner approval for that, and the program directive forbids new paid commitments
without it. Phase 5 qualification stays NOT RUN until then.

## Phase 0 verification results (Security agent, reproduced by principal where noted)

| Check | Result | Evidence |
| --- | --- | --- |
| hono node-server 2.1.11 engine range (`>=20`) vs CI Node 20/24 and local 24 | PASS | package engines; `ci.yml`. Vercel Node 26.x not set in repo: UNVERIFIED (Vercel builds only the UI) |
| API call sites | PASS | only `serve()` in `apps/orchestration-server/src/index.ts`; no `serveStatic`; `serve`/`Options` types unchanged 1.19.19→2.1.11; `tsc --noEmit` clean |
| Startup, SSE, upgrade, close, auth 401/200, error 500 | PASS (throwaway harness) | identical results on 1.19.19 and 2.1.11. Gap: no repo test binds `startServer()`; real MCP transport over HTTP not exercised |
| Targeted vitest (11 files) | PASS | 137 passed, 1 skipped, 0 failed |
| Dependency audit and `release:security` | PASS | production and all scopes 0/0/0/0; ratchet 591 vs baseline 592; secret scan and docs check pass |
| Lockfile | PASS | only `@hono/node-server@2.1.11` and `hono@4.13.18` |
| Codex runtime through the real launcher | FIXED | see below |

Codex wiring defect: `scripts/factory-worker-launch.sh` did not set
`CODEX_EXECUTABLE`. With a service-manager-style environment
(`env -i` plus a minimal PATH) and the Codex worker enabled, `factory:readiness`
reported `codex-runtime` FAIL. The launcher now defaults `CODEX_EXECUTABLE` to the
pinned 0.146.0 native binary on macOS arm64 when the variable is unset; an explicit
value always wins and the adapter still verifies version and digest. Re-run:
`codex-runtime` PASS with the default; FAIL when `CODEX_EXECUTABLE` points to the
unqualified Homebrew binary (the gate is not weakened). Note
`scripts/codex-factory-worker.ts` defaults to a nonexistent
`/Applications/Codex.app/...` path; it is not on the launcher path. Follow-ups, not
done: raise root `engines` to `>=20`; add a startup test that binds the listener.
