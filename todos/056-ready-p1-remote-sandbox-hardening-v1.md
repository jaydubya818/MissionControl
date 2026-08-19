---
status: completed
priority: p1
issue_id: "056"
tags: [remote-sandbox, exe-dev, security, reliability, qualification]
dependencies: []
---

# Remote Sandbox Hardening V1

Determine, with provider-backed and live evidence, whether the existing canonical `SandboxProvider` + exe.dev execution path can safely advance beyond Preview for bounded human-governed production pilots.

## Problem Statement

Production Pilot V3 proves the current Remote Sandbox flow operationally, but its execution profile still has known infrastructure limits: unrestricted outbound egress, runtime Codex installation, incomplete immutable toolchain binding, and incomplete terminal-diagnostic proof. These limits prevent a stronger security claim.

The work must harden the existing provider integration without creating a second sandbox architecture, changing acceptance/publication authority, enabling Guarded Auto, or expanding RED workloads.

## Findings

- Exact merged baseline: `627d55b3a572300863dee3fa15ff5a0cb32be7a6` (runtime v30).
- Production Pilot V3 remains exactly `HUMAN-GOVERNED PRODUCTION PILOT READY`; Remote Sandbox remains Preview until this qualification finishes.
- Provider-enforced network and immutable-image capabilities must be verified against current exe.dev behavior before implementation claims are chosen.
- Previous certification evidence is immutable and will be referenced, never overwritten.

## Proposed Solutions

### Option 1: Provider-enforced hardened profile

Use current exe.dev controls to enforce deny-by-default egress, bind an immutable image/toolchain digest, verify the observed runtime before work admission, and preserve bounded/redacted diagnostics.

**Pros:** Supports the requested production-pilot hardening claim with direct enforcement evidence.

**Cons:** Depends on actual exe.dev policy and image capabilities.

**Effort:** High

**Risk:** Medium

### Option 2: Evidence-backed partial hardening with HOLD

Implement only controls the current provider can truly enforce, preserve fail-closed gates, and publish unresolved provider limitations without claiming the profile is hardened.

**Pros:** Honest, minimal, and production-safe; avoids security theater.

**Cons:** Does not advance the profile beyond Preview.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Inspect and test current provider capabilities first. Implement Option 1 only if deny-by-default egress and immutable toolchain binding are enforceable in the existing architecture. Otherwise use Option 2 and return `HOLD`, while still landing any independently useful diagnostic, integrity, credential, teardown, and evidence improvements that are fully supported.

## Technical Details

**Primary scope:**
- `apps/orchestration-server/src/exeDevSandboxProvider.ts`
- `apps/orchestration-server/src/remoteSandboxRuntime.ts`
- sandbox profile, supervisor, credential, worker, and qualification modules/tests
- `docs/testing/evidence/remote-sandbox-hardening-v1/`

**Authority constraints:**
- `workOrders.accept` remains canonical acceptance.
- Human merge remains separate.
- Sandbox receives only Attempt-scoped inference authority.
- GitHub App, provider administration, OpenRouter management, Mission Control service, acceptance, and publication authority remain host-only.

## Acceptance Criteria

