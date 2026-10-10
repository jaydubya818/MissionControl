# Capability control — Checkpoint E

Isolated qualification candidate; overall release status PARTIAL. No production integration, deployment, paid operation, production grant, credential change, dependency merge, or external-alpha change is authorized by this checkpoint.

## Compatibility contract

MyEve remains the source of owner preferences. Relay retains organization/agent authority, and execution backends retain native admission, budget, runtime, writer, and resource authority. Preference enablement grants no execution authority.

The canonical P-256 wire implementation is MyEve `packages/capability-enforcement/src/ordering-wire.ts`, copied byte-for-byte into MissionControl and Relay. SHA-256: `4b198d32e1dcdc930c2658291906ebf72601e144596f3090202a3e7ee708d606`.

E adds receiver-signed CHALLENGE messages binding exact owner, organization, installation, incarnation, enrollment, registry, policy version/identity, native snapshot, command arguments, budget and expiry. Source issuance rejects mismatches and durably deduplicates the exact authenticated challenge. Receiving admission still revalidates policy and native authority transactionally.

Latest MyEve FENCE messages include accumulated restrictive control marks from immutable source policy changes. A superseding unrelated toggle therefore cannot erase an undelivered pause/revoke. Acknowledgment authenticates the exact entire fence, including those marks. Older strict receivers reject the extended message; mixed D/E delivery must remain pending, never silently downgrade. Existing D Relay owner-delivery rows without a frozen destination require explicit reconciliation and fail closed.

Native Missions/Attempts retain their original policy authority. Ordinary disable only affects new admission. Restrictive marks survive later enables and fence native writers/reclaim/publication paths; inherited Mission lineage also constrains descendants. An enrolled legacy Mission cannot authorize new fleet Work without reconciled lineage. Legacy active Work is contained with PENDING_BACKEND when an applicable explicit control exists. Reservations and historical evidence are retained.

Relay account epoch invalidation is admission freshness only. It must not turn a single-lease revoke into owner-wide active-Work revocation. Targeted Relay active-Work controls require a separate exact lease/agent/Work compatibility contract.

## Qualification limits

Composed local evidence uses real PostgreSQL, native Relay HTTP/policy/lease handlers, real Convex, actual browser login/Settings, signed-session Sofie capability handlers, ordinary/platform synthetic policies and reconnect. It performs no model invocation. Relay-agent qualification projection is a synthetic fixture, not a qualified live projection feed. Native execution fixtures do not prove resource execution or stop.

Restore safety is NOT_QUALIFIED: database-local versions or markers cannot prove absence of later revocation after restoring that same database. A trusted installation/controller head retained outside all restored policy databases, predecessor reconciliation and startup quarantine remain required. Do not enable this candidate in a restored/live installation.

Positive delegated Factory admission/execution, qualified safe-checkpoint pause, authoritative resource-stop/cleanup acknowledgment, targeted Relay active-Work revocation, legacy-lineage reconciliation and actual platform-owner binding remain release gates. The existing Factory pricing failures remain blockers; accounting tests and UNKNOWN exposure are unchanged. Fresh-clone qualification is deferred during the coordinated local storage hold.
