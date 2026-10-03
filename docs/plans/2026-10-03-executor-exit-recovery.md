# Executor exit recovery

Base: 4c58c26. Follow-up: GitHub issue #232. User authorized recovering executor
shutdown, reviewing verification retries, and testing the factory flow. Keep
primary-checkout edits intact. No governed delivery IDs were supplied.

The owned process exit and output-pipe close are different events. Record the
actual exit code and signal on exit, cancel its execution deadline, and allow a
short pipe-drain interval. If descendants keep pipes open, terminate the owned
process group with the existing TERM/KILL grace period. Settle with the recorded
exit outcome, not a later timeout. Preserve captured output and exactly-once
lifecycle observers.

Reject the saved patch's immediate completion after SIGTERM: it cancels escalation
and can leave a descendant that ignores SIGTERM alive. Keep escalation until
pipes close or KILL occurs. If pipes close during termination, kill remaining
owned descendants before cleanup cancels escalation. No model catalog changes.

Verification: real synthetic executables for successful and failed exits,
inherited pipes, ignored SIGTERM, cancellation, execution timeout, and output
limits. Commit regression before implementation. Run orchestration tests and
typecheck, then required CI before merge. No paid model call for these tests.
