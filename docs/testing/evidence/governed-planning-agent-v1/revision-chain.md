# Persisted revision chain

Date: 2026-08-30
Mission: `z97914e3pxmw9pscxm12jcw2rd8d9jyr`

## Live values

| Stage | Persisted identity | Exact repository SHA |
|---|---|---|
| Planning admission | Planning Run `yn71gwer0h1jrdy257n0c9cdq18d9dz6` | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Validated candidate | Candidate digest `sha256:08119091e4979201aced72e9b5c83d6260999937a9a500f98f99a4012da8f736` on the same run | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Human-approved Plan basis | Plan `ys7at6f5rkhgwd4z36e9mr2jfh8d866g`, revision 1 | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Implementation WorkOrder basis | WorkOrder `s57xr6201qh1wt83ca7y9v09dh8d87wj` | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Validator WorkOrder basis | WorkOrder `s57tz4nvwvja0ktgzefjsh8ytd8d9fdm` | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Task basis | Task `ph7h5vq1043kms52c2r52kvjed8ddswr`, authority revision 3 | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Final Attempt basis | Run `gq16ag6e`, WorkflowRun `sh7tfppxgpabn1cbesnd6j43318de6b2`, Task Attempt 3 | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Execution Manifest `repository.baseSha` | `sha256:e78bfcc6d8d297f880a43108c3579966f82e72b10c400df76332d2b4a6e1ceff` | `470057334800c7cddfc268b3f26d5ef3fc632088` |
| Immutable execution candidate | Not created | Not available |
| Verification Subject | Not created | Not available |
| Factory-controlled PR head | Not created | Not available |

The live same-SHA chain is therefore proven through Task, Attempt, and frozen
execution manifest. It stops before an immutable candidate commit and remains
insufficient for GO under the qualification directive. Pull request #139 is
the bootstrap feature branch and is not attributed to this terminal Attempt.

## Final Attempt boundary

Revision 3 preserved the exact code scope and raised only the cumulative
WorkOrder cap from $24 to $48. Four fresh approvals authorized one final
Factory v3 Attempt capped at $24. Run `gq16ag6e` claimed the exact frozen tuple
and invoked the real Codex adapter in isolated branch
`mc/9v09dh8d87wj-gq16ag6e`.

The harness returned `BLOCKED` after writing eight in-scope files because the
linked worktree did not contain the pnpm dependency graph required to run full
typechecking and the independent browser command. Those uncommitted changes
are preserved as failure evidence. No candidate SHA, tree SHA, Verification
Subject, verifier Attempt, publication permit, or pull request lineage exists.

Control-plane commit `7344b42` fixes the pre-executor defect for future runs by
preparing builder and verifier dependencies offline from the frozen lockfile,
with lifecycle scripts disabled and Git source state required to remain
unchanged. It does not mutate or upgrade the terminal Attempt.

## Dispatch boundary

The browser dispatch request for implementation WorkOrder `s57xr6201qh1wt83ca7y9v09dh8d87wj` persisted routing decision `zh7dqvsgbw0h0sj6j6wxspqmed8d9typ` with status `EXHAUSTED`. The only candidate tuple was:

- Factory version `sh7fwgwkpkbwqawvarekb7r5eh8d8vh7`
- Factory digest `factory-v1-d2b4fdf9`
- Harness `codex/v1`
- Model `openai/gpt-5.6-sol`
- Backend `persistent-worker`
- Factory risk boundary `YELLOW`

It was rejected with three hard codes:

- `MODEL_NOT_APPROVED`: the exact route qualification is scoped to `MISSION_PLANNING`/`YELLOW`, not this `CRITICAL` implementation WorkOrder.
- `RISK_BOUNDARY_EXCEEDED`: `CRITICAL` maps to execution tier `RED`, above the frozen Factory `YELLOW` boundary.
- `BUDGET_ESTIMATE_UNKNOWN`: the admitted ChatGPT-authenticated route exposes no execution cost estimate while the Factory has a hard cost budget.

The UI showed the denial and `workOrders:get` continued to return zero child Tasks and zero execution runs. No partial Attempt or manifest exists.

## Drift proof

No separate live SHA-drift scenario was run after dispatch stopped at the stronger model-authority gate. Deterministic test `convex/__tests__/executionManifest.test.ts` proves that a manifest built with approved planning SHA `A` and execution base SHA `B` throws `does not match the approved Plan planning repository SHA`. The production dispatch code also returns `planning-revision-drift` when the current canonical host base differs from `workOrder.planningRepositorySha`.

This evidence class is deterministic, not live browser proof.
