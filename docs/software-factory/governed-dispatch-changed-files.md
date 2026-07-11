# Governed WorkOrder Dispatch — Changed Files Summary

## Scope confirmation

This branch now contains only WorkOrder control-plane changes required for:

1. the previously approved first WorkOrder slice, and
2. the governed dispatch and lifecycle synchronization slice.

The attempted `scripts/seed-workflows.ts` investigation was reverted and is **not** included in this slice.

## Backend / contracts

- `convex/schema.ts`
  - adds `workflowId` on `workOrders`
  - adds `workOrderEvents`
  - extends `workflowRuns` status/metadata for synchronization
- `convex/workOrders.ts`
  - list/get/create/seed support
  - authoritative `dispatch` mutation
  - internal lifecycle synchronization mutations
- `convex/workflowRuns.ts`
  - propagates execution outcomes back to WorkOrders
- `convex/lib/workOrders.ts`
  - WorkOrder helpers/view shaping
- `convex/lib/workOrderCompat.ts`
  - legacy task compatibility
- `convex/lib/workOrderDispatch.ts`
  - dispatchability, active-run, and next-state policy helpers
- `convex/_generated/api.d.ts`
  - generated API updates for new Convex functions

## UI

- `apps/mission-control-ui/src/App.tsx`
- `apps/mission-control-ui/src/TopNav.tsx`
- `apps/mission-control-ui/src/sections/ControlSection.tsx`
- `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`
  - WorkOrder queue/detail
  - dispatch action
  - lifecycle events display
- `apps/mission-control-ui/src/controlPlane/workOrdersModel.ts`
- `apps/mission-control-ui/src/controlPlane/workOrdersModel.test.ts`

## CLI / orchestration adoption

- `scripts/mc`
  - adds governed `dispatch` command
  - aligns run command parsing with current workflow run output
- `apps/orchestration-server/src/convexCalls.ts`
  - registers the WorkOrder dispatch mutation path
- `apps/orchestration-server/src/index.ts`
  - adds `/workorders/:workOrderId/dispatch`

## Tests / config

- `convex/__tests__/workOrders.test.ts`
- `convex/__tests__/workOrderDispatch.test.ts`
- `vitest.config.ts`

## Documentation

- `docs/software-factory/domain-contracts.md`
- `docs/software-factory/incremental-delivery-plan.md`
- `docs/software-factory/verification-receipt.md`
- `docs/software-factory/governed-dispatch-changed-files.md`

## Explicitly excluded from this slice

- `scripts/seed-workflows.ts`
  - pre-existing verification defect
  - tracked separately via WorkOrder `wd7ddpc7ewff4jq13mkr333cd18aacsb`
