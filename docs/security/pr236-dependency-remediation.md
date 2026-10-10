# PR 236 dependency security remediation

Reviewed October 10, 2026. Scope: the four reported high/critical advisories.
The pnpm 9 frozen install succeeds with only these four resolutions changed.
Unrelated side-channel, hasown and type-is deduplication was removed from the
resolver output. Integrity hashes come from the generated registry resolution.
No advisory suppression, risk acceptance, security-check change or broad upgrade.

## Patched dependency paths

| Package | Prior | Minimum patched / selected | Vulnerable range | Audit severity |
| --- | --- | --- | --- | --- |
| source-map-js | 1.2.1 | 1.2.2 | >=1.0.0 <1.2.2 | High |
| proxy-addr | 2.0.7 | 2.0.8 | >=1.1.0 <2.0.8 | Critical |
| shell-quote | 1.10.0 | 1.11.0 | >=1.8.4 <1.11.0 | Critical |
| @modelcontextprotocol/sdk | 1.26.0 | 1.31.0 | >=1.12.0 <1.31.0 | High |

### source-map-js

[source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Reached through UI Tailwind and through Vite → PostCSS in UI and workspace test tooling. The patch rejects pathological indexed source-map offsets.

### proxy-addr

[proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).

Reached through SDK → Express, both orchestration and Taskmaster → fastmcp. The patch corrects IPv4-mapped IPv6 subnet trust matching.

### shell-quote

[shell-quote: `quote()` command injection via a line terminator in a token after a `{ comment }` token](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).

Reached through root development dependency concurrently. The patch rejects line terminators after comment tokens rather than producing executable shell text.

### @modelcontextprotocol/sdk

[MCP TypeScript SDK: OAuth client could send credentials to an authorization server chosen by the MCP server](https://github.com/advisories/GHSA-6qxp-vccf-f47h).

Direct orchestration dependency and Taskmaster → fastmcp transitive dependency. Both are pinned to the same minimum patched 1.x release. The patch binds OAuth credentials to their authorization-server issuer.

## Qualified identity and behavior

Independent review caught stale SDK identity labels. New host and Convex MCP
snapshots now declare SDK 1.31.0. A red-first regression reproduced the mismatch.
The broker test checks the installed SDK version and reconstructs a coherent
old-SDK grant; it is rejected as SERVER_SUBSTITUTION before transport. The
control plane rejects both old fixture and old Context7 snapshots. Historical
evidence is unchanged. New SDK qualification and grants are required before
activation; old qualification is not transferred to the new runtime.

The inspected MCP broker uses stdio or credential-free HTTP with no OAuth
provider or stored OAuth tokens. No OAuth credential migration is required for
those paths. Destination, DNS, redirect, read-only, lease, grant, accounting and
spend controls remain unchanged. Runtime contract v61 was already introduced
for observed-cost reconciliation; README and OVERVIEW now match that source.

## Validation

- Frozen pnpm install: pass.
- Unchanged release security gate: pass. Production has zero advisories;
  all-dependency audit has zero critical/high/moderate and one existing low.
- Complete workspace tests: pass, including 813 orchestration and 1,503 Convex.
  The subsequently added broker identity regression passed with all 17 broker tests.
- Complete workspace typecheck: pass.
- Opt-in Docker tests and exact-final-SHA CI: pending at this implementation checkpoint.
- Independent review: initial identity finding fixed; final review pending.

The remaining low advisory is GHSA-866g-f22w-33x8 in Taskmaster's transitive
@ai-sdk/provider-utils 3.0.21, patched at 3.0.28. It is outside the four approved
targets and passes the existing policy without a new exception.

## Holds

No merge, deployment, credential change, paid execution or release of the $4.49
hold. Main and review-branch Vercel automatic deployment remain disabled.
Deployment readiness remains NO pending fresh SDK qualification, exact AWS
route verification, live producer/verifier qualification, billing reconciliation
and explicit activation/budget authority. CI alone does not clear those gates.
