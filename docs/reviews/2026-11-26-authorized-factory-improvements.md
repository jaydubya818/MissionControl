# Mission Control: authorized factory improvements

Date: November 26, 2026  
Repository: [jaydubya818/MissionControl](https://github.com/jaydubya818/MissionControl)  
Baseline: `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`  
Working branch: `codex/mission-control-transcript-qualification`

## Outcome

The authorized source improvements are implemented locally, independently
reviewed, and integrated with the nine repairs from the preceding transcript
review. They make startup failures actionable, protect sensitive configuration,
add governed external intake and frozen replay, and make review evidence more
accurate. The existing Mission → WorkOrder → Task → Attempt → verification →
release lifecycle remains the source of execution and acceptance authority.

**The requested live factory qualification is still blocked before dispatch.**
The factory has not generated the to-do application. No canonical Mission,
WorkOrder, Task, or Attempt was issued for that workload, and no application
browser acceptance, live recovery drill, or unattended repeat occurred.

This is a cumulative working-tree patch. It has not been committed, pushed,
merged, or deployed. The new operator controls remain Preview. Passing source
and component tests do not establish live installation or browser behavior.
The orchestration suite also retains 14 failing Fab scenarios on this Linux
host; the exact failure set matches the preceding review.

The current machine-readable results are
`evidence/combined/combined-verification-summary.json` in the delivery archive.
The earlier transcript review and course crosswalk remain historical records;
this document supplies their current implementation disposition.

## What changed and why

### 1. Startup readiness now gives actionable answers

Added `pnpm factory:readiness`, backed by the existing runtime and configuration
contracts. It reports the control-plane URL, project and repository scope,
service signing configuration, service-registration uncertainty, selected
adapter, execution-mode conflicts, accounting journal path, Factory Version
bindings, actual Codex adapter health, platform constraints, and the package
manager visible to the worker's restricted subprocess environment.

The diagnostic does not start a worker or issue workload records. It reports
`executionAuthority: false` and `dispatchAdmission: UNVERIFIED`. Actual dispatch
still requires current control-plane admission, provider routing, budgets,
verifier availability, and the existing WorkOrder readiness evaluation. A
configured local value cannot certify those remote conditions.

The trusted host pnpm override is restricted to an absolute canonical regular
file outside the candidate checkout. Its probe uses the host Node executable,
a scrubbed environment, and a timeout. Candidate source cannot select the
toolchain. The actual probe verified pnpm 9.0.0 while correctly reporting the
missing service configuration and unavailable admitted Codex runtime.

See [startup readiness](../testing/factory-startup-readiness.md) and
[host pnpm preparation](../testing/host-pnpm-runtime.md).

### 2. Sensitive configuration has stronger authorization

Protected 25 public handlers across organization members, outbound webhooks,
and legacy scheduled jobs. The changes require real authentication, including
when demo mode is enabled; derive project and company scope from stored
records; apply the existing role and permission model; validate cross-project
and parent relationships; and derive audit actors from the caller.

Webhook reads omit secrets. Sending rechecks the stored project binding. The
delivery retry query now includes due `RETRYING` records through the existing
retry index, so scheduled retries can actually be selected.

This unit removed 24 newly protected entries from the static authorization
inventory. Together with the earlier GitHub repair, the cumulative patch
removes 32 entries. The final scanner sees 1,021 public functions, 430 with a
recognized guard, and 591 without one. Its regression gate passes. Those 591
entries still need handler-level assessment; they are neither proof that every
entry is exploitable nor proof of complete authorization coverage.

#### Legacy scheduling now reports its actual capability

Independent review reproduced an important downstream failure: the old job
runner scheduled the authenticated public `mission.reversePrompt` action and
marked the job executed before the action could succeed. Scheduled Convex
functions do not inherit the caller's authentication. The inspected reverse
prompt handler also returns fixed mock suggestions; it is not a supported
delegated production executor. See the
[Convex scheduling authentication contract](https://docs.convex.dev/scheduling/scheduled-functions#auth).

The correction refuses activation of unsupported legacy job kinds, keeps
disabled records editable/removable, and returns `NOT_EXECUTED` with a specific
reason. It does not enqueue the unavailable action, update a successful-run
timestamp, or report a successful execution. Polling records skipped work.
This change makes the legacy module truthful; it does not restore a delegated
executor. Other scheduler modules retain their existing behavior.

See [public configuration authorization](../testing/public-configuration-authorization.md).

### 3. External work can enter through governed intake

Added opt-in GitHub issue intake to the existing signed webhook route and a
generic HMAC-authenticated product-error route at `/factory/product-errors`.
Policies bind the existing installation or connection, repository, project,
owner/team, code scope, budget limits, allowed actors, and event selection.
Creating a policy does not install or authorize a provider connection.

Deliveries retain source identity and a bounded processing history. The ledger
handles duplicate deliveries, conflicting bodies, stale processing leases,
retries, correlation to active work, recurrence, and regression. Generation
fencing prevents a stale processor from completing a newer processing lease.
Payload limits and timestamp checks run before processing. Stored diagnostics
are normalized and scrubbed rather than retaining arbitrary raw provider text.

An admitted event creates a canonical draft Mission with its assignment and
event in one transaction. Product errors also link the existing incident
model. Planning is an explicit authenticated request through the current
planning API. Ingestion grants no approval, dispatch, or release authority.

Restoration requires a deployed release and matching current browser evidence
for the candidate, revision, environment, and error fingerprint. A provider's
resolved status is insufficient. List, detail, and restoration operations
respect canonical Mission visibility; unlinked deliveries require automation
management permission.

Root's independent review also fixed the clean GitHub bootstrap path: the
connection must be reverified after issue capabilities are enabled, and intake
waits for a fresh ready capability assessment. Existing tests using an already
ready connection had not exercised that transition.

This is an implemented adapter contract with controlled handler and signature
tests. No external webhook or monitoring service has been connected, and no
live issue or application error has traversed this path.

See [external intake](../factory/external-intake.md).

### 4. Replay now uses frozen workloads and canonical execution

Added replay through the existing experiment and Factory Version records.
Freezing captures immutable dataset rows, expected outcomes, workload
contracts, source revisions, evaluator definitions and producer identities,
two exact admitted Factory Versions, retry limits, and minimum matched pairs.

Preparation creates fresh WorkOrders using current canonical approval policy.
It does not copy old approvals. Dispatch calls the existing dispatcher with
the authenticated actor and current budget, routing, capability, and approval
checks. If routing chooses a different Factory Version, repository base, or
frozen contract, the transaction rolls back. The bounded dispatch operation
processes at most ten slots and returns per-case results, reasons, and a
continuation cursor. Failed retries require an explicit prior Attempt and
reason within the frozen bound.

Comparison keeps every frozen case in the denominator and requires matched
independent current evidence. Failed Attempts and their measured costs remain
visible. Missing cost and intervention data remain unknown. Owner interventions
and assistant work outside the factory are reported separately and bound to a
quiescent Attempt snapshot; these reports are not independent observation of
zero intervention. Unattributable external or model costs prevent a positive
cost comparison. Individual quality regressions cannot be hidden by a better
aggregate.

Learning and promotion read fresh replay results. An old `COMPLETED` experiment
cannot hide stale verification or a newly detected regression. Frozen replay
results cannot be replaced by manually entered or deterministic aggregate
results. The implementation does not assert statistical significance,
automatically promote a version, or grant release acceptance.

Independent review found and fixed a visibility gap affecting frozen workloads
from inaccessible source or bound WorkOrders. The complete set is denied when
a required record is hidden, preserving both access control and the comparison
denominator. The reviewer also found that a fixture filename matched Convex's
server-discovery rules. It now uses a filename excluded by those rules; an
old-name negative control confirms the distinction.

Successful dispatch/admission in the behavioral suites uses controlled
boundaries. The actual canonical dispatcher is also exercised for its
capability-admission refusal. No two-version live replay has occurred.

See [frozen replay](../testing/factory-replay.md).

### 5. Review evidence now reflects the current candidate

A reproduced defect allowed an old passing receipt to make a review appear
ready even when current canonical verification rejected the candidate. The
review projection now requires current eligibility and matching receipt,
verification run, WorkOrder, candidate, revision, and source identity. Missing
evidence stays incomplete; a current rejection stays blocked.

Added five advisory facets to the existing Review Evidence Package: alignment,
impact, verification, rollback cost, and error detection. Each reports
supported evidence, attention, or unknown. A favorable facet cannot override a
mandatory gate. This extends the review approach in the supplied
[Warp verification lesson](https://www.warp.dev/learn/build-a-self-improving-software-factory/add-verification-and-merge-risk)
using Mission Control's current evidence authority.

Operational observations require exact current live independent evidence and
validated structure. Synthetic, mismatched, stale, conflicting, or truncated
observations remain unknown. Review records now include the actual verifier
host platform, architecture, and Node version; this does not certify the
generated application's runtime.

Independent review corrected three consequential integration details: actual
Policy V2 observations live under `metadata.verifierMetadata`; a truncated
output suffix cannot prove that there was only one observation; and an expected
authorization error in a Preview query must stay within that panel. Permanent
regressions and retained failing probes cover each correction.

See [review facets](../testing/factory-review-facets.md).

### 6. Operators can reach the new controls from existing navigation

Missions now exposes an intake Preview panel with delivery states, processing
failures, bounded retry, Mission links, and planning requests. Datasets and
experiments exposes replay preparation, bounded dispatch, reconciliation, and
per-case evidence. Learning shows fresh replay comparisons and explicit unknown
cost/intervention data. The Review Evidence Package displays the new facets.

Queries load when the panel is opened. Local recoverable boundaries keep an
expected authorization denial from replacing the surrounding console, and
reset when the selected project or experiment changes. The controls call the
same scoped backend operations; they introduce no separate execution authority.

Seven Playwright cases are prepared for dark/light and narrow/wide rendering,
keyboard and accessibility checks, recipe override, intake failure/retry, and
replay blocked/unknown states. Their fixture uses real components with explicit
mock query/action boundaries. Test discovery and the fixture production build
succeeded. The browser cases themselves remain unrun because Chromium is not
available and the download attempt returned 403. Component tests and a built
fixture do not close this browser gate.

See [operator previews](../testing/factory-operator-previews.md).

### Earlier repairs remain included

The cumulative patch retains all nine earlier repair areas: truthful
qualification receipts; trusted TypeScript automation execution; reproducible
host dependency preparation; requested recipe intent; advisory semantic review
grouping; legacy GitHub caller/project authorization; bounded GitHub pagination
and source binding; explicit measurement direction; and preservation of known
quality-score regressions in Learning. Their original reproductions, tests, and
reviews are retained in the evidence archive.

## Verification of the integrated working tree

| Check | Final observed result | Evidence under `evidence/combined/` |
| --- | --- | --- |
| Full Convex backend suite | **2,005 passed**, 177 files | `combined-convex-tests.log` |
| Full UI component suite | **403 passed**, 80 files | `combined-ui-tests.log` |
| Full orchestration suite with trusted host pnpm configured | **832 passed, 14 failed, 11 skipped**, 71 files | `combined-orchestration-host-configured-tests.log` |
| Receipt and authorization-scanner regressions | **22 passed**, 2 files | `combined-receipt-scanner-tests.log` |
| Convex, UI, orchestration TypeScript checks | All three passed | `combined-*-typecheck.log` |
| Production UI build | Successful build reported | `combined-ui-build.log` |
| Browser fixture build | Successful build reported | `combined-browser-fixture-build.log` |
| Browser test discovery | Seven cases listed | `factory-review-browser-test-discovery.log` |
| Real browser execution | **Not run**; launch failed because executable is missing | `factory-review-browser-launch.log` |
| Authorization ratchet | Passed; 591 entries remain unrecognized | `combined-authorization.log` |
| Documentation check and tracked-source credential scan | Passed | `combined-docs-check.log`, `combined-secret-scan.log` |
| Whitespace and generated API discovery | Passed; 362 modules, no test entrypoints | `combined-whitespace-check.json`, `generated-api-discovery.json` |

Focused suites and independent probes overlap the full backend, UI, and
orchestration counts and must not be added again. Historical runs are retained
as evidence of failure and correction, not accumulated into a success total.
These results are local source verification; they are not a full CI release
gate, a deployed migration check, or factory-generated application acceptance.

The first combined orchestration run had one additional failure because the
test command omitted the already reviewed host pnpm override. The final command
supplied that setting and the dependency-preparation case passed. The remaining
14 failures are exactly the previous five Fab adapter and nine Fab worker
scenarios. The explicit native macOS constraint is a confirmed blocker on this
Linux host; exclusive causality and results on an admitted macOS host remain
unestablished. The failures have not been converted into skips or removed.

Independent source reviews cover authorization, intake, replay, and root-owned
readiness/review/UI changes. Review found defects beyond the authors' initial
tests and required corrections before integration. The final integration audit
also checks the shared schema, generated API, accepted source identities, and
remaining failure set. Its report is
`evidence/combined/improvements-integration-independent-audit.md`.

## Disposition of every recommendation

| Recommendation | Current implementation and qualification state |
| --- | --- |
| Actionable preflight | Local diagnostic implemented and actually exercised; remote service/admission verification remains blocked. |
| Versioned to-do qualification | Acceptance contract and ordered qualification plan prepared; actual factory workload not started. |
| Truthful completion receipts | Implemented, independently reviewed, and regression-tested; included in cumulative patch. |
| Reproducible host tools | Host Node/tsx and pnpm preparation repaired and tested; an admitted native worker still must be reached or qualified. |
| Authorization hardening | Priority configuration modules and prior GitHub helpers protected; the remaining inventory still requires assessment. |
| Durable continuation | Existing authority retained and replay/intake retries modeled explicitly; actual worker restart and provider interruption drills remain unrun. |
| Outcome observability | Replay exposes case outcomes, retained failures, cost uncertainty, intervention reports, and current comparisons; real delivery metrics await live runs. |
| UI/API parity | Intake, replay, and review controls use their scoped APIs in existing navigation; deployed auth and real browser verification remain open. |
| Improvement loop | Frozen replay plus fresh Learning/promotion checks implemented; real comparison and promotion qualification remain open. |
| Intent and review risk | Earlier routing/grouping repairs plus five current-evidence facets implemented; real browser proof remains open. |
| Governed issue and application-error intake | Source adapters, durable delivery records, visibility, bounded retry, and restoration-evidence validation implemented; provider configuration and live delivery remain open. |
| Real replay | Canonical preparation/dispatch and comparison source implemented; two admitted live Factory Versions and actual workload evidence still required. |
| Reusable second recipe | Retain the agreed dependency on the first real workload and clean repeat; no unqualified recipe is represented as proven. |
| Remove misleading success and runtime selection | Incomplete qualification cannot report PASS; candidate source cannot select TypeScript/pnpm runtimes; unsupported legacy scheduling now reports `NOT_EXECUTED`. |
| Avoid a parallel metafactory or extra management layers | No new primary workflow engine, agent hierarchy, mailbox, or promotion authority was introduced. Existing lifecycle and navigation were extended. |

## What prevents the requested live run

Vercel project discovery still returns a team-scope 403. The connection needs
the team's provider-side consent grant before it can inspect that deployment.
An approval in chat does not create this provider grant. A fresh single-use
consent link can be issued for the final access handoff; the link expires after
ten minutes and does not itself establish worker availability.

This workspace also lacks a usable configured Convex control-plane/service
identity, project and repository binding, admitted Factory Version binding,
and persistent accounting journal configuration. Codex is installed as
`0.172.0-alpha.2` on Linux x64; the inspected `codex/v1` contract requires the
evaluated `0.146.0` artifact and currently admits a `darwin-arm64` digest. Fab's
native host requirement is also not met here. CLI login does not establish the
Mission Control service registration or repository capabilities.

These findings describe the accessible workspace. They do not establish the
state of the owner's inaccessible native worker. The attempted anonymous local
Convex fallback previously failed to initialize with out-of-memory errors; no
healthy alternative backend was established. The browser plugin also has no
originating browser context available in this session.

The next concrete access step is the provider team grant. After it is granted,
retry project discovery, inspect the existing deployment and available worker
bindings, and use a qualified worker. If a new runtime is needed, it must pass
the existing qualification process with its actual artifact identity. An
unreviewed runtime upgrade or a synthetic offline inference path cannot satisfy
the live workload contract.

## Remaining execution sequence

1. Establish authenticated control-plane access and a current qualified worker,
   repository binding, provider route, verifier, budget, and accounting path.
2. Complete the remaining real browser checks for the changed operator UI and
   the existing source publication and deployment gates for this patch.
3. Create the to-do Mission and WorkOrder through the factory. Record the real
   Factory Version, Attempt IDs, provider invocation, revision, and artifact
   digest. The app contract covers create/edit/complete/reopen/delete, filters,
   counts, validation, persistence, keyboard use, and narrow-screen layout.
4. Independently exercise that exact app candidate in a real browser, including
   failed persistence, literal HTML-like input, Unicode, reload/reopen, and
   runtime error handling. Preserve any failed Attempt and bounded repair.
5. Exercise duplicate trigger, restart, cancellation, lease expiry, and stale
   verification recovery against the real workload; then run a clean repeat
   and account separately for owner and outside-factory assistant intervention.
6. Qualify opt-in issue delivery and a controlled application-error repair and
   restoration on the qualified application. Then run matched frozen replay
   across two admitted Factory Versions before any improvement promotion.

The delivery package contains the complete cumulative patch, source hashes,
implementation and test documents, retained negative controls, independent
reviews, and current result summary. Its patch is applied to an isolated Git
index and compared byte-for-byte with the working tree during packaging. That
check preserves the real index and does not create a commit or deployment.
