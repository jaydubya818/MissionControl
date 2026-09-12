---
status: complete
priority: p1
issue_id: "066"
tags: [factory, model-routing, harness, runtime, admission]
dependencies: ["065"]
---

# Separate Model Route from Harness Runtime Identity

## Problem Statement

`factory-model-route/v1` combines inference identity with Codex-specific
harness/runtime fields. That makes a model route conceptually own an adapter,
executable, image, and literal `CODEX_CLI` runtime even though Mission Control
already freezes and admits harness, backend, and runtime provenance separately.

## Proposed Solution

Add `factory-model-route/v2` as the canonical inference-only route, represent
the exact provider-neutral runtime artifact through the existing harness
composition, and make admission consume the model and harness/runtime inputs
explicitly. Preserve V1 only for frozen legacy Factory Versions and retain all
exact tuple, digest, qualification, worker, Attempt, and evidence checks.

## Scope

- Model route schema, canonicalization, qualification, and catalog writes
- Harness manifest runtime-artifact ownership
- Factory Version configuration and executable-role validation
- Execution manifest, routing, claim, worker admission, and result provenance
- Explicit V1 legacy read/execution compatibility
- Focused contract, admission, migration, and mismatch tests
- Model-routing, Factory-domain, and generic-harness documentation

## Non-Goals

- Execution Profiles or profile UI
- Deep Agents, Open SWE, Claude Code, or OpenCode adapters
- MCP, tool-broker redesign, new sandbox providers, or dynamic plugins
- Automatic harness routing, model benchmarking, or multi-model recipes

## Acceptance Criteria

- [x] New canonical model routes use `factory-model-route/v2` and contain no harness or runtime-artifact identity.
- [x] V2 route canonicalization and digests are deterministic and tamper-evident.
- [x] Runtime artifact identity is provider-neutral and owned by the harness composition without duplicating manifest fields.
- [x] Codex and DeepSeek remain explicitly and exactly qualified.
- [x] All executable workflow roles must use the one frozen route; no first-step shortcut remains.
- [x] Harness, runtime artifact, backend, manifest, and effective-config mismatches fail closed.
- [x] V1 routes remain readable and executable only through their frozen legacy Factory Versions.
- [x] Attempts and normalized results preserve reconcilable exact provenance.
- [x] Focused tests, repository checks, runtime-contract guard, build, and `git diff --check` are run and reported accurately.
- [x] The diff contains no Phase 2+ implementation.

## Work Log

### 2026-09-04 - Phase 1 implementation started

**By:** Codex

**Actions:**
- Read the approved Phase 1 request and governing composable-factory plan.
- Started parallel read-only audits of model-route persistence, execution
  admission/provenance, and regression/documentation coverage.

**Learnings:**
- The approved migration is additive: V2 is inference-only, while V1 is an
  explicit frozen-legacy format rather than an input accepted for new routes.
- Identity separation must not permit dispatch-time component recombination;
  only an already-qualified immutable Factory Version remains routable.

### 2026-09-04 - Phase 1 implementation completed

**By:** Codex

**Actions:**
- Added inference-only `factory-model-route/v2` identity and an exact V2
  qualification binding for harness manifest, effective configuration,
  runtime artifact, and backend.
- Added provider-neutral `harness-runtime-artifact/v1` sidecars while keeping
  historical Harness Capability Manifest digests stable.
- Split execution manifests into the byte-compatible V1 projection and the
  decomposed V2 model/harness/backend representation.
- Enforced exact identity through Factory creation/readiness, dispatch, claim,
  local and remote execution, normalized result reconciliation, and worker
  advertisement.
- Validated every executable workflow role rather than only the first step,
  and made unsupported reasoning controls fail before execution.
- Preserved immutable V1 route execution and blocked V1 from authorizing new
  Factory Versions or receiving new qualification.
- Separated the Factory all-qualification catalog view from generic modelId
  routing so a new disabled qualification draft cannot shadow an existing
  route.
- Closed final-audit gaps for pre-spawn Codex executable drift, noncanonical
  Agent Version providers, and noncanonical/cross-kind runtime artifacts.

**Verification:**
- `pnpm test` passed outside the filesystem sandbox: all runnable workspace
  and Convex tests passed; one existing integration test remained skipped.
- Focused Workflow Engine tests passed: 17 files, 176 tests.
- Focused Convex tests passed: 9 files, 84 tests.
- Focused orchestration tests passed: 10 files, 85 tests.
- Full-system Factory qualification passed outside the sandbox: 1 test.
- `pnpm lint`, `pnpm build`, and `git diff --check` passed.
- `RUNTIME_CONTRACT_BASE_SHA=HEAD pnpm ci:runtime-contract` passed for the
  three intended public changes with the local v33 to v34 bump.
- Default runtime-contract comparison remains red because this detached
  worktree is based on v33 while `origin/main` is already v38; rebase and use
  the next contract version before PR publication.
- `pnpm docs:factory-check` remains red on three README doctrine strings that
  were already absent at `HEAD`; the Phase 1 runtime-version claim is parsed
  and its focused negative test passes.
- Convex deployment-backed codegen was not run in the restricted environment;
  the additive generated API module entry was updated directly and all
  repository typechecks/builds pass.

**Follow-up:**
- Route health reporting still accepts only `(projectId, modelId)` and updates
  sibling qualification instances. There is no production caller; a later
  contract change should key V2 health by `routeDigest` while isolating the
  legacy modelId path.
- The next approved implementation phase is Phase 2, promoted harness catalog.