- [x] Freeze exact prior certifications, exe.dev profile, harness identity, and known limits without modifying historic evidence.
- [x] Verify whether exe.dev provides enforceable deny-by-default egress; prove allowed and denied cases or record the provider limitation.
- [x] Pin and bind an immutable execution image/toolchain digest where supported; no silent latest.
- [x] Verify expected versus observed toolchain identity before execution and fail closed on mismatch.
- [x] Remove runtime Codex installation if a pinned image is feasible; otherwise document and measure the limitation.
- [x] Preserve bounded, secret-redacted diagnostics for crash, model failure, process termination, timeout, and cancellation without manufacturing success.
- [x] Prove dedicated workspace permissions, no unnecessary mounts, temporary cleanup, and no cross-Attempt artifact visibility where testable.
- [x] Prove sandbox code cannot access management, GitHub, acceptance, provider-admin, or Mission Control service credentials.
- [x] Reconfirm resource isolation, one Attempt per resource, process-group cancellation, and exact teardown.
- [x] Run controlled network, credential, filesystem, stale-credential, toolchain, prior-artifact, and process-visibility negative tests.
- [ ] Produce SBOM, dependency audit, package/image provenance, and immutable version evidence with no unresolved Critical/High vulnerability in the certified scope.
- [x] Create an explicit versioned hardened profile only if warranted by actual enforcement evidence.
- [x] Re-evaluate GREEN/YELLOW eligibility; do not expand RED.
- [ ] Run live exe.dev bug-fix, security/policy, and migration scenarios serially with maximum one VM and require 3/3 first-pass candidate → independent verification → acceptance eligibility.
- [ ] Compare allocation, readiness, startup, execution, teardown, and total-cycle performance against the existing profile.
- [x] Record model, provider, and image/storage costs; preserve unknowns as `null`.
- [x] Re-run compatibility and the complete requested qualification matrix.
- [x] Publish immutable evidence under `docs/testing/evidence/remote-sandbox-hardening-v1/` with final VM inventory zero.
- [x] Obtain fresh GitHub CI and Vercel results for durable changes.
- [x] Return exactly one permitted final decision and use no hardening claim unsupported by network, toolchain, credential, teardown, and isolation evidence.

## Work Log

### 2026-08-19 - Terminal HOLD and durable publication evidence

**Actions:**
- Published draft PR #125 without enabling merge or production routing.
- Verified standard GitHub Actions run `32292312069` passed all 9 jobs and both Vercel deployments passed at implementation commit `6966cc3e81e340ed9f3d1d16b66d4602cff9c093`.
- Verified image workflow run `32292285409` built the exact candidate and generated its SBOM, then failed closed on seven High findings; evidence upload passed and publish/provenance steps were skipped.
- Preserved the live three-workload and performance-comparison criteria as unmet because admission failed before any paid VM allocation; final provider inventory remains zero.

**Learnings:**
- This work item is complete with a terminal `HOLD`, not a production promotion. The unresolved image-vulnerability, provider-enforced egress, live 3/3, and live-comparison criteria remain visibly unchecked below their evidence rather than being waived.

### 2026-08-19 - Candidate controls and fail-closed decision gates

**Actions:**
- Audited current exe.dev CLI/API/documented capabilities and confirmed custom images but no provider-level egress/firewall control.
- Added a digest-bound image candidate with baked Codex, exact toolchain checks, non-root execution, guest nftables policy, bounded diagnostics, process-group cancellation, and production-routing exclusion.
- Proved the guest policy, credential environment, filesystem boundary, and fresh-container behavior twice on linux/amd64.
- Generated an SPDX SBOM and ran an unsuppressed Grype High/Critical gate.

**Learnings:**
- Guest nftables is useful defense in depth but cannot satisfy provider-enforced egress isolation.
- The functional Wolfi candidate has zero Critical and seven unresolved High findings with no advertised fixes, so publication, live workload admission, and profile promotion must remain blocked.
- The correct decision is `HOLD`; the remaining repository-wide validation and fresh CI/Vercel evidence are publication work for the blocked-candidate findings, not evidence of profile promotion.

### 2026-08-19 - Publication closure and isolated kickoff

**Actions:**
- Audited and merged PR #123 normally after all PR checks were green.
- Verified merge commit `627d55b3a572300863dee3fa15ff5a0cb32be7a6`, runtime v30, main CI 9/9, Vercel 2/2, and qualified-head ancestry.
- Removed only the clean merged V3 worktree and branches.
- Created this isolated branch from the exact merged baseline and installed the frozen dependency graph.

**Learnings:**
- The hardening decision is gated first by current exe.dev network-policy and immutable-image capabilities.
- No authority or architecture expansion is required or permitted.

## Notes

- Maximum live concurrent VMs: 1.
- Controlled negative testing only; no destructive provider attacks.
- Guarded Auto remains disabled.
