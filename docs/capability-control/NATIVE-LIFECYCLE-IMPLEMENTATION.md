# Native capability lifecycle

Capability policy restricts existing Attempt authority without replacing native execution records. Revoke makes a current Attempt eligible for the existing authenticated sandbox reconciliation path immediately. The reconciler revokes credentials, requests termination, and requires exact provider resource-absence evidence before recording termination. Pause alone does not authorize destructive cleanup.

Lifecycle acknowledgments derive from a complete owner/project inventory of native Attempts, their frozen capability lineage, sandbox allocation journals, and credential revocations. A signed request cannot supply its own resource status. Legacy lineage and active Attempts without authoritative resource inventory remain pending. Cleanup never settles UNKNOWN accounting or releases reservations.

The lifecycle acknowledgment is a separate signed sidecar. The original admission-policy wire remains unchanged. A durable control row retains the latest acknowledgment and monotonic sequence. Equal evidence retries return the same acknowledgment; conflicting control identities fail closed.

Qualification must include revoke before lease expiry, pause preservation, exact-owner inventory, missing/foreign resource evidence, duplicate acknowledgment, retry after interruption, and real Convex transaction behavior. Native safe pause remains pending unless a backend provides qualified suspension evidence.

New admissions and challenges default to receiver recovery quarantine. A trusted host must explicitly set `MC_CAPABILITY_RECEIVER_RECOVERY_STATE=ACTIVE` and `MC_CAPABILITY_RECEIVER_EPOCH` to the enrolled incarnation. Restore handling must quarantine first and advance the independently retained host epoch before re-enrollment. Existing Work retains frozen authority; quarantine cannot grant new authority. These configuration checks do not detect a restore performed without the host restore protocol. An independently operated restore-fence authority remains an installation qualification requirement; a database-only row cannot meet it.

## Qualification evidence

The disposable real Convex runner passes 20 checks, including positive delegated WorkOrder admission, concurrent duplicate admission, budget/profile rejection without permit consumption, stale acknowledgment rejection, restart durability, and a simulated restored database fenced by an independently retained host epoch. The positive fixture is an explicitly synthetic offline FactoryVersion with zero provider calls; it creates no production or paid execution grant. The full Convex suite passes 1,525 tests across 169 files, and TypeScript, authorization ratchet, documentation, and runtime-contract checks pass.

Runtime contract 63 requires host recovery enrollment for capability-controlled admissions. The signed lifecycle sidecar adds observation only and cannot authorize execution. Missing resource journals remain `PENDING_BACKEND`; these checks do not independently qualify a running resource as stopped. Deployment, real-owner binding, and independently operated restore-fence custody remain unqualified installation gates.

## Actual local resource cleanup

The opt-in `local-resource.mjs` fixture also passes against the real Docker daemon and disposable Convex database. It uses an already present immutable Linux image, creates one uniquely labeled container with no network, credentials, mounts, provider calls, or publication authority, and observes that container running. The canonical `DockerSandboxProvider` and `reconcileSandboxOrphans` remove it and prove absence before the native reconciliation transaction records `TERMINATED`. Duplicate cleanup is idempotent. A missing provider leaves the real resource running and its durable state unchanged. An unexpired lease does not hide a revoked resource from reconciliation.

The cleanup-only recovery snapshot is synthetic and does not qualify remote WorkOrder execution. The separate positive WorkOrder test remains offline admission only. Native reservations and unresolved accounting are preserved; one confirmed resource cannot complete owner-wide cleanup while other inventory is unknown. The run now passes 21 real Convex checks and writes `evidence/local-resource.json`. Set `CAPABILITY_TEST_DOCKER_IMAGE` to an already present immutable image, and provide absolute `CAPABILITY_TEST_DOCKER_BIN` and `CAPABILITY_TEST_DOCKER_SOCKET` paths to opt in. No image is pulled, and no unrelated resource is removed.
