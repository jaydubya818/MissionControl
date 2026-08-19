# Exact execution and Attempt lineage

Every successful row carries Constitution → Spec revision/digest → approved Plan → Quality Contract → WorkOrder revision → Factory Version → Context Package → worker/lease → Attempt → exact candidate/tree SHA → independent Verification Attempt → evidence envelopes → Quality Gate → deterministic PR-lineage fixture → advisory review → human `workOrders.accept` fixture lineage in `run-results.json`.

Failed remote rows stop before verification, Quality Gate, review, and acceptance. Their missing downstream lineage is explicit rather than synthesized.

| Execution | Class | Backend | Attempts | First pass | Eventual | Verification | Human acceptance |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `bug-fix-1` | Bug fix | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `bug-fix-2` | Bug fix | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `bug-fix-3` | Live exe.dev | Remote Sandbox | 8 | No | No | NOT_VERIFIED | No |
| `feature-1` | Feature | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `feature-2` | Feature | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `feature-3` | Feature | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `refactor-1` | Refactor | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `refactor-2` | Refactor | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `refactor-3` | Refactor | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `security-policy-1` | Security/policy | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `security-policy-2` | Security/policy | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `security-policy-3` | Security/policy | Live exe.dev | 1 | Yes | Yes | VERIFIED | Yes |
| `data-migration-1` | Data/schema migration | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `data-migration-2` | Data/schema migration | Local Codex | 1 | Yes | Yes | VERIFIED | Yes |
| `data-migration-3` | Data/schema migration | Live exe.dev | 8 | No | No | NOT_VERIFIED | No |

The failed chains are preserved as `attempt-bug-fix-3-1` through `attempt-bug-fix-3-8` and `attempt-data-migration-3-1` through `attempt-data-migration-3-8`. Successful executions preserve one independent Attempt each. The canonical JSON contains all IDs, digests, SHAs, evidence envelopes, retry parents, failure reasons, sandbox events, and cleanup records.
