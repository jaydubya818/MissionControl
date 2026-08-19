# Validation

## Local qualification

Validated from branch `codex/production-factory-pilot-v2` at baseline `db44819ec59e79cdd71ba9ed36fce8064a120af3` on 2026-08-18 (America/Los_Angeles).

| Check | Result |
| --- | --- |
| Pilot V2 finalization | Expected exit `1`: evidence frozen with decision `BLOCKED` after 15 governed executions |
| Pilot evidence-contract tests | Pass: 5/5 |
| Full Factory qualification (`pnpm run qualify:factory`) | Pass |
| Full repository tests | Pass; included in Factory qualification |
| TypeScript and lint | Pass; included in Factory qualification |
| Skill lint | Pass: 10 skills, 0 errors, 0 warnings, average 100/100 |
| Runtime-contract guard | Pass: no public validator changes across 915 functions |
| Production build | Pass |
| Orchestration startup smoke | Pass |
| Dependency/security gates | Pass: production critical/high 0; accepted advisories unchanged |
| Repository secret scan | Pass before staging; repeated after staging |
| Git whitespace integrity | Pass |
| Historical evidence integrity | Pass: Pilot V1 and System Qualification V1/V2 unchanged |

The nonzero Pilot V2 finalization exit is the intended fail-closed behavior for a dataset that does not meet its frozen success bar. It is not a harness crash or infrastructure failure.

## Hosted qualification

Draft PR #122 received fresh hosted evidence on commit `9800325245b69e15d12cd3cb0842228ff8a65ded`:

- CI run `32225382868`: TypeScript, build, System Qualification V2, unit tests, lint/runtime guard, release security, smoke, and browser security/accessibility passed.
- The non-blocking E2E job never left `playwright install --with-deps chromium` on two separate runners. The first stalled attempt was cancelled after 17 minutes; the targeted retry was cancelled after 15 minutes. No E2E test ran or failed. The immediately preceding main run had passed the same job, and deterministic hosted browser gates plus local full qualification passed for this packet.
- Both Vercel deployments passed: `mission-control-mission-control-ui/9amjphhsVLZRw71PZLNPswNCTHTj` and `mission-control-ui/78Xr9uWBiK2TNwDx2s8p9Xap8tCB`.

The cancelled non-blocking E2E installer is retained as an operational hosted-runner limitation. It does not change the pilot decision, which was already blocked by the frozen remote reliability bar.
