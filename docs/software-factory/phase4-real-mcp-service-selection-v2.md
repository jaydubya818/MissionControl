# Phase 4 Recovery — Real Read-Only MCP Service Selection

Date: 2026-09-05

## Decision

Select Context7 MCP release `@upstash/context7-mcp@4.0.5` for the Phase 4
recovery proof. OpenAI Developer Docs MCP remains
`OPENAI_DOCS_MCP_CONTRACT_UNQUALIFIABLE_UNDER_CURRENT_POLICY` because its
provider documentation identifies a mutable endpoint and read-only purpose but
does not publish an immutable operation/schema contract tied to a server
version. The two prior OpenAI handshakes remain immutable negative evidence.

The Context7 qualification binds the published package contract to the live
service twice: the initialize response must identify `Context7` version
`4.0.5`, and the observed `query-docs` input schema must exactly equal the
schema generated offline by that release. Discovery is evidence only and never
creates authority.

## Selection matrix

| Property | OpenAI Developer Docs MCP (Option A) | Context7 MCP (Option B1) | Microsoft Learn MCP (Option B2) |
| --- | --- | --- | --- |
| Service | OpenAI Developer Docs MCP | Context7 MCP | Microsoft Learn MCP Server |
| Provider / owner | OpenAI | Upstash | Microsoft |
| Transport | Streamable HTTP | Streamable HTTP | Streamable HTTP |
| Endpoint | `https://developers.openai.com/mcp` | `https://mcp.context7.com/mcp` | `https://learn.microsoft.com/api/mcp` |
| Exact operation | `search_openai_docs` candidate | `query-docs` | `microsoft_docs_search` candidate |
| Published contract source | Unversioned endpoint documentation only | Immutable Git tag/source plus npm package release | Product repository and endpoint documentation |
| Contract version | None tied to endpoint/schema | `@upstash/context7-mcp@4.0.5` | None tied to endpoint/schema |
| Schema identity | No immutable provider-published schema | Exact `query-docs` schema generated offline from v4.0.5; digest `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942` | Provider explicitly says tools and schemas evolve dynamically |
| Data scope | Public OpenAI docs | Fixed public React docs query only | Public Microsoft Learn docs |
| Credential requirement | None | None for the bounded anonymous endpoint path; no plugin query parameter | None |
| Destination | `developers.openai.com:443` | `mcp.context7.com:443` | `learn.microsoft.com:443` |
| Read-only proof | Provider says documentation-only/read-only | v4.0.5 tool annotation: `readOnlyHint: true`, `destructiveHint: false`; source calls only documentation retrieval | Documentation search/fetch purpose |
| Cost | No incremental API cost documented | Anonymous access; API key is recommended only for higher limits | No authentication documented |
| Revocation | Disable Tool Version / revoke Tool Grant | Disable Tool Version / revoke Tool Grant | Disable Tool Version / revoke Tool Grant |
| Currentness semantics | Mutable `tools/list` only | Exact initialize version `4.0.5` plus exact observed/published schema equality | Provider requires dynamic discovery and refresh |
| WorkOrder usefulness | OpenAI documentation maintenance | React frontend correctness/documentation maintenance | Microsoft technology documentation maintenance |
| Qualification risk | No immutable contract | Hosted deployment could differ from release; exact version/schema checks fail closed | Dynamic schema is intentionally incompatible with pinning policy |
| Decision | Unqualifiable | **Selected** | Unqualifiable |

## Frozen selected contract

