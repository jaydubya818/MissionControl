# WorkOrder reservation transaction qualification

Result: **PASS**, 2026-09-06. The snapshot consistency correction resolves the
data-integrity review finding. Architecture, security and data-integrity review
have no remaining merge-blocking findings for this bounded slice.

The unmodified `convex/inferenceGateway.ts` source was bundled with only a
fixture authorization shim. The exact `inferenceReservations` schema and all
its production indexes were extracted unchanged; related tables and records
are deliberately synthetic. This is real local Convex transaction evidence,
not full application schema/authentication, provider, billing or real-pilot
qualification.

Source SHA-256:
`2f6a0713bcd4f2e95549534a71022703321124c4fe27d66d84b984ae5841a174`.
The source was unchanged before/after the run. Branch HEAD was
`0915113105d4be6b844def360ca0856c7579e232` at snapshot time and
`f4c5c8d269cb050f64f80604548d191e06dd8a91` at final verification; the parent
continued committing while qualification ran. The file hash is the proof
identity. Runtime: Convex client 1.42.3 and the cached backend binary hash in
`report.json`.

All 22 scenarios passed:

- Twelve trials each submitted eight competing 60-microusd reservations under
  one 100-microusd parent ceiling. Each produced one allocation and seven
  explicit aggregate-budget rejections.
- Eight trials each submitted eight exact simultaneous replays for a
  100-microusd reservation. Each produced one allocation, seven replay
  responses and one identical reservation ID/digest.
- A second Attempt under the same WorkOrder could not reserve another 60; its
  exact remaining 40 was admitted, leaving two Attempts and 100 allocated.
- A stored amount corrupted from frozen 60 to 1 caused a proposed 99 to fail
  closed without creating another reservation.

This exercised 165 reservation mutation HTTP requests. The backend log contains
140 explicit optimistic-concurrency retry entries for the actual gateway
mutation, supporting that the trials exercised real conflicting transactions.
No client-level retry workaround was used.

Nonblocking limitation: each new admission reads the WorkOrder's complete
reservation history. It remains O(n) per admission and needs a bounded scaling
strategy before high-volume rollout. Preserve the authoritative transaction;
do not paginate its sum across transactions. Hold release, wider WorkOrder
spend conservation, dispatch bounds and provider settlement remain outside
this slice and this qualification.

Reproduce on this machine:

```sh
node --import /private/tmp/fdlc-reservation-authority-harness/loopback-only.mjs /private/tmp/fdlc-reservation-authority-harness/run.mjs /private/tmp/fdlc-program-phase5
```

The harness creates a new directory and empty database on every run, picks
ephemeral ports, and generates a local-only key without persisting it. No
original database is copied or opened. No repository file or build output is
written. The Node network guard rejects non-loopback connections; the backend
binds 127.0.0.1 and disables its beacon. No inherited provider/account secrets
are supplied.

Evidence: `report.json`, `verification-note.json`, `deployment.log`,
`backend.log`, `source-inferenceGateway.ts`, `fixture-auth-shim.js`,
`fixture-source.ts`, `bundle-metafile.json`, and `project/convex/`.
The first temporary setup run rejected an unsupported CLI option before any
test; its failure and cleanup are preserved in `verification-note.json`.

Cleanup confirmed: the successful backend stopped with SIGTERM and both
127.0.0.1 ports 63682 and 63683 are closed. The earlier setup backend also
stopped. Disposable synthetic database and evidence are retained for review.
