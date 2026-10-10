# Enterprise Golden Journey

This advisory release check reuses the qualified MissionControl native and MyFactory delegated paths. It does not qualify a production release. A completed deterministic run reports `PARTIAL` overall, or `FAIL` when an unresolved security probe fails, until live MyEve, authenticated browser coverage, the Recruiting UI fixture and Claude Opus review are integrated.

## Run locally

Use Node 24, pnpm 9, Docker, the locked MyFactory source with its frozen npm install, the retained native runtime build directory and a local Convex backend. Run `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm run ci:prepare` first. No existing `.env` file is needed or loaded. The launcher passes an allowlist of fixture configuration and runtime environment variables to child commands.

Set these absolute paths:

- `MC_COMPATIBILITY_CONVEX_BINARY`: local Convex binary.
- `MC_COMPATIBILITY_PORT`: unused loopback port, such as 3476. The next port must also be free.
- `MC_LOCAL_MYFACTORY_ROOT`: clean checkout at the locked MyFactory SHA.
- `MYFACTORY_FIXTURE_GIT`: local Git repository containing the locked source fixture commit.
- `MC_GOLDEN_DOCKER`: exact Docker executable.
- `MC_GOLDEN_RUNTIME_BUILD`: retained runtime package directory, including `image.tar`, context, provenance and bundles.

Load the locked image archive with `docker load -i "$MC_GOLDEN_RUNTIME_BUILD/image.tar"`. PostgreSQL must be tagged `postgres:17` and resolve to the immutable digest in `scripts/enterprise-golden-journey/source-lock.json`. Pull that digest and tag it only in your isolated qualification environment. Never substitute a new runtime or FactoryVersion to make a test pass.

Run:

```sh
mkdir -p golden-evidence
node scripts/enterprise-golden-journey/run-all.mjs
```

Every run uses a fresh directory. It retains failed commands, raw records, Git candidate bundles, measured durations, source file hashes, Playwright traces, fixture boundaries, suite reports and an integrity manifest. Retrying requires a new directory. `run-all.mjs` continues independent suites after a failure and exits nonzero for execution failures. Explicitly unavailable dependencies are `NOT_RUN`. A missing or corrupted completed evidence manifest cannot count as PASS.

To challenge retained hybrid evidence without starting services:

```sh
node scripts/enterprise-golden-journey/verify.mjs golden-evidence/RUN/hybrid-mission/hybrid
```

This separate process validates lifecycle identities, candidate bytes, gate records, allowance settlement and cleanup. It also rejects eleven deliberate evidence mutations. It is not a Claude review or cryptographic third-party attestation. Signature authentication happens in the canonical MyFactory ingress during execution. The manifest detects changes relative to the saved hashes. It does not protect against an attacker rewriting both evidence and hashes.

## What executes

Shared HR Contracts uses the admitted native document operation to produce the versioned employee identity and API contract. A distinct verifier Attempt checks immutable candidate bytes. MyFactory executes its pinned protected slug utility through its real local provider, SQL control plane, independent verifier and authenticated Result ingress. The third native WorkOrder creates and verifies an integration document binding exact predecessor candidates and handoffs. Both predecessors must have passed their gates. Faulting either predecessor blocks dispatch without creating an Attempt.

The pinned MyFactory FactoryVersion does **not** produce a Recruiting UI. The reference HR initiative is therefore incomplete. The downstream proof document is not a compiled or deployed HR application. No historical FactoryVersion is modified.

The Sofie consumer fixture recognizes one frozen enterprise request, asks for owner planning authorization, creates an actual canonical Mission, reads actual progress, exposes the actual acceptance decision, and accepts only after canonical `AWAITING_ACCEPTANCE`. It reads DONE and all three accepted WorkOrders after database restart. The fixture also names and preserves Sofie Native and standalone MyFactory execution tiers. It does not implement or execute MyEve's native tier.

Browser checks open the real MissionControl Mission portfolio at desktop and 390px in explicit demo mode and retain reconnect traces. External login, the Sofie enterprise conversation and the composed owner acceptance journey are `NOT_RUN`. Relevant existing UI: `MissionPortfolioView.tsx`, `MissionDetailView.tsx`, `auth/AuthStates.tsx`. Required integration: an isolated identity provider and browser-accessible canonical fixture, a MyEve enterprise adapter, and connected proposal, authorization, Result/Proof and Needs You interactions. No imaginary UI selectors or synthetic passing owner flow are supplied.

