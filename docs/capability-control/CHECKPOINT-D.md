# Checkpoint D native admission candidate

Status: PARTIAL. Qualification installation only. Not release-qualified.

Mission start requires enterprise.missions. WorkOrder dispatch requires enterprise.fleet. Both require the canonical dependency closure, exact authenticated native owner, two signed policy proofs, current transaction-local source and Relay fences, a native admission snapshot digest, and bounded budget evidence. Existing backend authorization, runtime qualification and accounting checks remain in place. A Mission preference never creates paid execution authority.

The /capability-control/fence HTTP action verifies the source and prepares a signed acknowledgment. The internal mutation independently verifies both messages and stores the fence and ACK atomically. The HTTP action responds only after that commit. Duplicate delivery returns the persisted ACK. Older or conflicting versions fail closed. A durable enrolled-owner marker prevents removing environment variables from restoring the unenrolled fallback.

Legacy workflowRuns.start rejects linked WorkOrders in favor of canonical dispatch. It also rejects enrolled project or unscoped starts when an enrollment exists. This closes a separate admission path rather than creating another execution engine.

Run `CAPABILITY_TEST_CONVEX_BIN=/absolute/path/to/convex-local-backend node --import tsx scripts/capability-qualification/local-convex.mjs`. The runner copies candidate functions into a temporary directory, removes scheduled jobs, adds internal test fixtures only to that temporary copy, creates fresh synthetic keys, and starts a disposable real Convex backend on loopback. It exercises the actual HTTP fence and authenticated missions.start mutations. It never connects to a hosted deployment or starts a model operation.

Remaining gates: positive delegated WorkOrder dispatch with native qualified runtime/reservation, backend-generated admission challenge transport, composed browser journey, and active-writer fencing/resource cleanup. FENCE_ACK proves only new-admission ordering. It does not prove suspension, authority invalidation for active writers, or resource cleanup. UNKNOWN exposure is untouched.

Restore safety is NOT_QUALIFIED. Restoring older database fences under unchanged incarnation and keys is not detected by a marker stored in that same database. A trusted external startup/incarnation synchronization contract is required before release qualification. No production or alpha installation is enabled.
