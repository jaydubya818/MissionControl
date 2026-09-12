# First real MCP call preflight

Decision time: 2026-09-05, before any direct request to the MCP endpoint.

## Exact proposal

| Field | Value | Gate |
| --- | --- | --- |
| Service | OpenAI Developer Docs MCP, operated by OpenAI | QUALIFIED |
| Operation | `search_openai_docs`, semantically read-only | QUALIFIED |
| Data scope | Public OpenAI documentation; fixed query `Model Context Protocol configuration in Codex`, limit 3 | AUTHORIZED |
| Destination | exact `https://developers.openai.com:443/mcp`; TLS required; redirects, raw IPs, private/loopback/link-local/metadata DNS results denied | QUALIFIED |
| Credential model | `NONE`; no local, personal, developer, or production credential is read | NOT_REQUIRED |
| Service cost | Public documentation service; `NO_INCREMENTAL_COST`; one primary logical call, maximum three transport attempts | AUTHORIZED |
| Model/provider requirement | Direct currentness diagnostic calls the MCP service through the host broker only; no model/provider request | NOT_REQUIRED |
| Model budget | No model call in this diagnostic | NOT_REQUIRED |
| Tool Version | superseded first digest `sha256:92e07948cf7e3dfd93e682df8f081dd88038cd68e21c8d1369444047cae6107b`; contract/schema drift failed closed | QUALIFIED |
| Tool Grant | one workspace-bound, operation-bound, expiring grant shape; one logical call per Attempt | QUALIFIED |
| Execution Profile | existing immutable profile binding requires exact grant/model/harness/runtime/backend; no default inheritance | QUALIFIED |
| WorkOrder | Direct diagnostic only; the browser acceptance WorkOrder remains separately gated | NOT_REQUIRED |
| Attempt authority | Synthetic diagnostic Attempt uses an exact current lease tuple and broker receipt sink; not acceptance evidence | QUALIFIED |
| Containment | no discovery authority, writes, policy mutation, acceptance, routing, or second operation | QUALIFIED |
| Network policy | exact URL validation plus public-only DNS validation on every HTTP request; redirects disabled | QUALIFIED |
| Independent verifier | Required for final browser WorkOrder, not the direct currentness diagnostic | NOT_REQUIRED |
| Rollback/cancellation | grant revocation denies new calls; abort signal and timeout fence the request; no external mutation to roll back | QUALIFIED |
| Evidence destinations | this evidence directory; durable Convex receipt/event/artifact is required for final acceptance | QUALIFIED |

## Offline controls completed before this gate

Focused broker, Factory context, Attempt worker, verification, control-plane identity, Factory configuration, runtime admission, execution manifest, WorkOrder governance, and recovery tests passed. They cover exact version/grant identity, request and output bounds, destination rejection, public-only DNS, expiry/revocation, stale worker and cancellation, replay/call budget, unavailable service, timeout, hostile output, receipt creation, independent verification, and server/schema substitution. Phase 3's real local stdio fixture exchange remains green.

## Decision

All consequential fields for one minimum direct read-only diagnostic are `QUALIFIED`, `AUTHORIZED`, or `NOT_REQUIRED`. Existing task authority explicitly requests the Phase 4 real-service proof and permits the minimum call when this gate is satisfied. Proceed with one direct host-broker diagnostic. This call is diagnostic evidence only and cannot satisfy the browser-dispatch claim gate.

The later browser-dispatched Attempt requires a separate preflight. If it requires paid model/provider execution without an already approved WorkOrder budget, stop with `MODEL_CALL_AUTHORIZATION_REQUIRED` before dispatch.

## First-call result

The endpoint handshake succeeded, but `tools/list` did not match the frozen input schema. The broker emitted `SERVER_SCHEMA_SUBSTITUTION` and did not invoke `search_openai_docs`. The admitted schema had been derived from the provider's newer WebMCP surface, which omitted fields present in the MCP tool catalog. This result is a successful fail-closed currentness control, not a successful real-service call.

No silent adaptation occurred. A public recorded MCP `tools/list` cassette was used offline to identify the exact MCP schema. A new immutable Tool Version and a fresh offline/preflight gate are required before a second call.
