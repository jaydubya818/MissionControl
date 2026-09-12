# ADR: Governed read-only MCP capability

- Status: Accepted for Phase 3 qualification
- Date: 2026-09-05
- Baseline: `3ae9d86eeff1966862a6959664ec1fe2e6e7240a`

## Decision

Mission Control will qualify one host-brokered MCP operation,
`read_factory_doctrine_excerpt`, against an isolated local stdio server. The
server is a `QUALIFICATION_FIXTURE`, not a real admitted service. It returns one
checked-in, non-secret doctrine excerpt selected by a closed enum. The fixture
code performs no filesystem, network, credential, write, redirect, import, or
plugin operation. The broker re-reads and verifies the admitted bytes, copies
those exact bytes to a private temporary artifact, and launches that artifact
under Node's permission model without filesystem-write authority and with
filesystem reads limited to the artifact. Node's permission model is not an OS
egress boundary; the fixture's lack of networking is established by its closed,
dependency-free source. That limit is acceptable only for this local fixture.

The authority chain is:

`WorkOrder → Attempt lease → Execution Profile → Tool Grant → Tool Version → operation → authorization receipt → stdio MCP call → completion receipt → run evidence`.

MCP is a capability, not an execution abstraction. Harness, runtime artifact,
execution backend, sandbox, and model route retain their existing independent
identities. An optional Tool Grant is frozen inside the immutable Execution Profile. A
historical profile without that field means `NO_TOOL_CAPABILITY`; it does not
inherit a default. Factory Versions, manifests, and Attempts already freeze the
entire profile snapshot and therefore freeze the exact grant transitively.
The Factory worker performs the one qualified context read before invoking the
selected harness and passes only bounded, explicitly untrusted context to that
harness. Neither Codex nor DeepSeek becomes an MCP client.

The host-owned broker is the only MCP client. It validates the complete tuple,
request schema/digest and size, current lease, cancellation, expiry,
qualification, credential class, destination, operation, response schema and
size, and implementation digest. It writes an immutable authorization receipt
before starting the server and a separate immutable completion receipt after
termination. Denials and failures are receipts too. Raw credentials are never
accepted from, returned to, or logged for an agent; this fixture requires the
explicit credential class `NONE`.

**MCP server discovery is descriptive input, not authority.** The broker does not call `tools/list` to
derive authority and ignores tool descriptions when evaluating policy. Tool
output is untrusted evidence: it is bounded, secret-scanned, withheld where
needed, and cannot alter WorkOrder intent, policy, acceptance, routing, grants,
or qualification.

**Tool output is untrusted content, not policy.**

**An Attempt may invoke only the exact tool operation frozen into its governed execution configuration.**

## Authoritative domain relationship

The following mapping describes the records; the diagram is not authority:

`Factory Version → Execution Profile → Tool Grant → Tool Version → Tool Broker → MCP Server → Tool Call Receipt`

| Concept | Authoritative storage / code | Exact identity | Lifecycle and owner | Qualification / currentness | Evidence |
| --- | --- | --- | --- | --- | --- |
| Factory Version | `factoryDefinitionVersions`; `convex/factory/configuration.ts` | row ID + `configurationDigest` | immutable version; workspace operator | active definition and readiness must reference the exact qualified profile | existing readiness and Attempt evidence |
| Execution Profile | `factoryExecutionProfiles`; `convex/lib/executionProfile.ts` | row ID + `profileDigest` + qualification digest | immutable version; workspace operator approves/qualifies/revokes | live component reconciliation includes the exact grant; absent grant means `NO_TOOL_CAPABILITY` | frozen into Factory Version, execution manifest, Attempt, and trace |
| Tool Grant | `mcpToolGrants`; `convex/lib/governedMcp.ts` | row ID + `grantDigest` over workspace, operation, Tool Version bytes, destination, credential class, expiry, and one-call budget | immutable authority; operator may revoke; expiry is evaluated from time | must be `ACTIVE`, unexpired, and byte-current before each new call | grant identity on profile, Attempt, authorization, completion, event, and artifact |
| Tool Version | `mcpToolVersions`; `convex/lib/governedMcp.ts` | row ID + `toolVersionDigest` over server, implementation, protocol, SDK, transport, schemas, limits, credential class, and side-effect class | immutable registered version; operator separately qualifies | must be enabled, evidence-qualified, unexpired, and digest-current | qualification evidence plus every call receipt |
| Tool Broker | `GovernedMcpBroker` and `loadGovernedMcpContext` in the orchestration host | service identity `MISSION_CONTROL_SERVICE_ID`, signed service-command key, worker/session/generation, and deployed host/runtime | host-owned process; never agent/browser owned | an `ALLOWED` authorization receipt committed by Convex is the transactional transport permit | signed service-command receipt and typed tool-call receipts |
| MCP Server | exact checked-in dependency-free `.mjs` entrypoint | server name/version + source digest + protocol + frozen schemas and transport | one process/request, then terminated | verified source bytes are executed from a private copy; handshake, response schema, limits, and permission boundary are checked per call | server implementation digest and result digest |
| Tool Call Receipt | `mcpToolCallReceipts`; projected into `runEvents` and `runArtifacts` | canonical receipt digest + logical `callId` + phase | append-only authorization/completion history; control plane owns persistence | identity and state machine are revalidated transactionally | the typed receipt is authoritative; event/artifact rows are operator projections |

## Broker, destination, and credential boundary

Browser input, agent output, MCP discovery, display names, and arbitrary local
paths cannot become broker authority. The worker derives the request from the
claimed Attempt lease and frozen profile. Convex independently revalidates the
current Attempt status, cancellation flag, lease/fencing generation, profile,
grant, Tool Version, workspace, expiry, and per-Attempt call budget while
inserting the authorization receipt. The broker does not start transport unless
that insert succeeds.

