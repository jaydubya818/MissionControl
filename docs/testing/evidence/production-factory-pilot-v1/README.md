# Production Factory Pilot & Operational Qualification V1

## Decision: BLOCKED

Mission Control is not qualified for the requested production pilot milestone on this evidence set. Thirteen of fifteen governed executions reached independent verification and human acceptance. Two live exe.dev executions did not produce valid `factory-result/v1` output after bounded recovery, so the required 15/15 completion invariant was not met.

The result is fail-closed. Guarded Auto remained disabled, no autonomous publication or merge occurred, failed Attempts remain preserved, every allocated live sandbox was proven terminated, every observed Attempt credential was revoked, and the final exe.dev inventory was zero VMs.

## Fixed baseline

| Item | Value |
| --- | --- |
| Baseline / execution HEAD | `75981d8ae1bd49e235cc1478bac3d0f853fc717f` |
| `origin/main` at start | `75981d8ae1bd49e235cc1478bac3d0f853fc717f` |
| Convex runtime contract | `30` |
| Node | `v24.18.1` |
| pnpm | `9.0.0` |
| Codex CLI | `0.146.0` |
| Pilot interval | `2026-08-18T19:57:37.341Z` to `2026-08-18T20:59:58.406Z` |

## Operational result

| Measure | Observed |
| --- | --- |
| Workloads / repetitions | 5 classes × 3 independent repetitions |
| Governed executions | 15 |
| Successful / independently verified / accepted | 13 |
| Local Codex | 12/12 successful |
| Live exe.dev | 1/3 successful |
| Preserved Attempts | 29 total; 16 failed |
| First-pass and eventual reliability | 86.67% |
| Recovery effectiveness | 0/2 failed executions, low confidence |
| Cleanup | 100% scheduled-execution coverage; final live inventory 0 |
| Median / p95 cycle latency | 31,449 ms / 461,479 ms |
| Token telemetry | 933,271 input; 14,888 output; 12 samples |
| Model / infrastructure cost | `null` / `null` |
| Failure-injection coverage | 15/15, all fail-closed |
| Required governance actions | 36 |
| Avoidable execution-stage toil | 15, plus one browser-environment repair recorded separately |

## Exact blocker

`bug-fix-3` and `data-migration-3` each exhausted eight independent live Attempts. The latest Attempts terminated with executor exit code 0 but no valid structured result:

> Remote supervisor returned FAILED. Executor did not return valid factory-result/v1 JSON. Reading additional input from stdin...

The retry chain did not improve the outcome. This is why the strongest Factory Learning candidate is a proposal-only retry-policy experiment, not an automatic promotion. The next milestone is to qualify the remote Codex output boundary with a deterministic live fixture and a bounded retry policy. That milestone has not been started.

## Evidence index

- `run-results.json`: canonical 15-execution result and complete lineage.
- `initial-run-results.json`: immutable pre-recovery Attempt history.
- `reliability-scorecard.json`: value, samples, coverage, confidence, and limitations by dimension.
- `failure-injection-results.json`: 15 fail-closed fault cases and recovery proof.
- `routing-shadow-analysis.json`: advisory-only routing comparison; Guarded Auto applied count is zero.
- `factory-learning-output.json`: 23 signals, 6 clusters, 2 candidates, and one non-promoted experiment proposal.
- `human-intervention-analysis.json`: required governance separated from avoidable operational toil.
- `cost-latency-metrics.json`: measured latency/tokens with unknown cost preserved as `null`.
- `remote-sandbox-inventory.json`: live allocation cleanup and final absence proof.
- `browser-evidence.json`: real UI matrix, accessibility results, navigation/state checks, and screenshots.
- `exact-lineage.md`: execution/Attempt index into canonical evidence.
- `defect-log.md`: reproduced defects and bounded corrections.
- `../production-factory-pilot-v1-system-v2/automated-checks.json`: final composed qualification gate results.

Historical `system-factory-e2e-v1` and `system-factory-e2e-v2` evidence passed explicit byte-for-byte Git diff guards against the fixed baseline.
