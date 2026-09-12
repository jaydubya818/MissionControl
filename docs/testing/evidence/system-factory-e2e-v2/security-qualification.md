# Security qualification findings

Status: **PASS with time-bounded accepted dependency risks**

The findings below use the repository security-review format: rule, severity, location, evidence, impact, fix, mitigation, and false-positive notes. No credential value is included.

## Remediated findings

### SEC-PATH-001 — High — persona path traversal

- Location: `apps/orchestration-server/src/orchestrationSecurity.ts:3-20`, caller `apps/orchestration-server/src/index.ts:331`.
- Evidence: a persona name previously flowed into a joined YAML path without a strict identifier contract. Regression tests cover `../`, separators, absolute-path shapes, overlength input, and valid identifiers.
- Impact: an authenticated orchestration caller could attempt host-file reads under YAML-compatible paths.
- Fix: permit only 1–64 character ASCII alphanumeric/underscore/hyphen names, resolve from the configured root, and independently enforce root containment.
- Mitigation: orchestration service auth remains required; the response never returns the resolved host path.
- False-positive notes: this was a real boundary defect even though file extension and service authentication constrained practical exploitation.

### SEC-XSS-001 — High — docs search highlight HTML injection

- Location: `apps/mission-control-ui/src/DocsView.tsx:83-91,176`.
- Evidence: search excerpts were inserted with `dangerouslySetInnerHTML`; untrusted document text was highlighted before escaping.
- Impact: hostile imported documentation content matching a search could create browser markup/script execution.
- Fix: escape the complete text and search query before adding controlled `<mark>` tags.
- Mitigation: CSP now also denies objects/base changes and framing; unit tests cover hostile markup.
- False-positive notes: `dangerouslySetInnerHTML` made this exploitable if hostile documentation entered the collection, so it is not classified as theoretical.

### SEC-XSS-002 — High — unsafe Markdown link protocols

- Location: `apps/mission-control-ui/src/lib/markdownRender.ts:9-12,25-30`.
- Evidence: Markdown links previously accepted arbitrary schemes into rendered anchors.
- Impact: a user could activate a `javascript:` or other unsafe scheme from imported documentation.
- Fix: external targets now allow only absolute HTTP(S) and `mailto:`; all other non-internal targets become inert `#` anchors. External links retain `noopener noreferrer`.
- Mitigation: links still require user activation; CSP and framing protections provide defense in depth.
- False-positive notes: browser handling varies by scheme, but the missing protocol allowlist was a genuine client boundary gap.

### SEC-ERR-001 — Medium — client error and host-path disclosure

- Location: `apps/orchestration-server/src/orchestrationSecurity.ts:22-40`; route adoption throughout `apps/orchestration-server/src/index.ts:445-1338`; persona directory response at `index.ts:1348-1351`.
- Evidence: route catches returned raw `Error.message` values and persona listing exposed the configured host directory.
- Impact: errors could reveal tokens embedded in upstream messages, PEM material, host filesystem layout, control characters, or excessive internal detail.
- Fix: centralized bounded client-error sanitization redacts secret assignments, PEM blocks, common host paths, control characters, and output beyond 500 characters; directory output is `[REDACTED]`.
- Mitigation: operator-relevant non-sensitive error text is preserved; regression tests cover token, key, Unix/Windows path, control, fallback, and length behavior.
- False-positive notes: not every prior error contained sensitive material, but returning unsanitized provider/process errors is an information-disclosure defect.

### SPEC-VERIFY-001 — High — Spec verification expectation compiled to no executable verifier

- Location: `convex/lib/missionWorkOrderContract.ts:188-214` and `convex/__tests__/missionWorkOrderContract.test.ts`.
- Evidence: the composed V2 scenario demonstrated that a Spec expectation could be represented by an identifier with no registered execution behavior, yielding no expectation-specific evidence.
- Impact: a mandatory Spec expectation could appear in lineage without being run, undermining verification completeness.
- Fix: every frozen Spec verification check now binds to the existing `factory-command/v1` verifier and the approved deterministic command/args/class/timeout. The final V2 candidate contains distinct `spec:VERIFY-001` evidence.
- Mitigation: the Quality Contract remains enforced, verification stays a separate Attempt, and the runtime/public API is unchanged.
- False-positive notes: this was a real qualification-discovered invariant failure and was fixed before the Hardening decision.

### CI-SUPPLY-001 — Medium — non-deterministic release dependencies

