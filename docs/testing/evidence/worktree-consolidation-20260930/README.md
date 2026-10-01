# Worktree consolidation qualification

## Result

The repaired candidate `310ab539697e5e346d68bdc968ed8d710e316a09` passed all 19
stages of `qualify:factory`, including 3,435 repository tests (11 orchestration
tests skipped), TypeScript, 83 skills with zero lint errors, release checks,
production build, and orchestration startup. The dependency audit reports no
critical, high, or moderate findings and one low development dependency finding.

[Automated checks](../worktree-consolidation-final-20260930/automated-checks.json),
[composed scenarios](../worktree-consolidation-final-20260930/scenario-evidence.json),
and [golden eval receipt](../worktree-consolidation-final-20260930/eval-receipt.json)
identify the candidate and check outcomes.

The live browser qualification passed against the same application code on a
disposable copy of the stopped Research Lab database at localhost:5204 and
Convex port 3224. The test's only subsequent changes select the existing
Tasks & runs and Review tabs before inspecting their contents. The browser run
passed in 38.6 seconds. [Browser evidence](browser/browser-evidence.json) records
11 surfaces, three viewport sizes, both themes, accessibility results, and empty
console-error, page-error, and failed-request lists.

The browser validates stored lineage and operator gates. Composed executor tests
use fixtures. This is not proof of a newly dispatched paid model run, live GitHub
App publication, or production deployment. No production database was changed.

## Repairs

- Adapt BuilderIO factory metadata to the existing registry validator.
- Pin axios 1.20.0, undici 7.29.1, ip-address 10.7.1, and fast-uri 3.1.8 to clear
  observed audit failures without adding risk acceptances.
- Retain historical non-passing evidence and check statuses in storage. A census
  found one evidence row each for TIMED_OUT, BLOCKED_BY_DEPENDENCY, and
  NOT_EVALUATED. Existing normalization still rejects these in new packets.
  Thirteen focused regression tests passed; deployment to the database copy
  succeeded after failing on the original schema.
- Update the browser qualification's navigation to the current Work Order tabs
  and allow a separate evidence directory so old proof stays unchanged.

## Worktree disposition

[Full inventory](worktree-inventory.md). Registrations fell from 83 to 59:
eight redundant worktrees were fully archived, byte-verified, and removed;
16 missing-directory registrations were pruned. Original state remains in a
private recovery bundle and archives under
`/Users/jaywest/.local/share/mission-control-backups/consolidation-20260930/`.
Never publish those archives; they preserve ignored local configuration.

The 59 retained checkouts include the primary checkout, this consolidation
checkout, the runtime release, parents of nested worktrees, divergent branches,
dirty worktrees, and ten unreadable Documents directories. The primary checkout
still holds substantial UI and recovery work; its binary diff and untracked
files were backed up. None of that work was silently accepted or discarded.

No open PRs existed at initial inventory. Closed PRs were held rather than
interpreted as acceptance. Remaining feature selection and retirement must use
the inventory and current ownership, not branch names or old passing evidence.
