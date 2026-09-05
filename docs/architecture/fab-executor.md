# Experimental Fab executor integration

Implement the FDLC Phase 2 request against MC revision `07a96ac`. Fab remains an execution-only harness; MC owns claims, leases, frozen manifests, candidate commits, independent verification, approval, recovery and publication.

The adapter consumes an explicit operator-owned Fab config, a pinned private local package, a state directory outside the worktree, and MC's current Attempt context. No credential discovery. Native model APIs use only the enrolled Fab key or explicitly selected Fab environment variable. No source-control credential is passed to Fab.

The generic harness context gains optional attempt metadata and an authority checkpoint callback. Fab requires it and refuses uncertain session replay. The existing worker supplies canonical renewal checks, links work order/attempt/source, and binds the final candidate commit back to the Fab observation record. No new lease or control-plane table.

Registration is opt-in. This local persistent-worker tuple does not enforce a whole-agent OS read sandbox and rejects `WORKSPACE_ONLY`. Remote sandbox and production admission remain unavailable. Model tools and project checks retain Fab's existing bounded guards and contained snapshot execution. The MC verifier uses its existing separate Attempt path.

Qualification uses synthetic provider responses, isolated Git worktrees, actual Fab code/checks, canonical MC worker/verifier code and mocked external authority/GitHub transport. No real project publication or user credential use. Source-revision identity, redaction, scope, lease loss, cancellation, candidate mutation and uncertainty are explicit gates.

The vendored `.tgz` is a private packaged dependency built from FDLC `026d0fba1838466f06417313a28216306efcbca7`, not a second runtime source fork. Rebuild it from that checkout with `npm run build && npm pack --ignore-scripts`. Package files include a macOS native credential bridge; this tuple is macOS-only. The extracted `vendor/fab/runtime` directory is ignored and was linked into this isolated worktree’s local node_modules for testing. Ordinary package installation resolves the pinned archive dependency through normal Node/TypeScript resolution.

## Operator configuration and release gates

Set `FAB_EXECUTOR_ENABLED=1`, `FAB_EXECUTOR_CONFIG=/absolute/operator/config.json` and `FAB_EXECUTOR_STATE_DIR=/absolute/private/state` explicitly in the worker startup environment. These Fab settings are captured before legacy dotenv loading; repository dotenv cannot enable the adapter or override its selected key. Reuse the existing MC durable-worker project/repository/host configuration and admission surface. The config must bind the exact assigned worktree, provider/model, writable files, criteria and fixed checks. No working model or credential is inferred from an installed agent.

A matching capability manifest and effective-config hash are required. Whole-agent `WORKSPACE_ONLY`, read-only Fab execution, remote sandbox, model fallback and uncertain invocation replay are rejected. MC's own verifier handles verification attempts. The adapter sends bounded metadata to MC; source buffers and complete redacted transcripts remain in private Fab sessions.

Run `node node_modules/vitest/vitest.mjs run --config vitest.fab.config.ts --no-cache` for the selected offline qualification layers on a macOS host that permits Fab's contained checks. The package and MC orchestration typechecks also pass. Current result: 163 tests passed, 0 failed, 0 skipped across 22 files. The evidence and complete release gates live in FDLC's `docs/fab/FAB-QUALIFICATION.md` on `codex/fab`.

The golden path combines actual Fab edits/checks, MC candidate commits, a separate detached verifier worker, frozen subject/plan and canonical independence derivation, followed by fixture human approval and mocked publisher transport. It proves integration behavior, not deployed Convex or GitHub operation. MC policy-v2 subjects require a provider PR identity; the test provides a controlled fixture identity. Existing draft-publication policy is not changed into a deployed pre-publication verification service.

Before deployment, qualify a developer-enrolled live provider/model, the selected full runtime containment boundary, deployed authorization/persistence and a separately authorized publication target. Other OSes, remote per-attempt credential grants, broader repositories and automatic recovery after uncertain outcomes remain unavailable. The existing workspace dependency lock has unrelated pre-existing drift; its entire lockfile was not regenerated. The added Fab entry is scoped to the archive's measured SHA-512 integrity.
