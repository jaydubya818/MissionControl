# Experimental Fab executor integration

Fab is an execution-only harness. Mission Control owns admission, frozen manifests, Attempt leases, candidate commits, independent verification, human approval, publication and recovery. Fab readiness requires at least one current, explicitly selected, qualified provider route. Each route has its own status; an unavailable optional route does not block a qualified route.

The adapter consumes an explicit operator-owned Fab config, a pinned vendored package, a state directory outside the worktree, and the canonical Attempt context. No credential discovery occurs. Native model APIs use only the enrolled Fab key or explicitly selected Fab environment variable. Source-control credentials are never passed to Fab. The worker requires the exact frozen model route and installed runtime byte identity before credential use or inference.

The current package is `@fdlc/fab@0.1.0-experimental.9`, built from FDLC commit `3f0bee56bd4b7dffcb56655ee66a5ae0f39a6cb2`. The installed 43-file closure hash and source are recorded in `apps/orchestration-server/src/fabRuntimePin.ts`; the archive SHA-256 is `8a1ace50873b03f1fddf7d0f7d81fe425c6dbab25cf7acd4b23d5c148a654d32`, also bound by the pnpm integrity entry.

The active route uses OpenRouter's fixed non-streaming chat-completions endpoint
and exact model `openai/gpt-4.1-mini`. Mission Control mints one expiring,
dollar-capped key per Attempt, keeps it in memory, and confirms revocation after
execution. No provider fallback or retry occurs. Requested/returned model,
provider request ID, token usage, latency, and provider-reported cost remain in
canonical evidence.

Bedrock remains supported as a separate optional route. Its current status is
`EXTERNAL_WAIT` with reason `AWS_QUOTA`; it is not an OpenRouter fallback and is
not a Fab readiness dependency while OpenRouter is qualified. The Bedrock
text/tool protocol requires an explicit host-owned broker factory.
Configuration cannot select an AWS credential chain or an HTTP fallback. The
factory receives the canonical Attempt context, and the adapter rechecks authority
after broker enrollment. A missing broker fails closed; production startup does
not register a placeholder. The host still must implement exact CountTokens,
enrolled identity verification and durable reservation/claim/receipt handling
before live invocation. Offline tests do not establish those deployed controls.

Mission Control's shared Bedrock bridge and cumulative liability ledger are a
separate `codex/bedrock-v1` Docker tuple. They do not enroll this Fab
persistent-worker adapter. A Fab broker must reuse canonical authority without
duplicating the ledger or weakening either tuple's exact admission checks.

## Canonical lifecycle

New policy-v2 candidates pause before publication with an immutable v2 Git subject binding WorkOrder revision, contract, source Attempt, internal/provider repository, frozen base, candidate, tree, raw diff and branch refs. The builder's structured result and candidate evidence are durable before the separate Verification Attempt is dispatched. Existing v1 subjects retain their digest and historical semantics.

The detached verifier recomputes candidate identity before and after checks. Verification-authority rejection skips dependency preparation and command execution and produces canonical blocking policy evidence. A failed candidate terminates and requires replacement. Infrastructure failure preserves the candidate for an explicit verification retry. Missing mandatory evidence cannot be waived through human approval.

A separate verifier receipt must be current before human review. Human resolution retains the original verifier Attempt, plan and evidence identity. The current resolved receipt, human decision, candidate and active lease must all match before MC issues a publication permit. The worker rechecks cancellation, canonical lease renewal and the consumed permit immediately before each provider mutation. Git push and GitHub POST receive cancellation signals.

Actual publication produces a separate immutable subject-to-PR binding carrying the consumed permit and human/verifier identity. Acceptance still requires current trusted GitHub App evidence for the exact PR/head. A pre-publication proof or human approval alone cannot accept unpublished software.

If a provider or terminal response is lost, the consumed permit cannot authorize another write. Explicit reconciliation uses GitHub GET requests to prove the exact branch, commit and single open draft PR. Absent or conflicting evidence remains unknown. A durable binding permits finalization after local workspace cleanup without replaying the model, push or PR creation. Protected workspace ownership history allows recovery from a lost transfer acknowledgement; an unknown running in-process invocation still blocks transfer.

## Operator configuration

Set `FAB_EXECUTOR_ENABLED=1`, `FAB_EXECUTOR_CONFIG=/absolute/operator/config.json` and `FAB_EXECUTOR_STATE_DIR=/absolute/private/state` in the worker startup environment. For OpenRouter, also set `FAB_OPENROUTER_APPROVED_CONFIG_FILE` to an operator-owned copy of `docs/software-factory/fab-openrouter-qualified-route.json` and provide `OPENROUTER_MANAGEMENT_API_KEY` directly in the startup environment. These values are captured before legacy dotenv loading. The Fab config selects `provider: "openrouter"`, exact model `openai/gpt-4.1-mini`, and a `source: { "kind": "broker" }` credential reference. No generic OpenAI key is read.

Dependency preparation uses a scrubbed environment and empty HOME, a frozen lockfile, offline resolution, disabled lifecycle scripts and disabled pnpm hooks. Set `MISSION_CONTROL_FACTORY_PNPM_STORE_DIR` to an absolute prewarmed store outside the candidate worktree for dependency-bearing pnpm repositories. Candidate npm configuration cannot select that store or enable hooks. Missing dependencies fail closed within the preparation timeout; they are not fetched by the worker. Dependency preparation is not itself a whole-agent sandbox.

This local persistent-worker tuple rejects `WORKSPACE_ONLY`, read-only Fab execution, remote Fab execution, model fallback and uncertain invocation replay. Contained project checks operate on bounded snapshots; they do not establish an OS read boundary around the whole agent. The only qualified remote credential grant is the attempt-scoped, expiring, dollar-capped OpenRouter key described above. No Linux/Windows expansion or autonomous merge is included.

## Qualification

Run `pnpm exec vitest run --config vitest.fab.config.ts` on a macOS host that permits Fab's contained checks. Full repository tests, typechecks, release security, runtime-contract checks, build and composed System Qualification remain separate gates. New evidence belongs under `docs/testing/evidence/fab-phase3/` and FDLC `docs/fab/qualification/phase3/`; Phase 2 evidence is immutable.

Local tests use actual Fab code, native checks, canonical MC worker/verifier/report handlers, isolated Git repositories and synthetic provider/control-plane authority where declared. They cover model request uncertainty, durable event rejection, leases, cancellation, candidate identity, human/verifier currentness, publication fences and read-only recovery. The recovery operator component has pending/error/success states and local browser qualification; the existing shell suite is separate from deployed backend qualification.

OpenRouter qualification makes Fab usable in the approved non-production local
mode. Production deployment, broader workload claims, signing, and licensing
remain separate decisions.

Main reconciliation preserves the existing v1 `LOCAL_GIT` attestation route, which remains acceptance-ineligible. Runtime compatibility remains the current main contract. Main’s governed inference accounting remains opt-in and separate from Fab’s enrolled provider transport; no shared live gateway qualification is implied. Exact local attestation recovery may reclaim an expired lease only after the server validates the original failed Attempt, frozen manifest/configuration/WorkOrder/repository, unpublished code-diff checkpoint and prior owner. The worker only inspects that candidate; it does not rerun the executor, MCP tools or publication. Ordinary interrupted execution still requires a replacement Attempt. Failed/canceled terminal recovery is preserved and reported as a blocker rather than returned as successful recovery.

See [Phase 3 qualification evidence](../testing/evidence/fab-phase3/README.md) for results and remaining external gates.
