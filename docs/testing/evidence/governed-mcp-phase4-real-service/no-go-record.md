# Phase 4 NO_GO record

Date: 2026-09-05

Disposition: `NO_GO`

## Trigger

The selected real service was OpenAI Developer Docs MCP at exact destination `https://developers.openai.com:443/mcp`, operation `search_openai_docs`, credential class `NONE`, public fixed query only. Offline authority, destination, scope, receipt, timeout, cancellation, replay, hostile-output, worker, and verification tests passed while the Phase 3 stdio fixture remained green.

The first direct currentness handshake used Tool Version digest `sha256:92e07948cf7e3dfd93e682df8f081dd88038cd68e21c8d1369444047cae6107b`. The endpoint returned a different advertised operation schema. The broker raised `SERVER_SCHEMA_SUBSTITUTION` before `tools/call`.

No silent adaptation occurred. A public previously recorded MCP `tools/list` cassette supplied an exact schema candidate. A new immutable Tool Version was built and offline-qualified:

- Tool Version digest: `sha256:975f284c0045059615cee85e475a5dd4e0dde4401f8db58ceebf395ee37af2ff`
- Contract fingerprint: `sha256:dc02ca6f8f94428c0b180217342ddf6cabc7c8ca4df54f4d07f5866d57d0d9ef`
- Input schema digest: `7fe5182fc6d80abd05b373dbab70b45c6420b3ca91ccc5baa69817dfacb29692`

The second currentness handshake also returned a different advertised schema and again stopped on `SERVER_SCHEMA_SUBSTITUTION` before `tools/call`.

## Safety result

- Real service operation invocations: 0
- External mutations: 0
- Credentials accessed or transmitted: 0
- Customer/private data transmitted: 0
- Model/provider calls: 0
- Write-capable MCP operations registered or invoked: 0
- Browser-dispatched live Attempts: 0
- Durable Convex live-service receipts: 0
- PRs or merges: 0

The diagnostic used a non-durable receipt sink and is not represented as product evidence. The required browser → WorkOrder → Attempt → Profile → Grant → Broker → real service → durable receipt → verifier path did not occur.

## Why this is NO_GO

Phase 4 requires the remote service/schema identity to match the reviewed Tool Version and says to stop rather than adapt on drift. Two separately frozen schema identities failed that gate. Continuing would require one of the prohibited shortcuts: trusting dynamic discovery as authority, weakening exact schema matching, or making additional unqualified live requests to chase a moving contract.

Because the successful live read, durable receipt, browser dispatch, independent verification, review, merge, and post-merge proof never occurred, the narrow Phase 4 completion claim is not available.

## Repository state

The attempted implementation remains only as uncommitted work in the isolated `codex/phase4-real-readonly-mcp` worktree. Runtime contract v42 and the new registration mutation were not committed, deployed, opened as a PR, or merged. Final main remains the verified Phase 3 baseline `0d1a0908cce380d815069ce0a59e1604d2f26ece` at runtime contract v41.

## Safe next decision

Do not retry this service by dynamically accepting its catalog. A future authorized Phase 4 attempt should either obtain a provider-published immutable schema/version for this exact endpoint or select another no-credential read-only documentation MCP service with a stable published operation schema. That is a new qualification attempt and requires a fresh service-selection record and preflight.
