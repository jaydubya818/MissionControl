# Independent security review — current closure

Date: 2026-09-05. Reviewed current uncommitted source, including the merged-main working tree and v42 contract work. This is a separate source review, not a deployed-backend audit or independent behavioral certification. No Docker, provider, network, model calls or production mutations were performed by this reviewer. Earlier security-review.md remains historical evidence.

Scope: `convex/factory/providerLiability.ts`, `convex/lib/providerLiability.ts`, their validators/schema/tests, new signed service commands, Docker provider timeout handling and container bridge. Line references identify the source snapshot reviewed.

## Concrete findings

### CUR-SEC-1 — High potential aggregate-budget bypass; fixed during review

Initially, reservation creation deduplicated only `(projectId, idempotencyKey)`. A caller could create two reservations for the same WorkOrder with different keys, and each row could independently reserve the entire Factory budget. The request transaction locks one reservation row, so same-row concurrency protection alone did not protect the common monetary authority.

Reported to the implementation agent and re-read its fix: `convex/factory/providerLiability.ts:42–46` now queries `by_work_order` in the same creation mutation and denies any second WorkOrder reservation, including one associated with an expired reservation, changed revision or profile. The existing creation digest preserves same-key idempotency. This conservative rule addresses the reviewed bypass in source; expiration cannot reset money or uncertain holds. Do not describe it as an unresolved source vulnerability. A Convex handler-level concurrent creation test is still needed as evidence; pure reservation transition tests cannot exercise this index query or transaction.

### CUR-SEC-2 — Medium qualification gap: authoritative handlers are not covered by the supplied new tests

`convex/__tests__/providerLiability.test.ts:1–2` imports only pure helpers from `convex/lib/providerLiability.ts`. Its cases exercise transition math and caller-provided authority booleans, not `currentAuthority`, public permission checks, service-command scoping, the new single-WorkOrder authority query or Convex concurrency. In particular, it cannot establish the actual registration/generation/Attempt gates in `convex/factory/providerLiability.ts:54–66` or command validation at `convex/serviceCommands.ts:493–519`.

Required evidence: handler tests for unauthorized actor, wrong project/repository, different WorkOrder/revision/profile, stale registration/lease/generation, cross-Attempt settlement, price dependency failure, Factory ceiling, duplicate creation under distinct keys, and simultaneous requests for the last shared capacity. Keep a real deployed-runtime qualification separate from handler fixtures. This is a fixable test/evidence omission, not proof the inspected checks fail.

## Controls confirmed in source

- Price/reservation/reconciliation public writes require `MANAGE_AUTOMATION`; reservation reads require project VIEW permission. Price and reservation creation record actor/time; usage events append subject, usage digest, actor, correction flag and evidence reference.
- Public service actions use the existing HMAC envelope verifier, capability check, payload digest, bounded payload and scoped command receipt (`serviceCommands.ts:1024–1062`). They resolve scope from the workflow run before entering the internal mutation.
- Request authority checks current WorkOrder run/revision, RUNNING status, cancellation, lease expiry/identity/generation, Execution Profile eligibility/digest, repository, current host registration and Factory monetary ceiling (`providerLiability.ts:54–66`). Settlement additionally checks that the hold belongs to the exact run/lease/generation (`:89`).
- The monetary transition validates positive bounded rates and input/output limits, reserves before dispatch, and includes full previous maximum liability even after settlement. No money is released by UNKNOWN, expiration or lower reported usage (`convex/lib/providerLiability.ts:50–68`).
- Usage validates request digest/provider/model and price identity; per-reservation receipt replay is denied, correction revisions are checked, and usage exceeding the reserved output cap or input bound freezes the reservation rather than silently ignoring the overrun (`convex/lib/providerLiability.ts:75–92`). Usage token counts are ACTUAL while cost remains ESTIMATED; this correctly avoids calling price-derived cost an actual provider invoice.
- Validators structurally constrain persisted objects; semantic integer/digest/identity/bound checks occur in the transition helpers. Price HTTPS source and evidence digest are references, not proof that an external provider honors the stated bound.
- Docker host timeout now uses remaining absolute profile deadline (`dockerSandboxProvider.ts:173`), and exit 124 maps to TIMEOUT (`:172`). Bridge establishes its absolute deadline before stdin and shares remaining time through async bootstrap/supervisor operations. This source review does not certify host/VM clock assumptions, active-worker-death behavior or every deadline fault point.

## Remaining production qualification boundaries

The new Convex code is an authoritative storage/authorization **skeleton**. It does not by itself prove a governed broker sends exactly the bytes whose digest and limits were reserved, forwards a provider-enforced output cap, validates real provider identity/usage, or prevents every alternate credential/network route. A registered price document containing strong booleans and a source digest is not a real provider guarantee. No provider/model or real-call authorization is available in this review.

One reservation per WorkOrder prevents the discovered same-WorkOrder balance reset. It does not independently establish the proposed cohort-wide ceiling or producer/verifier suballocation contract; those remain explicit production admission work unless governed by another demonstrated shared budget authority. Per-reservation receipt replay checking is not a provider-account-wide receipt uniqueness proof.

**Recommendation: NO_GO for WorkOrder 1.** CUR-SEC-1 is fixed in source; CUR-SEC-2 and the stated real-provider/broker/full-runtime qualification remain open. No additional confirmed high-severity exploitable defect was identified in the current fixed offline skeleton during this bounded review. This conclusion does not authorize live calls, production admission records, WO1, publication or release.
