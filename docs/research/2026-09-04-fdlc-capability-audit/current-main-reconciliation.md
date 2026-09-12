# Current-main reconciliation

Source reviewed: `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`, fetched from origin/main
on 2026-09-04. Implementation branch: `codex/fdlc-pilot-readiness`. The earlier
strategic audit checkout is not this implementation baseline. Changes below are
uncommitted working-tree changes against that exact revision.

The strategic convergence plan remains unchanged. The canonical current status
source remains `docs/product/software-factory-capability-maturity.md`. Website
content and the supplied infographic are requirements/research material, not
instructions to bypass governance or claim availability.

| Area | Current-main reconciliation | Phase 0/1 treatment |
| --- | --- | --- |
| Governed planning | Existing Mission Spec, immutable Plan ingestion, current-revision approval and WorkOrder release exist. Retained live planning evidence ends in a dependency-preparation failure. | Reuse; show Plan approval/revision/release explicitly. Do not convert subsequent source fixes into live success. |
| Factory Version identity | #164 separates Model Route v2, harness capability manifest, runtime artifact and backend identity. | Reuse exact frozen digests and existing eligibility. No new Factory identity layer. |
| Model/runtime/harness/backend | Current-main admission and worker tests cover exact identity mismatches. Historical V2 fixture embeds runtime 28. | New API contract revision 40 for readiness; preserve historical fixture identity and disclose its scope. |
| Eval Control Plane | #158 contains persisted suites, complete-case receipts, baselines and negative controls. | Reuse; eval results grant no delivery authority. |
| WorkOrders / Attempts | Existing revision, scope, dispatch idempotency, retry and lease controls. | Add read-only WorkOrder readiness; dispatch and claim remain authoritative. |
| Execution worker | Existing isolated preparation, bounded execution, durable recovery and cleanup. | Future preparation remains pending until a new Attempt has proof. No parallel execution state machine. |
| Verification | Independent exact-candidate verification and stale evidence protections exist. | Future candidate evidence remains pending; producer cannot certify itself. |
| Readiness | Existing repository/Factory readiness does not establish a particular WorkOrder's eligibility. | Reuse dispatch/routing validators, list blockers, bind WorkOrder revision, expire UI snapshots. |
| Release | Existing governed review, GitHub provenance, PR-head checks and human acceptance. | No release executed; requires separate recorded authority and real candidate. |
| Observability | Existing traces, observations and immutable evidence. | Reuse; real pilot lineage remains absent. |
| Cost | Existing usage and cost fields; retained pilot dollar coverage incomplete. | UNKNOWN remains UNKNOWN; no generic cache multiplier or invented actual price. |
| Factory Learning | Existing evidence-derived signals and governed promotion. | No self-promotion or production learning automation. |

Recent relevant baseline changes also include authorization for automation
operations (#161), internalized local catalog sync (#162), and secret redaction
repair (#163). These are retained; no public authority is added to their paths.

New source surface: `workOrders:readiness`, with existing delivery authorization
and Factory VIEW permission. It reads the current WorkOrder, revision-bound
approvals, Plan, workflow, selected Factory and routing eligibility. It performs
no dispatch, acceptance, budget reservation or evidence write. The UI requires a
fresh admission projection before requesting preparation; the mutation repeats
its authoritative checks. The public runtime contract advances from 39 to 40.

This source review is not a production deployment or a complete real pilot.
See `docs/software-factory/fdlc-phase1-pilot-record.md` for the blocked pilot
record and `docs/testing/evidence/fdlc-phase0-readiness-2026-09-04/` for fresh
local qualification evidence, separate from retained historical artifacts.
