# Factory improvements: GitHub publication

Date: November 26, 2026

Jarrett authorized GitHub commits for the reviewed factory improvements. The
publication contains the earlier nine repairs, the governed intake and replay
capabilities, startup diagnostics, current review evidence, and operator Preview
controls. It uses the existing Mission Control lifecycle and authority.

The [implementation report](2026-11-26-authorized-factory-improvements.md)
describes the independently reviewed source snapshot before publication. Its
statements about uncommitted work describe that recorded snapshot. The commit
history and pull request record the subsequent publication state. Source
publication can trigger configured preview builds. It does not authorize
production promotion or establish live factory qualification.

## Commit order

1. The preceding transcript-review repairs, reproduced from the reviewed
   34-file patch against `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`.
2. The authorized factory capabilities, reproduced from the complete reviewed
   93-file cumulative source manifest.
3. CI coverage and this publication record.

The first two snapshots retain their independently reviewed source bytes. The
third adds execution of the prepared checks to the existing CI runners. It
does not change worker admission, production configuration, dependency versions,
or repository merge requirements.

## Hosted verification added

The unit-test job now selects the 13 qualification-receipt regressions under
`scripts/`. The existing root test command selects workspace tests and the
Convex test directory, so these receipt cases previously fell outside that
selection.

The browser-security job runs the seven factory operator Preview scenarios
after its existing Chromium installation. These scenarios exercise actual UI
components through explicit fixture query and action boundaries. They cover
review evidence, light and dark themes, narrow layouts, keyboard interaction,
accessibility, recipe override, intake retry, and blocked replay.

The job retains `test-results/factory-review/` as a GitHub Actions artifact for
seven days, using the same pinned upload action already used by the repository.
That artifact can contain fixture screenshots and failure traces. The test
command remains a failing gate when an assertion fails. The existing critical
browser tests and the new cases both get a chance to run after an earlier test
failure.

## Evidence and remaining qualification

At the frozen source snapshot, the full backend suite passed 2,005 tests and the
UI component suite passed 403. Orchestration passed 832 tests, failed 14 Fab
scenarios, and skipped 11. All three typechecks passed. Receipt and authorization
scanner regressions passed 22 tests. Focused checks overlap these totals.

The 14 failures matched the prior failure list exactly on this Linux host.
GitHub's existing unit and composed-qualification jobs use macOS runners. Their
actual results, and the browser job's actual results, must be read from the
workflow run for the published candidate. CI configuration alone is not a
passing result.

The original live to-do workload remains unstarted. There is no generated
application, canonical workload record, live application browser receipt,
recovery drill, two-version live replay, or clean unattended repeat from this
session. Operator Preview browser results establish only their stated fixture
scope. The inaccessible deployment and qualified worker remain separate live
prerequisites.
