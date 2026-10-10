# Native capability lifecycle

Capability policy restricts existing Attempt authority without replacing native execution records. Revoke makes a current Attempt eligible for the existing authenticated sandbox reconciliation path immediately. The reconciler revokes credentials, requests termination, and requires exact provider resource-absence evidence before recording termination. Pause alone does not authorize destructive cleanup.

Lifecycle acknowledgments derive from a complete owner/project inventory of native Attempts, their frozen capability lineage, sandbox allocation journals, and credential revocations. A signed request cannot supply its own resource status. Legacy lineage and active Attempts without authoritative resource inventory remain pending. Cleanup never settles UNKNOWN accounting or releases reservations.

The lifecycle acknowledgment is a separate signed sidecar. The original admission-policy wire remains unchanged. A durable control row retains the latest acknowledgment and monotonic sequence. Equal evidence retries return the same acknowledgment; conflicting control identities fail closed.

Qualification must include revoke before lease expiry, pause preservation, exact-owner inventory, missing/foreign resource evidence, duplicate acknowledgment, retry after interruption, and real Convex transaction behavior. Native safe pause remains pending unless a backend provides qualified suspension evidence.

New admissions and challenges default to receiver recovery quarantine. A trusted host must explicitly set `MC_CAPABILITY_RECEIVER_RECOVERY_STATE=ACTIVE` and `MC_CAPABILITY_RECEIVER_EPOCH` to the enrolled incarnation. Restore handling must quarantine first and advance the independently retained host epoch before re-enrollment. Existing Work retains frozen authority; quarantine cannot grant new authority. These configuration checks do not detect a restore performed without the host restore protocol. An independently operated restore-fence authority remains an installation qualification requirement; a database-only row cannot meet it.

## Qualification evidence

The disposable real Convex runner passes 20 checks, including positive delegated WorkOrder admission, concurrent duplicate admission, budget/profile rejection without permit consumption, stale acknowledgment rejection, restart durability, and a simulated restored database fenced by an independently retained host epoch. The positive fixture is an explicitly synthetic offline FactoryVersion with zero provider calls; it creates no production or paid execution grant. The full Convex suite passes 1,525 tests across 169 files, and TypeScript, authorization ratchet, documentation, and runtime-contract checks pass.

Runtime contract 63 requires host recovery enrollment for capability-controlled admissions. The signed lifecycle sidecar adds observation only and cannot authorize execution. Missing resource journals remain `PENDING_BACKEND`; these checks do not independently qualify a running resource as stopped. Deployment, real-owner binding, and independently operated restore-fence custody remain unqualified installation gates.