## Failure coverage

| Requirement | Executable evidence |
| --- | --- |
| Duplicate Mission | Hybrid `duplicateMission`, same ID and no new record |
| Duplicate WorkOrder dispatch | Native `duplicateDispatch`, same Attempt |
| Lost acknowledgement | Native recovery and delegated admission transport fault |
| MissionControl restart | Native recovery with fresh controller and durable accounting |
| MyFactory restart | Local-provider SQL restart and fresh factory/recovery controller |
| Stale Plan revision | Delegation admission and canonical gate controls |
| Stale WorkOrder generation | Delegation controls and local-provider recovery |
| Wrong FactoryVersion | Gate controls, exact pinned provider assertion, offline mutation challenge |
| Candidate mismatch | Protected verifier controls and offline candidate challenge |
| Verification failure | Local-provider failing protected expectation and native mutation control |
| Quality Gate rejection | Native gate controls, Factory PASS with enterprise policy failure |
| Budget exhaustion | Actual transactional native/native, delegated/delegated and hybrid races |
| UNKNOWN provider operation | Actual execution with response loss, reserved exposure after restart |
| Cancellation | Native launch cancellation, local-provider reconciliation |
| Cross-owner and tenant access | Native settlement, delegated ingress and canonical Mission query denial |
| Dependency invalidation | Each predecessor individually blocked before C dispatch, zero new Attempts |
| Stale writer | Signed command replay, lease and stale Result rejection |
| Browser disconnect/reconnect | Desktop and 390px shell only; durable owner browser journey NOT_RUN |

The scripts use internal fixture mutations to inject invalid authority, stale records and policy faults into disposable storage. Those mutations are fault injection, not production APIs or evidence of owner authorization. Native tariff records zero model calls and zero model charge. Resource cost remains unmeasured.

## Hosted workflow and release policy

`enterprise-golden-journey.yml` runs eight named jobs through `enterprise-golden-suite.yml`. The jobs have read-only tokens, pinned actions, frozen installs and bounded timeouts. Failed artifacts are retained for 90 days. The aggregate report checks consistent source identities and evidence digests. Setup failures receive a failed report. There are no production secrets, publishing steps, deployment steps, automatic merges or branch-protection changes.

Hosted native execution needs `MC_GOLDEN_RUNTIME_PACKAGE_URL`, a read-only HTTPS location for the exact retained package. Its checksum is locked. The package is currently local and has not been published. Without this dependency the affected jobs report NOT_RUN. Hosted MyFactory fixtures build from the exact pinned checkout and start disposable PostgreSQL at a pinned image digest. Building the old runtime recipe again is not evidence of the old image identity, so CI must not silently rebuild it as a replacement.

Keep this workflow advisory. A green Actions job means its declared checks ran, not that cross-system release qualification passed. Use the machine-readable `qualification.json`, whose `releaseEligible` remains false. `aggregate.mjs --require-release` exits nonzero until release eligibility exists. Promotion requires repeated composed runs on exact committed candidates, live Sofie and authenticated browser integration, a qualified Recruiting UI fixture, and an independent Claude Opus verdict. Branch-protection promotion requires a separate owner decision.

## Performance

Every command and canonical journey stage records elapsed wall time. Native producer and verifier timings use stored `executionClaimedAt` and `completedAt`. Proposal, admission, delegated execution, gates and canonical readback have named stage measurements. Browser reconnect records measured shell time. These are local observations, not benchmarks or service-level objectives. Live Sofie latency and authenticated browser latency are NOT_RUN.

## Documentation consulted

- Existing native successor, canonical accounting and compatibility documentation in `docs/enterprise-factory/`.
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).
- [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data).
- [Playwright configuration](https://playwright.dev/docs/test-configuration).

## Isolation recovery

The historical same-tenant Owner read failure is retained in the original evidence. The approved correction uses exact owner identity and explicit scoped grants in the canonical backend. See [the recovery policy and migration plan](ISOLATION_RECOVERY_PLAN.md). Only a new source-stable qualification report may supersede the historical FAIL; the workflow remains advisory.
