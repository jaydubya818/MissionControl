# Capability dependency remediation, 2026-10-10

The production and full audit reported four high/critical advisories. This candidate changes only their four package versions. No risk acceptance, audit suppression, authorization rule or accounting code changes.

| Package | Locked before | Fixed candidate | Advisory and dependency path | Exposure and compatibility |
|---|---|---|---|---|
| source-map-js | 1.2.1 | 1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q); PostCSS/Vite and Tailwind | Untrusted indexed source maps can block the event loop. Build/tooling exposure; patch release preserves the API. |
| proxy-addr | 2.0.7 | 2.0.8 | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h); MCP SDK / Express | Incorrect IPv4-mapped trust subnets can trust spoofed forwarded IPs. No matching application trust-proxy configuration found; transitive runtime package remains patched. |
| shell-quote | 1.10.0 | 1.11.0 | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv); concurrently | Command injection needs a newline-bearing token after a comment token. Development command runner exposure. Fixed release rejects that input; ordinary command behavior requires CI validation. |
| @modelcontextprotocol/sdk | 1.26.0 | 1.31.0 | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h); orchestration-server and Taskmaster / fastmcp | OAuth credentials could follow an untrusted server-selected issuer. The governed broker uses a guarded HTTP transport without authProvider, with pinned DNS and redirects denied. Same-major update; issuer-aware persisted credentials would need separate migration if an OAuth integration is later introduced. No credential mutation here. |

Registry integrity values were verified before resolution. Exact package paths and vulnerable ranges are retained in audit-before.json. Root overrides cover direct and transitive copies. The existing unrelated type-is resolution is retained.

The unchanged audit gate passes with zero production findings, and zero high/critical/moderate findings in the full graph. The existing low @ai-sdk/provider-utils advisory remains visible and is outside this bounded high/critical correction. It is not suppressed.

Only the lockfile was resolved locally with lifecycle scripts disabled. Local installed packages were not replaced because the storage hold remains. Compatibility must be established by exact-SHA hosted CI with a frozen install. All PRs remain HOLD; no deployment or release authorization follows from a passing audit.

A compatibility follow-up aligns new host and Convex MCP snapshots with pinned SDK 1.31.0. Two red-first control-plane regressions reproduced stale 1.26.0 labels. Existing snapshots/grants are not rewritten: a coherently rehashed old-SDK grant is denied before transport. This was independently visible in main's PR #236 fix; the bounded equivalent was applied without merging that dependency branch or its other execution changes.
