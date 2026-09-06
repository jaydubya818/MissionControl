# Independent review dispositions

Latest reviewed main: 4434cc56448075f4804787325a9586c6290b2215; candidate public diff
six additions, one Docker argument expansion, no removals; runtime v46 to v47.

- Architecture / simplicity GO: current-main Fab enrollment, runtime/model identity,
  immutable candidate/recovery/verifier/publication flows retained. Bedrock is a
  bounded separate harness/provider composition. Independent 79 targeted tests pass.
- Security GO: independent 93 accounting tests plus 33 bridge/transport tests pass.
  Fixed price-book expiry in proof, total WorkOrder cap, and reciprocal reservation
  exclusion. Exact US/global-deny routing, explicit credential envelope, no default
  credential chain/retries, signed commands, Docker isolation and no replay retained.
- Data integrity GO: independent 93 tests pass. Fixed atomic overrun evidence/freeze,
  cross-receipt provider request ownership, and repeated correction event identity.
  Original receipts remain immutable; observed overruns append reconciliation evidence.
- Documentation: contract return shapes corrected; newest baseline/version supersedes
  earlier plan. AWS fields remain unqualified; historical browser fixture is labeled
  separately from byte-preserved current-main UI. No production maturity promotion.

All reviewers were independent of the accounting implementation. Architecture review
was independent of worker changes; browser/identity auditor did not implement ledger.
Review findings were fixed and re-reviewed. These are offline engineering dispositions,
not AWS qualification, model-call authority, WorkOrder readiness, or pilot completion.

Final latest-main re-review: architecture/simplicity GO (99 independent tests), security GO (89 independent tests), data integrity GO (113 independent tests). Shared cumulative allocation rule preserves all prior allocated ceilings in both admission paths. Documentation labels historical browser fixtures separately from unchanged current-main UI.
