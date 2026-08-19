# Qualification defect log

| Finding | Reproduction | Correction | Verification | Qualification impact |
| --- | --- | --- | --- | --- |
| Host Codex model cache incompatible with CLI 0.146.0 | CLI failed before inference because cached model metadata lacked `base_instructions` | Attempt-scoped ephemeral `CODEX_HOME` with existing auth only | All 12 local pilot executions passed | One avoidable environment repair |
| Remote supervisor admitted malformed executor output into an invalid outer bundle | Focused standalone supervisor regression | Normalize malformed output into a schema-valid fail-closed `FAILED` bundle | `remoteSandboxRuntime.test.ts` | Safety improved; did not restore remote reliability |
| Remote Codex omitted the structured output schema | Remote invocation inspection and live failure | Upload the frozen schema and pass `--output-schema` in the sandbox invocation | Adapter/provider tests pass | Necessary correction; insufficient for 15/15 |
| Remote supervisor only read the explicit output file | Focused Codex JSONL fixture | Fall back to the last Codex agent message when the output file is empty | Focused behavioral test passes | Necessary correction; insufficient for 15/15 |
| Mission validation IDs overflowed their UI card | Real light-theme desktop screenshot and DOM measurement | Add `min-w-0`, `break-words`, and `overflow-wrap:anywhere` containment | Regression test plus post-fix browser measurement | Browser defect closed |
| Git-backed worker tests timed out under composed parallel load | Reproduced in two composed qualification runs; passed in isolation | Increase only asynchronous worker/pid polling deadlines from 1s to bounded 5s | Final composed qualification passes | Test reliability defect closed |

The unresolved production blocker is the remote Codex structured-result boundary: two live workloads continued to exit 0 without a valid `factory-result/v1` document after all bounded corrections and retry Attempts.
