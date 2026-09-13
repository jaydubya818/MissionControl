# Native macOS Fab containment qualification

- Date: 2026-09-13
- Environment: macOS host, executed outside the nested Codex sandbox
- Command: `env -u CODEX_SANDBOX pnpm --filter @mission-control/orchestration-server exec vitest run src/__tests__/factoryAttemptWorker.test.ts`
- Result: 1 test file passed; 39 tests passed; 0 failed; 0 skipped
- Duration: 16.53 seconds
- Containment tests were not weakened or modified for this run.
