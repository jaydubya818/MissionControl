# Production Factory Pilot V2
## Decision: BLOCKED

Mission Control does not meet the requested production-pilot qualification bar on this evidence. All 15 final-population executions returned valid terminal `factory-result/v1` records, but only 14/15 reached candidate, independent exact-candidate verification, exact-current eligibility, and authorized human acceptance. The comparable live Remote Sandbox subset improved from V1’s 1/3 to V2’s 2/3, below the required 3/3 minimum.

The result is fail closed. `security-policy-3` returned a canonical `BLOCKED` output-file result and no candidate. Exact criterion accounting classified it `NON_RETRYABLE_RESULT / RESULT_ACCEPTANCE_CONTEXT_INVALID`; automatic retry was denied. Guarded Auto remained disabled, no branch or pull request was published, no merge occurred, all three final-population Attempt credentials were revoked, all three exe.dev resources were proven absent, and final inventory was zero.

## Fixed baseline

| Item | Value |
| --- | --- |
| Exact merged `origin/main` | `db44819ec59e79cdd71ba9ed36fce8064a120af3` |
| Runtime contract | `30` |
| Pilot branch | `codex/production-factory-pilot-v2` |
| Final population run ID | `e1cbd5f5e9f8` |
| Node | `v24.18.1` |
| pnpm | `9.0.0` |
| Codex CLI | `0.146.0` |
| Guarded Auto | disabled; applied count `0` |

PR #120 and its Pilot V1 BLOCKED packet remain unchanged at historical head `604e2c482bc1b87d8a2cbca35f4c09ca13264e13`.

## Final population

| Measure | V1 | V2 |
| --- | ---: | ---: |
| Governed executions | 15 | 15 |
| Valid first-pass terminal structured results | 13 | 15 |
| Independently verified / accepted | 13 | 14 |
| Local Codex | 12/12 | 12/12 |
| Live Remote Sandbox | 1/3 | 2/3 |
| Attempts | 29 | 15 |
| Replacement Attempts | 16 | 0 |
| Failed Attempts | 16 | 1 |
| Non-retryable failures | not separately frozen | 1 |
| UNKNOWN failures | not separately frozen | 0 |
| Context misses | 0 | 0 |
| Review corrections | 0 | 0 |
| Final exe.dev inventory | 0 | 0 |

The two stopped pre-population probes are not included in the V2 denominator. They are preserved separately because they exposed V1 qualification-runner gaps versus the already-qualified production prompt: first the literal result contract was omitted, then criterion IDs were supplied without the production `[ID] title` mapping. Neither probe created an automatic retry, and neither changed Mission Control product code.

## Remote result boundary

- Final population: 3/3 valid first-pass terminal `factory-result/v1` records.
- Provenance: 3 `OUTPUT_FILE`, 0 JSONL reconstruction.
- Successful remote candidates: `bug-fix-3` and `data-migration-3`.
- Failed remote execution: `security-policy-3`, canonical status `BLOCKED`, no candidate, no verification, no acceptance.
- Retries: 0. The single failure was non-retryable and remained one preserved Attempt.
- Public run IDs, Convex-style workflow document IDs, manifest resource names, allocations, leases, candidates, and verification identities are recorded per Attempt in `remote-reliability.json` and `execution-results.json`.

JSONL recovery was not routinely required in the final population: it was used 0/3 times.

## Operational metrics

| Metric | Observation |
| --- | --- |
| Median local execution | 29,633.5 ms, 12/12 coverage |
| Median remote allocation | 3,404 ms, 3/3 remote coverage |
| Median remote readiness/start | 4,217 ms, 3/3 remote coverage |
| Median remote execution | 79,032 ms, 3/3 remote coverage |
| Median remote teardown | 3,362 ms, 3/3 remote coverage |
| Median / p95 total cycle | 33,609 ms / 195,622 ms |
| Verification | median 278.5 ms, 14/14 eligible candidates |
| Review projection | median 0 ms, 14/14 eligible candidates |
| Tokens | 1,187,316 input; 20,503 output; 15/15 coverage |
| Model cost | `null` |
| Provider cost | `null` |
| Retry success rate | `null` because no retry was authorized or observed |

Unknown cost remains `null`, never zero.

## Failure, routing, and learning

- Failure injection: 17/17 fail-closed cases, including stale worker/lease identity, cancellation, timeout, malformed/truncated/missing result, stale candidate/PR head, stale/failed verification, context miss, sandbox failure, cleanup failure simulation, unsupported capability, missing telemetry, and review-discovered defect.
- Shadow routing: advisory only, 0 automatic applications, 80% recommendation agreement. Local median cycle latency was lower; the advisor would also have avoided the selected remote tuple for the observed non-retryable failure. The sample is too small for Guarded Auto.
- Factory Learning: 8 signals, 6 clusters, 1 proposal-only candidate. The actual remote failure is a fail-closed deterministic-gate signal; nothing was promoted and acceptance authority remains false.
- Human intervention: 36 required governance decisions; zero avoidable final-population execution-stage recovery actions. The failed high-risk execution still requires a human rejection/next-step decision and is not counted as accepted.

## Authority and suitability

Canonical authority remains unchanged:

- Spec finalization is planning-ready only.
- Plan approval releases Work Orders.
- worker execution remains lease-bound.
- harnesses and Remote Sandbox retain no verification, publication, merge, or acceptance authority.
- Verification Factory remains independent and exact-current.
- Review Intelligence, Memory, Learning, and routing remain advisory.
- `workOrders.accept` remains the only canonical acceptance operation.

Mission Control is **not yet suitable for the requested human-governed production pilot workloads** on this evidence because the agreed 15/15 and remote 3/3 bars were not met. This does not negate the PR #121 result-boundary qualification: the final population achieved 15/15 valid terminal structured results and failed closed correctly.

## Evidence index

- `run-results.json`: canonical final-population dataset and decision.
- `execution-results.json`: full 15-execution lineage and Attempt evidence.
- `remote-reliability.json`: three remote samples, provenance, identities, results, candidates, and cleanup.
- `retry-data.json`: Attempt counts, retry classifications/decisions, and workload breakdown.
- `v1-v2-comparison.json`: immutable V1 summary versus final V2 population.
- `cost-latency-metrics.json`: operational latency, tokens, nullable costs, currentness, and recovery metrics.
- `failure-injection-results.json`: 17 fail-closed injected cases and regression-suite proof.
- `routing-shadow-analysis.json`: recommendation versus actual tuple; Guarded Auto applied count zero.
- `factory-learning-output.json`: signals, clusters, proposal-only candidate, and no acceptance authority.
- `human-intervention-analysis.json`: required governance versus avoidable toil.
- `final-vm-credential-proof.json`: credential revocation, resource absence, and zero final inventory.
- `workload-matrix.json`: five classes × three materially equivalent repetitions.
- `exact-lineage.md`: compact execution/Attempt/candidate/verification index.
- `defect-log.md`, `initial-probe-results.json`, `criterion-accounting-probe-results.json`: excluded runner-alignment probes and corrections.
