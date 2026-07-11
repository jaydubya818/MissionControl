# Archive recommendation: Hermes-harness-with-missioncontrol

**Repo:** `/Users/jaywest/projects/Hermes-harness-with-missioncontrol` (`github.com/jaydubya818/hermes-harness-missioncontrol`)
**Status:** dormant since 2026-04-20, dirty working tree, worker stub only. **Decision (approved 2026-07-11): harvest-only. Do not merge or revive its standalone JSON control plane.**

## Why archived

It reimplements a "MissionControl" control plane (Hono services, JSON-file state, React console) that is not wired to either the Convex Mission Control or the Hermes runtime — its worker fabricates artifacts and its `HERMES_API_URL` config is consumed nowhere. The approved architecture routes all executor integration through the Pi bridge against the Convex backend.

## Patterns harvested (with attribution)

| Pattern | Where it landed |
|---|---|
| Replay-safe event ingestion keyed by stable `event_id` | Executor contract idempotency keys (`pib:state:…:<seq>`) |
| Artifact dedup by `artifact_id` | `recordExecutorArtifact` + `contentDrops.by_idempotency` |
| Execution envelope with `resource_budget` (token/artifact/output caps) | Candidate for the bridge dispatch envelope (PR 21b) |
| Worktree path-confinement guard (`relativeWithin`, worktree root) | Referenced for PR 21 delivery-plane recording |
| Schema-first OpenAPI contracts (TS + Python generation) | Noted for future cross-language contract work |

## Recommended action for Jay

Commit or stash the dirty files, then archive the GitHub repo (Settings → Archive). Local checkout can stay for reference. No automation will touch it.
