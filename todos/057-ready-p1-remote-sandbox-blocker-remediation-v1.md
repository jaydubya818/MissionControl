---
status: ready
priority: p1
issue_id: "057"
tags: [remote-sandbox, exe-dev, security, supply-chain, qualification]
dependencies: []
---

# Remote Sandbox Hardening V1 Blocker Remediation

## Problem Statement

PR #125 proved useful fail-closed Remote Sandbox controls but correctly stopped at `HOLD`. Its candidate image contains seven unresolved High vulnerabilities, and exe.dev exposes no known provider-enforced egress/firewall primitive. The candidate cannot enter live production-pilot qualification until the image gate is clean and the guest privilege, network, credential, and isolation boundaries are proven without overstating provider enforcement.

## Findings

- Exact remediation baseline: `11a51cac1e446488cddf34781cc9663b922c7684` from latest `origin/main`.
- PR #125 remains draft at candidate head `6db1389c2e5dfd309cebefd1db45727532fab71d` and will not be modified during remediation.
- Existing unsuppressed Grype evidence reports 0 Critical and 7 High findings across `busybox`, `libcrypto3`, and `libssl3`.
- Provider-enforced egress remains a declared limitation unless current exe.dev CLI/API/custom-image capabilities prove otherwise.
- The prior evidence packet is immutable input. Remediation evidence will be additive and versioned separately.

## Proposed Solutions

### Option 1: Patch and qualify the existing candidate architecture

Reconcile the PR #125 candidate into this fresh branch, minimize and repin the OCI image until its unsuppressed gate reaches 0 Critical/0 High, then re-prove the existing guest-side controls and run the bounded live gate only after every admission criterion passes.

**Pros:** Smallest change, preserves the proven architecture and authority model, directly addresses both blockers.

**Cons:** A current upstream package set may still contain an unfixable High finding; guest egress remains defense in depth.

**Effort:** High

**Risk:** Medium

### Option 2: Preserve the blocked candidate and stop

Complete the root-cause audit, document unfixable findings or missing provider capabilities, and return a terminal hold without live allocation or publication.

**Pros:** Honest and safe when admission cannot be proven.

**Cons:** No production-pilot advancement.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Execute Option 1 only while every result is evidence-backed. Fall back to Option 2 immediately if the image cannot reach 0 Critical/0 High or the workload can alter its guest firewall. Do not waive findings, expand authority, enable Guarded Auto, promote globally, or introduce another sandbox architecture.

## Technical Details

**Primary scope:**
- `infra/remote-sandbox/`
- `.github/workflows/remote-sandbox-image.yml`
- `apps/orchestration-server/src/*Sandbox*`
- `apps/orchestration-server/src/standalone*Supervisor*`
- `convex/lib/executionRouting.ts`
- `scripts/remote-sandbox-image-local-qualification.mts`
- `docs/testing/evidence/remote-sandbox-blocker-remediation-v1/`

**Authority constraints:**
- `workOrders.accept` remains canonical acceptance.
- Human merge remains separate.
- The guest receives only an Attempt-scoped inference credential.
- GitHub, exe.dev administration, OpenRouter management, Mission Control service, verification, acceptance, and publication authority remain host-only.

## Acceptance Criteria

- [x] Reconcile PR #125 candidate code and preserve its evidence without changing PR #125.
- [x] Record source layer, dependency path, reachability, removability, fix availability, action, and residual risk for all seven High findings.
- [x] Minimize the final runtime image without removing required supervisor, Git, Node, Codex, certificate, network-policy, or Mission Control functionality.
- [x] Pin the exact base image, Node, Codex package/binary, package graph, final image, and SBOM digests with no floating tags.
- [x] Produce an unsuppressed image scan with 0 Critical and 0 High findings before live admission.
- [x] Re-check current exe.dev network/API capabilities and explicitly preserve the provider-enforced egress limitation if no control exists.
- [x] Prove guest deny-by-default egress permits only required inference destinations and blocks unauthorized public, RFC1918, link-local, metadata, and unexpected DNS targets where enforceable.
- [x] Prove the Codex workload is non-root, lacks `CAP_NET_ADMIN`, cannot modify nftables, cannot install packages, and cannot access host/provider administration.
- [x] Prove only the Attempt inference credential is present; all management, GitHub, Mission Control, verification, acceptance, and publication credentials are absent.
- [x] Prove protected system paths, dedicated workspace writes, no package-cache leakage, and no prior-Attempt persistence across two fresh instances.
- [x] Run the live bug-fix, security/policy, and schema-migration gate serially at maximum one VM only if every pre-live criterion passes; require 3/3 first-pass with no retries.
- [x] Run the bounded live negative matrix only after admission and require every forbidden action to fail safely.
- [x] Compare allocation, readiness, startup, execution, teardown, and total-cycle performance with unknowns preserved as `null`.
- [x] Run the complete requested repository, runtime, routing, security, build, smoke, lint, and qualification matrix.
- [ ] Preserve final provider VM inventory zero and obtain fresh GitHub CI and Vercel evidence for durable changes.
- [x] Determine whether this branch supersedes, reconciles, or leaves PR #125 blocked, without losing its evidence.
- [x] Return exactly one permitted terminal decision and avoid any unsupported isolation claim.

## Work Log

### 2026-08-25 - Sensitive-repository policy decision

