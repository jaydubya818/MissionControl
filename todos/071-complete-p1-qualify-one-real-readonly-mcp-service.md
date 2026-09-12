---
status: complete
priority: p1
issue_id: "071"
tags: [software-factory, mcp, security, qualification, browser]
dependencies: ["061"]
---

# Qualify One Real Read-Only MCP Service

## Problem Statement

Phase 3 proves the governed MCP authority boundary with a deterministic local
stdio fixture, but it does not prove that the same boundary survives contact
with a real external service through the browser-dispatched WorkOrder and
Attempt path.

## Findings

- Phase 3 final main is `0d1a0908cce380d815069ce0a59e1604d2f26ece`.
- Runtime contract baseline is v41.
- Service selection, exact destination authority, offline negative controls,
  and a complete authorization preflight must precede the first network call.
- The existing Phase 3 registry, grant, broker, receipt, Execution Profile,
  Attempt, verification, and UI surfaces must be extended rather than replaced.

## Proposed Solutions

### Option 1: One public no-credential documentation MCP service

**Approach:** Qualify exactly one read-only operation and public namespace over
an exact TLS destination.

**Pros:** Minimum data, credential, cost, and operational risk.

**Cons:** Still requires bounded network transport and real-service currentness
evidence.

**Effort:** High

**Risk:** Medium

### Option 2: One credentialed repository/documentation MCP service

**Approach:** Use a qualification-only read token for one approved namespace.

**Pros:** Potentially stronger repository usefulness.

**Cons:** Introduces credential authorization, storage, revocation, and leakage
risk before the no-credential path is proven.

**Effort:** Very high

**Risk:** High

## Recommended Action

Select Option 1 if an exact, semantically read-only, zero-cost public operation
is available. Implement only the minimum network transport needed by that
service, preserve the Phase 3 fixture, and stop before the first live call if
any consequential preflight field is not authorized or qualified.

## Technical Details

**Starting revision:**
- `0d1a0908cce380d815069ce0a59e1604d2f26ece`

**Expected affected areas:**
- Governed MCP contracts and host broker
- Factory/Attempt worker integration
- Existing Execution Profile, Factory Configuration, Attempt, and readiness UI
- Focused unit/integration/browser qualification tests
- Service selection, ADR/maturity/runbook, and immutable evidence records

**Runtime contract:**
- Preserve v41 unless a minimal public Convex validator change is unavoidable.

## Resources

- Phase 4 specification supplied by the Product Owner on 2026-09-05
- `docs/decisions/governed-mcp-tool-capability.md`
- `docs/testing/evidence/governed-mcp-phase3/completion-record.md`

## Acceptance Criteria

- [x] Compare at least two real read-only service candidates and select exactly one.
- [x] Record exact service, operation, public/synthetic scope, destination, credential, and cost authority.
- [x] Register exactly one real Tool Version and one Tool Grant for one exact profile.
- [x] Pass all required offline authority, destination, identity, currentness, revocation, timeout, cancellation, replay, and hostile-output controls.
- [x] Complete a fully qualified and authorized first-live-call preflight.
- [x] Prove one browser-dispatched real WorkOrder/Attempt call with durable receipt and independent verification.
- [x] Verify all required desktop, 390px, keyboard, accessibility, refresh, failure, and remediation states.
- [x] Retain Phase 3 fixture regression and zero reachable qualified write operations.
- [x] Obtain independent security, data-integrity, architecture, simplicity, and documentation GO reviews.
- [x] Pass full repository, composed qualification, runtime-contract, security, and documentation gates.
- [x] Merge a focused PR only after CI is green.
- [x] Qualify exact merged main from a clean worktree and record final identities and evidence.
- [x] Stop before write MCP, connector breadth, gateway expansion, or full economics work.

## Work Log

### 2026-09-05 - Phase 4 kickoff

**By:** Codex

**Actions:**
- Verified final Phase 3 main at `0d1a0908cce380d815069ce0a59e1604d2f26ece`.
- Created clean branch `codex/phase4-real-readonly-mcp` from exact `origin/main`.
- Began repository mapping and current official service-candidate research.

**Learnings:**
- The first real network call remains gated independently from offline
  implementation and qualification.

### 2026-09-05 - Service selected and public changes enumerated

**Actions:**
- Compared OpenAI Developer Docs, DeepWiki, and Context7.
- Selected one exact credential-free OpenAI Docs search operation.
- Recorded destination, scope, cost, contract-identity limitation, and one new
  public registration mutation before implementation.

**Learnings:**
- Existing storage, grant, profile, receipt, revocation, and evidence contracts
  can remain the single authority path. No live MCP request has occurred.

