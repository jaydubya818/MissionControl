# Relay factory checkpoint — terminal WO-001 boundary

**Snapshot:** 2026-09-13 after verifier `kaup5omi`  
**Execution boundary:** Relay dispatch is stopped. No further WO-001 repair or retry was performed.  
**Canonical Mission:** Relay V1 `gs7zy3chm9k0ddv9gvqk5m2j018e9798`  
**Approved Plan:** revision 1 `gn7ncm1sc89j6cvj26zdjeavk98e9yph`

## Terminal outcome

WO-001 revision 4 is **not accepted**. Its canonical state is `BLOCKED`, approval is `APPROVED`, verification is `FAIL`, and the terminal verification verdict is `NOT_VERIFIED`. Acceptance is ineligible because `ASSERT-FOUNDATION` failed.

Final verifier `kaup5omi` (`ys70pr5f90ycvn60h5bjrja3ps8ebhkw`) evaluated exact candidate `394414750427c9ea12fe51e46a0b17007691209f` in a detached worktree. Verification independence passed. Five of nine mandatory evidence items passed:

- passed: negative-space constraints, verification authority, change budget, exact pnpm/lockfile policy, and no Mission Control/FDLC runtime coupling
- error: frozen offline install timed out after 600,000 ms
- failed: TypeScript typecheck, production build, and built health endpoint
- disproven requirements: `REQ-001`, `REQ-002`, and `REQ-009`

The source candidate, verifier worktree, receipts, and earlier Attempts remain preserved. The orchestration worker was stopped after this verdict; no further Relay WorkOrder was claimed.

## All 17 WorkOrders

`READY` is the persisted row state, not proof that predecessors have been accepted.

| WBS / class | WorkOrder ID | State | Approval / verification | Revision / latest run | Approved Plan r1 dependencies | Checkpoint class |
| --- | --- | --- | --- | --- | --- | --- |
| WO-001 Repository + Technical Foundation | `yh7e14257qs9wnyk5061aeha4n8e9x37` | `BLOCKED` | `APPROVED` / `FAIL` | r4; `kaup5omi` completed `NOT_VERIFIED` | none | minimum runnable slice; failed gate |
| WO-002 Domain Model + Database | `yh73636ca1j2q99thxdhbvz1n18e9dmn` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-001 | minimum runnable slice |
| WO-003 Authentication + Accounts | `yh7fpt474m9v3ad37ytmss57fd8e9pzd` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-001 | minimum runnable slice |
| WO-004 Agent Identity + Runtime Connections | `yh70wzbydednmzbfsa0161p4bd8e8kec` | `READY` | `APPROVED` / `PENDING` | r1; r2 pending; no run | WO-002 | minimum runnable slice |
| WO-005 Capability Registry + Permission Engine | `yh72nmh2kxgk19338jdgn5jghn8e89x4` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-004 | minimum runnable slice |
| WO-006 MCP Gateway + Dynamic Tool Projection | `yh73qz6g40fatksygx3xn6s7f98e9pdz` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-005 | minimum runnable slice |
| WO-007 Activity + Audit + Execution Receipts | `yh7cwhzycbxgd20ksdggmjqb3x8e84br` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-002 | minimum runnable slice |
| WO-008 Dashboard Shell + Navigation + Design System | `yh78v2ztq5kn418f58q03qp1sx8e9naj` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-001 | minimum runnable slice |
| WO-009 Memory Service + Memory UI | `yh794mswtnsebgfjgj4gqwx7sn8e9x8e` | `READY` | `APPROVED` / `PENDING` | r1; r2 pending; no run | WO-005 | deferrable from first runnable slice |
| WO-010 Connector Framework + First Connector | `yh72h0mmndtg5k67zx6pbtddwx8e95xf` | `READY` | `APPROVED` / `PENDING` | r1; r2 pending; no run | WO-005 | minimum runnable slice |
| WO-011 Sandbox Service | `yh7en0rcvswnjjpsknqpyjb2p18e9659` | `READY` | `APPROVED` / `PENDING` | r1; no run | WO-005 | deferrable from first runnable slice |
| WO-012 Performance Qualification | `yh758dmw5bmwfbz4rwsfgrqfax8e98jj` | `READY` | `NOT_REQUIRED` / `PENDING` | r1; no run | WO-006, WO-007, WO-008, WO-009, WO-010, WO-011 | later qualification |
| WO-013 Security Qualification | `yh72grptbxy89kemw14xph5ey98e9gpc` | `READY` | `NOT_REQUIRED` / `PENDING` | r1; r2 pending; no run | WO-005, WO-006, WO-007, WO-010 | later qualification |
| WO-014 Golden-Path E2E Qualification | `yh7d6aw10egcapgmydp3j2eyd18e9cnj` | `READY` | `NOT_REQUIRED` / `PENDING` | r1; no run | WO-006, WO-007, WO-008, WO-009, WO-010, WO-011, WO-012, WO-013 | final qualification |
| Legacy — Convert Apple Notes signals into governed factory intake | `yh77nb7p1r7zknwwg7d2zjyna98e95tt` | `DISPATCHED` | `APPROVED` / `PENDING` | r1; `factory-relay-1` pending | none | non-Mission; exclude from Relay delivery |
| Legacy — Wire Pi runtime receipt packets into factory read models | `yh73whcryd7qy9q2ne8esrgzks8e884k` | `IN_PROGRESS` | `APPROVED` / `STALE` | r1; `factory-relay-2` recorded running | legacy alias `notes-to-factory-intake` | non-Mission; worker stopped |
| Legacy — Add approval-gated external writeback preview | `yh79dn9emback0nsxws96hr58d8e9k13` | `DISPATCHED` | `APPROVED` / `PENDING` | r1; `factory-relay-3` pending | legacy alias `pi-runtime-receipts` | non-Mission; exclude from Relay delivery |

