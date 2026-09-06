# Phase 1 reconciliation with current main

Baseline `0d1a0908cce380d815069ce0a59e1604d2f26ece` (v41).
Fetched main `ed77c46c9d975a2ed0c666cdaf0a3f0e12e77d4d` (v42), two commits later.
Source fork merge-base `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`.
New isolated candidate starts directly at fetched main; no merge commit or push.

## Audit and overlap decisions

Preserve main's two new public APIs: `factory/attempts:recoverLocalCandidate` and
`factory/governedMcp:registerContext7QueryDocs`. Preserve immutable LOCAL_GIT
verification, exact code-diff checkpoints, no-model-replay recovery, workspace
ownership transfer, live MCP handshake/schema/DNS/deadline controls, current
Execution Profile tool grants, approval recalculation and Factory readiness
NOT_APPLICABLE handling. No newer provider adapter or transactional monetary
reservation authority supersedes the Phase 1 implementation.

The per-file inventory classifies all main and Phase 1 changes. Nine overlaps:
worker and Attempt handlers compose Docker recovery with main's candidate recovery;
schema adds Phase 1 monetary tables without replacing MCP observation fields;
WorkOrders keeps main's fresh approval calculation and adds read-only readiness;
runtime advances from current main; README/overview/maturity retain main's claims
and add Phase 1 qualification limits; documentation drift test uses current source
version. Generated API files are not imported from the old candidate.

Non-overlapping main files remain unchanged. Non-overlapping Phase 1 changes are
retained. Historical evidence is copied unchanged and snapshots preserved. The
legacy filesystem liability ledger is fixture-only; Convex remains the single
live monetary authority. No duplicate router, Attempt or verifier is introduced.

## Exact public contract plan — written before version change

Current main v42 → proposed v43. All seven operations are STILL_REQUIRED:

1. `workOrders:readiness`: scoped, read-only current WorkOrder blockers. No issuance.
2. `factory/providerLiability:registerPriceVersion`: immutable versioned bounds/rates.
3. `factory/providerLiability:createReservation`: unique transactional WO authority.
4. `factory/providerLiability:getReservation`: scoped evidence query.
5. `factory/providerLiability:reconcileUsage`: authorized audited corrections.
6. `serviceCommands:reserveProviderRequest`: signed fenced pre-send budget hold.
7. `serviceCommands:recordProviderUsage`: signed attributed usage/unknown outcome.

No existing public operation is removed. No current-main operation is superseded.
Bedrock-specific API price values remain in the newly added price operation.
Authoritative codegen must generate the API diff; no manual generated edits.
Historical v41→v42 evidence stays historical. Both default and explicit current-main
guards must pass the new transition. Phase 3 historical child guard stays scoped.

## Remaining work

Carry the source delta into this isolated worktree, review every overlap, update
safe AWS bootstrap configuration (explicit profile only; no default discovery),
and prove current model-route/profile/Factory/readiness/verifier compatibility.
Run ≥152 focused and 51 Docker/ledger cases, current System Qualification and
security/data/architecture/simplicity reviews. Local commits are authorized.
No AWS/model calls, WO1, readiness, merge, push or publication.


## Current-main advancement during implementation

Re-fetched main at 2026-09-05 22:19 UTC: eb438f5fd14add2822392858852051dea27d6fd1,
three commits beyond preserved 0d1a0908cce380d815069ce0a59e1604d2f26ece.
Initial fetched ed77c46 remains historical audit evidence. Reviewed all ten new files:
operating-contract map, release policy and evidence, maturity ledger and Vercel guard.
Preserve all upstream additions; maturity ledger combines both additions. No changed
public operation or runtime version. Rebased isolated local candidate onto eb438f5;
normal merge-base is now eb438f5. Contract proposal remains v42 → v43 with seven
additions and no removals. See current reconciliation reviews and main advancement
patch archive. Original source checkout, pending merge and stash remain untouched.
