# Governed Planning Agent hardening qualification

> Historical checkpoint: this document records the first hardening pass before GitHub App authority was available. The App gate was later resolved and the live path advanced through approved WorkOrders. The current authoritative verdict is [go-no-go.md](./go-no-go.md).

Date: 2026-08-27
Branch: `codex/governed-planning-agent-v1`
Decision: **NO-GO — live positive browser path remains blocked**

## Resolved implementation findings

| Finding | Result | Evidence |
|---|---|---|
| Repository-contained read-only execution | Resolved | Codex permission profile `mission-planner-contained` grants `:minimal` runtime reads plus the exact worktree, denies repository `.env` files, disables network, and runs with `--strict-config`. Adapter health executes a real allowed-read/outside-read/write probe before reporting READY. |
| Truthful planner identity | Resolved | New runs identify the executing built-in planner as `mission-planner/v1`; research and generation record their actual prompt version and SHA-256 digest. The approved Factory agent is retained separately as admission context. |
| One active run per Mission | Resolved | The public Convex mutation checks `QUEUED`, `RESEARCHING`, `GENERATING`, and `VALIDATING` through `by_mission_status` before insertion. Convex mutation serialization makes the check-and-insert transactional; the second request returns `ACTIVE_RUN_EXISTS`. |
| Durable phase receipts | Resolved | Research and generation execution receipts are appended idempotently as separate worker reports before phase validation. Final success is assembled only from the persisted receipts. Failed generation and later retries retain earlier research and failed-generation receipts. |
| Plan-bound versus unadopted run | Resolved in code and focused tests | The read model returns the run bound to the latest Plan separately from the latest unadopted run. The UI renders explicit `Bound to this Plan` and `Latest unadopted candidate` sections, and apply is allowed only with no Plan or a DRAFT Plan. |
| Exact-SHA downstream authority | Preserved | Existing Plan → WorkOrder → Task/Attempt → execution-manifest SHA inheritance and dispatch drift rejection remain green in the full test suite. |

## Repository containment proof

Command: `pnpm run qualify:planning-containment`

Result: **PASS**

```json
{
  "permissionProfile": "mission-planner-contained",
  "repositoryRead": "ALLOWED",
  "unrelatedHostRead": "DENIED",
  "repositorySecretRead": "DENIED",
  "repositoryWrite": "DENIED",
  "gitCommit": "DENIED",
  "gitPushPublication": "DENIED",
  "networkEgress": "DENIED",
  "governanceAuthority": "NONE",
  "controlPlaneCredentials": "ABSENT"
}
```

`CodexV1ExecutorAdapter.health()` also returned `READY` after the executable version, native digest, and live permission-profile probe passed.

## Browser evidence

Environment: local Convex `http://127.0.0.1:3210`; UI `http://localhost:5199`; viewport 1024×768 unless stated otherwise.

- Entering Mission detail at 1024px automatically closed the persistent chat dock. The `Open chat` control remained available and successfully reopened the dock.
- The controlled Mission Plan showed `Planning Agent — Current planning run`. Clicking `Generate Plan candidate` reached the real `missionPlanning:request` mutation and failed closed because the repository still has no active, fully ready SOFTWARE Factory.
- Backend corroboration after the click: `bound: null`, `latest: null`, `latestUnadopted: null`, `runs: []`, `events: []`.
- The approved controlled Plan rendered without the irrelevant feature-flag editing warning in dark and light themes.
- Axe WCAG 2 A/AA/2.2 AA: zero violations on the planning failure surface and the approved Plan surface.
- Browser page errors: zero. The only console error was the expected and UI-rendered failed-closed planning mutation.
- At 1440×900 the chat dock remained available and rendered normally when opened.

Screenshots:

- [1024px auto-collapsed chat](./hardening-browser/mission-plan-1024-chat-collapsed.png)
- [1024px user-reopened chat](./hardening-browser/mission-plan-1024-chat-reopened.png)
- [Planning request failed closed](./hardening-browser/planning-request-failed-closed-1024.png)
- [Approved Plan, dark](./hardening-browser/approved-plan-no-irrelevant-warning-1024.png)
- [Approved Plan, light](./hardening-browser/approved-plan-no-irrelevant-warning-1024-light.png)
- [Approved Plan at 1440px with chat](./hardening-browser/approved-plan-1440-chat-available-light.png)

## Automated qualification

| Command | Result |
|---|---|
| `pnpm run qualify:planning-containment` | PASS; all enforced filesystem, mutation, publication, network, authority, and credential checks passed. |
| `pnpm run typecheck` | PASS across 19 checked workspace projects, including UI and orchestration. |
| `pnpm run test` | PASS. UI 69 files / 312 tests; orchestration 28 passed files / 183 tests plus one opt-in integration skip; Convex 107 files / 780 tests; all other workspace suites passed. |
| `pnpm run ci:runtime-contract` | PASS; public contract remains correctly versioned v34. |
| `pnpm run release:security` | PASS; no critical/high production advisories, authorization baseline unchanged at 637, 2,605 tracked files clean in the secret scan. |
| `pnpm run smoke:orchestration-start` | PASS; built Node ESM orchestration artifact loaded. |
| PR `CI — Mission Control` | PASS for all nine jobs. Lint 2m24s; typecheck and E2E 2m40s; unit 2m18s; browser security/accessibility 1m29s; build 53s; release security 37s; smoke 18s; System Qualification V2 6m46s. Both Vercel deployments passed. |

## Blocking gate

The positive browser flow is still not runnable because the controlled repository has no verified GitHub App installation and the SOFTWARE Factory cannot activate. Planning admission correctly rejects before creating a run. Therefore RESEARCHING → GENERATING → candidate → adoption → human approval → WorkOrders cannot be claimed, and the internal pilot remains unstarted.

No Factory activation, planning run, candidate, Plan transition, WorkOrder, or Attempt was fabricated to bypass this gate.
