# Customer governed-planning demo runbook

Target: Monday customer demonstration
Workspace: Software Factory Demo (`hx7pph7fzd91jhhgdhr1xh94g18d9qx2`)
Repository: `jaydubya818/MissionControl`
Mission: Planning Agent Browser Verification (`z97914e3pxmw9pscxm12jcw2rd8d9jyr`)

Current decision (2026-08-30): **GO for the governed planning and fail-closed
execution story; NO-GO for a full implementation-to-PR claim.** The single
final authorized implementation Attempt is terminal without a candidate or
independent Verification Subject.

## Demo claim

Mission Control turns a human-owned Mission into an exact-revision,
repository-researched Plan candidate, preserves the human submission and
approval boundaries, releases bounded WorkOrders, and admits implementation
only through a frozen Factory, explicit decisions, a clean canonical worker,
and independent evidence.

Do not describe the product as autonomous merge or deployment. Planning,
implementation, verification, publication, acceptance, merge, and deployment
remain separate authorities.

## Preflight

Run this from the feature worktree used for the qualification:

```bash
cd /Users/jaywest/.codex/worktrees/a037/MissionControl
git status --short
git rev-parse HEAD
pnpm --filter mission-control-ui typecheck
```

Use the existing local Convex data. Do **not** run the force seed: it can replace
the live qualification narrative and record identities needed below.

Confirm before opening the meeting:

- `http://localhost:5199` loads from this checkout with no page or request errors.
- Factory v3 `sh7ahq69kg6vzb0yykkz9fydas8dcw3v` / `factory-v1-746c28c5` is active.
- Its current readiness assessment is `PASS` with 16 of 16 checks verified.
- Refreshed assessment `t97c1jvvbvnkatqh7w5zdpzz1s8dekhc` remains valid
  through Monday 2026-08-31 11:11 PDT.
- Host `planning-pilot-local` is `READY`, clean, and advertises the exact v3 binding.
- The implementation WorkOrder is on its current approved revision.
- No implementation or verification Attempt is unexpectedly active.
- The latest terminal Attempt, receipts, and pull request state match the claim used in the talk track.
- Current worker `planning-pilot-local` reports `READY`, clean, the current
  feature-branch HEAD, and zero active runs.

Open these tabs before screen sharing:

