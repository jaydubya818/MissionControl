# Runtime contract lineage audit — 2026-09-05

Classification: read-only Git history audit and reconciliation recommendation, not a completed reconciliation or runtime qualification. No fetch, merge, source edit, commit, credential access, provider call, or WorkOrder dispatch was performed by this audit. The Git History Analyzer skill was used. The only new artifact is this report.

## Observed revisions

The checked-out branch is `codex/fdlc-pilot-readiness`, HEAD `f82fe1d98b156278c4fa0c0e2032008e2f010f39`, runtime contract v40. Stored `origin/main` resolves to `0d1a0908cce380d815069ce0a59e1604d2f26ece`, runtime contract v41. These are locally observed refs, not a claim that a network refresh has verified current remote main. Their merge base is `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38` (v39).

| Main lineage | Commit | Timestamp | Purpose |
|---|---|---|---|
| v38 → v39 | `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38` (#164) | 2026-09-04 17:49:05 -07:00 | Phase 1 model route, harness, runtime artifact, backend identity separation |
| v39 → v40 | `3ae9d86eeff1966862a6959664ec1fe2e6e7240a` (#170) | 2026-09-05 00:09:35 -07:00 | Phase 2 governed immutable Execution Profiles |
| v40 → v41 | `6611a03c6025e7e19548e9a742237e2e466030ee` (#171) | 2026-09-05 02:47:38 -07:00 | Phase 3 governed read-only MCP capability, eight public changes recorded in its completion evidence |
| v41 retained | `0d1a0908cce380d815069ce0a59e1604d2f26ece` (#172) | 2026-09-05 03:09:50 -07:00 | Phase 3 post-merge evidence and correctly scoped historical qualification baseline |

Separately, `f82fe1d98b156278c4fa0c0e2032008e2f010f39` (2026-09-04 23:51:34 -07:00) changes v39 → v40 for the added public `workOrders:readiness` query. It is a sibling of the main Phase 2/3 history, not the same v40 contract. Its existing historical artifact must remain intact; its version number must not displace main v41.

The relevant main commits are authored by Jarrett West; the readiness commit uses the configured `notes-to-factory` identity. No authorship/configuration change is needed. History shows independent feature branches consuming the next number before reconciliation, rather than a legitimate downgrade.

## Historical versus general qualification

Phase 1 established exact independent model/harness/runtime/backend tuples at v39. Phase 2's accepted `docs/decisions/execution-profile-identity.md` explicitly names baseline `9a80cf3…` and composes already qualified Phase 1 tuples at main v40. These labels concern architectural phases; FDLC's bounded pilot Phase 1 is not permission to rewind the architecture to v39.

Main `scripts/governed-mcp-phase3-qualification.mts:13–16` deliberately requires historical baseline `3ae9d86…` (main v40). It validates the implementation SHA against current HEAD. This fixed base is appropriate only for this historical Phase 3 scenario, not for the complete current contract.

Commit `0d1a090…` changes `scripts/system-factory-e2e-qualification.mjs` to define `phase3QualificationBaseSha = "3ae9d86…"` and pass it **only** to the Phase 3 child. The general `baseSha` remains explicit `MC_QUALIFICATION_BASE_SHA`, otherwise `git merge-base HEAD origin/main`; other security, historical immutability, system, and contract gates retain that normal value. Import this existing fix rather than invent another global override. Main's Phase 3 completion report records 19/19 composed post-merge gates, so the reconciled runner must not silently retain the older runner's gate count.

The general `scripts/lib/runtime-contract-guard.mjs` defaults independently to `origin/main` (HEAD only if the ref is absent), not to merge-base. It rejects a decreasing version and any public validator change without increment. This is correct. It must not be patched to use f82 or another old base merely to pass.

One remaining current-evidence defect to address after reconciliation: `scripts/governed-mcp-phase3-qualification.mts:69` hardcodes `runtimeContractVersion: 41` even while allowing a newer exact current implementation HEAD. At v42 a fresh evidence document must record the actual source contract version and distinguish any preserved historical Phase 3 contract version/baseline. Do not overwrite old v41 receipts or relabel them as v42.

## Prior evidence interpretation

`../runtime-contract-explicit-command.json` explicitly records base f82/v40, current v40, stored default origin/main `0d1a090…`/v41, and no new public API changes relative to f82. This is a valid narrow statement about the Docker edits on that branch; it is not successful integration with current main.

`../../fdlc-phase1-docker-system-qualification/automated-checks.json` records f82 as both base and started HEAD and a PASS from 2026-09-05T17:54:10.110Z through 17:55:57.725Z. This uses the older branch-local System runner, which lacks main's Phase 3 child. Preserve it as historical branch-local evidence; it cannot certify current main's contract or full current System Qualification. The original NO_GO and default-contract failure remain correct. No evidence examined here proves an incorrectly admitted live runtime or WorkOrder; no such admission was issued.

## Exact reconciliation strategy

1. Preserve all current tracked/untracked work and existing evidence with a file manifest and hashes before changing Git state. Keep the original worktree usable. Do not reset, clean, or overwrite untracked reports. A dedicated integration worktree from freshly verified main is the lowest-risk approach; the parent task owns any authorized ref refresh/creation.
2. Start from authoritative main v41, retaining the v39 → main-v40 → v41 chain. Replay the readiness implementation (f82) and its immutable historical records without treating f82's v40 as the new current version. Apply the preserved Docker/budget source delta in a controlled step; compare file hashes against the snapshot and resolve integration conflicts against current Execution Profile/MCP APIs. Do not restore whole old files over newer main implementations.
3. Before the contract edit, enumerate the intended public diff against the exact selected main SHA. At minimum the existing readiness API addition is new to main; include every additional Docker/provider/budget public validator change the implementation actually requires. Current Docker source edits alone were internal on f82 and do not excuse the readiness addition. Advance exactly once from v41 to **v42**, provided verified main still is v41. If refreshed main has advanced, recalculate once from that authoritative version instead; do not reserve an already-used number.
4. Keep main's child-scoped Phase 3 historical base. Update only new evidence generation to report current source version separately from historical scenario version. Do not modify historical contract files, immutable receipts, or expected historical semantic baselines.
5. Run both `pnpm run ci:runtime-contract` and `node scripts/check-runtime-contract.mjs --base <exact-current-main-SHA>` on the reconciled tree. Review the full listed API diff, not only the exit code. Run guard unit tests. Run Phase 3 with its explicit historical v40 base through the current System runner and compare its old/new scenario semantics. Fresh Phase 1/2 regression tests should run on current source; any historical code replay must use a separate historical worktree and be labeled accordingly.
6. Run the full current System Qualification with a new revision-scoped evidence slug and the normal general base. Use a clean final-main worktree for required post-merge requalification. Preserve the old 13/14 state and do not claim closure until default/current-main guards and all equivalent current gates pass.

If schema/public validators change, use authoritative Convex codegen and record the generated diff; never hand-edit generated files. This strategy does not authorize WO1 or live provider calls and does not qualify the runtime/budget by itself.

## Commands supporting this audit

Read-only commands included `git log --follow`, `git log origin/main -S 'RUNTIME_CONTRACT_VERSION = 40'`, corresponding v41 searches, `git show` of each version transition, `git merge-base HEAD origin/main`, `git blame -w -C -C -C origin/main -- scripts/system-factory-e2e-qualification.mjs`, `git shortlog -sn origin/main -- convex/lib/runtimeContract.ts`, scoped `git grep`, and reads of the historical FDLC command/System evidence and main Phase 3 completion record. No network assertion is inferred from these local object reads.
