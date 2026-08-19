# Failure diagnostic preservation

The standalone supervisor now keeps stdout/stderr memory-bounded while retaining full byte counts and stream digests. Persisted tails are redacted before their 16 KiB truncation. Diagnostics are written atomically before the final result bundle; an injected crash after that checkpoint leaves diagnostics and no manufactured result.

| Terminal case | Classification / status | Evidence |
| --- | --- | --- |
| Supervisor crash after executor | `SUPERVISOR_EXITED_BEFORE_RESULT`; no success | Runtime test preserves the atomic diagnostic and observes no result file. |
| Model rate limit / transient provider failure | `RETRYABLE_EXECUTION` | Existing typed classifier and Remote Structured Result tests. |
| Unclassified process failure | `UNKNOWN / EXECUTOR_UNCLASSIFIED` | stderr is redacted and bounded; success is not manufactured. |
| Executor timeout | `RETRYABLE_EXECUTION / EXECUTOR_TIMEOUT`; `TIMED_OUT` | Process group receives TERM then KILL fallback; typed bundle remains bounded. |
| Operator cancellation | `UNKNOWN / ATTEMPT_CANCELED`; `CANCELED` | New process-group test observes exit 143, cancellation diagnostics, and a terminal result bundle. |
| Oversized stdout | `NON_RETRYABLE_RESULT / JSONL_TOO_LARGE` | Functional test emits 1,100,000 bytes, records exact byte/truncation counts and digest, and retains at most a 16 KiB redacted tail. |
| Secret spanning tail boundary | redacted | Existing regression proves redaction occurs before tail slicing. |

An uncatchable guest or provider failure before the first durable diagnostic write can still leave only host lifecycle evidence. That residual limitation is not represented as successful terminal evidence.
