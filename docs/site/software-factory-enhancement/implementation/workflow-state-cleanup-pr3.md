# Workflow State Cleanup PR 3

Mission Control now uses Ready as the canonical actionable Task state while
continuing to read legacy Assigned records. Assignment is metadata; readiness
is workflow state.

Review decisions and blockers now retain structured owners, timestamps,
reasons, findings, required actions, and resolution history. Request changes,
Block, and Unblock use accessible dialogs that prevent empty or short reasons.
The existing Work Order and Mission approval authority is unchanged.

The Why tab exposes a workspace-scoped, read-only compatibility report. The
Software Factory Research Lab currently has 20 legacy Assigned Tasks and 34
legacy Review Tasks without structured context. Zero Assigned records qualify
for automatic migration, so PR 3 performs no backfill.

All system bypass writers discovered during implementation—executor callbacks,
loop detection, stale-agent quarantine, budget gates, review messages, and
duplicate cancellation—now record state-entry time and Task transition evidence.

Rollback is additive: stop new Ready/structured writers and revert their UI;
existing fields remain readable and no data restoration is required.

Full engineering decision record:
`docs/architecture/workflow-state-cleanup-pr3.md`.

