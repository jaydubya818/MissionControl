# WorkOrder inference reservation qualification

Scope: aggregate allocation inside the existing `createReservation` mutation.
Program status remains **IN_PROGRESS**; this is not full Phase 5 acceptance.

Base: `f749b06c8ef39c5bd22c9e0ad76334482ec35b33`.
Integrated implementation: `0915113105d4be6b844def360ca0856c7579e232`.
Composed qualification head: `f4c5c8d269cb050f64f80604548d191e06dd8a91`.
Runtime contract: **v46**, inherited from #183; no signature/schema change here.
PR: [Mission Control #184](https://github.com/jaydubya818/MissionControl/pull/184).
Merge and exact-main qualification remain pending until the program record says
otherwise.

Retained text logs normalize trailing whitespace; test outcomes are unchanged.

## Behavioral proof

- [Handler tests](reservation-handler-tests.log): 23 passed. Admission shares
  one parent ceiling across requests and Attempts, permits the exact remainder,
  preserves exact replays, retains unresolved allocations and rejects corrupt
  or substituted amounts. Authorization is mocked in these tests.
- Baseline negative control: the first 20 tests against the original `e9d2f52`
  source produced 13 failures and seven passes, including reproduced duplicate
  allocation. Three snapshot-integrity regressions were added after review.
- [Backend report](backend-concurrency/report.json): 22 scenarios passed on a
  disposable Convex backend. [Verification note](backend-concurrency/verification-note.json)
  records 165 reservation HTTP requests and 140 observed transaction retries.
  The production mutation source and reservation schema/indexes are exact;
  surrounding records/schema and authorization are fixtures. No real provider,
  billing, full-app authorization or real pilot qualification is inferred.
- [Composed qualification](automated-checks.json): full repository tests,
  security, deterministic evals, worker/verification failures, runtime guard,
  lint/typecheck, build and startup checks. Full tests passed **2,475 tests**,
  with one pre-existing skipped test. Its exact status is retained in the log
  summary; a skip is not counted as a pass.
- [Eval receipt](eval-receipt.json) retains its own verdict and economics
  warnings. This reservation change supplies no missing provider prices or
  accepted-work denominator.

The first local qualification attempt failed because the isolated Corepack
launcher had no explicit cache and attempted network discovery in offline mode.
[Initial results](initial-qualification-results.json) retain that failure. A
task-specific copy of the already cached pnpm 9.0.0 launcher passed the
[isolated worker check](offline-worker-setup.log). Main #183 independently added
the corresponding launcher correction; it was integrated before the successful
composed run. No assertion, candidate hook prohibition, offline restriction or
Production setting was weakened to obtain a pass.

## Independent reviews

Two read-only review agents examined the bounded source change independently of
implementation. Architecture, security, data integrity, simplicity and docs
were reviewed, with an additional agent-parity and prior-learning check.

- Data integrity found that the stored amount could diverge from its immutable
  snapshot. The mutation now rejects that mismatch; three regression cases and
  the real-backend corruption scenario passed.
- Docs review clarified that exact replay still requires current admission
  checks. Final reconciliation also corrected two contradictory historical
  baseline statements in the maturity ledger.
- Architecture/simplicity retained the existing index and transaction. The
  O(n) historical allocation scan remains a disclosed scale limitation.
- Agent parity found no new UI/tool asymmetry: the existing authenticated
  mutation remains the shared authority path.

No remaining blocking finding was reported for this slice. These code reviews
are not human acceptance of a WorkOrder. Full application authority checks are
covered separately by repository gates, not by the fixture authorization shim.

## Reproduction and operational limits

Run the repository's `test:inference:phase5`, `qualify:factory:v2` and
`test:e2e:critical` commands with the pinned dependency graph and current base.
The retained [backend harness](backend-concurrency/run.mjs) and
[loopback guard](backend-concurrency/loopback-only.mjs) reproduce the transaction
drill on the recorded machine, using the cached backend binary and an empty
disposable database. Pass the source checkout as the harness argument. Neither
file contains the generated local key. The exact invocation and cleanup are in
the [backend review](backend-concurrency/qualification-review.md).

The gateway remains default off. Existing allocations are held conservatively;
expiry, cancellation and call exhaustion do not prove zero external liability.
The change does not implement settlement, finite transport payload exposure,
all-component WorkOrder spend conservation, live route qualification or real
accepted-work economics. Keep those gaps open in todo 063 and the cumulative
[program record](../../../software-factory/capability-convergence-program.md).

The [deployment baseline](deployment-guard-baseline.json) contains only sanitized
platform metadata. All four canonical Production deployment identities match
the prior integration exit. Main deployment guards remain in source. No
Production release or live provider call is authorized by this proof.
