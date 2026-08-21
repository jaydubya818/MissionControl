# Verification Receipt — WorkOrder Slice

## WorkOrder

Create and inspect a first-class WorkOrder with acceptance criteria and linked ExecutionRuns.

## Acceptance criteria and evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| A first-class WorkOrder schema exists | PASS | `convex/schema.ts`, `convex/workOrders.ts` |
| WorkOrders can be queried and created | PASS | `convex/workOrders.ts`, `npx convex run workOrders:seedDemo '{"projectId": "<your workspace id>"}'` |
| Execution runs can link directly to a WorkOrder | PASS | `convex/schema.ts`, `convex/workflowRuns.ts` |
| A Work Queue UI exists in the main product shell | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, screenshot `tmp/work-orders-queue.png` |
| WorkOrder detail shows outcome, acceptance criteria, and linked runs | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, screenshot `tmp/work-orders-detail-selected.png` |
| Seed/dev fixtures exist for the slice | PASS | `convex/workOrders.ts#seedDemo` |
| Critical contract/view-model logic is test-covered | PASS | `convex/__tests__/workOrders.test.ts`, `apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts` |
| UI builds successfully | PASS | `pnpm --filter mission-control-ui build` |

## Checks executed

```bash
npx convex codegen --typecheck disable
npx convex run workOrders:seedDemo '{"projectId": "<your workspace id>"}'
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

1. Existing portfolio/fleet control-plane surfaces remain placeholder-backed.
2. `scripts/seed-workflows.ts` remains a pre-existing verification issue and was intentionally excluded from this slice; direct `workflows:upsert` was used as the workaround.

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

## Fourth slice — Execution Run Inspector and Evidence Drill-Down

| Criterion | Result | Evidence |
| --- | --- | --- |
| Structured run events are first-class and ordered | PASS | `convex/schema.ts`, `convex/workflowRuns.ts`, `convex/lib/runInspector.ts` |
| Structured run artifacts are first-class and receipt-linkable | PASS | `convex/schema.ts`, `convex/workflowRuns.ts`, `convex/workOrders.ts` |
| One authoritative run inspector query exists | PASS | `convex/workflowRuns.ts#getInspector` |
| WorkOrder run links open a dedicated inspector | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, `apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx` |
| Verification receipt links drill into focused evidence lineage | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, `apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx` |
| CLI exposes run summary, events, and artifacts inspection | PASS | `scripts/mc` |
| Orchestration server exposes authenticated run event/artifact APIs | PASS | `apps/orchestration-server/src/index.ts`, `apps/orchestration-server/src/convexCalls.ts` |
| Run inspector helper/view-model logic is test-covered | PASS | `convex/__tests__/runInspector.test.ts`, `apps/mission-control-ui/src/controlPlane/runInspectorModel.test.ts` |

### Additional checks executed

```bash
pnpm install --frozen-lockfile
pnpm exec convex codegen --typecheck disable
pnpm exec vitest run convex/__tests__/workOrderDispatch.test.ts convex/__tests__/workOrderGovernance.test.ts convex/__tests__/runInspector.test.ts apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts apps/mission-control-ui/src/controlPlane/runInspectorModel.test.ts
pnpm --filter mission-control-ui typecheck
pnpm --filter mission-control-ui build
pnpm run ci:prepare
pnpm --filter @mission-control/orchestration-server typecheck
pnpm --filter @mission-control/orchestration-server build
pnpm exec tsc --noEmit -p convex/tsconfig.json
```

### Result summary

- Added `runEvents` and `runArtifacts` as additive execution-trace tables
- Added receipt-linked evidence lineage on `verificationReceipts`
- Added a dedicated `ExecutionRunInspector` reachable from linked runs and verification receipts
- Added authenticated orchestration endpoints and CLI inspection commands for structured run traces

## Fifth slice — WorkOrder revision, reopen, supersede, and governance expiry lifecycle

| Criterion | Result | Evidence |
| --- | --- | --- |
| Immutable revision history exists and is approval-driven | PASS | `convex/schema.ts`, `convex/lib/workOrderRevision.ts`, `convex/workOrders.ts`, `convex/__tests__/workOrderRevision.test.ts` |
| Explicit reopen decisions preserve lineage and stale prior evidence | PASS | `convex/workOrders.ts#reopenWorkOrder`, `convex/__tests__/workOrderGovernance.test.ts`, live reopen verification below |
| Supersession links original and replacement WorkOrders | PASS | `convex/workOrders.ts#supersedeWorkOrder`, live supersession verification below |
| Approval and receipt validity windows can expire authoritatively | PASS | `convex/lib/workOrderGovernance.ts`, `convex/workOrders.ts#expireGovernanceRecords`, live expiry verification below |
| UI, CLI, and orchestration expose the same lifecycle commands | PASS | `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`, `scripts/mc`, `apps/orchestration-server/src/index.ts` |
| Lifecycle model and governance logic are test-covered | PASS | `apps/mission-control-ui/src/controlPlane/workOrderLifecycleModel.test.ts`, `convex/__tests__/workOrderDispatch.test.ts`, `convex/__tests__/workOrderGovernance.test.ts`, `convex/__tests__/workOrderRevision.test.ts` |

### Additional checks executed

