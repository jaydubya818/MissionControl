# Venture Factory ExecutionIntent shadow provider v1

## Decision

Mission Control exposes a dedicated, authenticated anti-corruption boundary for the Autonomous
Venture Factory `ExecutionIntent/v1` contract. The provider operates only in `SHADOW` mode. It may
validate, durably record, deduplicate, and reconcile an intent plus one intake event. It has no
planning, dispatch, execution, verification, release, or software-acceptance authority.

## Boundary

- Routes: `POST /v1/execution-intents`, `GET /v1/execution-intents/:intentId`, and
  `GET /v1/execution-intents/:intentId/events`.
- Authentication: a dedicated bearer token and canonical HMAC signature. Browser-origin requests
  are rejected. This credential is independent of operator/browser orchestration credentials.
- Tenant scope: one configured organization and one configured Convex service subject.
- Contracts: exact byte-for-byte copies in `contracts/venture-factory/v1`, pinned by
  `contract-lock.json`.
- Persistence: Convex is the sole source of truth for intent, receipt, and event records.
- Effects: exactly one intake record, one transport receipt, and one sequence-1 event for a new
  intent. No Mission, Plan, WorkOrder, Task, Attempt, branch, PR, release, or acceptance record.

## Transport protocol

The signed canonical string is newline-delimited:

1. `avf-execution-intent-transport-v1`
2. uppercase method (`POST` for requests, `RESPONSE` for responses)
3. exact request path
4. key ID
5. Unix epoch milliseconds
6. UUID nonce
7. idempotency key, or an empty string for reads
8. `sha256:` digest of RFC 8785-style canonical JSON

The provider accepts the current key and, only during rotation, one previous key. Requests outside
the five-minute replay window, more than 30 seconds in the future, over 256 KiB, with an unknown
key, repeated nonce, invalid digest/signature, unsafe organization, unsupported schema, or fields
that imply executor instructions are rejected before durable intake.

Every response is signed with the current provider key and a fresh nonce. Error bodies are also
signed after the request has passed enough authentication to establish the response key.

## Idempotency

- New idempotency key and intent: create one correlation, receipt, and acceptance event; return
  `ACCEPTED_FOR_PLANNING` with HTTP 202.
- Existing key with the same intent ID and digest: create no new effect; return `DUPLICATE` with
  HTTP 200 and the original correlation.
- Existing key with a different intent ID or digest: create no new effect; return `CONFLICT` with
  HTTP 409.
- Reusing a transport nonce is rejected before persistence.

`ACCEPTED_FOR_PLANNING` names intake eligibility only. In shadow mode it does not create a plan.

## Durable model

`executionIntents` stores the immutable request digest, canonical request, organization, service
identity, idempotency key, correlation, shadow status, sequence, and timestamps.
`executionIntentEvents` stores the canonical event and digest. `executionIntentTransportReceipts`
stores consumed nonces until replay-window cleanup. Every Convex function requires the configured
authenticated service subject and exact organization.

## Failure and recovery

The Factory retries only the exact semantic request after network ambiguity, with a fresh transport
nonce. It then reconciles by intent ID. Mission Control never overwrites a conflict and never
creates a replacement intent. Restart recovery reads the durable correlation and event. Disabling
the provider preserves evidence and blocks all three routes.

## Configuration

- `AVF_EXECUTION_INTENT_MODE=disabled|shadow`
- `AVF_EXECUTION_INTENT_ORGANIZATION_ID`
- `AVF_EXECUTION_INTENT_BEARER_TOKEN`
- `AVF_EXECUTION_INTENT_KEY_ID`
- `AVF_EXECUTION_INTENT_HMAC_SECRET`
- optional paired previous key ID/secret for rotation
- `AVF_EXECUTION_INTENT_CONVEX_SUBJECT`
- `CONVEX_SERVICE_AUTH_TOKEN`

Production startup fails closed on an invalid mode, weak credential, unsafe identifier, incomplete
rotation pair, or missing service subject. The default is disabled.

## Verification

Provider tests cover valid intake, duplicate, conflict, disabled mode, malformed/oversized input,
unsupported contract, unsafe authority fields, bearer/HMAC failures, stale/future signatures,
nonce replay, browser origin, cross-organization access, signed reconciliation/event responses,
restart-safe durable policy, and the absence of execution or acceptance projections.

## Post-deploy monitoring and validation

- Search orchestration and Convex logs for `SHADOW_DISABLED`, `UNAUTHORIZED`,
  `INVALID_SIGNATURE`, `REPLAYED_NONCE`, `ORGANIZATION_SCOPE_DENIED`, `CONFLICT`, and
  `INTAKE_FAILED`. Logs must never contain bearer tokens, HMAC secrets, signatures, or canonical
  request bodies.
- Monitor intake outcomes, request latency, Convex failures, replay/conflict counts, process
  restarts, and the exact `executionObjectsCreated:false` and `softwareAcceptance:false`
  invariants.
- At deployment, +15 minutes, +1 hour, +4 hours, and +24 hours, reconcile the same canary intent.
  Healthy evidence is one correlation, one sequence-1 event, exact duplicate reuse, no execution
  references, and no acceptance claim.
- Disable the provider and roll back the immutable release on signature/digest drift, cross-org
  visibility, duplicate durable intake/event effects, sequence gaps, credential exposure, or any
  planning/execution/acceptance record attributable to this route.
- The staging release owner must be named before deployment; production monitoring remains outside
  this shadow provider decision.