The only destination is the exact local entrypoint named by the Tool Version.
The host derives that path; the agent cannot provide it. The child receives a
minimal environment with no inherited credentials. This version's required
credential class is exactly `NONE`, so credential presence, rotation, and
revocation are `NOT_APPLICABLE`. A future credential-bearing Tool Version must
add a broker-owned credential reference and per-call currentness check; it may
not silently reuse this qualification.

## Receipts, replay, cancellation, and revocation

The logical invocation ID is deterministic for the Attempt, operation, and
single permitted call. A duplicate request is rejected; it never starts a
second transport. The original immutable `ALLOWED` record remains intact and a
separate `REPLAY_DENIED` authorization record may reference the same logical
call. Independently, the Convex authorization transaction counts prior allowed
calls for the exact Attempt and grant, so a different caller-supplied call ID
cannot bypass `maxCallsPerAttempt: 1`.

Revocation mode is `DENY_NEW_CALLS`. Revocation or expiry before the
authorization transaction blocks the call. An already authorized read may
complete, because this operation has no external write effect, but its
completion is marked `lateOrStale` if the Attempt was canceled, terminalized,
lost its lease, or changed fencing generation. Late output remains audit
evidence, is withheld from the harness, and is not promoted to current evidence
or acceptance authority.
Historical receipts are never rewritten after revocation.

## Qualification semantics and identity limits

Factory qualification is the authority: its staged run includes the real MCP
stdio exchange, broker negative matrix, Factory worker context handoff,
control-plane identity/currentness contracts, existing non-MCP profiles,
independent verification, full regression suites, runtime-contract guard,
security/docs checks, build, and startup smoke. `qualify:mcp:phase3` is a narrow
developer convenience, not a separate maturity or admission decision.

Material changes to any profile, harness, runtime artifact, execution backend,
sandbox, broker behavior, grant, Tool Version, credential/transport
requirements, server implementation, schema, limit, or destination require a
new digest and requalification.

The local source digest, repeated byte check, private execution copy, and
handshake cover substitution of the dependency-free fixture
entrypoint/name/version/schema. The MCP SDK is host-broker code covered by the
qualified runtime artifact and dependency lock; it is not a dependency loaded
by the fixture. This does not cryptographically attest a remote deployment or
provide OS-level network isolation. That evidence limit is acceptable only for
`QUALIFICATION_FIXTURE`; a real admitted service must use a stronger
content-addressed artifact or deployment identity, enforce egress policy, and
document any remaining remote-attestation limit.

## Exact qualified identity

- Protocol: MCP `2025-11-25`
- Host-broker SDK: `@modelcontextprotocol/sdk@1.26.0` (the server artifact has no dependencies)
- Transport: local stdio only
- Server: `mission-control-readonly-qualification-fixture`
- Server version: `1.0.0`
- Operation: `read_factory_doctrine_excerpt`
- Side effect: `READ_ONLY`
- Destination: the exact checked-in fixture entrypoint and digest
- Data class: `PUBLIC_FIXTURE`
- Credential class: `NONE`
- Lifecycle: one process and one request per call; terminate on completion,
  denial, cancellation, timeout, malformed response, or oversize response
- Admission: `QUALIFICATION_FIXTURE`; never `REAL_ADMITTED_SERVICE`

Request and response schemas, byte limits, timeout, server implementation
digest, and qualification expiry are part of the immutable Tool Version.

## Consequences

This qualifies the single fixture transport and governance path while keeping connector risk
near zero. It does not prove a real external MCP service, arbitrary MCP tools,
network transport, OAuth, agent-originated dynamic discovery, write operations,
or general harness MCP support. Codex and DeepSeek harness manifests remain MCP
unsupported; only the exact host-broker/profile/grant combination is qualified.

No write-capable MCP operation is authorized. A future write phase requires
operation-specific approval, idempotency, pre-effect and post-effect receipts,
rollback or compensation, post-condition verification, incident containment,
and explicit handling of irreversible effects. Read-only qualification cannot
be inherited by such a version.

Phase 4 must not broaden this boundary until an operator explicitly approves a
real service, exact operation, transmitted data, credential scope, call count,
cost, and evidence plan.

## Phase 4 addendum — one exact real read-only operation

The operator approved and Mission Control qualified one narrow exception to the
Phase 3 fixture-only boundary on 2026-09-05. Context7
`@upstash/context7-mcp@4.0.5` operation `query-docs` is admitted only through
the host broker at `https://mcp.context7.com/mcp`, only for the frozen public
arguments `/facebook/react` and `useEffect cleanup for external subscriptions`,
with credential class `NONE`, one call per Attempt, zero broker retries, and a
10-second operation timeout.

The Tool Version binds the provider release commit and npm integrity, exact
server version, protocol, expected input schema, normalized output schema,
destination, public-only DNS policy, byte limits, and read-only authority. The
live broker independently records the observed server and schema identities and
fails closed unless they equal the expected identities before `tools/call`.
The transport connects to the validated public DNS address with TLS SNI and
certificate verification for the qualified hostname, eliminating a second
unvalidated resolver step, and one deadline covers initialization, catalog
validation, and invocation.
Authorization and completion are separate durable receipts linked to the exact
Attempt, lease, Execution Profile, Tool Grant, and Tool Version.

This addendum does not change harness manifests to MCP-supported and does not
authorize discovery, writes, acceptance, routing, policy mutation, credentials,
private data, another operation, another service, or general MCP support. The
Phase 3 fixture remains qualified and its historical contract above is
unchanged. The exact selection and live evidence are in
`docs/testing/evidence/governed-mcp-phase4-recovery/README.md`.
