- [x] Read poteto-mode Principles and mission-control-delivery.
- [x] Phase A: Frame. Exact sources, authorized scope, completion predicate and trust boundaries.
- [x] Phase B: Design the workflow. Compare canonical Attempt envelope with inference-record reuse; independent reviewers support Attempt authority.
- [ ] Phase C: Run the loop. Implement, test, review and preserve each unit.
- [ ] Accounting: red abuse cases, canonical schema/admission/settlement, actual database races, review, commit/push/SHA.
- [x] Gate: canonical policy-v2 ingestion/currentness, stale evidence/failure tests, review/checkpoint.
- [x] Recovery: durable controller readback, restart/fault tests, no redispatch, review/checkpoint.
- [x] Phase D: Keep the audit trail. Append each decision/checkpoint to decisions.tsv.
- [ ] Phase E: Verify and hand back. Fresh clones, CI, regression identity, independent review and required report.
- [x] Blocking first steps: exact base and canonical source discovery before implementation.
- [x] Independent workstreams: security/architecture review only; implementation remains sequential per user tool mapping.
- [x] Shared mutable state: a single writer owns this clone; canonical shared budget reads/writes use one transaction.
- [x] Smallest safe decomposition: accounting then gate then recovery. Opening PR/merge skipped; user requested isolated commits/pushes, no dependency adoption.

- [x] Canonical native/delegated reservations and delegated executed settlement qualified and preserved.
- [ ] Native executed settlement: blocked on exact pinned runtime image; reservation retained.
- [ ] Final recovery remote source, fresh-clone and hosted CI evidence pending.

## Native runtime successor
- [x] Final bounded source/workflow provenance check; original image UNAVAILABLE.
- [x] Design reviewed for native reservations, retained-proof settlement and separate verifier authority.
- [ ] Build separately versioned runtime with exact source/context/toolchain/image/archive provenance.
- [ ] Register and qualify v3 without changing historical v1/v2 identities.
- [ ] Native execution and executed settlement through canonical APIs and real storage.
- [ ] Concurrency, duplicates, lost acknowledgments, cancellation, expiry, UNKNOWN, restart and stale writers.
- [ ] Native enterprise gate and deterministic hybrid Mission with canonical acceptance/handoffs.
- [ ] Independent security/architecture review, fresh clone, hosted CI, exact Bedrock baseline.
- [ ] Commit/push/remote SHA checkpoints and required report.
