# Experimental Fab executor integration

Implement the FDLC Phase 2 request against MC revision `07a96ac`. Fab remains an execution-only harness; MC owns claims, leases, frozen manifests, candidate commits, independent verification, approval, recovery and publication.

The adapter consumes an explicit operator-owned Fab config, a pinned private local package, a state directory outside the worktree, and MC's current Attempt context. No credential discovery. Native model APIs use only the enrolled Fab key or explicitly selected Fab environment variable. No source-control credential is passed to Fab.

The generic harness context gains optional attempt metadata and an authority checkpoint callback. Fab requires it and refuses uncertain session replay. The existing worker supplies canonical renewal checks, links work order/attempt/source, and binds the final candidate commit back to the Fab observation record. No new lease or control-plane table.

Registration is opt-in. This local persistent-worker tuple does not enforce a whole-agent OS read sandbox and rejects `WORKSPACE_ONLY`. Remote sandbox and production admission remain unavailable. Model tools and project checks retain Fab's existing bounded guards and contained snapshot execution. The MC verifier uses its existing separate Attempt path.

Qualification uses synthetic provider responses, isolated Git worktrees, actual Fab code/checks, canonical MC worker/verifier code and mocked external authority/GitHub transport. No real project publication or user credential use. Source-revision identity, redaction, scope, lease loss, cancellation, candidate mutation and uncertainty are explicit gates.

The vendored `.tgz` is a private packaged dependency built from FDLC `e82fc67`, not a second runtime source fork. Rebuild it from that checkout with `npm run build && npm pack --ignore-scripts`. Package files include a macOS native credential bridge; this tuple is macOS-only. The extracted `vendor/fab/runtime` directory is ignored and is only a local test/typecheck resolver; ordinary package installation resolves the pinned archive dependency.
