# Governed MCP Phase 4 completion record

Status: **PHASE_4_CLOSED**

This immutable record freezes the strongest claim supported by Phase 4:

> One real read-only MCP service was qualified through Mission Control's
> canonical browser-dispatched WorkOrder, Attempt, Execution Profile, Tool
> Grant, broker, durable Tool Call Receipt, and independent-verification path.

It does not authorize a general MCP platform, arbitrary servers or operations,
write-capable tools, broader credentials, remote arbitrary MCP, harness-native
MCP, or production-wide MCP.

## Qualified identity

| Field | Frozen value |
| --- | --- |
| Service | Context7 MCP `4.0.5` |
| Operation | `query-docs` (read-only) |
| Fixed arguments | library `/facebook/react`; query `useEffect cleanup for external subscriptions` |
| Endpoint | `https://mcp.context7.com/mcp` |
| Allowed destination | `mcp.context7.com:443`, HTTPS, public DNS only, redirects denied |
| Stable published contract | `@upstash/context7-mcp@4.0.5` |
| Release commit | `a37d30cf14f69341e12c226fcc729c62b4f0a900` |
| Package integrity | `sha512-PHDDdCiu/H9d37R//g/s50f5/EBvGECABExSgz0ESsdpeEoPCfWj34xd21r/3zakWTapOOwqManMwd9j9W2Xow==` |
| Expected qualified server version | `4.0.5` |
| Observed live server version | `4.0.5` |
| Expected qualified schema digest | `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942` |
| Observed live schema digest | `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942` |
| Tool Version | `wd7r7htk8w5fj5bka3peexgv2s8dv60j` |
| Tool Version digest | `sha256:59151f37eb70b6f51a0a6d213fd6e330703a6cc2cb470f525ee574f1fe22b490` |
| Tool Grant | `w97vvpwmnc3a2wfwj2x3nzb3fs8dvave` |
| Tool Grant digest | `sha256:2bdbc466379b81bf1189c4703121c8418ecaa99b9da51c6972e174c486ae3cab` |
| Execution Profile | `w17g54jf86s77hn370407emp5d8dvk0e` |
| Execution Profile digest | `sha256:a49832c6a97ced874ecc48a7b6d364976b164b57b3b4655cac205200b8d45f1b` |
| Project/workspace | `sn7b1vs0eda93we4qe76rpcmm18dtnjn` |
| Mission | `gs7nhgw097vcasjqw7dcm2hwgd8dvb1s` |
| Plan | `gn7nwft7pxak8728449cr071dd8dvn5z` |
| WorkOrder | `yh7201gkt7cqwgqv085n95nxbs8dt7s2` |
| Task | `wh762h5d558c11b0n7s7sbsc4n8dvshm` |
| Source Attempt / workflow run | `ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg` |
| Operator run | `ci4zgph7` |
| Tool Call Receipt | `w57h70zrn7a0pfqpw970da0n6x8dvmd2` |
| Authorization receipt | `w57gyhz7y6fq52cm1tk1ez8egx8dv5hg` |
| Tool call ID | `mcp:ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg:query-docs:1` |
| Sanitized output digest | `62f801a8916430200cd7b3136c4d7e2ce812f1a266e747335f630cb7461e81b6` |
| Limits | 10 seconds; 256 request bytes; 65,536 response bytes |
| Observed transport | 905 ms; 86 request bytes; 138 output bytes |
| Credential class | Public; no credential |
| Cost | `UNKNOWN`, never coerced to zero |
| External Context7 operations | 2 total: one direct diagnostic and one canonical Attempt |
| Retry count | 0 |

`EXPECTED_QUALIFIED_SCHEMA` and `OBSERVED_LIVE_SCHEMA` are intentionally
separate facts. Equality was observed for this qualification. Any future
divergence fails closed; discovery output never updates authority.

## Verification and delivery

| Field | Frozen value |
| --- | --- |
| Verification Attempt | `ys726g569gsxcb65f1nxhzdjwd8dt39h` |
| Verification run | `nh7gt75yvpdckn9cgwzhhex3wn8dtw81` |
| Verdict | `VERIFIED`; independence `true` |
| Acceptance | current `false`; eligible `false` because subject was `LOCAL_GIT` |
| WorkOrder verification receipt | `xh7ehfyk2evkh9wpq7ah1m645x8dv0f5` |
| Criterion receipt | `xh73mvyksay3pe4veyfece3xfs8dv990` |
| Decision digest | `sha256:a512648d62fb4815d898922fc31e4dd4e8151680897675b040c2e7c8cfe54a66` |
| Evidence digest | `sha256:f27210e66ab35ddefb20991c4175658e486223ce6ae68fb9d2b1e6159a8b5d4d` |
| Environment | Disposable isolated local backend and UI; synthetic data only |
| Shared-state classification | No shared development state and no customer data |
| Cleanup | Worker, UI, and backend stopped; database, storage, environment file, and synthetic candidate/verifier worktrees removed; redacted evidence retained |
| Runtime contract | `v42` |
| Implementation PR | `#174` |
| Implementation merge SHA | `aa8c12b1d4907589b71cef3cb421ef2a2c380676` |
| Closure PR | `#175` |
| Final qualified main SHA | `ed77c46c9d975a2ed0c666cdaf0a3f0e12e77d4d` |
| CI | All required checks passed for PRs `#174` and `#175` |

Independent security, data-integrity, architecture, and simplicity reviews all
returned GO. Their findings and the post-merge gate outputs are retained in
`pre-merge-qualification.md` and `post-merge-qualification.md`.

## Authority boundary

Discovery is not authority. `tools/list` and any equivalent response cannot
grant access. Every call must resolve current authority through:

`Tool Version + Tool Grant + Execution Profile + Attempt + current policy`

The canonical execution path remains:

`WorkOrder → Task → Attempt → Execution Profile → Tool Grant → Broker → Tool → Receipt → Evidence`

No direct agent-to-tool path is qualified. Create, update, delete, send,
comment, merge, deploy, permission changes, and all other external mutations
remain unsupported.

## Permanent negative controls

`pnpm run test:mcp:phase4` is the offline contract regression entry point. Its
deterministic fixtures cover exact server, expected and observed schema, exact
Tool Version, exact Tool Grant, stale Tool Version, revoked grant, wrong
workspace, wrong operation and destination, hostile and oversized output,
timeout, cancellation, stale lease/completion, replay, malformed packets,
identity or implementation substitution, reservation enforcement, and schema
substitution. The suite must not contact the live service.

The earlier OpenAI Docs NO_GO at
`../governed-mcp-phase4-real-service/no-go-record.md` remains immutable and is
not superseded or rewritten by this successful replacement-service proof.

Live requalification is explicit and governed by
`../../../software-factory/governed-mcp-recertification-policy.md`.
