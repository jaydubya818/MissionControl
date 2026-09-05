# Phase 3 governed read-only MCP completion record

Status: **complete — merged and qualified from clean main**

This record covers one exact, local, read-only qualification fixture. It does not claim broad MCP support, a production MCP service, or harness-native MCP support.

## Revision and release identity

| Field | Value |
| --- | --- |
| Required baseline main SHA | `3ae9d86eeff1966862a6959664ec1fe2e6e7240a` |
| Qualified implementation SHA | `37953e4d287971175da2e3b2aa658f6b5da5d03b` |
| Pull request | [#171](https://github.com/jaydubya818/MissionControl/pull/171) |
| Final reviewed branch SHA | `2034a869d3921d435fc586bb3195a0cf64eea5d3` |
| Implementation merge SHA | `6611a03c6025e7e19548e9a742237e2e466030ee` |
| Qualified implementation main SHA | `6611a03c6025e7e19548e9a742237e2e466030ee` |
| Runtime contract | `v41`, exactly eight accepted public changes from `v40` |

PR #171 was squash-merged after all required GitHub checks passed. The exact merge commit was fetched as `origin/main` before the clean-worktree qualification below.

## Exact broker qualification identity

| Identity | Exact value |
| --- | --- |
| Classification | `QUALIFICATION_FIXTURE` / experimental qualified read-only path |
| Service | `mission-control-readonly-qualification-fixture@1.0.0` over local stdio |
| Server implementation digest | `sha256:8d67b2b5bdbf71cb0aaeb339d4bc996f3915d0f0eec6751601d5d992748dd70d` |
| Tool Version | `qualification-tool-version` |
| Tool Version digest | `sha256:7de45ff549953aa804fb8b13e976a69c47a23e2169992284a034a1d3d0e7107b` |
| Operation | `read_factory_doctrine_excerpt` (`READ_ONLY`) |
| Input schema digest | `c1d92d6f44abf63ac23a9732b13e968091a91bcc05f5777044ae7c200c50b409` |
| Output schema digest | `db88401b958bd7196825c053ed5c9c5e0ef70b0232f1143fbc167715f6a455e1` |
| Tool Grant | `qualification-grant` |
| Tool Grant digest for retained qualified run | `sha256:22eb40bc1dbaa592140b889bd74594d82681ccc8df05c54039106ed05fc5f3fc` |
| Execution Profile | `qualification-profile` |
| Execution Profile digest | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
| Factory Version | Not applicable to the local broker sub-scenario; the authoritative Factory V2 qualification binds the committed revision and existing Factory contracts |
| Broker | `mission-control-governed-tool-broker@1.0.0`, authority `HOST_BROKER` |
| Credential class | `NONE` |
| Destination | `LOCAL_PROCESS` only |

The deliberately synthetic `qualification-*` identifiers and profile digest above belong only to the broker sub-scenario at `runs/37953e4d2879-2026-09-05T09-38-13-078Z/`. The timestamp-bound grant digest is not a durable Convex identity.

## Exact durable local-demo identity

These Convex records were used only for integrated browser/currentness proof in the isolated `Software Factory Demo` workspace. The shell's repository card visibly names the workspace default `jaydubya818/MissionControl`; the Factory panel was selected on the separate public `jaydubya818/spectrum-design-data-mc-demo` repository.

| Identity | Exact value |
| --- | --- |
| Tool Version | `wd7qdhzmdkvjqm8pykskyks7t18dtwa2` |
| Tool Version digest | `sha256:7de45ff549953aa804fb8b13e976a69c47a23e2169992284a034a1d3d0e7107b` |
| Revoked Tool Grant v1 | `w97hzng11q8dmj7hvf3g2b4tq58dtsqp` / `sha256:c1d4c884195d6eeeee117f9a35bfaa55c3fe00819c4042547c8d45fb1715dba9` |
| Replacement Tool Grant v2 | `w97t98rw6zvm9esmn3s578v2a98dtspz` / `sha256:aa0eeec5b7559ddc7175134d7fbc73156ce00223df94c46a7c04eb3851d9fb51` |
| Revoked-profile version v1 | `w17nnaqz3vcgy65aswsfv3kn1n8dtdea` / `sha256:92f72e40d824c6c8fe5117e6aad9bb13a7b6529c03030d298d48b0366818639f` |
| Replacement profile version v2 | `w17mznczetqq40rgzv28tt0ysd8dttet` / `sha256:0da3b32482949baab99e1e740cba6e0abd8f6d2c37537bc7856ed1a04eeacfa5` |
| Factory definition | `md7npw2thzksj7ga5fegwdgqrd8df6zj` |
| Factory Version 6 | `m97vpk1tzj171b8t61k5mm3cp58dtwc9` / `factory-v1-e7f408af` |

Factory Version 6 froze profile v1. After Tool Grant v1 was revoked, readiness correctly made that Factory version ineligible. The separately qualified v2 grant/profile was not silently substituted and was not frozen into a new Factory version; doing so requires an explicit governed configuration change.

## Qualification and tests

The authoritative command passed against the exact implementation SHA:

```sh
MC_QUALIFICATION_BASE_SHA=3ae9d86eeff1966862a6959664ec1fe2e6e7240a \
MC_IMPLEMENTATION_SHA=37953e4d287971175da2e3b2aa658f6b5da5d03b \
MC_QUALIFICATION_EVIDENCE_SLUG=governed-mcp-phase3-factory-37953e4d2879 \
pnpm run qualify:factory:v2
```

The revision-scoped files are:

- `../governed-mcp-phase3-factory-37953e4d2879/automated-checks.json` — SHA-256 `6307744a540225e597d507f35abb953c5d0e17f14ad4574375b57dabd31ec20e`;
- `../governed-mcp-phase3-factory-37953e4d2879/eval-receipt.json` — SHA-256 `9aa02feeff1ea9a12efa23744ec52dd48d96726735ba9a34797b6b82b35828a5`;
- `../governed-mcp-phase3-factory-37953e4d2879/scenario-evidence.json` — SHA-256 `b5e2504f5baeb83710384094d3b9adff28e94f03494bf5e7a4e22ea3e3281f80`.

The generated Factory report records `PASS`, 19/19 gates, and the exact started head. Its receipt-first eval is publishable with all 6/6 blocking cases passing. Its `WARN` is one pre-existing advisory economics case, which fails advisory evaluation but is explicitly non-blocking. Separately, the scenario evidence records 15/15 named failure-injection controls as `PASS`; MCP-specific negatives are covered by the governed broker/control-plane test suites referenced below.

Included gates:

- full repository tests: UI 323/323, orchestration 263/263 with one intentional integration skip, Convex 942/942, plus all package suites;
- lint, TypeScript, build, orchestration startup smoke, documentation consistency, dependency/authorization/secret security checks, and `git diff --check`;
- runtime contract guard: `v40` to `v41`, eight enumerated public changes and no unrelated drift;
- exact broker exchange through the official MCP SDK and the dependency-free local stdio fixture;
- existing profiles without governed MCP, unsupported harness declarations, verification independence, historical evidence, recovery, and currentness regressions.

## Negative controls and receipts

Broker and control-plane tests fail closed for unauthorized workspace/Attempt, wrong or revoked/expired grant, unsupported/write operation, stale lease or worker generation, cancellation, replay, schema/server substitution, redirect or local-metadata escape, unavailable credential, timeout, oversized or malformed response, and hostile output. Authorization, completion, denial, late/stale, retry, byte count, duration, sanitization, and unknown-cost facts remain attributable to the exact Attempt/Profile/Grant/Version lineage.

The revision-scoped broker receipts are observations of the real local stdio exchange. Append-only persistence and transactional currentness are separately proven by the Convex and Factory integration suites; the local JSON is not misrepresented as the control-plane database.

## Post-merge qualification

A new detached worktree was created from fetched main at `6611a03c6025e7e19548e9a742237e2e466030ee`. The authoritative Factory command passed there with 19/19 gates and wrote a separate revision-scoped bundle:

- `../governed-mcp-phase3-postmerge-6611a03c6025/automated-checks.json` — SHA-256 `0d4229ca181c3d8ef9264485842b9295b5906813c2f6d46b542e568a39794b91`;
- `../governed-mcp-phase3-postmerge-6611a03c6025/eval-receipt.json` — SHA-256 `9e770c4db8680672e704ec8751345427495108761bbc3fbac662ea1e3ca0928d`;
- `../governed-mcp-phase3-postmerge-6611a03c6025/scenario-evidence.json` — SHA-256 `f371b398024b283197da9550a9e3fb85ed50a5a7976f2472224f97f3e71a5013`;
- `runs/6611a03c6025-2026-09-05T09-48-33-852Z/broker-scenario.json` — exact post-merge Tool Grant digest `sha256:78d32031712762fc0c07cb2815e948495c967d54e172ffc8d0d6827022944110`.

The post-merge run reconfirmed: the exact qualified profile path remains eligible; profiles without governed MCP remain unchanged; unsupported/write operations, revoked grants, server/schema substitution, stale workers, and replay remain denied; receipts remain attributable. The explicit runtime-contract check accepted only the same eight v40→v41 changes. Release security, authorization ratchet, secret scan, documentation consistency, build, typecheck, startup smoke, and `git diff --check` all passed. The validation worktree had no tracked modifications; only these new evidence files existed before this documentation-only addendum.

## Independent reviews

- Security: GO after the broker authority and credential-boundary fixes, and GO again after the Node 20 permission-flag compatibility change; no unresolved high-severity trust-boundary defect and no unpermissioned fallback.
- Data integrity: GO after atomic call-budget/currentness and immutable receipt fixes.
- Architecture and simplicity: GO; no second capability registry, evidence store, authorization system, Execution Profile, Factory Version, MCP-specific workflow engine, or general connector framework.
- Documentation: GO after independent rerun against this corrected record and revision-scoped Factory bundle; artifact hashes, counts, identity classification, and scope claims reconciled.

## Browser evidence

Actual integrated-application checks cover the exact Execution Profile capability view, Tool Grant history, revoked currentness/readiness remediation, refresh persistence, and 390px no-overflow behavior. They were captured at source revision `045176e44deef520a88988212af202b6d4c82e19`; the later `37953e4d2879` change affects only Node child-process permission-flag selection and its unit test, not the UI or browser data. Attempt receipt/denial/unavailable-server presentation is covered by integrated read-model and component tests rather than a browser-dispatched live Attempt. See `browser/browser-evidence.json` for exact classifications and screenshot digests.

## Real versus fixture evidence

No external or internal network MCP service was called. No credentials, cost, external transmission, production data, or internal repository data were used. The only service is a local stdio qualification fixture reading a frozen public doctrine excerpt. The qualification proves the authority boundary, exact identity, read-only behavior, receipts, and negative controls; it does not prove general prompt-injection resistance or production service reliability.

## Rollback and revocation

The product revocation path denies new calls without rewriting historical receipts. Browser evidence retains the revoked v1 grant and shows a separately qualified v2 replacement; readiness invalidates the Factory version that froze the revoked profile and requires a new immutable grant, profile, and Factory version. Code rollback is the normal revert of the focused implementation PR; existing profiles without tool capability remain `NO_TOOL_CAPABILITY` and valid.

## Deferred work

Write-capable MCP, arbitrary discovery, plugin/marketplace abstractions, network credentials, broad harness support, real-service qualification, inference gateway/economics, routing/fallback, and accepted-outcome accounting remain deferred. Any future write-capable phase requires idempotency, approval, side-effect receipts, rollback/compensation, post-condition verification, and incident-containment proof. Phase 4 is not part of this change.
