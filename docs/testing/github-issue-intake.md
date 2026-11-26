# GitHub issue intake authorization and pagination

## Repair contract

The legacy GitHub integration imports issues as INBOX tasks. It does not create
Missions or WorkOrders and is not the signed GitHub webhook ingress.

All public integration reads require an authenticated operator with access to
the stored workspace. Imports and task links require that workspace's existing
`delivery.write` permission. Task-ID operations derive the workspace from the
stored task. Remote issue-state edits also require the stored repository and
issue number to match the requested target. The public `handleIssueWebhook`
function remains an authenticated replay helper and grants no webhook trust.
The integration requires a real authenticated identity even if the deployment's
anonymous demo override is enabled. Linking a PR stores its repository separately
so a PR in another repository does not retarget the task's linked issue.

Issue idempotency includes the workspace. A same-project legacy key can be
adopted without changing task status. A matching legacy record in another
project must neither be updated nor returned as the caller's task. An authorized
import may create a separate record for the caller's project.

Sync authorizes before provider calls, retains the provider budget, and fetches
up to ten pages of one hundred GitHub results. It validates all fetched pages
before starting imports. Pagination links must use the HTTPS GitHub API and
either the original issue path or GitHub's canonical numeric repository path.
The code extracts the next page number and rebuilds the request on the original
authorized repository, retaining `state=all` and `per_page=100`. A numeric
repository ID from a link never chooses the destination. Redirects,
invalid payloads, failed pages, and an outstanding next page at the cap fail
explicitly. Credentials must never be forwarded to an arbitrary pagination URL.

The canonical numeric path is documented in
[GitHub's pagination reference](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api).
Convex documents that actions preserve user authentication when calling queries
and mutations in its [actions reference](https://docs.convex.dev/functions/actions).

Fetching completes before imports, so fetch and pagination failures create no
tasks. Later per-issue writes are separate calls and are not claimed to be one
transaction. If a write fails, the action fails and a retry uses the same scoped
keys to resume without duplicating completed imports.

The existing `tasks.create` budget still applies: at most 300 external creations
per 60-second window across origins, and 30 per source/source reference. A
ten-page fetch cap therefore does not promise a thousand task creations in one
run. Other external callers share that global budget. Exhaustion can leave
completed imports before the action reports a write failure; subsequent retries
remain subject to the same budgets. The controlled task-creation fixture does
not exercise this downstream budget.

## Design decision

Two approaches were considered. Keeping one global issue key and rejecting a
project mismatch prevents a cross-project write but also prevents legitimate
imports into another authorized project. A project-scoped key with same-project
legacy adoption preserves isolation and permits that legitimate import.
Legacy adoption checks both the requested repository spelling and its normalized
spelling. Once adopted, new keys normalize repository case. This is not a bulk
migration of historical keys stored under unrelated spellings.

The repair reuses `requireWorkspaceAccess` with the delivery editing permission.
It does not assign factory improvement or publication authority. Adjacent
link/status helpers use the same boundary to avoid a bypass through another
export in the module.

## Verification

The tests invoke registered Convex handlers with an in-memory database and
controlled provider responses. They use the real company/workspace authorization
helpers. The `tasks.create` boundary is a controlled INBOX test implementation,
not a deployed Convex mutation. The tests do not establish deployed integration
behavior or a live factory run.

Run the focused checks from the repository root with the pinned package manager.

```sh
npx --yes pnpm@9.0.0 exec vitest run convex/__tests__/githubIssueIntake.test.ts convex/__tests__/actionAuthorization.test.ts
npx --yes pnpm@9.0.0 exec tsc -p convex/tsconfig.json --noEmit
npx --yes pnpm@9.0.0 --filter mission-control-ui typecheck
npx --yes pnpm@9.0.0 --filter @mission-control/orchestration-server typecheck
AUTHORIZATION_BASE_SHA=b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a node scripts/check-convex-authorization.mjs
git diff --check
```

The retained results distinguish the initial reproduction from later review
controls.

| Evidence file | Observed result |
| --- | --- |
| `.audit/github-issue-intake-before.log` | Original source with the first 30 intake tests. 28 failed and 2 passed. |
| `.audit/github-issue-intake-after.log` | First repair. 30 intake tests and 23 existing provider-budget checks passed. |
| `.audit/github-issue-intake-canonical-before.log` | Official canonical pagination formats exposed 3 failures with 59 passes. |
| `.audit/github-issue-intake-binding-before.log` | The PR repository overwrite added one failure. 4 failed and 59 passed. |
| `.audit/github-issue-intake-final.log` | Corrected source. All 40 intake tests and 23 existing provider-budget checks passed. |
| `.audit/github-issue-intake-final-typecheck.log` | Convex TypeScript compilation exited 0. |
| `.audit/github-issue-intake-authorization.log` | The authorization gate exited 0 against the exact baseline. Eight GitHub exports were removed from the legacy exception list. |
| `.audit/github-issue-intake-ui-before.log` | The UI package's compiler settings exposed one `body: unknown` return-type error; exit 2. |
| `.audit/github-issue-intake-compatibility-tests.log` | After explicit string normalization, all 63 focused checks passed again. The independent reviewer also reran all 63 successfully. |
| `.audit/github-issue-intake-ui-after.log` | UI package typecheck exited 0 after the correction. |
| `.audit/github-issue-intake-orchestration-after.log` | Orchestration package typecheck exited 0 after the correction. |

The cross-package correction changes only the parser's body normalization from
the nullable expression to an explicit string check. The existing validation
still accepts strings, null, and omitted bodies, rejects other body types, and
normalizes null or omitted bodies to an empty string. No compiler setting or
validation guard changed. The independent reviewer confirmed that reversing
this one expression recreates the previously reviewed source byte for byte.

The 40 intake cases cover authenticated reads, denied writes, workspace and
stored-task scope, legacy adoption, distinct imports for two projects, viewer
permissions, task-state preservation, remote issue linkage, PR repository
separation, 101-item pagination, numeric repository links, credential routing,
failed/invalid pages, the ten-page cap, and idempotent recovery after a write
failure. `git diff --check` also passed.

The authorization inventory still contains unrelated legacy endpoints. This
repair does not assert that the entire application's legacy API is authorized.
It also does not qualify a snapshot-consistent GitHub listing while issues change
during pagination, import backlogs beyond the ten-page cap, or bulk-migrate old
case variants. No runtime admission, publisher authority, or acceptance rule is
changed. An independent source and comment review found no blocking issues,
matched all four reviewed file hashes, and reran the two-file focused command
with all 63 checks passing. That review establishes no deployed-runtime claim.
