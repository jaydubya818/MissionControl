# 2026-11-02 high-severity dependency remediation

Owner: Jay West. Scope: restore Release Security Gates and System Qualification V2
on `main` (`ee922b6c`) without weakening the audit policy, ignoring highs, or
changing factory work orders WO-001..014.

Baseline CI: https://github.com/jaydubya818/MissionControl/actions/runs/41453928846
(`FAIL production: 0 critical / 5 high / 11 moderate`; `FAIL all: 15 high / 22 moderate`).

No existing open upgrade branch or PR duplicated this work. Open PRs #241–#243
are docs-only and were not modified.

## Policy applied

- High and critical findings cannot be risk-accepted (`scripts/lib/dependency-audit-gate.mjs`).
- Same-major patched releases were selected (smallest patched version on the
  current major).
- One moderate finding (`@hono/node-server` 1243661) has no 1.x patch; major 2
  requires Node >=20. It is recorded in `dependency-risk-acceptances.json` with
  exploitability evidence. High findings were not accepted.

## High findings

| Advisory | Package | Installed | Exploitable in Mission Control? | Why | Fixed |
| --- | --- | --- | --- | --- | --- |
| [1242628](https://github.com/advisories/GHSA-22jm-h49p-29qw) | `@modelcontextprotocol/sdk` | 1.31.0 | No active experimental-tasks path, but production SDK | Governed broker uses stdio + Streamable HTTP client only; still a production dependency of orchestration | 1.32.2 |
| [1242649](https://github.com/advisories/GHSA-46jr-4wx8-v453) | `@modelcontextprotocol/sdk` | 1.31.0 | Yes (reachable) | HTTP MCP client/server validation is on the Context7 Streamable HTTP path | 1.32.2 |
| [1242658](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | `vite` | 6.4.3 | Dev-server / Windows editor launch; counted as production because `@tailwindcss/vite` is a UI dependency | Launch-editor existence check bypass. Production static assets do not run Vite's dev server, but `--prod` audit includes it. 6.4.4 still has moderate 1243858 (`server.fs.deny` query bypass), so 6.4.5 is the selected patch | 6.4.5 |
| [1243066](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | `zod` | 4.3.6 (prod), 3.25.76 (Taskmaster) | Yes for orchestration Zod 4 schemas; Taskmaster 3.x was also flagged because the advisory range is `<4.6.6` | Oversized constrained collections can exhaust memory. Orchestration validates inference/Bedrock payloads with Zod. AI SDK peers allow `^4.1.8`, so 4.6.6 is compatible | 4.6.6 |
| [1243074](https://github.com/advisories/GHSA-27r3-jxmh-p828) | `body-parser` | 2.3.0 | Transitive through MCP SDK → Express; not a direct Mission Control server | Compressed-body trailing-byte DoS. Patched because it is in the production MCP SDK tree | 2.4.0 |
| [1242604](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [1242605](https://github.com/advisories/GHSA-8r9p-f939-6h3c), [1244003](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) | `follow-redirects` | 1.16.0 | Dev-only (Taskmaster → axios) | Credential headers on redirects. Not in production audit; still high on the all-deps gate | 1.16.2 |
| [1243113](https://github.com/advisories/GHSA-xjj6-f33q-929c), [1243473](https://github.com/advisories/GHSA-4w7w-5xrc-9h26), [1243475](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [1243478](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) | `undici` | 7.29.1 | Dev-only (Taskmaster → fastmcp) | TLS/cache/DoS issues in undici 7.29.1. Not in production audit; still high on the all-deps gate | 7.30.1 |
| [1243857](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) | `decode-uri-component` | 0.5.0 | Dev-only (`@testing-library/jest-dom` → css) | Quadratic percent-decoding DoS in UI unit tests | 0.5.1 |

## Same-major moderate patches included so the existing gate can pass

These are not high, but `evaluateDependencyAudit` fails closed on unaccepted
moderates. Each has a same-major patch, so they are upgraded rather than accepted.

| Advisory | Package | Installed | Fixed |
| --- | --- | --- | --- |
| 1242595 | `hono` | 4.13.7 | 4.13.11 |
| 1242630, 1242667 | `@modelcontextprotocol/sdk` | 1.31.0 | 1.32.2 |
| 1242622, 1242651, 1242730, 1243858 | `vite` | 6.4.3 | 6.4.5 |
| 1242767, 1242769 | `@vitest/mocker` | 4.1.11 | 4.1.12 |
| 1243098, 1243104 | `fast-uri` | 3.1.8 | 3.1.9 |
| 1242883 | `ip-address` | 10.7.1 | 10.7.4 |
| 1243687 | `qs` | 6.16.0 | 6.16.1 |
| 1243078, 1243081, 1243481, 1243484 | `undici` | 7.29.1 | 7.30.1 |

## Moderate with no same-major patch

| Advisory | Package | Exploitable? | Disposition |
| --- | --- | --- | --- |
| [1243661](https://github.com/advisories/GHSA-rmxm-3fg6-px4f) | `@hono/node-server` 1.19.17 (now 1.19.18, see note below) | No. `serveStatic` is unused. Orchestration uses `Hono` + `serve` only. | Recorded acceptance. Patched line is 2.1.3+ (`engines.node >=20`). |

## Compatibility

- MCP Tool Version snapshots now bind to SDK **1.32.2**. Existing 1.31.0 / 1.26.0
  grants remain denied as `SERVER_SUBSTITUTION` / `tool-version-substituted`
  before transport. Fresh qualification is required before activation.
- Runtime contract remains **v63**. No Convex public function signatures changed.
- Zod 4.3.6 → 4.6.6 is same-major. `@ai-sdk/*` peers already allow `^4.1.8`.
  Taskmaster's `generateTasksFromPRD` schema parses and round-trips through
  AI SDK `generateObject` on the overridden Zod 4.6.6 (`scripts/lib/taskmaster-planning-zod.test.mjs`).
- Stale low advisory 1119676 (`@ai-sdk/provider-utils` 3.0.21) was removed from
  `dependency-risk-acceptances.json`; the existing `@ai-sdk/provider-utils@<3.0.28`
  override already moved Taskmaster onto 3.0.28, so the finding is no longer in the audit.
- Vite 6.4.3 → 6.4.5 and Vitest 4.1.11 → 4.1.12 are patch releases.
- Hono 4.13.7 → 4.13.11 required an explicit `MiddlewareHandler` return type on
  `requireAuth()` so TypeScript 2742 declaration emit stays portable. Auth
  behavior is unchanged.
- `@hono/node-server` stayed on 1.19.17 in this PR; Node >=18 floor is unchanged.
  Superseded by PR #245, which pins **1.19.18** to close GHSA-jpvv-r467-5p4w
  (`serve()` backslash path) and keeps the 1243661 acceptance. See
  [2026-11-03-hono-node-server-1243661.md](2026-11-03-hono-node-server-1243661.md).
- `@mission-control/cli`, `@mission-control/openclaw-sdk`, and
  `@mission-control/capability-control` do not depend on the patched packages.
  MyEve `missioncontrol-consumer` is not in this repository; no public package
  API was changed for that consumer.

## What was not done

- No advisory ignore list, no high-severity acceptance, no audit-level change.
- No merge, deploy, or environment change.
- Historical qualification evidence under `docs/testing/evidence/` was not edited.
- Factory work orders WO-001..014 were not touched.
- PRs #241, #242, and #243 were not modified.