**Actions:**
- Product Owner approved provider-enforced egress as mandatory for sensitive repositories.
- Preserved exe.dev guest nftables as defense in depth only and kept sensitive remote routing ineligible.
- Selected controlled local execution as the safe pilot path until a compliant provider is explicitly qualified.

**Learnings:**
- A bounded live cohort does not satisfy a provider-enforced egress requirement.
- Missing provider capability must block the route rather than be converted into an exception or waiver.

### 2026-08-19 - Exact-baseline kickoff

**Actions:**
- Fetched latest `origin/main` and created isolated branch `codex/remote-sandbox-blocker-remediation-v1` from exact commit `11a51cac1e446488cddf34781cc9663b922c7684` using the repository worktree manager.
- Confirmed PR #125 remains draft, open, and unchanged at `6db1389c2e5dfd309cebefd1db45727532fab71d`.
- Read the existing seven-finding vulnerability evidence as immutable remediation input.

**Learnings:**
- The remediation can remain within the existing SandboxProvider/exe.dev architecture.
- Live admission remains strictly downstream of the unsuppressed image and privilege gates.

### 2026-08-19 - Remediation, admission, and terminal live gate

**Actions:**
- Replaced the prior Wolfi development image with a digest-pinned Node Alpine runtime, checksum-pinned source builds for minimal Git and BusyBox, and an exact final package set. Removed package managers, OpenSSL runtime packages, unused BusyBox applets, caches, and build toolchains from the final image.
- Audited all seven PR #125 High findings and retained the raw unsuppressed findings. Local and registry Grype gates both reached 0 Critical / 0 High; the exact public GHCR digest and GitHub provenance attestation are recorded.
- Proved two fresh local instances with UID/GID 10001, `NoNewPrivs`, all five capability sets empty, blocked firewall mutation, absent package managers/caches, exact allowlisted egress, protected system paths, and no cross-Attempt state.
- Reconfirmed that exe.dev exposes no provider egress primitive. The profile remains visibly `DEGRADED` and qualification-only.
- Ran exactly three live exe.dev Attempts serially with no retries. Each failed closed before executor start because the provider-reported image identity did not exactly match the requested digest-qualified image reference. All three credentials were revoked and stale-key probes returned `401`; all exact resources were deleted; final inventory was zero.
- Ran the complete composed Factory qualification, full repository tests, TypeScript, lint, skill lint, runtime guard, production build, orchestration smoke, secret scan, and whitespace check successfully.

**Learnings:**
- Image vulnerability remediation and local guest-boundary proof are complete, but they cannot substitute for live proof.
- The current blocking condition is the exe.dev image-identity reporting boundary, not a waived security finding. A future gate must first reconcile the provider's normalized image identity with the immutable digest without weakening the fail-closed check, then run a new 3/3 first-pass qualification.
- PR #126 supersedes PR #125 as the remediation draft, but remains `HOLD` and non-mergeable. PR #125 remains unchanged with its evidence preserved.

### 2026-08-20 - Immutable publication and final live qualification

**Actions:**
- Reverified GitHub `write:packages`, GHCR authentication, the preserved worktree, exact local image ID, 0 Critical / 0 High gate, local 3/3 first-pass result, bounded OpenRouter revocation timing, and the draft/unmerged state of PRs #125 and #126.
- Published the exact locally qualified OCI index to `ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`. Proved the registry index, linux/amd64 manifest, config, layers, digest-pulled image ID, and RootFS match the local qualified artifact; recorded its public-pull result and BuildKit SLSA provenance.
- Ran a one-Attempt live canary through hardened image, supervisor, Codex, canonical structured result, candidate, independent verification, and acceptance eligibility. The canary passed first-pass with zero retries, exact credential rejection inside the 30-second bound, exact VM absence, and inventory zero.
- Ran the strict bug-fix, security/policy, and data/schema-migration cohort serially. All three passed first-pass with zero retries; each produced a canonical result and exact candidate, passed independent verification and acceptance eligibility, rejected its exact credential at the first post-revocation probe, and proved its exact VM absent.
- Re-ran the network, privilege, credential, filesystem, and cross-Attempt matrix against the immutable published image. UID/GID 10001, `no_new_privs`, empty capability sets, guest nftables enforcement, firewall-mutation denial, forbidden-destination denial, credential absence, and previous-Attempt isolation all passed.
- Rebuilt the published-artifact SPDX SBOM and Grype scan. The gate remains 0 Critical / 0 High with no suppression. The two Medium BusyBox metadata records remain bounded by independent proof that the affected `wget` applet and binary are absent.
- Ran `pnpm run qualify:factory`; all 17 composed gates passed, including the full repository suites, TypeScript, lint, skill lint, runtime guard, production build, orchestration smoke, release security/secret scans, and whitespace validation.

**Learnings:**
- The provider-reported image label is truncated metadata, but allocation is requested with the full immutable digest and the guest toolchain matches the exact qualified identity. A different requested digest still fails closed.
- exe.dev still offers no provider-level egress primitive. The honest boundary is guest nftables defense in depth plus a non-root, capability-empty workload that cannot mutate the policy.
- Live qualification is now complete. The remaining external gate is fresh GitHub CI/Vercel on this durable PR update; neither PR is merge-authorized by this work.

## Notes

- Maximum live concurrent VMs: 1.
- No destructive provider attacks.
- Provider-enforced egress and guest defense in depth must remain distinct claims.
- Guarded Auto remains disabled.
