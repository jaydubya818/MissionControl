# Independent security review — lost-create-reply recovery

Date: 2026-09-05. Scope limited to `DockerSandboxProvider.terminateRequested`, optional resource-ID/recovery receipt, `convex/lib/dockerAllocationRecovery.ts`, and `reportSandboxReconcileInternal` acceptance. Read-only source and supplied test/evidence review; no Docker/provider/network calls or implementation edits by this reviewer. This does not qualify a provider route, producing profile or WO1 admission.

**No confirmed cross-lease, cross-image or known-ID bypass was found in the reviewed recovery changes.**

## Ownership and receipt checks

- Missing-ID recovery (`apps/orchestration-server/src/dockerSandboxProvider.ts:197–220`) requires a Docker journal request, canonical bounded resource name, lease ID, manifest SHA-256 and a frozen supported profile. The daemon lookup is an anchored exact name, not a broad prune or substring cleanup.
- A discovered result must be exactly one full Docker resource ID. Inspection authenticates the exact ID/name/provider label/lease label/manifest label before removal, then separately checks the actual configuration image ID against the frozen provider image ID (`:210–217`). Removal uses the inspected immutable ID. A same-name container owned by a different lease or image is rejected rather than deleted.
- A second responsive daemon lookup must show exact-name absence. A socket/daemon error rejects the operation; it is not converted into absence. When no ID was ever observed, the receipt honestly omits it rather than inventing one.
- Existing-ID termination still uses its original exact-ID path (`:183–195`). `dockerRequestRecoveryMatches` explicitly requires the persisted allocation to have no provider resource ID (`convex/lib/dockerAllocationRecovery.ts:5`), so a recovery proof cannot excuse a different known resource ID.
- The receipt helper matches journal name, provider, lease, manifest and immutable profile image, validates optional discovered ID and timestamp ordering, and requires `resourceAbsent: true`. It binds evidence to an existing journal request; it does not create an allocation or dispatch authority.
- Canonical acceptance (`convex/factory/attempts.ts:459–480`) reloads the run/host and refuses reconciliation of a current registered lease. It loads the allocation within that exact workflow run, preserves known-ID matching, and requires the missing-ID proof even when both receipt and allocation IDs are absent. Active credentials must be reconciled before the allocation can close (`:492–500`). The existing signed, scope-bound service action remains the caller (`convex/serviceCommands.ts:769–788`).

## Supplied evidence and limits

The actual Docker test first allocates a real resource, then supplies a journal without the returned ID to model a lost reply. It verifies a wrong lease leaves that resource intact, the correct lease recovers/removes it, a repeated absence receipt omits the ID, and a dead socket rejects. The helper file contains 11 cases total: one acceptance case exercising discovered-ID and no-ID receipts, six journal-binding negatives and four malformed/missing-proof negatives. These are implementer-run controls, not this reviewer's independent behavioral certification.

**Remaining ambiguity qualification limit:** this test loses a reply after a create has completed. It does not delay a still-in-flight daemon create until after recovery's final name-absence observation. `terminateRequested` proves responsive point-in-time absence; it cannot alone prove no previously submitted create can materialize later. If that race occurs and the journal is marked TERMINATED, the current live-state reconciler will no longer select it. Preserve this as an open late-create fault point until serialization/fencing or a controlled delayed-create drill demonstrates closure. It is separate from the successfully tested same-name ownership controls and must not be described as a cross-lease deletion exploit.

The optional receipt proof is still an assertion from the authenticated controller, not a daemon-signed attestation. The controller and daemon remain trusted boundaries as before. Helper-only tests also do not independently prove the full signed service/handler inactive-lease path.

## Disposition

The reviewed change safely narrows recovery authority and closes the tested completed-create/lost-ID case without loosening known-ID matching. No source correction is required for cross-lease/image deletion in this bounded review. Full ambiguous-allocation qualification retains the late-create limit above. Provider selection, real provider liability, complete producing admission and WO1 remain unqualified; this review grants no GO or dispatch authority.

## Reinspection after fail-closed refinement — 2026-09-05

Re-read the updated provider, receipt interface, backend helper and helper tests. This section supersedes the preceding description of receipts with omitted IDs; that behavior is preserved above only as review history.

- `terminateRequested` now throws `INFRASTRUCTURE_FAILURE` when the exact-name lookup returns no container, explicitly requiring the request journal to remain unresolved. It cannot emit a successful absence receipt for an unknown create outcome.
- Recovery succeeds only after discovering a full 64-hex container ID, checking exact ownership and frozen image, removing that identified resource and observing absence. The returned receipt always includes the discovered ID.
- `SandboxTerminationReceipt.providerResourceId` is required again. `dockerRequestRecoveryMatches` independently rejects a missing or malformed discovered ID, so the canonical receipt consumer also denies the former omitted-ID path. Known-ID matching remains unchanged.
- The helper test inventory now has 12 cases, including the newly added missing-ID negative. The implementer reports these passing; final Docker/System reruns were still in progress at this reinspection. No rerun or independent behavioral certification was performed by this reviewer.

**The identified premature-absence closure risk is closed in source by preserving an unresolved state.** An empty lookup can no longer finalize the missing-ID journal before a late daemon create becomes visible. This is fail-closed containment of ambiguity, not qualification of automatic resolution for every delayed-create outcome. If a create never produces a discoverable resource, the record intentionally remains unresolved until a separately justified reconciliation establishes closure. No cross-lease/image deletion or known-ID bypass was identified after the refinement. Provider/WO1 admission remains outside this review and unqualified.
