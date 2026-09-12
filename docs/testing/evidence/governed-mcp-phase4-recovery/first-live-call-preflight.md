# Context7 first-live-call preflight

Date: 2026-09-05

Disposition: `READY_FOR_REAL_SERVICE_CALL`

| Gate | Frozen value | Result |
| --- | --- | --- |
| Service | Context7 / `context7-docs` | QUALIFIED OFFLINE |
| Provider contract | `@upstash/context7-mcp@4.0.5`, release commit `a37d30cf14f69341e12c226fcc729c62b4f0a900`, npm integrity `sha512-PHDDdCiu/H9d37R//g/s50f5/EBvGECABExSgz0ESsdpeEoPCfWj34xd21r/3zakWTapOOwqManMwd9j9W2Xow==` | QUALIFIED OFFLINE |
| Operation | `query-docs`, provider annotation `readOnlyHint: true`, `destructiveHint: false` | QUALIFIED OFFLINE |
| Expected schema | digest `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942` | QUALIFIED OFFLINE |
| Observed schema | Must be captured from `tools/list` and equal expected before `tools/call` | FAIL-CLOSED GATE ARMED |
| Server currentness | Initialize identity must be exactly `Context7` / `4.0.5` | FAIL-CLOSED GATE ARMED |
| Destination | `https://mcp.context7.com/mcp`; TLS, no redirect, public DNS only | QUALIFIED OFFLINE |
| Data | Fixed public React documentation query only | AUTHORIZED |
| Credential | `NONE`; no Authorization or API-key header | AUTHORIZED |
| Service cost | Anonymous public access; no incremental paid service call | AUTHORIZED |
| Model call | None | NOT REQUIRED |
| Execution Profile | One ephemeral direct-qualification profile, exact Tool Grant binding | QUALIFIED FOR DIRECT DIAGNOSTIC ONLY |
| Tool Version | `sha256:db771657f99224ece3c62310bb7f2654a51c11d36a51774c81c02bd1e30b03ea` | QUALIFIED OFFLINE |
| Tool Grant | Exact operation, arguments, destination, one call, 60-second expiry | QUALIFIED FOR DIRECT DIAGNOSTIC ONLY |
| Lease/fencing | Exact synthetic Attempt/worker/session tuple, 60-second expiry | QUALIFIED FOR DIRECT DIAGNOSTIC ONLY |
| Budget | One call, zero retries, 10-second timeout, 256-byte request, 65,536-byte response | AUTHORIZED |
| Offline negative controls | Scope, destination, DNS, identity, schema drift, replay, cancellation, timeout, hostile output | GREEN |
| Phase 3 fixture regression | Focused fixture and worker suites | GREEN |

The diagnostic may make one `query-docs` call only after the endpoint handshake,
server identity, protocol, destination, and exact schema gates pass. Any failure
must stop before additional calls. Its in-memory receipts prove broker behavior
but are not Phase 4 acceptance evidence. A successful diagnostic must still be
followed by the browser-dispatched durable WorkOrder/Attempt path.
