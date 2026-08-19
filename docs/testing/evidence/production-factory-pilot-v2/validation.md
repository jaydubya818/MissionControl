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

Fresh CI and Vercel results are recorded in the draft pull request created for this packet.
