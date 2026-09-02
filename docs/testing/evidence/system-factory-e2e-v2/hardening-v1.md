# Release & Dependency Hardening V1

Decision: **HARDENING V1 PASSED**

## Baseline control inventory

| Area | Existing control | Existing evidence | Hardening gap and disposition |
| --- | --- | --- | --- |
| Dependency auditing | pnpm lockfile and manual `pnpm audit` | V1 packet: 4 production moderate, no high/critical | Added reproducible prod/full audit gate plus exact risk records; safe patches reduced findings |
| Lockfile integrity | pnpm 9 lockfile | Frozen local install passed | All CI/Vercel installs are now frozen; no Git/URL dependency sources found |
| Secret scanning | Redaction helpers and credential-boundary tests | GitHub App, worker, sandbox tests | Added high-confidence tracked-file gate and fixture-only annotations; 2,285 tracked files pass |
| CI release gates | Test/typecheck/build/runtime jobs | Existing GitHub Actions | Pinned Actions to exact SHAs; added blocking security, browser/accessibility, and V2 qualification jobs |
| Vercel/security headers | Scoped `/v2` SPA rewrites | `vercel.json` | Added frame/base/object CSP, permissions, referrer, nosniff, and frame protections; retained scoped rewrites |
| Authentication boundaries | Convex/company scope and orchestration service auth | auth and company-policy suites | Re-proved; no authority change |
| GitHub App credentials | Host-only publisher/token flow | publisher/readiness/CI-ingest suites | Re-proved no persistence/evidence/harness exposure |
| Worker credentials | server admission and leases | worker guardrail/admission suites | Re-proved stale session/generation/manifest fail closed |
| Sandbox credentials | attempt-scoped issue/revoke lifecycle | credential, reconciler, remote runtime suites | Re-proved revoke-before-teardown and no GitHub authority |
| Evidence/artifact redaction | normalized envelopes and secret shaping | redaction and composed qualification suites | Added public-error sanitizer and built-bundle scan |
| Factory Memory/Learning/harness redaction | advisory projections and normalized results | Memory/Learning/harness tests | Re-proved no credential or acceptance authority |
| API error disclosure | route-local error handling | orchestration tests | Raw errors and host paths were client-visible; centralized bounded sanitization fixed this |
| Logs/traces | normalized trace/evidence contracts | observability suites | Re-proved no credentials; useful identifiers retained |
| Production build | Vite + workspace builds | V1 build | Passed; 49 emitted files, no source maps or secret-shaped values |
| E2E | live and shell Playwright suites | V1 browser evidence | Added blocking deterministic critical route/a11y gate and full live V2 matrix |
| System Qualification | one canonical runner | V1 packet | Extended in place to V2 Spec/harness/security lineage; V1 evidence remains immutable |

## Advisory results

| Scope | Before | After |
| --- | --- | --- |
| Production | 0 low / 4 moderate / 0 high / 0 critical | 0 low / 3 moderate / 0 high / 0 critical |
| Complete graph | 4 low / 9 moderate / 0 high / 0 critical | 2 low / 4 moderate / 0 high / 0 critical |

Safe exact overrides patched `yaml` 2.8.2→2.8.3, `file-type` 21.3.0→21.3.2, `uuid` 11.1.0→11.1.1, `qs` 6.15.0→6.15.2, `@babel/core` 7.29.0→7.29.6, and `body-parser` 2.2.2→2.3.0. No direct framework, Convex, Vite, Playwright, TypeScript, pnpm, authentication, or orchestration major was changed.

### Current advisory classification

| Package / advisory | Path and reachability | Preconditions / actual exposure | Smallest remediation and blast radius | Recommendation |
| --- | --- | --- | --- | --- |
| `react-router` 6.30.6 / 1124268, moderate | UI → `react-router-dom` → `react-router`; production client bundle | Crafted attacker-controlled navigation target; Mission Control constructs internal paths and has no router external-redirect flow | Patched release requires React Router 7.18+, a navigation major migration | Accept through 2026-11-15; review 2026-09-15; execute dedicated migration plan |
| `react-router` 6.30.6 / 1124272, moderate | UI transitive production bundle | Framework/Data Router SSR manual hydration and attacker-shaped serialized errors; product uses client-only declarative BrowserRouter | React Router 7.18+; broad route/hydration qualification | Accept because preconditions are absent; migrate separately |
| `turbo` 1.13.4 / 1121861, moderate | Root dev dependency, only `clean`; absent from production audit/deploy/CI | Turbo login callback; Mission Control never starts one | Turbo 2.9.14 major tooling migration | Accept through 2026-11-15; dedicated clean/Node 20 validation |
| `turbo` 1.13.4 / 1119389, low | Same development-only path | Yarn Berry project detection; repository is pnpm-only | Same major migration | Track with Turbo migration |
| `@ai-sdk/provider-utils` 3.0.21 / 1119676, low | Taskmaster CLI transitive only; absent from runtime/CI/production audit | Manually invoked development planning CLI and malicious oversized provider data | No upstream patch is published | Re-evaluate Taskmaster when a patch exists |

Exact owner, versions, controls, review/expiry dates, and migration pointers are enforced from `docs/security/dependency-risk-acceptances.json`. A high or critical advisory always fails regardless of an entry. A moderate fails unless every identity and time-bound field matches.

## Supply-chain and repository integrity

- `pnpm install --frozen-lockfile` passes and is used by every CI job and Vercel.
- The lockfile contains no Git, GitHub shorthand, HTTP tarball, or other unexpected dependency source.
- Only `.env.example` files are tracked; no tracked private keys, environment files, caches, coverage, build output, test results, or Playwright reports were found.
- The production build emits no `.map` files. The repository and emitted bundle secret scans pass.
- Dependency overrides are limited to the six exact patched versions above and are covered by the audit gate.

## Release/config changes

- `pnpm run release:security`: exact dependency policy plus repository secret scan.
- `pnpm run qualify:factory` and `qualify:factory:v2`: one V2 canonical runner; dependency/security, release-config, immutable V1, composed lineage/failures, complete tests, lint, runtime, build, smoke, and whitespace.
- GitHub Actions use exact action commit SHAs, frozen installs, a blocking Browser Security and Accessibility job, and System Qualification V2.
- Vercel rewrites only `/v2` and `/v2/:path*`; `/api`, callbacks, `.well-known`, and arbitrary non-v2 paths are not swallowed by SPA fallback.
- Security headers apply to static responses. HSTS remains intentionally deferred until the canonical production-domain and subdomain policy is qualified.

## Runtime and public API delta

Runtime remains v28. The runtime-contract guard reports no public Convex validator change across 906 functions. There is no schema or public API addition. Internal deltas are bounded to sanitized orchestration error strings/directory metadata, safe docs rendering, a real command binding for Spec verification expectations, improved loading semantics, release configuration, and qualification/test infrastructure.
