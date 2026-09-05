# Governed MCP Phase 4 — one real read-only service

Status: **NO_GO — schema currentness could not be established.** This directory separates offline controls and direct live diagnostics from the browser-dispatched acceptance evidence that was never attempted. A direct broker diagnostic does not satisfy the Phase 4 claim gate.

## Fixed baseline and scope

- Starting main: `0d1a0908cce380d815069ce0a59e1604d2f26ece`
- Starting runtime contract: v41
- Intended runtime contract: v42 (one new exact Tool Version registration mutation)
- Service: OpenAI Developer Docs MCP
- Operation: `search_openai_docs`
- Destination: `https://developers.openai.com:443/mcp`
- Credential: `NONE`
- Data: `PUBLIC`, fixed query only
- Tool Version digest: `sha256:975f284c0045059615cee85e475a5dd4e0dde4401f8db58ceebf395ee37af2ff`
- Server contract fingerprint: `sha256:dc02ca6f8f94428c0b180217342ddf6cabc7c8ca4df54f4d07f5866d57d0d9ef`
- Input schema digest: `7fe5182fc6d80abd05b373dbab70b45c6420b3ca91ccc5baa69817dfacb29692`
- Output normalization schema digest: `8a94dbb63f2834ab250f91f5ef3450299b61a8002155d44e7e0390f7c8c4a752`
- Approved-arguments digest: `8f649bcfde204a1df0ac60f59f74c85b477af5c898b8f21fa96f11707f932449`

The remote server does not publish an immutable implementation digest. The recorded server digest is therefore explicitly a contract fingerprint, not remote binary attestation. TLS destination and the exact advertised operation input schema are checked on every connection.

The superseded first fingerprint `sha256:26b03e3811a09005c47834d076e0a3907fd233a2ecf5b29b77ee13532a4542fa` failed currentness at `tools/list` and never reached `tools/call`. It is retained here as negative evidence, not mutated into the current version.

## Evidence index

- [Service selection](../../../software-factory/phase4-real-mcp-service-selection.md)
- [First live-call preflight](first-live-call-preflight.md)
- [NO_GO record](no-go-record.md)
- Direct live diagnostics: two handshakes reached `tools/list`; both stopped on `SERVER_SCHEMA_SUBSTITUTION`; zero `tools/call`
- Browser-dispatched WorkOrder/Attempt and durable receipt: not attempted after the currentness gate failed
- PR, merge, and post-merge qualification: not attempted

## Claim boundary

This work can establish one qualified real read-only service and one operation. It does not establish arbitrary MCP support, write MCP, harness-native MCP, credentialed MCP, a connector catalog, or a general network gateway.