1. [Mission Plan](http://localhost:5199/v2/missions/z97914e3pxmw9pscxm12jcw2rd8d9jyr?workspace=hx7pph7fzd91jhhgdhr1xh94g18d9qx2)
2. [Implementation WorkOrder](http://localhost:5199/v2/control-work-orders?workOrder=s57xr6201qh1wt83ca7y9v09dh8d87wj&workspace=hx7pph7fzd91jhhgdhr1xh94g18d9qx2)
3. [Decision Center](http://localhost:5199/v2/control-approvals?workspace=hx7pph7fzd91jhhgdhr1xh94g18d9qx2)
4. Settings → Workspaces & Repositories → Factory configuration

## Ten-minute walkthrough

### 1. Start with intent, not agents (1 minute)

Open the Mission and show the finalized Specification and Constitution lineage.

Say: “The human owns intent and constraints. The agent cannot start from an
unfinalized brief or silently decide its own authority.”

### 2. Show the researched Plan candidate (2 minutes)

Open the Plan tab and the successful planning run
`yn71gwer0h1jrdy257n0c9cdq18d9dz6`. Point out:

- exact repository SHA `470057334800c7cddfc268b3f26d5ef3fc632088`;
- 9 inspected files and 26 server-validated citations;
- research digest `sha256:77857e509ab16db0bc4b57fe13470c5840f90a55fb4500f37885c197a9b1f90c`;
- immutable candidate digest `sha256:08119091e4979201aced72e9b5c83d6260999937a9a500f98f99a4012da8f736`;
- the candidate is advisory until a human adopts it into a Draft.

Say: “The important unit is not chat output. It is a durable candidate with
source citations and immutable lineage.”

### 3. Show the human control points (1 minute)

Show that candidate adoption created a Draft, submission created a Proposed
Plan, and a distinct human approval released the WorkOrders. Point out that
none of those transitions grants execution, publication, merge, deployment,
or acceptance authority.

### 4. Show the executable contract (2 minutes)

Open the implementation WorkOrder and show:

- current specification revision and revision history;
- CRITICAL risk and explicit approvals;
- exact allowed and denied paths;
- cumulative WorkOrder cost authorization and per-attempt Factory cap;
- exact Planning SHA inherited from the approved Plan;
- acceptance criteria mapped to independent evidence.

Say: “This is where prose becomes an enforceable execution contract. If the
machine-readable scope disagrees with the request, execution stops.”

### 5. Show Factory admission (1 minute)

In Settings, show Factory v3, its frozen workflow, model route, Codex harness,
three repository scopes, policy, verifier, recovery boundary, and 16-of-16
readiness result.

Say: “A ready worker is necessary but not sufficient. The exact WorkOrder is
revalidated against this frozen tuple again at dispatch.”

### 6. Show the Attempt and evidence (2 minutes)

Return to the WorkOrder and open the latest implementation Attempt. Show its
Task attempt number, exact base SHA, isolated branch/worktree, lease, Factory
version, scope receipt, step timeline, changed-file audit, and terminal state.

If the implementation and independent verification are complete, continue to
the exact candidate, requirement-linked receipts, Verification Subject, and
controlled pull request. State explicitly that merge and deployment were not
authorized.

If they are not complete, use the fallback wording below and stop before any
claim of downstream success.

### 7. Close on trust (1 minute)

Say: “The product is designed to make safe autonomy boring: every transition
has an owner, every run has a bounded contract, and every claim has retained
evidence.”

## Do not click during the customer demo

- `Seed demo` or any force-seed command.
- `Generate new candidate` on the already-approved qualification Mission.
- `Dispatch` or `Retry` unless the run has been rehearsed from an equivalent clean state.
- `Accept WorkOrder`, merge, deploy, waive, or supersede.
- Any control that would mutate the evidence package being presented.

## Fallbacks

### Local UI or worker unavailable

Use the retained browser evidence in `live-browser/`, then show
`live-planning-proof.md`, `revision-chain.md`, and the UI operation ledger.
Be explicit that these are retained qualification records, not a live run.

### Downstream implementation not complete

Say: “The planning-through-release path is live-proven. We then revised the
scope and budget through explicit approvals and ran the real Factory. The final
Attempt stopped because its isolated worktree lacked the frozen dependency
graph needed to execute verification. Mission Control preserved the terminal
Attempt instead of turning partial code into a candidate.”

Then show run `gq16ag6e`, its exact base SHA, isolated branch, real executor
events, eight preserved in-scope worktree changes, revision-3 approvals,
Factory v3 readiness, and the explicit blocker. Explain that control-plane
commit `7344b42` moves offline frozen dependency preparation before the model
boundary and passes qualification, but it cannot rewrite the terminal Attempt.
Do not present a synthetic candidate, verification receipt, or Factory-created
pull request. PR #139 is bootstrap feature work and must be described as such.

### Browser state becomes confusing

Reload the current route once. If the same record does not return, switch to
the prepared tabs and retained screenshots. Do not re-seed during the meeting.

## Final go/no-go on Sunday

Current result: **NO-GO for the full end-to-end customer claim.**

Full end-to-end customer claim is **GO** only when all of these are true:

- the latest implementation Attempt completed on the current WorkOrder revision;
- its candidate SHA is bound to the exact approved planning base;
- the independent verification Attempt passed the frozen contract;
- requirement-linked receipts and the Verification Subject are current;
- any pull request was published only after its separate human checkpoint;
- the worktree is clean and the complete browser path has been rehearsed once;
- merge, deployment, waiver, and acceptance remain unconsumed unless separately authorized.

Otherwise the demo is a truthful **planning-to-governed-dispatch** walkthrough,
not a full implementation-to-PR claim.
