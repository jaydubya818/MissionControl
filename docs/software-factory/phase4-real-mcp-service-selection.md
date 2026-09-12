# Phase 4 real read-only MCP service selection

Status: selected; first currentness handshake failed closed before tool invocation and a new immutable contract is undergoing offline requalification.

Baseline: `origin/main` at `0d1a0908cce380d815069ce0a59e1604d2f26ece`, runtime contract v41.

## Decision

Qualify exactly one operation from the OpenAI Developer Docs MCP service:

- Service/operator: OpenAI Developer Docs MCP, operated by OpenAI
- Endpoint: streamable HTTP at `https://developers.openai.com:443/mcp`
- Operation: `search_openai_docs`
- Approved input: exactly `{ "query": "Model Context Protocol configuration in Codex", "limit": 3 }`
- Approved corpus: public documentation served from `developers.openai.com`, `platform.openai.com`, and `learn.chatgpt.com`
- Data classification: `PUBLIC`
- Credential: `NONE`
- Side effects: `READ_ONLY`
- External mutation/write authority: `NONE`
- Service cost: `NO_INCREMENTAL_COST`; no paid OpenAI API call is made by this service
- Call budget: one logical call per Attempt, at most three transport attempts
- Revocation: disable/revoke the exact Mission Control Tool Grant; no service credential exists to revoke

OpenAI documents the endpoint as a public, read-only, documentation-only MCP service that does not call the OpenAI API on the caller's behalf: <https://developers.openai.com/learn/docs-mcp>. The exact server catalog is not admitted. Only `search_openai_docs` is registered and granted.

## Candidate comparison

| Candidate | Endpoint / transport | Proposed operation | Data and credential scope | Side effects / cost | Stability and usefulness | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI Developer Docs MCP | `https://developers.openai.com:443/mcp`, streamable HTTP | `search_openai_docs` | Public OpenAI documentation; no credential | Read-only; no incremental service cost | Official endpoint and a useful bounded reference lookup for a documentation-maintenance WorkOrder. The remote implementation has no immutable release digest, so Mission Control must pin and recheck the advertised operation schema. | **Selected** |
| DeepWiki MCP | `https://mcp.deepwiki.com:443/mcp`, streamable HTTP | `read_wiki_contents` | Any public GitHub repository; no credential | Read-only; free public endpoint | Useful, but the public-repository namespace is substantially broader than the one documentation corpus needed for this proof and the generated wiki layer adds another source-of-truth boundary. | Rejected |
| Context7 MCP | `https://mcp.context7.com:443/mcp`, streamable HTTP | documentation lookup | Broad third-party library documentation; optional key for higher limits | Read-only; free tier/limits may vary | Broad corpus and multi-step library discovery create more schema, rate-limit, and scope surface than Phase 4 requires. | Rejected |

Sources: OpenAI Docs MCP documentation (<https://developers.openai.com/learn/docs-mcp>), DeepWiki MCP documentation (<https://docs.devin.ai/work-with-devin/deepwiki-mcp>), and Context7 repository (<https://github.com/upstash/context7>).

## Exact destination authority

The qualified destination is one URL only:

- Protocol: HTTPS with TLS certificate validation
- Hostname: `developers.openai.com`
- Port: `443`
- Path: `/mcp`
- Transport: MCP streamable HTTP
- Redirects: forbidden
- Raw IP URLs: forbidden
- DNS: each connection must resolve the exact hostname and reject loopback, link-local, private, multicast, unspecified, and reserved destinations before transport startup

The broker must deny wrong hosts, alternate ports, path changes, localhost, loopback, link-local, metadata-service addresses, private-network results, raw-IP substitution, redirects, and any post-qualification destination mutation before invoking transport. Denials must produce durable authorization receipts without making an external call.

## Frozen operation contract

The server's advertised schema includes `query`, optional `limit`, optional `cursor`, and the draft-07 marker. Mission Control separately admits a much narrower exact request: `query` is the fixed public documentation query above, `limit` is exactly `3`, and `cursor` is forbidden. The broker caps request and response bytes, timeout, retries, and output normalization. The remote handshake must advertise `search_openai_docs` with the frozen server input-schema digest before the call. A schema mismatch is `SERVER_SCHEMA_SUBSTITUTION`, not a prompt for dynamic adaptation.

The initial 2026-09-05 currentness handshake reached `tools/list` but stopped before `tools/call` because the first frozen schema was based on a contemporaneous web-surface schema rather than the MCP catalog. A public recorded MCP `tools/list` cassette confirmed the exact missing fields. That failed Tool Version is not mutated or admitted. Phase 4 creates a new contract fingerprint and reruns the complete offline gate before considering a second live call.

The remote service does not publish an immutable implementation digest. The Tool Version therefore records a contract fingerprint over the exact endpoint, protocol, operation, and frozen schemas. This is weaker than binary identity and is an explicit Phase 4 limitation. Each real connection compensates by validating TLS destination, handshake identity where available, and the exact advertised tool schema before invocation.

## One legitimate WorkOrder

The live proof WorkOrder is bounded documentation maintenance: confirm the public Codex MCP configuration reference before producing a candidate documentation update. The retrieved result is untrusted context only. It cannot choose a model route, alter the Execution Profile, mint a Tool Grant, dispatch another tool, approve a plan, publish a change, or satisfy independent verification.

## Public contract change inventory

One MCP-specific public Convex mutation is required: register the exact OpenAI Docs `search_openai_docs` Tool Version. The existing qualification, grant, profile, receipt, revocation, query, and evidence contracts remain the authority path. Because the new mutation changes the public runtime surface, Phase 4 increments `RUNTIME_CONTRACT_VERSION` once from 41 to 42 and must pass both the default guard and an explicit v41 baseline guard. No schema table or general connector API is added.

## First live call gate

Offline tests must qualify Tool Version identity, Tool Grant identity, profile compatibility, request/output bounds, destination policy, revocation/expiry, stale worker, cross-workspace denial, timeout/cancellation, receipt behavior, replay, hostile output, and server/schema substitution first. Immediately before the first MCP network request, evidence must record every field in the Phase 4 preflight as `QUALIFIED`, `AUTHORIZED`, or `NOT_REQUIRED`. A real model call is separately gated and is not authorized by this selection.
