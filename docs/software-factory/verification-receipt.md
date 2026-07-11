# Verification Receipt — WorkOrder Slice

## WorkOrder

Create and inspect a first-class WorkOrder with acceptance criteria and linked ExecutionRuns.

## Acceptance criteria and evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| A first-class WorkOrder schema exists | PASS | `convex/schema.ts`, `convex/workOrders.ts` |
| WorkOrders can be queried and created | PASS | `convex/workOrders.ts`, `npx convex run workOrders:seedDemo "{}"` |
| Execution runs can link directly to a WorkOrder | PASS | `convex/schema.ts`, `convex/workflowRuns.ts` |
| A Work Queue UI exists in the main product shell | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, screenshot `tmp/work-orders-queue.png` |
| WorkOrder detail shows outcome, acceptance criteria, and linked runs | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, screenshot `tmp/work-orders-detail-selected.png` |
| Seed/dev fixtures exist for the slice | PASS | `convex/workOrders.ts#seedDemo` |
| Critical contract/view-model logic is test-covered | PASS | `convex/__tests__/workOrders.test.ts`, `apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts` |
| UI builds successfully | PASS | `pnpm --filter mission-control-ui build` |

## Checks executed

```bash
npx convex codegen --typecheck disable
npx convex run workOrders:seedDemo "{}"
pnpm exec vitest run convex/__tests__/workOrders.test.ts apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts
pnpm --filter mission-control-ui typecheck
pnpm --filter mission-control-ui build
pnpm exec tsc --noEmit -p convex/tsconfig.json
```

## Result summary

- Introduced a real `workOrders` domain object
- Linked `workflowRuns` to WorkOrders
- Added a real `Control > Work Orders` slice
- Verified seed data renders in the UI shell

## Second slice — Governed WorkOrder Dispatch and Lifecycle Synchronization

### Slice work order

- Primary slice WorkOrder: `wd77cygdcke24x9b4736825en98abm1w`
- Follow-up defect WorkOrder: `wd7ddpc7ewff4jq13mkr333cd18aacsb`

| Criterion | Result | Evidence |
| --- | --- | --- |
| One authoritative dispatch command exists | PASS | `convex/workOrders.ts#dispatch` |
| Dispatch is idempotent and auditable | PASS | `workOrderEvents` in `convex/schema.ts`, idempotency handling in `convex/workOrders.ts` |
| Duplicate active runs are prevented | PASS | `convex/lib/workOrderDispatch.ts`, `convex/__tests__/workOrderDispatch.test.ts`, direct failure evidence from `workOrders:dispatch` |
| WorkOrder lifecycle synchronizes from run state | PASS | `convex/workOrders.ts#syncExecutionOutcome`, `convex/workflowRuns.ts` |
| UI, CLI, and orchestration share the dispatch boundary | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, `scripts/mc`, `apps/orchestration-server/src/index.ts` |
| Compatibility with legacy task workflows preserved | PASS | `legacyTaskId` linkage and `convex/lib/workOrderCompat.ts` |

### Additional checks executed

```bash
pnpm workflows:seed
npx convex run workflows:upsert '{"workflowId":"feature-dev","name":"Feature Development","description":"Seeded for dispatch verification","agents":[{"id":"planner","persona":"Strategist"}],"steps":[{"id":"plan","agent":"planner","input":"Plan {{task}}","expects":"STATUS: done","retryLimit":2,"timeoutMinutes":10}],"active":true}'
./scripts/mc dispatch wd77cygdcke24x9b4736825en98abm1w feature-dev
npx convex run workOrders:dispatch '{"workOrderId":"wd77cygdcke24x9b4736825en98abm1w","workflowId":"feature-dev","actorType":"HUMAN","actorId":"test","idempotencyKey":"duplicate-dispatch-test","runtime":"test"}'
npx convex run workflowRuns:updateStatus '{"runId":"qzdq3dua","status":"RUNNING"}'
npx convex run workflowRuns:updateStatus '{"runId":"qzdq3dua","status":"COMPLETED"}'
npx convex run workOrders:get '{"workOrderId":"wd77cygdcke24x9b4736825en98abm1w"}'
```

### Pre-existing verification issue excluded from this slice

Command:

```bash
pnpm workflows:seed
```

Observed failure on the unmodified repo script:

```text
🔄 Seeding workflows into Convex...

/Users/jaywest/MissionControl/scripts/seed-workflows.ts:13
import { loadAllWorkflows } from "../packages/workflow-engine/src/loader";
         ^
SyntaxError: The requested module '../packages/workflow-engine/src/loader' does not provide an export named 'loadAllWorkflows'
```

Root-cause hypothesis:

- pre-existing `tsx`/ESM module-loading mismatch when `scripts/seed-workflows.ts` imports the workspace source file directly
- likely export-shape/resolution disagreement between the runtime loader and `packages/workflow-engine/src/loader`
- not required to prove the governed dispatch boundary, so excluded from this slice

Workaround used for dispatch verification:

- directly upserted the required workflow with `npx convex run workflows:upsert ...`
- then dispatched the WorkOrder through the governed Convex mutation via `./scripts/mc dispatch ...`

Follow-up tracking:

- Separate WorkOrder created: `wd7ddpc7ewff4jq13mkr333cd18aacsb` — **Fix workflow seeding verification path (scripts/seed-workflows.ts)**

### Direct runtime evidence

