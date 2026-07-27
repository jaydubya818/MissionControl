# Governing WorkOrders

WorkOrders are the primary unit of value in the software factory — not tasks shaped like chat transcripts.

## Create a WorkOrder

Each WorkOrder declares:

- **Desired outcome** — one sentence the operator can verify
- **Acceptance criteria** — checklist, test, or command verification methods
- **Risk level** — LOW → CRITICAL drives approval requirements
- **Source-of-truth refs** — repo, doc, PRD, issue links

Use **Delivery → Work Orders** or `createSoftwareFactoryProject` for a seeded factory project.

## Lifecycle states

| State | Meaning |
| --- | --- |
| READY | Scoped and dispatchable |
| IN_PROGRESS | Execution run active |
| BLOCKED | Preflight or dependency failure |
| AWAITING_APPROVAL | Human gate open |
| AWAITING_VERIFICATION | Run complete, criteria pending |

## Verification receipts

Criterion-level proof lives in `verificationReceipts`. A WorkOrder is not DONE until every criterion is PASS or WAIVED (with audit note).

## Approvals

RED/YELLOW policy hits create `approvals` rows. Dual-control approvals require two decisions before dispatch proceeds.

## UI drill-down

Command Center → blocked WorkOrders → Trace Inspector for step timeline and artifacts.

See [Factory overview](https://github.com/jaydubya818/MissionControl/blob/main/docs/software-factory/information-architecture.md) for the full entity model.
