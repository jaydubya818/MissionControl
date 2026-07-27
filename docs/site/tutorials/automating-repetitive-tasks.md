# Automating repetitive tasks

Turn recurring operator work into governed factory automation.

## Workflows

Define multi-step workflows in `workflows` table:

- Step agents (Hermes operator, Pi bounded runtime)
- Retry limits and timeouts
- Expected outputs per step

Seed demo includes `mc-demo-delivery` workflow for WorkOrders.

## Scheduled jobs

`scheduledJobs` drive cron-like execution:

- Daily CEO brief (`mission_prompt`)
- Nightly QC run
- Smoke test suite

View upcoming runs in Command Center.

## Hybrid patterns

**Labs → Hybrid Workflows** and **Automations** harness pages document Eric workshop patterns — trigger → agent fleet → receipt.

## From task to WorkOrder

When chat-shaped work repeats:

1. Capture desired outcome and criteria
2. Promote to WorkOrder (not another INBOX task)
3. Attach workflow and repo scope
4. Dispatch with idempotency key
5. Store receipt for meta-loop mining

## Metrics

Factory Health tracks `humanTouchesPerAgentTask` — automation succeeds when this drops without verification FAIL rate rising.