## Notes

- The maximum success claim is one qualified real read-only service through one
  exact governed profile/grant/broker/Attempt/receipt/verification path.
- No broad MCP support or write capability is authorized.

### 2026-09-05 - Currentness gate NO_GO

**Actions:**
- Passed the focused offline broker, Factory context, Attempt worker,
  verification, control-plane, manifest, governance, and recovery suites.
- Performed two separately preflighted, credential-free currentness handshakes.
- Stopped both before `tools/call` on `SERVER_SCHEMA_SUBSTITUTION`.
- Recorded the NO_GO; did not browser-dispatch, open a PR, merge, or deploy.

**Learnings:**
- The provider's web-surface schema and a public recorded MCP schema both differ
  from the endpoint's current advertised schema. Exact currentness cannot be
  established from stable published evidence without chasing dynamic discovery.
- Final main remains Phase 3 at runtime contract v41. The isolated worktree's
  attempted v42 implementation is uncommitted and unshipped.

### 2026-09-05 - Stable-contract recovery

**Actions:**
- Preserved the OpenAI Docs `SERVER_SCHEMA_SUBSTITUTION` NO_GO unchanged.
- Confirmed OpenAI publishes no immutable endpoint/schema contract sufficient
  for current policy and stopped using that endpoint for qualification.
- Evaluated Context7 and Microsoft Learn as the two replacement candidates.
- Rejected Microsoft Learn because its provider explicitly requires dynamic
  schema discovery and selected Context7 v4.0.5.
- Captured the exact provider release commit, npm integrity, initialize identity,
  and generated `query-docs` schema without invoking the hosted service.
- Classified the abandoned v42 worktree changes and replaced OpenAI-specific
  assumptions while preserving generic fail-closed transport foundations.

**Learnings:**
- A provider-owned versioned package plus an exact live server-version and schema
  match provides an independently pin-able currentness contract.
- Expected and observed schema identities must remain separate durable receipt
  fields; equality is a gate, not an inference.

### 2026-09-05 - One-call direct qualification

**Actions:**
- Completed the recorded authorization preflight with fixed public data, no
  credential, no model call, and no incremental paid service call.
- Performed one direct Context7 `query-docs` call after exact endpoint, server
  version, protocol, and schema equality checks passed.
- Captured equal expected/observed schema digests and server versions in the
  broker receipts; recorded 910 ms duration, 86 request bytes, 138 output bytes,
  zero retries, and no poisoning signal.

**Learnings:**
- Context7's hosted endpoint is currently running the exact provider-published
  v4.0.5 operation contract.
- This proves transport qualification only; Phase 4 still requires the durable
  browser-dispatched WorkOrder/Attempt path.

### 2026-09-05 - Browser Attempt authorization boundary

**Actions:**
- Stopped before launching the combined demo stack after its environment review
  identified shared Convex development, workflow seeding/execution, and remote
  data/service side effects beyond local rendering.
- Stopped the orchestration process and removed the temporary environment link.
- Did not dispatch a browser WorkOrder or make a second real Context7 call.

**Learnings:**
- The browser proof needs explicit Product Owner authorization for the shared
  demo environment side effects before it can create durable acceptance data.

### 2026-09-05 - MCP call authorized; shared demo environment still blocked

**Actions:**
- Read and applied the Product Owner's authorization for exactly one governed
  Context7 qualification call with zero retries under the frozen preflight.
- Requested the required `pnpm run dev:demo` launch for the browser-dispatched
  path.
- Stopped when the host safety gate rejected the shared Convex development,
  workflow-seeding, and executor side effects as outside the one-call authority.
- Removed the temporary `.env.local` link. No browser WorkOrder/Attempt or
  additional Context7 call occurred.

**Learnings:**
- MCP transport authority and shared environment mutation authority are
  separate boundaries. The browser proof cannot proceed until the latter is
  explicitly approved.

### 2026-09-05 - Isolated qualification backend and model-call boundary

**Actions:**
- Replaced the unsafe shared `dev:demo` dependency with a Phase 4 launcher that
  clones the stopped local SQLite state into a temporary directory, creates a
  unique self-hosted Convex instance/admin key, deploys the current branch, and
  starts the UI without global workflow seeding or an opportunistic executor.
- Added fail-closed source-state, port, URL, generated-environment, and cleanup
  guards plus deterministic launcher tests.
- Started the isolated backend on `127.0.0.1:3224` and UI on port `5204` because
  the preserved Research Lab UI already occupied `5199`.
- Created the qualification-only workspace
  `PHASE4_REAL_MCP_QUALIFICATION` (`sn772faj2bj96066brg7v0my318dvjgx`)
  inside the disposable state. No external MCP request was made.