## What is implemented

### Accepted Relay repository

`/Users/jaywest/factory-pilot` main remains at `c55c80b11b30939d73487dcd66ccfbb68f211de1`. It contains only `LICENSE`, `README.md`, and `docs/RELAY-V1-SPEC.md`. There is no accepted runnable application.

### Preserved, unaccepted WO-001 candidate

Candidate `394414750427c9ea12fe51e46a0b17007691209f` is one commit ahead of main on `mc/aeha4n8e9x37-ojwqn3k9`. It changes 10 files, with 344 additions and 26 deletions:

- minimal Next.js App Router and placeholder root page
- typed `GET /api/health` returning `{ "ok": true }`
- `packageManager: pnpm@9.0.0`, complete lockfile, workspace file, and strict TypeScript configuration
- standalone README and no Mission Control/FDLC runtime dependency

This is WO-001-only foundation code. WO-002 through WO-014 have no execution run or canonical implementation evidence. None of the candidate code is merged to main.

### Mission Control corrections completed during the pilot

The uncommitted Mission Control worktree contains factory/operator corrections for:

- bounded Codex executor finalization and compatible model-cache handling
- dependency-preparation latency and exact approved Corepack command admission
- WorkOrder-scoped Kanban counts, revision approvals, and truthful Attempt status presentation
- immutable local-candidate verification continuation, source-lineage independence, and truthful `BLOCKED`/`FAIL` terminal projection

Focused tests passed before the final live run: 88 tests across six files, then 27 tests across the final three verification-recovery files; Convex TypeScript checking passed. These Mission Control changes are not committed.

## What is verified and accepted

- Approved/released: Relay Mission Plan revision 1.
- Approved for execution, not accepted: WO-001 revision 4.
- Verified on the exact candidate: five of nine mandatory evidence items and the separate-attempt independence boundary.
- Accepted Relay WorkOrders: **0 of 14**.
- Accepted Relay application code on main: **none**.

## What remains

- WO-001 remains a failed prerequisite; no retry is authorized by this checkpoint.
- WO-002 through WO-014 remain unimplemented and unverified.
- Pending r2 metadata exists for WO-004, WO-009, WO-010, and WO-013 but is not authoritative until approved/applied.
- The approved dependency graph must be followed if execution is later resumed.
- The three legacy demonstration WorkOrders remain outside Relay Mission progress.

## Dependency graph

Authoritative approved Plan r1 edges:

```text
WO-001 -> WO-002 -> WO-004 -> WO-005 -> WO-006
   |         |                    |----> WO-009
   |         |----> WO-007        |----> WO-010
   |----> WO-003                  |----> WO-011
   |----> WO-008

WO-006 + WO-007 + WO-008 + WO-009 + WO-010 + WO-011 -> WO-012
WO-005 + WO-006 + WO-007 + WO-010                     -> WO-013
WO-006 + WO-007 + WO-008 + WO-009 + WO-010 + WO-011
       + WO-012 + WO-013                              -> WO-014
```

Visible but unapplied dependency proposals:

- WO-004 r2 adds WO-003.
- WO-009 r2 adds WO-008.
- WO-010 r2 adds WO-003.
- WO-013 r2 adds Authentication and Sandbox to its qualification subject.

## Minimum runnable Relay vertical slice

The smallest existing-WBS slice is WO-001, WO-002, WO-003, WO-004, WO-005, WO-008, WO-007, WO-006, and WO-010. It is intended to prove: account -> agent/runtime -> capability grant -> operator shell -> authorized MCP tool -> one connector action -> auditable receipt.

Deferrable from that first runnable checkpoint: WO-009 Memory, WO-011 Sandbox, and qualification WO-012 through WO-014. They are not deferrable from the declared full V1 release. All three legacy WorkOrders are deferrable because they are not members of the Relay Mission.

## Current runnable instructions

Accepted main is not runnable. To inspect the unaccepted candidate without mutating any preserved worktree, use a disposable clone:

```bash
relay_run_root="$(mktemp -d /tmp/relay-foundation-3944147.XXXXXX)"
git clone --no-local /Users/jaywest/factory-pilot "$relay_run_root"
git -C "$relay_run_root" checkout --detach 394414750427c9ea12fe51e46a0b17007691209f
cd "$relay_run_root"
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsc --noEmit
corepack pnpm run build
corepack pnpm start
```

In another terminal:

```bash
curl --fail --silent http://127.0.0.1:3000/api/health
```

Expected response: `{ "ok": true }`. The root page displays `Relay is online.`. Prerequisites are Node `>=20.9.0` and Corepack-managed pnpm `9.0.0`. These instructions run the **unaccepted WO-001 candidate**, not Relay V1.

## Preserved evidence

- Relay repository: `/Users/jaywest/factory-pilot`
- Source candidate worktree: `/Users/jaywest/factory-pilot/.mission-control/worktrees/aeha4n8e9x37-ojwqn3k9`
- Final verifier worktree: `/Users/jaywest/factory-pilot/.mission-control/worktrees/verify-kaup5omi`
- Final verification run: `nh7wbsv4fnx16fdan6ajep8nzh8ea05n`
- Detailed runnable/code inventory: `.audit/relay-first-factory-run/relay-runnable-and-code-inventory.md`
- Factory lessons and improvement ledger: `.audit/relay-first-factory-run/lessons-and-improvements.md`
