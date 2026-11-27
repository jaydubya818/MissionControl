# Native runtime successor qualification

Accepted MissionControl source: 0ecad86ecde784e38b62c7a8109530a28854ac5e. MyFactory source e498c31db8b749fa91b0544ecd1d1a661b971c2c and local FactoryVersion 4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95 remain frozen. Existing delegated accounting/gate qualification is preserved.

## Final historical provenance check

Original image sha256:4c0e7e776c25f393ba9eb2e29319dbc38dc4c1d0f8a91e307aeb1a31849269db remains UNAVAILABLE. Its manifest names harness source 75ec5d8c0307895facf64d3de759edba0c350442 and version 2. Commit 8b9a5af014f543f4bb1a38c74071586ed6a40f13 introduced that final image and bridge/backend pins. The canonical build-isolated-invocation.mjs bundles the separate entrypoint and backend with esbuild 0.27.0, target node22, capturing exact input bytes. It does not build an image.

The producing notes refer to /private/tmp/skill-qualification-20260904/profile-closure-build-3 and profile-closure-container-build-3. Those directories and the original checkout no longer exist. The source revision's infra/docker-factory/Dockerfile builds a distinct remote-sandbox/Codex image; it is not evidence of the missing isolated-invocation image's Dockerfile. Exact original container Dockerfile/context, image architecture, container Node version, image-build workflow and registry remain UNKNOWN. Host runtime in retained v17 proof is node v24.18.1 darwin/arm64, not proof of container architecture. Historical evidence remains untouched. No broad recovery search is repeated.

Original runtime policy is isolated-container, no host mounts, network none, read-only root/runtime, bounded tmpfs, nonroot workload inside chroot, bounded CPU/memory/PIDs, no model/provider route, and exact retained invocation/result protocol v2. Original qualification is context-skills-synthetic-factory/v1 v17, SYNTHETIC_FACTORY_ADMISSION_QUALIFIED; proof digest sha256:2f82f88827fa9b973d9f8ef7ff72480edb5e29d1f517ce5fb07744c6e30c61c2.

## Successor design

Add explicit isolated-invocation version 3 identity in the existing registry, preserving frozen version 1/2 constants. Reuse invocation/result v2 and execution manifest v4 where semantics remain unchanged. Build a new image from pinned canonical source bundles and a pinned base, with exact Dockerfile, context/input hashes, architecture, toolchain, image configuration ID and exported archive digest. No binary equivalence claim. Artifact generation is not execution authority.

Reuse canonical WorkOrder dispatch, FactoryAttemptWorker authenticated lease/reporting, candidate custody, separate native verifier Attempt, Policy V2 evidence and currentness. Each executing native producer/verifier owns its own reservation. Imported delegated verifier observations retain their existing non-executable parent accounting semantics.

Freeze native zero-charge engineering tariff before admission/claim. Reconcile only server-retained offline response bytes tied to the authenticated historical lease, exact manifest, reservation and runtime with proven container cleanup. UNKNOWN retains exposure. Cancellation/expiry alone never releases it. Resource cost remains UNMEASURED. Readback cannot dispatch work or mint replacement authority.

Hybrid qualification uses one approved Mission with native and delegated predecessors and a downstream integration WorkOrder. Existing acceptance and handoff transitions enforce dependency progression. Any isolated acceptance extension must require the exact marked qualification project and authenticated owner, preserve SYNTHETIC scope, and leave production acceptance excluded. No direct DONE patch or manufactured Result.

## Ordered checkpoints

1. Runtime build/provenance/security controls and versioned registration. Review, commit/push/remote SHA.
2. Real canonical native execution, native tariff/settlement and database contention/faults. Review and preserve checkpoint.
3. Native gate/currentness and hybrid Mission with exact handoffs and independent verification. Fresh clone, CI, Bedrock comparison, independent security/architecture review, final checkpoint/report.

Implementation is sequential. Review agents are read-only. Reuse existing isolated clone on codex/native-runtime-successor. Production integration NOT_RUN, paid operations 0, external-alpha changes 0, executable production grants 0, publication DISABLED, deployment NOT_AUTHORIZED. Do not modify MyFactory's qualified execution path or dependency PRs.

## Canonical hybrid admission extension

The accepted delegated harness seeded its predecessor Attempt and owner lease. Hybrid qualification must instead reuse canonical WorkOrder dispatch and approvalDecisions. Add an explicit isolated local-delegation preparation branch, then exact owner approval and the existing transactional admitTrial reservation. A pending preparation has no execution authority; authenticated claim creates the owner lease and durable claim event only after reservation. Resolve canonical member-backed ownership and authenticated Plan approver identity without rewriting those fields. Never mutate an approved Plan to append delegation approvals after native execution.

Use the retained three-file synthetic MyFactory source snapshot (5cd13fa1f307a0c0f42f6317d966bb3179ad77c9) as the single local Mission repository. It fits the existing bounded local source admission. The local MyFactory request preserves its canonical source repository name. An explicit immutable preparation maps the admitted local repository ID to that exact name, commit and tree; the local provider's immutable configuration and FactoryVersion remain unchanged. No GitHub access, publication, or Vercel path is needed. All three WorkOrders remain in one repository and one approved Mission; downstream integration consumes exact predecessor handoff identities in a deterministic proof document.

This extension touches dispatch, existing compatibility authority lookup and qualification scripts because fixture-created Attempts cannot establish canonical lifecycle qualification. It introduces no new registry, ledger, execution engine or Result system.
