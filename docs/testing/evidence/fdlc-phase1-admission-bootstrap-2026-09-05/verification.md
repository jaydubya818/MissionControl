# Offline admission verification

Source HEAD: f82fe1d98b156278c4fa0c0e2032008e2f010f39.
2026-09-05 07:17 UTC.

Command:

```sh
pnpm --filter @mission-control/orchestration-server exec vitest run src/__tests__/codexExecutorAdapter.test.ts -t 'fails closed instead|rejects executable drift|passes only an explicit|uses a strict workspace'
```

Result: one file passed; 4 tests passed, 10 skipped; 546 ms.
No model invocation. The drift test uses an unqualified synthetic executable and
asserts the mocked harness runner is never called. This is not a live host or
Factory qualification receipt. Untested candidate-tuple controls remain blocked.

`probe.py` performs exact package SHA-512 and native SHA-256 comparisons,
non-model `--version` and sandbox diagnostics with synthetic files. The mutation
sandbox diagnostic exits before executing because the CLI requires a permission
profile. The read-only planning diagnostic executes and reports allowed read,
denied outside read, denied child outside read and denied workspace write.
Do not interpret exit 0 of the reporting script as overall containment success.
The raw JSON retains command-level exit codes, stderr and cleanup status.
