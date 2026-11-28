# Unattended to-do application qualification

Date: 2026-11-26

Source baseline: `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`

Status after the authorized improvements: the source adapters, frozen replay,
readiness diagnostic, and review facets are implemented and locally verified as
described in the [current implementation report](../reviews/2026-11-26-authorized-factory-improvements.md).
The historical findings below explain the original plan. No live workload has
been dispatched, so the acceptance and recovery requirements remain open.

## Requested outcome

Review Mission Control against four supplied Tiny Software Factories transcripts,
the later Ben Holmes article, and the ten subsequently supplied Warp course
pages. Use the existing factory to create and test a small to-do application
without further owner interaction. Repair concrete defects in the authorized
scope and retain evidence of every attempted check.

The historical assessment at `docs/mission-control-existing-system-assessment.md` remains historical. This review uses current source, the capability maturity ledger, and observed execution results.

## Execution contract

The to-do application is a disposable qualification workload. Its target must be an admitted repository and isolated workspace. No canonical Mission, WorkOrder, Task, or Attempt identifiers have been issued in this session. Their absence is a blocker, not permission to invent records or relabel a fixture.

The owner authorized implementation, testing, and related repairs. Existing authority, source publication, acceptance, and deployment controls still apply. The requested outcome does not require a recurring schedule or a change to unrelated product data.

Required evidence includes the factory version, runtime artifact identity, producer and verifier identities, WorkOrder and Attempt IDs, actual provider invocation provenance, source revision, artifact digest, browser results, recovery results, and an intervention ledger.

## To-do acceptance contract

The application must support task creation, title editing with save and cancel, completion, reopening, deletion, All/Active/Completed filters, and correct remaining counts. Titles are trimmed, contain 1 to 200 characters, and render as text. Empty and whitespace-only input must produce visible validation. State must persist across reload and reopening in the same browser profile. Browser-local persistence is sufficient and must be described accurately.

The application must expose usable empty states, keyboard controls with accessible names, and a responsive narrow-screen layout. It must start through documented commands. Independent browser verification must cover CRUD, validation boundaries, filters, counts, persistence, literal HTML-like input, Unicode, keyboard operation, mobile layout, and runtime errors against the exact delivered artifact.

If browser persistence is unavailable or a save fails, the app must show the
failure and avoid claiming that the in-memory change was durably saved. Include
this path in the browser acceptance evidence and application error-detection
summary.

The factory must preserve failed Attempts and pass any repair through a new bounded Attempt and fresh independent verification. A proposed limit is three implementation Attempts; the actual limit and resource budget must come from the admitted configuration before dispatch. No budget or approval record is fabricated by this document.

## Ordered work

1. Confirm the repository and real worker entrypoint.
2. Compare transcript ideas with current implementation before adding features.
3. Check control-plane access, qualified runtime, scoped repository, provider route, verifier, and publication capability when needed.
4. Capture the baseline failure of the qualification receipt reporter.
5. Fix incomplete-run reporting and independently test interruption, failure, full completion, and receipt replacement.
6. Run the relevant producer, verification, recovery, and exact-artifact contract tests.
7. Dispatch the to-do WorkOrder only when all live prerequisites are observed.
8. Run independent browser acceptance and isolated duplicate/restart/recovery checks.
9. Deliver separate verdicts for application behavior, live factory generation, independent verification, recovery, and no-owner-intervention completion.

## Observed initial blockers

- The connected local Browser tool has no originating browser context.
- Vercel project discovery returned 403 for the existing team scope.
- The documented hosted UI redirects to Vercel sign-in in the cloud browser.
- This workspace has no configured Convex service identity or signed service-command configuration.
- The installed Codex is `0.172.0-alpha.2` on Linux. Current `codex/v1` requires `0.146.0` and has only an evaluated `darwin-arm64` digest.
- The existing local synthetic qualification path explicitly denies inference. It cannot be reused for a live run.

These observations concern this session and source baseline. They do not establish the health of the owner's inaccessible Mac worker or hosted control plane.

## Reporting defect hypothesis

The current qualification runner writes a terminal-looking PASS after each successful intermediate check. If a later subprocess blocks or execution stops, the receipt can claim completion while most required checks never ran. The repair must initialize a nonterminal receipt before any gate, remain nonterminal while checks are incomplete, and produce PASS only after all expected checks have completed successfully. Receipt replacement must be atomic.

## Transcript decisions

Adopt narrow reusable workloads, durable continuation, concise progress summaries linked to raw evidence, and API access to supported operations. Adapt specialized agents and metafactory changes to existing scoped capabilities and immutable Factory Versions. Defer a new metafactory interface until one real product workload passes. Preserve independent verification, existing approval boundaries, bounded repair, and exact artifact lineage.

Reject active-agent counts as the primary success metric, automatic authority expansion, summaries as verification evidence, cron triggers as proof of durability, and unsupported claims that models or additional agents guarantee better outcomes.

## Additional article received during the run

The owner added Ben Holmes's article, *How to build a software factory you'll
actually use*, through an X link and a fifth attached text. The matching primary
article is <https://www.warp.dev/blog/program-software-factory-as-code>.

Its triage and review-risk sections prompted two bounded source checks. The
recipe recommender currently evaluates sensitive vocabulary before answer-only
and plan-only intent. The advisory semantic grouping rule currently treats any
`apps/*/src` file as UI. Repair those defaults within the existing contracts.

The recommendation repair must keep read-only questions and plan deliverables
within their requested action, preserve stronger routing for actual sensitive
changes, retain operator override provenance, and grant no dispatch authority.
The grouping repair must stop treating backend paths as UI solely because of
their app-directory location, preserve actual UI indicators, and keep every
group advisory. Capture failing regression evidence before each repair.

These repairs do not change the live workload's blocked status. Application
browser proof, exact-candidate verification, and actual failure recovery remain
required for the original exit predicate. The article's five review facets
should extend the existing Review Evidence Package rather than add another
workflow engine or acceptance authority.

## Additional course qualification sequence

The later ten URLs contain nine written lessons and one unit index. Their
contribution and current source mappings are documented in
[the course crosswalk](../reviews/2026-11-26-warp-course-crosswalk.md).

The initial to-do build remains the first real workload. The current blocked
state does not justify replacing it with a manually built app or a synthetic
fixture. Finish the bounded issue-import and measurement defects found during
source review, then use the same exact-candidate acceptance contract above.

After that workload and its clean repeat succeed, qualify one opt-in issue
event through an explicit governed adapter. Preserve provider/source identity,
repository/project scope, source-item and delivery deduplication, active-work
correlation, the actual configured budget, and the existing Mission/WorkOrder
authority. An INBOX import alone does not satisfy this case.

Next, exercise a controlled application persistence failure in an isolated
qualification environment. A configured product-error adapter should retain
release and diagnostic references, link one bounded repair, and distinguish
duplicate delivery, recurrence, regression, and observed restoration. These
adapters were not created or connected in this session; their behavior remains
an implementation and qualification requirement.

For the improvement loop, use explicit higher/lower measurement direction and
retain recorded quality scores. A frozen set of real workloads should run under
two admitted Factory Versions with attributable cost and independent outcomes.
Manual aggregate entry and deterministic fixture comparison must remain labeled
as such. No statistically significant improvement or autonomous promotion is
inferred from a small or unexecuted comparison.

All course-derived live cases remain NOT_RUN until the runtime and service
identity prerequisites are met and the actual system produces their evidence.
