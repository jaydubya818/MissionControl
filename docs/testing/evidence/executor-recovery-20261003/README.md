# Executor exit recovery evidence

Base: main 4c58c26. Regression commit: b7d4365. Fixes GitHub issue #232.

Before the fix, three real subprocess regressions failed. Owned exits with
inherited pipes took 12,041 ms, 12,057 ms, and 17,038 ms to settle because the
execution timeout remained active after the parent exited. The last case
ignored SIGTERM and required the existing five-second SIGKILL escalation.

After the fix, the adapter records the owned exit, cancels its execution timer,
allows 250 ms to drain output, then terminates descendants holding pipes open.
It preserves exit status, captured output, and exactly-once process observers.
Escalation remains active until completion; remaining owned descendants are
killed even if they close their pipes before exiting.

## Verification

- Final orchestration suite: 765 passed, 11 skipped across 64 passing and
  3 skipped files; 19.85 seconds, exit code 0.
- Adapter coverage includes normal successful exit, failed exit, inherited
  pipes, ignored SIGTERM, closing pipes without exiting, real timeout,
  cancellation, output overflow, and exactly-once observer calls.
- Orchestration TypeScript and git diff --check passed.
- Tests use synthetic executables and real process groups. They do not call a
  model or mutate production. POSIX process-group cases skip on Windows.
- No UI or model-catalog changes. Saved primary-checkout edits remain intact.

[Verification retry review](retry-review.md) records the next recovery scope and
its missing integration evidence. Live factory qualification awaits an approved
work item, target repository, and spend limit from the operator.
