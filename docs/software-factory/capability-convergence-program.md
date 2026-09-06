# FDLC capability convergence program

Status: **IN_PROGRESS**. Authorization: Product Owner's master execution and
final acceptance instructions, received 2026-09-05. This is the cumulative
execution record for the existing roadmap, not a replacement roadmap.

## Reconciled source baseline

| Repository | Current main at program start |
| --- | --- |
| Mission Control | `e9d2f52720e634b79d2c614a7fb9812a6b986fe9` |
| FDLC | `b1a082fa4a4700d8a59e7c66886a9f7a52cf84c1` |
| Guide | `4149884ead436bb11962ba80b87d7416af71989a` |

The authorization's earlier hashes are historical. Current Mission Control
contains the offline inference slice (#178/#179), the Fab adapter (#180), and
shared builder intent (#181/#182). Runtime contract was **v45** at program start. Todo 062 is
complete for its bounded, default-off, synthetic Preview scope; it is not
real-team adoption. Todo 063 remains in progress. The existing Phase 5
completion record closes only its bounded offline slice, not this program.

Before the first program PR, main advanced to
`f749b06c8ef39c5bd22c9e0ad76334482ec35b33` (#183). Its WorkOrder readiness
projection, offline package-manager correction and **runtime v46** are retained.
The implementation branch was rebased before final qualification. Its newly
landed [capability coverage plan](../plans/2026-09-04-feat-fdlc-capability-convergence-plan.md)
adds explicit eval/fan-out proof and conditional scale requirements. Its phase
numbers differ from the production convergence plan: inference is Phase 4 there
and Phase 5 in the execution authorization. Use the capability and todo identity
to resolve this numbering difference. The master authorization supersedes older
phase-by-phase stopping instructions; it does not combine pilot trust gates. The later Phase 1 owner record names FDLC / Mission Control and Jarrett West; live identity, route, budget and execution qualification remain open.

## Dependency graph derived from current records

| Existing work | Required predecessors | Current evidence and next work |
| --- | --- | --- |
| Todo 063: inference and outcome economics | Bounded first slice already allowed before 062; broader intent dependency now satisfied | Offline boundary exists. Audit and close aggregate liability, dispatch bounds, route identity, settlement and distinct outcome measurement before claiming the master acceptance contract. |
| Todo 059: ten real accepted WorkOrders | Approved exact repository and named team, champion, FDE and incident commander; preflight drill; enrolled execution authority | Admission and exit assessors exist. Real cohort is not proven. Preserve bug, feature, refactor and security/policy diversity and all human decisions. |
| Todo 060: canonical incident lifecycle | Todo 059 pilot evidence under the existing convergence plan | Existing containment controls support pilot preflight. Full incident aggregate remains dependency-gated; do not silently remove this dependency. |
| Todo 064: feedback and governed learning | Todo 063 outcome facts; real observed signals for real-loop acceptance | Existing advisory learning machinery is reusable. Implement only the missing canonical projections and bounded processing; real promotion and restoration need attributable human decisions. |
| Comparable evals and bounded fan-out/join | Exact configuration, child reservation conservation; real fixtures for real-work claims | Reuse Eval Control Plane and workflow graph. Qualify failure, timeout, cancellation, conflicts, duplicate events and recovery against a single-worker baseline. Synthetic proof cannot stand in for measured real-work benefit. |
| Later scale requirements | A complete operating loop and a currently approved required item | The capability coverage plan explicitly defers multi-repository coordination, fair scheduling, enterprise controls, semantic governance, transitive locks and experimental export to separate later WorkOrders. No unconditional requirement to implement those before the initial line is established. |

Canonical sources: [convergence plan](../plans/2026-08-25-feat-software-factory-production-convergence-plan.md),
[inference plan](../plans/2026-09-05-feat-inference-gateway-outcome-economics-qualification-plan.md),
[maturity ledger](../product/software-factory-capability-maturity.md), and todos
[059](../../todos/059-in-progress-p1-real-product-repository-pilot.md),
[060](../../todos/060-ready-p1-factory-incident-command.md),
[062](../../todos/062-complete-p1-shared-builder-intent.md),
[063](../../todos/063-in-progress-p1-outcome-economics-routing.md), and
[064](../../todos/064-ready-p2-production-feedback-learning.md).

## Authority and evidence boundaries

Routine implementation, isolated branches, commits, PRs, qualified merges,
post-merge qualification and evidence-based ecosystem synchronization are
authorized. Existing main deployment guards remain active. Production changes
and paid/live provider calls require their exact existing authorization or a
concrete new authorization packet after all independent work is complete.

The [selected inference service](./phase5-inference-service-selection.md)
explicitly authorizes offline implementation only. No gateway provider account,
credential enrollment, live-call cap or live spend has been approved there.
The current exact Context7 read stays Experimental; inference work does not
broaden MCP. Human acceptance, release, Factory activation and improvement
promotion remain distinct persisted decisions.

All new proof must label its actual scope: deterministic fixture, integrated
local backend, real provider, real accepted WorkOrder, Preview or Production.
Calculated monetary estimates are not ACTUAL billing. Missing costs, windows,
denominators and coverage remain explicit. Existing economics WARN remains.

## Completed slice: conserve WorkOrder inference reservations

- Objective: prevent separate logical requests or retry Attempts from each
  reserving the full approved parent WorkOrder budget.
- Baseline, branch baseline and merge-base:
  `f749b06c8ef39c5bd22c9e0ad76334482ec35b33` after integration; original
  implementation baseline `e9d2f52720e634b79d2c614a7fb9812a6b986fe9`.
- Implementation branch: `codex/capability-convergence-phase5`.
- Reuse: existing `inferenceReservations.by_work_order` index and canonical
  `createReservation` mutation; no new budget store or public API.
- Invariant: prior immutable allocations plus the proposed allocation cannot
  exceed the current approved WorkOrder ceiling. Expiry, cancellation, an
  exhausted call count or an unknown outcome does not release liability.
- Idempotency: while current admission checks pass, an exact replay returns its
  existing reservation without allocating twice; different immutable bytes
  remain rejected. Replay does not bypass current lease, profile or price-book
  admission checks.
- Qualification: [retained proof](../testing/evidence/capability-convergence-reservation-final/README.md)
  at `f4c5c8d269cb050f64f80604548d191e06dd8a91`; 23 handler tests, 22
  disposable-backend concurrency scenarios, and full composed qualification
  passed. Independent architecture/security/data-integrity/simplicity/docs
  findings were addressed. Initial local launcher failure remains recorded.
- PR: [#184](https://github.com/jaydubya818/MissionControl/pull/184).
  All 12 reported CI/deployment check contexts passed on
  `c58474afbbdf5be4ca01d9735cf8ef9934854e8d`. Merged at 2026-09-06T05:35:19Z
  as `4434cc56448075f4804787325a9586c6290b2215`.
- [Clean-main proof](../testing/evidence/capability-convergence-reservation-postmerge/automated-checks.json)
  passed all 19 composed gates, plus Phase 5 and 15 critical browser checks.
  The clean checkout's reservation source hash exactly matches the real local
  concurrency proof. The [post-merge platform check](../testing/evidence/capability-convergence-reservation-postmerge/postmerge-guard.json)
  confirms all four Production deployments, aliases, settings and protections
  unchanged, with no new main/Production deployment. Qualification completed at
  2026-09-06T05:39:35Z. This closes the bounded allocation slice only.
- Runtime contract: v46 inherited from #183; this slice changes no public signature.
- Maturity: no promotion. This closes one parent allocation gap, not provider
  dispatch bounds, authoritative billing settlement or real-work economics.

## Active slice: preserve canonical inference identities

- Original baseline: `4434cc56448075f4804787325a9586c6290b2215`.
  Integrated baseline and merge-base: `9e6dfd9b0110c0316b1fc085539b41e2616ebac7`
  after #185. Retain its composed provider admission, transaction helpers,
  provider-request ownership checks and disabled optional token dimensions.
- Branch: `codex/inference-ledger-identities`.
- Objective: repair the mismatch between database IDs and frozen logical IDs in
  the complete persisted reservation → intent → claim → receipt → reconciliation
  → outcome projection chain. Preserve canonical bytes and their digests while
  retaining database IDs for API arguments, foreign keys and navigation.
- Design: [inference ledger identity contract](./inference-ledger-identity-contract.md).
  Reuse the existing tables; add optional immutable snapshots for legacy-schema
  compatibility, require exact snapshots for new canonical processing, and fail
  closed when an old row has lost unrecoverable identity. Do not rewrite history.
- Runtime contract: v48 for the optional snapshot schema fields (v47 inherited
  from #185).
- Focused handler proof: 38 tests pass, including the full synthetic persisted
  chain, late receipts, replay drift, corrupted snapshots and legacy cohorts.
  Independent architecture/security/data-integrity/simplicity/docs review found
  replay-source and cohort-isolation defects; both are fixed with regressions.
  All 19 composed gates passed on the original branch head `d367b34b2504`;
  that proof is historical after the main advance. Integrated qualification,
  backend proof, PR, merge and final-main are pending.
- Maturity: no promotion. After identity repair, claims still need finite
  request/output exposure before transport; receipt persistence still needs to
  retain observed overrun evidence. Live-provider qualification remains gated.

## Remaining acceptance evidence

The complete Factory loop and ten real accepted WorkOrders are **NOT_PROVEN**.
Live inference qualification and its two-route comparison are **NOT_RUN**.
Real incident restoration, observed outcomes, evaluated improvement, human
promotion, controlled activation and observed rollback remain required at the
scope specified by the master acceptance criteria. Program completion must not
be inferred from the bounded offline records or from checklist implementation.
