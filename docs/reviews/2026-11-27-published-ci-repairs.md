# Factory CI repair evidence

Date: November 27, 2026

Jarrett authorized the factory improvements and GitHub commits. The objective
remains unattended delivery and verification of a small application through
Mission Control's canonical lifecycle. This follow-up repairs failures found
by [PR #251](https://github.com/jaydubya818/MissionControl/pull/251) after the
first three commits were published.

The first hosted candidate was
`9f1cfab742a88ec6e9684888fda055506c6b1b9a`. Its
[CI run](https://github.com/jaydubya818/MissionControl/actions/runs/45887821478)
exposed the following defects and environment changes.

## Repairs

| Failure | Cause | Change |
| --- | --- | --- |
| Chromium installation failed in both browser jobs. | `ubuntu-latest` selected Ubuntu 26.04, which locked Playwright 1.59.1 rejects. | Pin those two jobs to Ubuntu 24.04. Keep test commands and gate behavior unchanged. |
| Typecheck and lint failed with TS6307. | Telegram's composite project did not include the canonical WorkOrder implementation imported by replay. | Add `../../convex/workOrders.ts` to its explicit file set. Preserve strict and composite checking. |
| One native orchestration test failed. | The host package-manager guard checked the configured path and final target but missed candidate-owned entries hidden by symlink aliases. | Inspect path entries, ancestors, and symlink targets before executing the canonical host CLI. Bound expansion and preserve native resolution errors. |
| Dependency audit blocked release and composed qualification. | Hono had new advisories, and the adapter exception's November 16 review date was overdue. | Patch Hono and its adapter. Preserve the security gate and report the remaining feed discrepancy. |

The path guard's portable regression uses an explicit ancestor alias instead of
depending on an operating system's temporary-directory layout. It covers file
and directory links, indirect chains, relative targets, and a relative target
containing a symlink followed by `..`. Broken files, broken parent links, and
cycles must fail before invoking the package manager. Existing tests continue
to require that legitimate host links execute the canonical file with the
worker's Node executable and scrubbed environment.

## Dependency evidence

The patch changes `@hono/node-server` from 1.19.18 to 1.19.19 and `hono` from
4.13.11 to 4.13.18. Both target tarballs match their published SHA-512 and SHA-1
digests and embedded package identities. Neither adds runtime dependencies.
The adapter's Node requirement remains `>=18.14.1`, as in the previous version.
The repository's runtime requirement is unchanged.

The lockfile retains 814 package entries and 817 snapshots. Reversing only the
two package-version substitutions and their two integrity substitutions
reconstructs the previous lockfile byte for byte. The patch also updates direct
dependency declarations and the corresponding peer references.

The maintainer's [adapter advisory](https://github.com/honojs/node-server/security/advisories/GHSA-rmxm-3fg6-px4f)
lists 1.19.19 as patched. The
[1.19.19 release](https://github.com/honojs/node-server/releases/tag/v1.19.19)
documents the backport and additional percent-path hardening. The
[Hono 4.13.18 release](https://github.com/honojs/hono/releases/tag/v4.13.18)
documents the accompanying router, validator, body-limit, and static-path
fixes.

Both audited scopes change from five moderate and one low finding to one
moderate and no low findings. Critical and high counts remain zero. The
remaining registry advisory, `1243661`, still reports the broad range
`>=1.19.10 <2.1.3`, with an October 28 update timestamp. That response flags
the patched 1.19.19 backport, contrary to the maintainer's current advisory.

The unchanged security gate still fails. No finding is suppressed, and no
exception is added or renewed. The obsolete 1.19.18 active exception is retired
after a successful frozen install. Its previous record is preserved in
[Git history](https://github.com/jaydubya818/MissionControl/blob/9f1cfab742a88ec6e9684888fda055506c6b1b9a/docs/security/dependency-risk-acceptances.json).
Its review date was overdue, while its December 15 expiration had not passed.

## Verification status

The first hosted run passed 845 orchestration tests and skipped 11, alongside
the single path-boundary failure. It passed all 403 UI component tests and all
13 qualification-receipt tests. Build, smoke, and evaluation-integrity jobs
passed. Browser assertions could not establish application behavior because
Chromium installation failed first. Composed qualification stopped at the
dependency gate before its worker stages.

Local verification of the follow-up passed the following checks.

- `pnpm install --frozen-lockfile --ignore-scripts` completed with exit 0.
  Installed package metadata confirms both patched versions.
- `pnpm run typecheck` completed with exit 0 after the dependency update.
  All 17 package typecheck invocations completed, including Telegram and
  orchestration. The command also completed its preparation builds.
- The actual dependency-installer module passed all 23 Vitest cases, including
  the nine new regressions. The source-extracted before probe admitted six
  forbidden paths. The same probe passed all ten cases after the correction.
- Six selected authentication and transport files passed 35 tests and skipped
  one live Convex integration case. The skipped case requires
  `RUN_GOVERNED_CONTEXT_BRIDGE_INTEGRATION=1` and a live backend.
- Authorization checks passed all nine scanner regressions and found no new
  unauthorized public functions. This static result is not a claim that the
  remaining 591 unrecognized functions have been manually reviewed.
- The repository secret scan and factory documentation check passed.

The installed dependency gate failed with the single advisory described above.
Hosted results for the new candidate are tracked in the pull request. A new CI
configuration is not itself a passing result.

## Subsequent hosted verification

Candidate `492b6deeb41041bacadbfcd1f071617b3bd4c742` completed the
[next CI run](https://github.com/jaydubya818/MissionControl/actions/runs/46025292578).
The native macOS unit job passed 855 orchestration tests and skipped 11. It also
passed all 403 UI component tests, 2,005 Convex tests, and 13 receipt regressions.
Other workspace package tests passed. The earlier host CLI failure is cleared,
including the nine added regressions.

The [capability qualification workflow](https://github.com/jaydubya818/MissionControl/actions/runs/46025292640)
passed 59 component tests on each of Node 20 and Node 24, plus 84 admission and
containment tests. The release and composed-qualification jobs stopped at the
same dependency advisory. Those results do not establish the later composed
worker stages.

Both browser installations succeeded. The existing critical browser and
accessibility suite passed all 15 cases, and the retained operator-route E2E
case passed. The seven new operator Preview cases produced six passes and one
failure. Screenshot inspection revealed a second fixture defect that passing
behavioral assertions had missed.

The recipe test used exact label text, which included the nested select's option
text. The browser exposed the expected accessible name on its combobox. The test
now selects that exact named control within the named dialog and retains every
draft-only assertion.

The fixture's CSS build scanned its own directory but omitted utility classes
from imported application components. Browser traces and a separate baseline
build both confirmed the omission. A fixture stylesheet now imports the existing
application stylesheet and explicitly registers the application source. The
repaired build contains the missing layout utilities. New computed-style and
viewport assertions prevent that omission from producing another misleading
pass. Styled layout and contrast qualification require the next hosted browser
run and its screenshots. The prior six passes do not establish that result.

Lint also reached the public runtime-contract guard for the first time. It found
18 contract changes against the PR base while both versions remained 63. The
shared client/backend constant advances to 64 for the intake and replay APIs
and the optional measurement `targetDirection` argument. The unchanged guard
now passes against the explicit PR base. Its regression and documentation tests
passed 14 cases, and UI compatibility tests passed 12. Historical v63 records
remain unchanged. Deployed clients and the backend must still advance together;
source publication does not establish that deployment.

## Live factory qualification remains open

Neither this source repair nor the operator fixture tests establish live to-do
generation, deployed application acceptance, recovery, or an unattended repeat.
There is no canonical live workload record or admitted worker invocation from
this session. The latest team-scoped Vercel API attempt returned 403 for this
connection. The connected local browser reported that it requires an originating
browser session unavailable in this environment. Existing GitHub integration
may create preview builds, but those builds do not prove the live factory
workflow.