- Created next WorkOrder: `wd77cygdcke24x9b4736825en98abm1w`
- Direct workflow upsert returned workflow doc id: `w97bdn0yn3e82ma1gma1nas40s8abv76`
- CLI dispatch succeeded and returned:

```json
{
  "created": true,
  "run": {
    "_id": "w576v1f7d13pdtd67yyb9fwcx98ab1bd",
    "runId": "qzdq3dua",
    "status": "PENDING",
    "workOrderId": "wd77cygdcke24x9b4736825en98abm1w",
    "workflowId": "feature-dev",
    "runtime": "mc CLI"
  }
}
```

- Duplicate dispatch was rejected with:

```text
Error: WorkOrder is not dispatchable (active-run-exists)
```

- Run status synchronization checks returned success for `RUNNING` and `COMPLETED`
- Final WorkOrder query showed `state: "DONE"` and one linked execution run with `status: "COMPLETED"`

### Lifecycle events captured on the WorkOrder

| Event | From | To | Notes |
| --- | --- | --- | --- |
| `WORK_ORDER_CREATED` | — | — | WorkOrder created with workflow `feature-dev` |
| `DISPATCH_REQUESTED` | `READY` | `DISPATCHED` | CLI requested governed dispatch |
| `DISPATCHED` | `READY` | `DISPATCHED` | Execution run `qzdq3dua` created |
| `STATE_SYNCED` | `DISPATCHED` | `IN_PROGRESS` | After run status moved to `RUNNING` |
| `RUN_COMPLETED` | `IN_PROGRESS` | `DONE` | After run status moved to `COMPLETED` |

### Final validation checks

```bash
pnpm exec vitest run convex/__tests__/workOrders.test.ts convex/__tests__/workOrderDispatch.test.ts apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts
pnpm --filter mission-control-ui typecheck
pnpm --filter mission-control-ui build
pnpm exec tsc --noEmit -p convex/tsconfig.json
```

## Known limitations

1. WorkOrder detail currently embeds run summaries rather than a dedicated Run Inspector view.
2. Existing portfolio/fleet control-plane surfaces remain placeholder-backed.
3. `scripts/seed-workflows.ts` remains a pre-existing verification issue and was intentionally excluded from this slice; direct `workflows:upsert` was used as the workaround.

## Third slice — ApprovalDecision and VerificationReceipt traceability

| Criterion | Result | Evidence |
| --- | --- | --- |
| Approval decisions are first-class and auditable | PASS | `convex/schema.ts`, `convex/workOrders.ts`, `apps/mission-control-ui/src/controlPlane/WorkOrderApprovalsView.tsx` |
| Verification receipts are first-class and criterion-linked | PASS | `convex/schema.ts`, `convex/workOrders.ts`, `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx` |
| Run completion no longer auto-accepts WorkOrders | PASS | `convex/lib/workOrderDispatch.ts`, `convex/workOrders.ts#accept` |
| Missing, failed, or stale receipts block acceptance | PASS | `convex/lib/workOrderGovernance.ts`, `convex/__tests__/workOrderGovernance.test.ts`, local end-to-end verification |
| Waived criteria require auditable approval | PASS | `convex/workOrders.ts#recordVerificationReceipt`, local end-to-end verification |
| Duplicate receipt creation is idempotent | PASS | `convex/workOrders.ts#recordVerificationReceipt`, local end-to-end verification |
| Newer runs can make prior evidence stale | PASS | `convex/workOrders.ts#dispatch`, `convex/workOrders.ts#markReceiptsStaleForWorkOrder`, local end-to-end verification |
| Approval Center and traceability matrix render governance state | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrderApprovalsView.tsx`, `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx` |

### Additional checks executed

```bash
pnpm exec convex codegen --typecheck disable
pnpm exec vitest run convex/__tests__/workOrderDispatch.test.ts convex/__tests__/workOrderGovernance.test.ts apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts
pnpm run ci:typecheck
pnpm run ci:test
pnpm run ci:test:e2e
pnpm exec playwright test -c playwright.config.ts --workers=1 tests/e2e/arm-ui.e2e.spec.ts tests/e2e/dashboard-smoke.e2e.spec.ts
pnpm --filter mission-control-ui build
pnpm exec tsc --noEmit -p convex/tsconfig.json
pnpm --filter @mission-control/orchestration-server build
```

### Local governed acceptance evidence

- approval gate error: `WorkOrder is not dispatchable (approval-required)`
- acceptance gate error before receipts: `WorkOrder cannot be accepted (Missing receipts: ac-1)`
- verified acceptance WorkOrder: `wd7abx34yqyq1nh5hcfn6n49vx8aaeeb` → final state `DONE`
- waiver acceptance WorkOrder: `wd78ecnsw61p05f5yhjqx5ab0n8aa4qg` → final verification status `WAIVED`, final state `DONE`
- stale-evidence WorkOrder: `wd76w0305pcrsr4jdchhq6vg0s8aawnc` → criterion status `STALE`, verification status `STALE`
- idempotent receipt replay confirmed: first create `true`, second create `false`
- lifecycle events observed include:
  - `APPROVAL_REQUESTED`
  - `APPROVAL_APPROVED`
  - `VERIFICATION_FAILED`
  - `VERIFICATION_STALE`
  - `VERIFICATION_RECORDED`
  - `WORK_ORDER_ACCEPTED`