- Inspected the canonical Factory worker and confirmed that it calls
  `loadGovernedMcpContext` and then immediately calls `runHarnessExecution`.
  There is no authorization checkpoint between the real Context7 call and the
  LLM/provider invocation.

**Learnings:**
- Shared-development mutation is no longer a blocker; the isolated path is
  technically viable and deterministically disposable.
- The remaining canonical path requires a real model call after the governed
  MCP context succeeds. The Phase 4 MCP authorization explicitly does not
  authorize that provider call, so starting the scoped worker would implicitly
  cross a separate authority boundary.

### 2026-09-05 - Canonical isolated browser qualification

**Actions:**
- Used the Product Owner's subsequent exact model-call authorization and
  dispatched synthetic WorkOrder `yh7201gkt7cqwgqv085n95nxbs8dt7s2` from the
  browser against the disposable backend.
- Canonical Attempt `ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg` invoked Context7
  `query-docs` through the host broker with call ID
  `mcp:ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg:query-docs:1`.
- Persisted authorization receipt `w57gyhz7y6fq52cm1tk1ez8egx8dv5hg`
  (`ALLOWED`) and completion receipt `w57h70zrn7a0pfqpw970da0n6x8dvmd2`
  (`SUCCEEDED`, 905 ms, zero retries).
- Ran separate verification Attempt `ys726g569gsxcb65f1nxhzdjwd8dt39h`;
  verification run `nh7gt75yvpdckn9cgwzhhex3wn8dtw81` returned `VERIFIED`
  with independent criterion-level evidence.
- Validated desktop, 390px mobile, keyboard, accessibility, refresh, failure,
  and remediation states. Total Context7 operations remain two: one direct
  diagnostic and one canonical browser Attempt; one of the three authorized
  transports remains unused.

**Learnings:**
- The exact profile/grant/version/lease authority chain and durable receipt path
  survive the canonical browser-dispatched Factory lifecycle.
- Independent verification proves the candidate but does not give the MCP
  service or producing worker acceptance authority.

### 2026-09-05 - Independent release hardening

**Actions:**
- Closed review findings by pinning HTTPS to the validated public DNS address,
  expanding reserved-address denial, rejecting duplicate operation names, and
  applying one end-to-end deadline across initialize, catalog, and call.
- Restored normal policy-v2 GitHub publication and made every `LOCAL_GIT`
  subject non-accepting without a trusted current publication projection.
- Replaced in-place terminal recovery with a new linked Attempt, fresh runtime,
  trace, cancellation, and cost identity, an exact source-owner workspace
  transfer, and a pre-publication durable code-diff checkpoint.
- Added a source quiescence gate: the isolated launcher now rejects active
  configured backend ports and SQLite WAL/SHM sidecars before copying. The
  initial qualification snapshot predated this enforced check; all canonical
  qualification records were newly synthetic inside the disposable copy and
  no source records were mutated.

**Learnings:**
- Verification and acceptance currentness are separate: a locally verified
  commit remains useful evidence but cannot become acceptance-current until it
  has a trusted publication projection.
- Terminal Attempt history and cost/trace identity must never be recycled for
  recovery convenience.

### 2026-09-05 - Final pre-merge qualification

**Actions:**
- Received independent security/data-integrity, architecture/simplicity, and
  documentation GO decisions after the final recovery and transport hardening.
- Passed the full repository suite, composed system qualification, Phase 3
  regression, runtime-contract guard, release security/docs checks, production
  build, startup smoke, and the 15-test critical browser/accessibility suite.
- Recorded all results in
  `docs/testing/evidence/governed-mcp-phase4-recovery/pre-merge-qualification.md`.

**Learnings:**
- The Phase 4 boundary is ready for CI without another external MCP or model
  call; deterministic receipts and tests cover the final hardening delta.

### 2026-09-05 - Merge and exact-main qualification

**Actions:**
- Opened PR 174 from branch revision
  `63d202dcde29c27a068e30fdde185b95cde8a0de`; merged only after every GitHub
  check passed.
- Qualified merged main
  `aa8c12b1d4907589b71cef3cb421ef2a2c380676` from a fresh detached worktree.
- Re-ran composed Factory qualification, Phase 3 regression, Phase 4 focused
  tests, runtime-contract, release security/docs, build, and startup gates.
- Stopped and removed the isolated runtime and synthetic candidate/verifier
  worktrees without using the third authorized Context7 transport.

**Learnings:**
- The merged revision reproduces the governed real-service proof without a
  second authority path or dependence on retained qualification infrastructure.
