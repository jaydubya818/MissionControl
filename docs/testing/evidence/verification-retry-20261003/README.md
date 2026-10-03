# Completed-verifier retry recovery

Base: `63ae3c9`. Backend fix: `d91c7f5`. Regression commit: `34cd342`.

The original three tests reproduced rejected retries and incorrect WorkOrder
state before recovery. The recovered change creates a new source continuation
for the exact unchanged candidate, preserves failed evidence, and requires
independent verification and fresh human approval before publication.

## Validation

- All 1,472 Convex tests pass across 162 files.
- The 24 retry tests invoke mutation handlers with persisted synthetic rows,
  real scheduler/report/approval functions, and simulated transaction rollback.
  They cover v2 subject rebinding, authorization, tenant/project separation,
  stale revision/contract/candidate rejection, concurrency, idempotency,
  scheduling failure, repeated failures, producer lineage, human approval,
  publication claim, permit issuance, and lease recovery.
- All 766 orchestration tests pass, with 11 existing skips. The worker fixture
  uses real Git and protected ownership files to publish from a new continuation.
  It transfers the original workspace through the existing recovery mechanism,
  reuses the saved result, and makes no additional fake-model calls. Provider
  writes are stubbed. The ordinary same-attempt publication case also passes.
- Convex and UI TypeScript checks pass.
- All 19 factory qualification stages pass. The attached receipt records the
  initial test commit because qualification started with the recovered patch
  uncommitted. The audit digest adjustment and four additional producer-lineage
  tests were checked again afterward. CI validates the final committed tree.
- Browser verification used a disposable copy of the local database at port
  5204. A temporary synthetic completed verifier with NOT_VERIFIED made the
  recovery button visible in Work Orders. Clicking it invoked retryVerification;
  the intentionally incomplete source was rejected with “Only an exact terminal
  Verification Attempt can be retried.” The error appeared and the button became
  available again. The screenshot records the recovery control. The temporary
  mutation, launcher changes, server, and database copy were removed.

## Limits

The handler fixture is not a deployed Convex transaction test. Browser testing
proves reachability and the rejection state. Successful publication is tested
through the local worker fixture, not a real provider. No live model, executor
replay, actual pull-request publication by the factory, or production database
mutation was performed. A fresh paid end-to-end factory run still needs
an approved Mission/WorkOrder, target repository, and current model-spend limit.
The historical September 6 qualification budget was not reused.

The primary checkout and its saved edits were preserved. Work was sequenced into
verifiable units: regression, backend recovery, then UI reachability and evidence.
Final publication review found and fixed missing original result lookup, lost
current-attempt selection during governance refresh, and cross-attempt workspace
handoff. Approval restores mutating status so terminal success still requires
the consumed publication permit and PR binding.