- Server identity: `Context7` / Mission Control key `context7-docs`
- Provider contract: npm package `@upstash/context7-mcp@4.0.5`
- Release tag: `@upstash/context7-mcp@4.0.5`
- Release commit: `a37d30cf14f69341e12c226fcc729c62b4f0a900`
- npm artifact integrity: `sha512-PHDDdCiu/H9d37R//g/s50f5/EBvGECABExSgz0ESsdpeEoPCfWj34xd21r/3zakWTapOOwqManMwd9j9W2Xow==`
- Mission Control implementation identity: `sha256:f9d12c44a0a0d505c8604fc852af7ec0d7811c768e338e01598f36b6278972ca`
- Protocol negotiated by the existing broker: `2025-11-25`
- Operation: `query-docs`
- Input schema digest: `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942`
- Provider output schema: not advertised; Mission Control enforces its normalized text envelope
- Normalized output schema digest: `feb48503b083f60b20727a4f816505e3cea9a376deb9f6c5b10c2baa9fdbf399`
- Tool Version digest: `sha256:59151f37eb70b6f51a0a6d213fd6e330703a6cc2cb470f525ee574f1fe22b490`
- Arguments: `{ "libraryId": "/facebook/react", "query": "useEffect cleanup for external subscriptions" }`
- Data: `PUBLIC`, exact corpus `CONTEXT7_PUBLIC_REACT_DOCUMENTATION`
- Credential: `NONE`
- Side effect: `READ_ONLY`
- Timeout: 10 seconds
- Request limit: 256 bytes
- Response limit: 65,536 bytes
- Redirects: denied
- DNS: public addresses only, rechecked on every transport fetch
- Calls: one per Attempt, zero retries

## Expected and observed identities

`EXPECTED_QUALIFIED_SCHEMA` is the canonical schema generated offline by the
exact provider release. `OBSERVED_LIVE_SCHEMA` is captured from the live
`tools/list` response and recorded separately in the Tool Call Receipt. A real
call is allowed only when their canonical digests are equal. The live initialize
version must also equal `4.0.5`.

The normalization used for schema comparison sorts object keys recursively but
does not remove descriptions, required fields, schema dialect markers, or any
other semantic field. Array order remains significant. It therefore changes
serialization order only, not schema meaning.

If the release disappears, the npm integrity changes, the endpoint advertises a
different server version, or the observed schema differs, this Tool Version is
stale/unqualified and the broker fails closed. Requalification requires a new
reviewed Tool Version; historical grants and receipts remain immutable.

## Uncommitted v42 worktree audit

| Change | Classification | Recovery treatment |
| --- | --- | --- |
| Streamable HTTP transport, exact destination/DNS/redirect controls | `REUSABLE_GENERIC_FOUNDATION` | Retained and parameterized for Context7 |
| Exact schema comparison and fail-closed classification | `REUSABLE_GENERIC_FOUNDATION` | Retained; expected and observed identities are now separately receipted |
| Generic Tool Version, Tool Grant, Attempt, receipt, and UI plumbing | `REUSABLE_GENERIC_FOUNDATION` | Retained |
| OpenAI service constants, schema, registration mutation, and output label | `OPENAI_SPECIFIC` | Replaced with exact Context7 v4.0.5 identities |
| Two OpenAI endpoint handshake records | `FAILED_EXPERIMENT_ONLY` | Preserved only in the original NO_GO evidence set |
| WebMCP/community schema assumptions | `DISCARD` | Not carried into the recovered contract |
| Runtime contract v42 bump | `REUSABLE_GENERIC_FOUNDATION` | Retained after the final public diff was checked against v41; the exact Context7 registration and local-candidate recovery contracts are intentional public additions |

## Provider evidence

- OpenAI endpoint/read-only documentation: <https://developers.openai.com/learn/docs-mcp>
- Context7 v4.0.5 release: <https://github.com/upstash/context7/releases/tag/%40upstash/context7-mcp%404.0.5>
- Context7 v4.0.5 tool source: <https://github.com/upstash/context7/blob/%40upstash/context7-mcp%404.0.5/packages/mcp/src/index.ts>
- Context7 endpoint and credential guidance at the exact tag: <https://github.com/upstash/context7/blob/%40upstash/context7-mcp%404.0.5/README.md>
- Microsoft Learn dynamic-contract guidance: <https://github.com/MicrosoftDocs/mcp#%EF%B8%8F-building-a-custom-client>
