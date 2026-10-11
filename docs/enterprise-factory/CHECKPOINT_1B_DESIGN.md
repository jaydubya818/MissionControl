# Checkpoint 1B deterministic compatibility

Accepted base: `356b92e58d9acd8f75fd80b3f12b1cac581733ce`. Foundation remains PARTIAL. This checkpoint is fixture engineering, never canonical execution adoption.

## Ownership and scope

Extend `factoryDefinitions` with an optional version-bound compatibility registration. Its identity stays the existing definition ID and its lifecycle remains DRAFT/ACTIVE/ARCHIVED. Attach capabilities, health, fixture qualification, capacity, admission policy, revocation, and exact dependency SHAs. Registration never activates a native version or creates dispatch authority.

Keep a bounded fixture accounting projection on the existing Mission. The Mission owns the ceiling; both native and delegated fixture holds consume that ceiling. No provider ledger or enterprise budget service is added. Canonical native spending is deliberately not wired to this projection, so composed production accounting remains NOT_RUN.

Subordinate `factoryDelegationTrials` records correlate immutable 1A bindings to fixture admission/status observations. They are not partner WorkOrders or Runs. Claiming a trial before a network call persists UNKNOWN and retains its allowance. A repeated claim never resends. Observation and settlement writes use an internal mutation, callable only by trusted server adapter plumbing after transport verification. Factory-management permission alone cannot attest a receipt. The disposable test runner uses an ephemeral backend admin key for that server boundary. Read/reconciliation and cancellation remain possible after expiry or revocation. Cancellation acknowledgment alone never releases exposure.

## Boundary contracts

The MissionControl-owned adapter uses a distinct signed loopback fixture protocol. It cannot target DNS names, redirects, or public endpoints. This protocol is not asserted to be MyFactory's installation-bound external-alpha API. Exact MyFactory `MYFACTORY_EXECUTION_V2` parsing and `MYFACTORY_RESULT_V1` signature/artifact validation are reused from the authorized source via an explicit pinned compatibility loader. No copied partner verifier or widened partner request schema.

Request authentication binds scope, immutable binding digest, operation, payload digest, nonce and validity. Responses bind the exact request digest. Separate directional fixture keys prevent reflected requests. Current authentication is required for reads and duplicates. Unknown network outcomes preserve the original trial; no retry or fallback dispatch.

Result projection retains producer status, candidate identity, independent verifier outcome, signed Factory Result, enterprise gate, human acceptance and publication separately. The last three remain NOT_EVALUATED, PENDING and NOT_AUTHORIZED in this checkpoint. Partner PASS cannot advance them.

## Alternatives and decision

A separate factory service with its own registry and budget store would duplicate ownership and add reconciliation. Extending the existing records keeps authority in MissionControl and allows real Convex transactions. The fixture projection is explicit because existing canonical inference pricing and grants cannot honestly represent arbitrary delegated execution without further integration.

## Verification and throughput

Sequence registry/accounting, adapter/result, then composed fixture qualification. Build a repeatable disposable Convex harness that loads the actual schema and handlers, synthetic tenant membership, and no scheduled jobs. Exercise HTTP authentication, cross-tenant access, concurrent reservations/duplicate claims, cancellation, expiration, revocation, restart, lost responses, and budget exhaustion. Run existing native suites, fresh-clone affected checks, hosted CI, independent review and disclosure review before source publication. No UI changes.

The critical path is real database qualification and pinned partner validation. Keep implementation sequential under the user's tool mapping; independent review must be separately evidenced or reported unavailable.

## Compatibility pins

- MyFactory `fa48a820ba185eb9b891130c78166463b61cba74`.
- MyEve `8338309582d6806829dec1ae1beef301d6b52425`.
- MySkills foundation `d57ff77b8522f897fc6ae392cf59b3141295ba82`.
- MySkills behavioral qualification `21ae05a7be2f73be1378deb896f138700c473e84`.

Remote pull refs were freshly verified to match. These are historical compatibility candidates, not production-adopted releases. The 1A UUIDv4 binding is preserved. The newer external-alpha UUIDv8 installation protocol is not silently substituted.