```bash
pnpm exec convex codegen --typecheck disable
pnpm exec vitest run convex/__tests__/workOrderDispatch.test.ts convex/__tests__/workOrderGovernance.test.ts convex/__tests__/workOrderRevision.test.ts apps/mission-control-ui/src/controlPlane/workOrderLifecycleModel.test.ts apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts
pnpm exec tsc --noEmit -p convex/tsconfig.json
pnpm --filter mission-control-ui typecheck
pnpm --filter mission-control-ui build
pnpm run ci:prepare
pnpm --filter @mission-control/orchestration-server typecheck
pnpm --filter @mission-control/orchestration-server build
pnpm run ci:typecheck
pnpm run ci:test
pnpm run ci:test:e2e
```

### Local end-to-end lifecycle evidence

- reopen and reaccept verification WorkOrder: `wd70m7g2e6r485xmdh0fg26dkd8ab517`
  - reopen decision: `y17ay7etwx3n3yqp75q7xh15f98abm3a`
  - original receipt: `x5775838hwkxdmdtf6690ve0cn8abs2e` → `STALE`
  - replacement receipt: `x576r0c7cqateqbg4ntv5rhryx8aaawr` → `PASSED`
  - final state: `DONE`, verification: `PASS`
  - observed lifecycle events: `WORK_ORDER_REOPENED`, `VERIFICATION_STALE`, `WORK_ORDER_ACCEPTED`
- selective revision invalidation verification WorkOrder: `wd77sjtzm8xe58am3epwy1yers8abca0`
  - current revision: `2`
  - unaffected criterion `ac-1` stayed `PASS`
  - changed criterion `ac-2` became `STALE`
  - latest dispatch linked run revision `2`
- active-run revision block verification WorkOrder: `wd71qrmxb0sr9c09dw6bf96xvh8aa5zr`
  - active run revision stayed `1` while WorkOrder advanced to revision `2`
  - WorkOrder remained `BLOCKED` until replacement execution
  - observed lifecycle events included `REVISION_REQUESTED`, `REVISION_APPROVED`, and `REVISION_APPLIED`
- approval-expiry verification WorkOrder: `wd70r7jdjx0bhm7ww8tta6n0yd8aarfc`
  - approval decision: `x176q7277dkasm96nn9rp3ychs8abc9r`
  - final approval status: `EXPIRED`
  - blocking reasons included `Expired approvals: SECURITY`
  - observed lifecycle events: `APPROVAL_REQUESTED`, `APPROVAL_APPROVED`, `APPROVAL_EXPIRED`, `GOVERNANCE_RECORDS_EXPIRED`
- receipt-expiry verification WorkOrder: `wd7c57m8cae9ywk0g48em9efk18ab16z`
  - receipt: `x57fpzbv0rcdayxc1dxztj3kan8abk6q` → `STALE`
  - final verification status: `STALE`
  - blocking reason: `Stale criteria: ac-1`
- supersession verification:
  - original WorkOrder: `wd730tjzk2mfr0qsc4scgp807x8aajd2` → state `SUPERSEDED`
  - replacement WorkOrder: `wd7df781m9sm3bazvykezyb7j58aarq4`
  - lineage preserved via `supersededByWorkOrderId` / `supersedesWorkOrderId`

## Sixth slice — Real Factory Overview dashboard

| Criterion | Result | Evidence |
| --- | --- | --- |
| Portfolio overview is backed by live Convex data | PASS | `convex/workOrders.ts#factoryOverview`, `apps/mission-control-ui/src/controlPlane/FactoryOverviewView.tsx` |
| Summary metrics cover active work, blocked work, approvals, stale evidence, and attention-seeking runs | PASS | `convex/lib/factoryOverview.ts`, `apps/mission-control-ui/src/controlPlane/factoryOverviewModel.ts` |
| Exception-first lists show blocked work, approval queue, stale evidence, and runs needing attention | PASS | `apps/mission-control-ui/src/controlPlane/FactoryOverviewView.tsx` |
| Control > Portfolio no longer uses placeholder-only content | PASS | `apps/mission-control-ui/src/sections/ControlSection.tsx`, `apps/mission-control-ui/src/controlPlane/FactoryOverviewView.tsx` |
| Factory overview helper/model logic is test-covered | PASS | `convex/__tests__/factoryOverview.test.ts`, `apps/mission-control-ui/src/controlPlane/factoryOverviewModel.test.ts` |

### Additional checks executed

```bash
pnpm install --frozen-lockfile
pnpm exec convex codegen --typecheck disable
pnpm exec vitest run convex/__tests__/factoryOverview.test.ts apps/mission-control-ui/src/controlPlane/factoryOverviewModel.test.ts
pnpm exec tsc --noEmit -p convex/tsconfig.json
pnpm --filter mission-control-ui typecheck
pnpm --filter mission-control-ui build
pnpm run ci:typecheck
pnpm run ci:test
pnpm run ci:test:e2e
```

### Result summary

- Added authoritative `workOrders:factoryOverview` query for the control-plane portfolio view
- Replaced the Control > Portfolio placeholder with a live overview built from WorkOrders, approval decisions, verification receipts, and workflow runs
- Surfaced exception-first lists for blocked work, pending approvals, stale evidence, and attention-seeking runs
