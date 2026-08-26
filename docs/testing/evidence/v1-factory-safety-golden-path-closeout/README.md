# V1 factory safety and golden-path closeout

Date: 2026-08-25
Original implementation baseline: `af534ae9b5045710ae4017c5502b4fabea6ad090`
Reconciled base: `b3dfceec6f4a888deae05abee22df559d26a9156`
Clean qualified implementation candidate: `4d7542b4ed40be72471397b2320dbb8d59585e82`
Implementation branch: `codex/v1-factory-safety-golden-path-closeout`

## Qualification status

The deterministic Mission-to-PR browser path passes from a fresh local Convex
backend and is installed as the blocking `mission-golden-path` CI job alongside
the existing blocking `browser-security` job.

The local proof covers:

- an approved immutable Plan bound to a WorkOrder;
- one governed child Task;
- a failed implementation Attempt followed by a recovered implementation
  Attempt with a new candidate SHA;
- an independently attributed verification Attempt;
- four durable evidence envelopes and two current criterion receipts;
- a GitHub App installation projection, draft PR projection, and exact-head
  passing quality-gate projection;
- refresh-stable Mission and WorkOrder views; and
- readiness for explicit human WorkOrder acceptance without performing that
  human-only action.

The clean-candidate-SHA release gate is complete. A detached worktree at
`4d7542b4ed40be72471397b2320dbb8d59585e82` started an empty local Convex
backend, loaded both deterministic seeds, and executed the browser proof 1/1.
GitHub CI must reproduce the same result on the final pull-request head before
merge.

## CI backend decision

| Option | Isolation | Secrets / recurring infrastructure | Decision |
| --- | --- | --- | --- |
| Convex preview deployment per PR | Strong | Requires deployment credentials and preview lifecycle management | Not selected for V1 closeout |
| Fresh local Convex backend per job | Strong; empty state for every job | No shared deployment, provider credentials, or recurring hosted project | **Selected** |
| Dedicated hosted test project | Shared unless reset carefully | Adds durable infrastructure, credentials, and cleanup ownership | Not selected |

The fresh local backend is the smallest deterministic option and adds no
recurring infrastructure or secrets. It starts on loopback, applies the schema,
loads the normal demo seed plus the qualification fixture, runs the browser
proof, and is discarded with the CI runner. The operator's approval of the
closeout plan authorizes this no-new-infrastructure choice; any future move to a
preview or dedicated deployment requires separate approval.

## Evidence boundary

The CI fixture is deliberately synthetic and local. PR `#999`, installation
`152563527`, SHAs, provider links, and quality-gate records are DEMO projections
stored in the isolated Convex backend. The test performs no GitHub/provider
writes and holds no provider credential. It proves Mission Control's durable
state, lineage, governance, refresh, and browser behavior; it does not claim a
new live GitHub pull request was created during this run.

Historical live-provider qualification remains recorded in the existing
`real-codex-github-pr-golden-path` evidence packet. Keeping the deterministic CI
proof separate avoids making a blocking repository gate depend on external
provider availability or mutable hosted state.

## Recorded browser evidence

- `mission-exact-current-evidence-card.png` — exact subject/plan lineage,
  recovered and verification attempts, four envelopes, GitHub App projection,
  and eligible quality gate after refresh.
- `work-order-review-ready.png` — evidence package is READY for human review.
- `work-order-exact-lineage.png` — base/head SHA, installation, attempt, and
  recovery summary.
- `work-order-evidence-and-ci.png` — current criteria, authoritative independent
  verification, draft PR, and exact-head CI.
- `work-order-recovery-lineage.png` — failed SHA, recovered SHA, attempt numbers,
  and lease-expiry recovery reason.
- `work-order-acceptance-ready.png` — explicit human acceptance is enabled but
  not executed by the anonymous deterministic fixture.

## Commands and observed result

```text
pnpm exec tsc -p convex/tsconfig.json --noEmit                    PASS
actionlint .github/workflows/ci.yml                               PASS
CI=true pnpm run ci:test:e2e:golden-path                         PASS (1/1)
pnpm --filter @mission-control/workflow-engine test             PASS (158; retired legacy executor removed)
pnpm --filter @mission-control/orchestration-server test        PASS (171; 1 environment integration skipped)
pnpm vitest run <focused Factory suites>                         PASS (68)
pnpm vitest run <focused authorization/runtime suites>           PASS (58 across 6 files)
pnpm run release:security                                       PASS (0 high/critical; scoped auth 0; no active retired consumers; no secrets)
pnpm run typecheck                                               PASS (all workspaces)
pnpm run ci:runtime-contract                                    PASS (v33; 62 accepted changes)
pnpm run smoke:pm2-runtime                                      PASS
pnpm run smoke:orchestration-start                              PASS
git diff --check                                                  PASS
```

The cold rehearsal created an empty local backend, deployed the candidate
functions, ran both seeds, exported the dynamic IDs, and let Playwright start
the UI exactly as the CI job does. The qualification seed also re-ran
idempotently against the same backend.
