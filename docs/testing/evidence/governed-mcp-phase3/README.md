# Governed read-only MCP Phase 3 evidence

This directory retains evidence for the one Phase 3 `QUALIFICATION_FIXTURE`.
The authoritative admission command is:

```sh
MC_QUALIFICATION_BASE_SHA=3ae9d86eeff1966862a6959664ec1fe2e6e7240a pnpm run qualify:factory:v2
```

`qualify:mcp:phase3` is a developer convenience exercised as a stage inside
that Factory qualification. It uses the official MCP SDK in the host broker and
a dependency-free, single-file local stdio server. Each run writes a new
revision-scoped file under `runs/`; previous evidence is never overwritten.

The broker scenario records exact identity and receipt-shaped observations from
the real stdio exchange. Those observations are not described as immutable
control-plane receipts: append-only Convex persistence, live currentness, and
transactional call-budget behavior are proven by the Factory qualification's
control-plane and integration gates. The completion record links both classes
of proof, independent reviews, browser evidence, and rollback/revocation proof.

No evidence here admits a network service, credentials, a write operation, or
general MCP support for Codex or DeepSeek.
