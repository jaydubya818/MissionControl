# Service command authentication

## Decision

Mission Control V1 uses one authenticated service identity,
`orchestration-server`, for service-side WorkOrder dispatch, executor receipt
ingestion, and leased Factory-attempt execution. Public browser mutations cannot claim `SYSTEM` or `AGENT` authority.
The orchestration server authenticates inbound callers with a bearer credential,
then signs each outbound Convex command with a separate HMAC credential.

This is an application service identity, not a human Clerk identity and not a
GitHub App installation identity. Those authorities remain separate.

## Signed envelope

Every service command signs these fields in a fixed `mc-service-command-v1`
canonical form:

- service identity and exact capability;
- workspace and repository record IDs;
- globally unique command ID;
- issued and expiry times (maximum five-minute envelope; clients use one minute);
- SHA-256 digest of the exact serialized payload.

Convex validates syntax, freshness, payload digest, HMAC, active Factory version,
and exact WorkOrder/workspace/repository scope before invoking an internal
mutation. A command ID can be claimed once. A repeated command ID is recorded as
a replay and cannot repeat side effects.

## Durable audit behavior

`serviceCommandReceipts` stores accepted, succeeded, failed, and denied commands.
It contains identity, capability, claimed scope, timestamps, digest, result
reference, denial/failure reason, attempt count, and replay time. It never stores
the HMAC secret, bearer credential, raw signature, or payload body.

## Configuration

Production orchestration requires:

- `ORCHESTRATION_API_TOKEN` (or legacy `MC_API_TOKEN`) for inbound HTTP requests;
- `MISSION_CONTROL_SERVICE_COMMAND_SECRET` in both orchestration and Convex;
- optional `MISSION_CONTROL_SERVICE_ID`, defaulting to `orchestration-server` in
  both processes.

The orchestration HTTP server applies authentication as a default-deny policy.
Only `GET /health`, `GET /gateway/status`, and CORS preflight are public.
Production requests to every other current or future route return `503` when
inbound authentication is not configured. Outbound commands fail before
calling Convex when the signing secret is absent. Rotate the bearer and signing
credentials independently.

## Current command capabilities

| Capability | Public human entry | Authenticated service entry | Internal mutation |
|---|---|---|---|
| `workorders.dispatch` | `workOrders.dispatch` (`HUMAN` only) | `serviceCommands.dispatchWorkOrder` | `workOrders.dispatchServiceInternal` |
| `receipts.ingest` | None | `serviceCommands.ingestReceiptPacket` | `factory/piBridge.ingestReceiptPacketInternal` |
| `attempts.claim` | None | `serviceCommands.claimFactoryAttempt` | `factory/attempts.claimInternal` |
| `attempts.renew` | None | `serviceCommands.renewFactoryAttempt` | `factory/attempts.renewInternal` |
| `attempts.report` | None | `serviceCommands.reportFactoryAttempt` | `factory/attempts.reportInternal` |
| `executions.claim` | None | `serviceCommands.claimExecution` | `executionWorker.claimInternal` |
| `executions.heartbeat` | None | `serviceCommands.heartbeatExecution` | `executionWorker.heartbeatInternal` |
| `executions.report` | None | `serviceCommands.reportExecution` | `executionWorker.reportInternal` |
| `executions.finalize` | None | `serviceCommands.finalizeExecution` | `executionWorker.finalizeInternal` |

Attempt claims are atomic and bounded to 15–120 seconds. Renewal and report
commands must present the exact active lease. `attempts.report` is the only
orchestration-server path for ordered Factory execution events, artifacts, and
terminal status; the former generic HTTP event/artifact write routes return
`410 Gone`.

The documented V1 golden path uses the `attempts.*` capability set for the
repository-scoped verification-first worker. `CODEX_FACTORY_WORKER_ENABLED=true`
also requires an exact project and repository binding, and queries claimable
runs through that repository scope. `executions.*` remains a compatibility API
surface but has no supported production launcher. Runtime startup fails if both
the unscoped `FACTORY_EXECUTION_ENABLED=1` mode and the bounded
`CODEX_FACTORY_WORKER_ENABLED=true` mode are configured, preventing competing
claims against the same Attempt.

Additional scheduler, task-transition, approval-request, and handoff
commands must be added as named capabilities before those callers can be treated
as production service identities. Do not reuse one generic “system” capability.
