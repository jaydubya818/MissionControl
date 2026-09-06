# Inference ledger identity contract

Todo 063 continuation. Initial baseline: `4434cc56448075f4804787325a9586c6290b2215`.
Integrated baseline: `9e6dfd9b0110c0316b1fc085539b41e2616ebac7`.
The gateway remains Experimental and default off.

Database references and canonical evidence identities serve distinct purposes.
Convex document IDs remain API arguments, foreign keys, lookup/index keys and
navigation references. Canonical records retain the logical identity frozen
when their digest was created. A database ID must never replace that identity
while keeping the old digest.

The existing reservation freezes `${projectId}:${registrationKey}`. Passing its
database ID to the strict physical-intent constructor makes a normal persisted
request fail. Receipt construction repeats the mismatch. Intent keys and retry
ancestry are also lost, and projection adapters reconstruct different IDs under
the original event/receipt/projection digests.

## Bounded repair

1. Preserve an immutable snapshot on new intent, receipt and outcome projection
   rows, following the existing reservation and price-book pattern. Optional
   schema fields admit existing data without migration; new writes always retain
   exact snapshots. Canonical consumers reject missing or invalid snapshots.
2. Construct physical intents using the reservation's frozen ID. Store the exact
   PERSISTED snapshot. Translate a validated prior database intent reference to
   its canonical intent ID for fallback ancestry. Exact replay also binds the
   caller's original intent key.
3. Keep the original intent snapshot immutable during claim/cancellation. At
   receipt creation, derive the CLAIMED canonical view using committed claim
   identity/time and the existing claim transition helper. The receipt's logical
   IDs stay canonical; its database foreign keys still point to actual rows.
4. Persist the exact receipt snapshot and consume that snapshot for projection.
   Reconstruct event IDs using their original `${sourceType}:${sourceId}` formula.
   Resolve reconciliation database receipt references through the selected
   receipt-to-canonical-ID map while retaining original reconciliation evidence.
5. Store the exact outcome projection snapshot, including its logical version ID
   and canonical reference lists. Keep separate database reference lists for
   navigation. Route comparisons consume validated canonical snapshots from the
   selected cohort and supported formula, so unrelated historical rows cannot
   block a new cohort. Receipt replay compares every observation against the
   frozen snapshot, including pricing context.

Legacy rows with a lost intent key or missing canonical snapshot are not repaired
by guessing. Preserve them for inspection and fail closed for new claims,
receipts or comparisons that depend on unrecoverable identity. This change grants
no new execution, provider, acceptance, release or promotion authority.

## Storage round-trip correction

A real local backend revealed that the shared legacy canonical hash includes
explicit `undefined` properties while Convex omits those properties during
storage. A snapshot that passed in-memory tests therefore failed its digest after
a database round trip. New intent, receipt and projection snapshots use **v2**
schemas and remove absent object fields before hashing. The global canonical
hash and historical v1 evidence remain unchanged. Canonical consumers reject all v1 intent, receipt and projection snapshots,
including hash-valid ones. They do not silently rehash old evidence or invent
lost fields. Existing records remain inspectable; dependent new execution or
projection requires a supported v2 snapshot.
The Phase 5 command compares a new v2 fixture while retaining the original
[offline record](../testing/evidence/governed-inference-phase5/offline-qualification.json).

Runtime contract advances from v47 to v48 for the optional snapshot schema fields.

## Required proof

Exercise real mutation handlers with deliberately different database and logical
IDs through primary intent, claim, definitive failure, fallback, success,
reconciliation/replay and a versioned outcome projection. Validate canonical
digest reconstruction and unchanged original reservation/intent snapshots. Deny
changed intent keys, substituted scopes and unrecoverable legacy identities.
Synthetic verification/approval facts are labeled fixtures and never counted as
real accepted WorkOrders. Repeat the persisted chain on an isolated local backend
and run current full repository, phase, security, runtime and browser gates.

This repairs identity persistence only. Physical liability bounds, receipt
overrun retention, exact live routes, billing provenance, complete outcome
economics and real pilot acceptance retain their existing open requirements.
