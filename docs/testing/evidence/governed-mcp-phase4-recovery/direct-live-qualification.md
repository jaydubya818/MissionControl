# Direct Context7 live qualification

Date: 2026-09-05

Result: `SUCCEEDED` — transport qualification only, not Phase 4 acceptance.

- Service: `context7-docs`
- Operation: `query-docs`
- Destination: `mcp.context7.com:443`
- Tool Version: `sha256:db771657f99224ece3c62310bb7f2654a51c11d36a51774c81c02bd1e30b03ea`
- Ephemeral diagnostic Tool Grant: `sha256:31880bb91a316dd2990e0383e7df735f12e98b058986c29b26c66c9b7edb5e3d`
- Expected server version: `4.0.5`
- Observed server version: `4.0.5`
- Expected input schema: `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942`
- Observed input schema: `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942`
- Request bytes: 86
- Output bytes: 138
- Output digest: `62f801a8916430200cd7b3136c4d7e2ce812f1a266e747335f630cb7461e81b6`
- Duration: 910 ms
- Retry count: 0
- Credential: none
- Model call: none
- Poisoning detected: false

The broker performed endpoint/DNS/redirect checks, protocol negotiation,
server identity validation, `tools/list`, and expected/observed schema equality
before the single `tools/call`. The two receipts above were held by the direct
diagnostic's in-memory sink and are not durable acceptance receipts. No second
direct diagnostic call is authorized.
