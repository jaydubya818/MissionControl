# MissionControl checkpoint 1B

Foundation remains **PARTIAL**. Production integration is **NOT_RUN**. PASS below applies only to the implemented deterministic fixture scope.

Accepted base: `356b92e58d9acd8f75fd80b3f12b1cac581733ce`. Engineering branch: `codex/enterprise-factory-orchestration`. Published SHA, fresh-clone evidence and hosted CI readback are recorded in the local workspace report after commit.

| Area | Status | Evidence and limitation |
| --- | --- | --- |
| Factory Registry | PASS | Durable extension of existing definitions; exact versions, capabilities, fixture qualification, health, capacity, policy, revocation and compatibility pins. Registration grants no execution. |
| MyFactory Adapter | PASS | Loopback-only fixture transport, exact binding, signed scoped requests/responses, persistent one-time claim, status, cancellation and Result retrieval. Not the installed external-alpha HTTP API. |
| Delegation Authority | PARTIAL | Authenticated workspace scope and exact fixture identity. Authority generation and canonical effect admission remain unqualified. |
| Accounting Compatibility | PARTIAL | Real transactional Mission fixture reservations, native/delegated contention, duplicate settlement and retained UNKNOWN pass. MyEve shared owner allowance and production MyFactory spend ledger are not composed. |
| Result/Proof Compatibility | PASS | Exact pinned MyFactory signature/artifact verifier plus MissionControl identity checks. Producer, candidate, verifier, Factory Result, enterprise gate, acceptance and publication remain separate. Synthetic signed evidence does not prove a real independent execution. |
| Cross-Tenant Isolation | PASS | Anonymous and foreign owner registry/trial access, cancellation and duplicate admission denied. Internal observation writes cannot be invoked publicly. |
| Concurrency | PASS | Eight simultaneous identical admissions converge to one reservation; final-budget contention has one winner; concurrent adapter claims produce one send. |
| UNKNOWN Recovery | PASS | Lost acknowledgment survives actual database restart. No redispatch. Expiry and cancellation retain sent exposure until confirmed reconciliation. |

## Verification

- Shared suite: 213 tests pass, including preserved 116 binding cases and 13 new accounting cases.
- Adapter authentication suite: 26 tests pass.
- Real database/HTTP qualification: 15 scenarios pass on the actual schema, indexes and handlers in a disposable Convex backend. This includes the independent review regressions for public settlement denial and terminal outcome preservation.
- Native regression and pure provider accounting suites: 87 tests pass across seven files.
- Repository workspace typecheck and Convex typecheck pass.
- Authorization scan passes with no newly unguarded public function. Skill lint has zero errors and 34 existing warnings.
- Independent read-only code review found two blockers, both corrected and rechecked. See `CHECKPOINT_1B_REVIEW.md`.
- Public disclosure review confirmed all referenced source repositories public. Published fixtures contain synthetic identities, ephemeral runtime-generated keys, no credentials, no private source, and no raw request attachments.

The broader existing `providerLiabilityHandlers.test.ts` suite has 42 failures and 47 passes. The same 42 failures reproduce on the exact accepted 1A commit. Its qualified-price fixture expires at `2026-10-07T00:00:00Z`, before this run. Tests fail with `PRICE_NOT_BOUNDED` before their expected handler assertions. This checkpoint does not change those tests or weaken price validity. The complete regression set is not claimed green.

The committed CI workflow runs shared and adapter tests, typechecks, seven native/provider suites, real database qualification, authorization scan and skill lint. It pins the Linux Convex archive by release and SHA-256 and fetches the exact MyFactory candidate. No secrets or deployment step are used. Fixture code is loaded only into a newly started loopback backend with an ephemeral local admin key and no scheduled jobs.

## Reproduce

From a clean checkout with frozen dependencies installed, run the normal shared/adapter suites and typechecks. For real database checks, supply an existing local Convex backend binary and a bare Git store containing the exact MyFactory candidate:

```sh
MC_COMPATIBILITY_CONVEX_BINARY=/absolute/path/convex-local-backend \
MC_MYFACTORY_COMPATIBILITY_GIT=/absolute/path/MyFactory.git \
MC_COMPATIBILITY_EVIDENCE=/absolute/path/evidence.json \
node --import tsx scripts/enterprise-compatibility/qualify.mjs
```

The database is disposable and its schema includes actual MissionControl validators. Synthetic records are seeded directly; this is not an approved-Mission-to-execution golden path. The fixture HTTP server never starts a model or provider. The signed candidate and verifier evidence test cryptographic compatibility only.

## Dependencies and remaining gates

See `CHECKPOINT_1B_COMPATIBILITY.md` for all exact SHAs, PR states, source paths and three-tier preservation. All four dependency PRs remain open. No dependency repository was modified.

Canonical integration still requires the adopted receiving authority protocol, exact Work/Run admission and current authority generation, production parent/sub-allowance accounting, execution/verifier custody, operational UI, and composed security qualification. Registration evidence is fixture-scoped and does not qualify production capacity or health. Existing E1–E10 and T1–T10 statuses are not promoted by this checkpoint.

Next checkpoint: recover dependency contracts after they reach main, then implement canonical authenticated admission and a governed execution path under those exact contracts. Further fixture refinement is possible without dependency adoption, but no production execution is authorized here.

Paid operations: **0**. External-alpha changes: **0**. Executable production grants: **0**. Production deployments: **0**. Generated application publication/PR/merge/deployment: **0**. Engineering branch publication is tracked separately.
