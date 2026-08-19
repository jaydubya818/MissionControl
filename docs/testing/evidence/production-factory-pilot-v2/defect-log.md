# Pilot V2 defect log

## V2-PROBE-001 — V1 runner prompt omitted the qualified result contract

- Scope: qualification tooling only; no Mission Control product code changed.
- Reproduction: the first live `bug-fix-3` probe used the materially equivalent V1 workload prompt plus the V1 runner’s short result instruction. Codex exited zero, but the canonical output file was `SCHEMA_INVALID`; JSONL contained one terminal completion and no valid candidate.
- Classification: `NON_RETRYABLE_RESULT / RESULT_SCHEMA_INVALID / RESULT_RECONSTRUCTION`.
- Retry decision: `FAILURE_CLASS_NOT_RETRYABLE`; no automatic or replacement Attempt was created.
- Safety: Attempt credential revoked, resource absence proven, final exe.dev inventory zero.
- Root cause: the V1 runner enumerated result fields but omitted the required literal `factory-result/v1` schema value, exact uppercase status values, exact criterion accounting, and array-shape rules already frozen in PR #121’s qualified runner.
- Correction: reuse the canonical qualified result instruction verbatim for the fresh Pilot V2 run. This changes only the pilot runner and does not relax schema validation or retry policy.
- Preserved evidence: `initial-probe-results.json`.

## V2-PROBE-002 — V1 runner omitted production criterion mappings

- Scope: qualification tooling only; no Mission Control product code changed.
- Reproduction: after the schema instruction was corrected, the fresh `bug-fix-3` probe produced a valid canonical `OUTPUT_FILE` with status `COMPLETED`, but reported only `BUG-001` and omitted `BUG-002`.
- Classification: `NON_RETRYABLE_RESULT / RESULT_ACCEPTANCE_CONTEXT_INVALID / RESULT_VALIDATION`.
- Retry decision: `FAILURE_CLASS_NOT_RETRYABLE`; no automatic or replacement Attempt was created.
- Safety: Attempt credential revoked, resource absence proven, final exe.dev inventory zero.
- Root cause: the V1 runner supplied a bare ID list. The real production prompt compiler supplies `[criterion ID] criterion title` mappings, so the probe was not yet production-comparable.
- Correction: include the existing production criterion mapping shape in the pilot prompt. Workload code, tests, scope, backend, model, result schema, and retry policy remain unchanged.
- Preserved evidence: `criterion-accounting-probe-results.json`.