- Location: `.github/workflows/ci.yml:14-260`, `vercel.json:5`, `scripts/lib/dependency-audit-gate.mjs`, and `scripts/lib/repository-secret-scan.mjs`.
- Evidence: CI actions used mutable major tags in the baseline, some install steps were not frozen, and no blocking exact advisory/secret policy existed.
- Impact: dependency or action drift could change release behavior without a reviewed lockfile/source diff.
- Fix: pin action commits, freeze all installs, enforce zero high/critical and exact moderate records, scan tracked secrets, and run security/browser/V2 as blocking deterministic jobs.
- Mitigation: the lockfile and release config have regression tests; live third parties are excluded from required gates.
- False-positive notes: mutable tags are common, but they are an avoidable supply-chain risk in a financial marketplace release path.

### DEP-PATCH-001 — Moderate/Low — safely patchable transitive advisories

- Location: root `package.json` pnpm overrides and `pnpm-lock.yaml`.
- Evidence: baseline advisories 1114301, 1114726, 1115556, 1119441, 1119502, 1123528, and 1123976 affected `file-type`, `yaml`, `uuid`, `qs`, `@babel/core`, and `body-parser`.
- Impact: malformed parsing, denial of service, buffer bounds, or development file-read behavior under their respective preconditions.
- Fix: exact safe patched overrides removed all seven advisories without a direct dependency or major-framework change.
- Mitigation: full tests, build, runtime guard, orchestration smoke, and browser qualification passed against the frozen graph.
- False-positive notes: actual reachability varied, but exact safe patches were lower risk than accepting them.

## Accepted dependency findings

### DEP-RR-1124268 — Moderate — React Router backslash open redirect bypass

- Location: `react-router` 6.30.6 via `mission-control-ui > react-router-dom`.
- Evidence: production audit advisory 1124268; patched only in React Router 7.18+.
- Impact: unexpected external navigation if attacker-supplied strings reach router navigation.
- Fix: dedicated React Router 7 migration plan, not a hidden framework major in hardening.
- Mitigation: declarative client-only routing, internal route maps, no router external redirect, protocol validation for docs links; owner review 2026-09-15, expiry 2026-11-15.
- False-positive notes: the advisory is valid; Mission Control does not satisfy its attacker-controlled target precondition today.

### DEP-RR-1124272 — Moderate — SSR hydration constructor injection

- Location: `react-router` 6.30.6 via `react-router-dom`.
- Evidence: production audit advisory 1124272 explicitly limits impact to Framework/Data Mode manual SSR hydration.
- Impact: attacker-triggered constructor behavior and outbound traffic through crafted hydrated errors.
- Fix: Router 7 migration.
- Mitigation: Vite client-only SPA, declarative BrowserRouter, no SSR, RouterProvider data mode, StaticRouter, or serialized router-error hydration; same review/expiry.
- False-positive notes: the advisory is real, but the affected execution mode is absent.

### DEP-TURBO-1121861 — Moderate — Turbo login callback CSRF/session fixation

- Location: root dev-only `turbo` 1.13.4, used by `clean` only.
- Evidence: full-graph audit advisory 1121861; absent from production audit, build runtime, Vercel, and CI commands.
- Impact: Turbo login callback session manipulation if that service is started.
- Fix: dedicated Turbo 2.9.14+ tooling migration.
- Mitigation: no Turbo login callback; pnpm-only repository; owner review 2026-09-15, expiry 2026-11-15.
- False-positive notes: valid tool advisory, but the affected service is not used.

## Low tracked findings

- `DEP-TURBO-1119389`: Yarn Berry detection code execution; repository uses pnpm 9/frozen lockfile and Turbo is development-only. Resolve with the Turbo major migration.
- `DEP-AISDK-1119676`: unpatched resource consumption in `@ai-sdk/provider-utils`, reachable only through manually invoked Taskmaster CLI; absent from runtime, CI, bundle, and production audit. Re-evaluate when upstream patches.

## Credential and authority proof

- Repository scan: 2,313 tracked files, no credential material; only `.env.example` files are tracked.
- Built UI: 51 emitted files, no secret-shaped value and no source maps.
- GitHub App private key/installation token remained host-only and absent from Convex records, evidence, Context Packages, Memory, Learning, harness results, screenshots, and manifests.
- Harnesses received no GitHub App/service/provider-admin credential and retained authority `NONE`.
- Sandbox credentials remained Attempt-scoped, ephemeral, revoked, and execution-only; provider administration remained host-only.
- `workOrders.accept` remained the only canonical acceptance writer. Memory, Learning, Evals, Spec finalization, Quality Gate Decisions, harnesses, and sandboxes stayed advisory/non-authoritative.

No high, critical, credential, authority, or disclosure finding remains unresolved.
