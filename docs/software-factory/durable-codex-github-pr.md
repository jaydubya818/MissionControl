# Durable Codex-to-GitHub Pull Request Worker

## Purpose

This is the single V1 mutation path from an approved Mission Task Attempt to a
review-ready GitHub pull request. It targets the repository already bound to
the active Factory; it does not create repositories, merge pull requests, or
deploy code. The governed staging-release contract takes ownership only after
GitHub reports the exact merge.

## Authoritative flow

`Mission → approved plan → released WorkOrder → Task → workflowRun Attempt → Factory version → Git commit → independent verification → optional human-review checkpoint → publication permit → pull-request artifact → GitHub merge → governed staging release → release verification evidence`

Dispatch freezes the repository, code scopes, worktree, branch, executor,
model, tool list, timeout, budget, Factory digest, and current WorkOrder
revision. The durable worker then:

1. Claims one `PENDING` `codex/v1` Attempt through a signed service command and
   records a renewable lease.
2. Revalidates current Mission, WorkOrder, Factory assessment, policy, host,
   repository, scope, and GitHub App readiness.
3. Creates or recovers the exact linked worktree and server-owned branch.
4. Runs Codex with the frozen request and a credential-minimized environment;
   model authentication is available to Codex, but orchestration and GitHub
   publication credentials are not.
5. Computes the complete committed and uncommitted Git change set.
6. Blocks publication and records a policy-deviation artifact if any path is
   outside or excluded by the approved repository scopes.
7. Runs every approved verification command in a temporary home directory
   without Codex, GitHub CLI, or ambient Git credentials. It then rechecks Git
   identity, branch, history, repository configuration, changed-file scope, and
   secret patterns before staging the final result. It fails closed when no
   command is bound.
8. When verification requires human judgment, durably pauses the Attempt before
   provider writes. Unconditional approval resumes the same Attempt at the exact
   verified candidate; decisions requiring changes close it for governed retry.
9. Revalidates current revision, approval, receipt, required approvals, lease,
   and candidate immediately before publication, then consumes a bounded
   publication permit as the auditable point of no return.
10. Commits with repository hooks disabled, mints a repository-scoped installation
   token, pushes the exact branch, and finds or creates the pull request.
11. Persists commit, pull request, changed files, installation identity, and the
   complete Mission-to-Factory lineage before marking the Attempt complete.
12. After GitHub reports the PR merged, creates one separate code-release
    aggregate bound to the exact merge commit. Human staging approval,
    deployment receipt, independent provenance/smoke/health evidence, and
    rollback follow `docs/software-factory/governed-staging-release.md`.

The GitHub installation token is held only in worker memory during push and PR
publication. Codex never inherits the App private key, installation token,
service-command secret, or Convex service credential.

## Recovery and idempotency

The worker heartbeats before and during execution, validation, and publication.
It closes the Codex child process stdin immediately after launch so the CLI can
resolve the argv prompt instead of waiting on the long-lived server input.
If the process exits, the durable worktree and branch remain. When the lease
expires, another worker can reclaim the same Attempt and:

- continue partial work without resetting it;
- reuse an existing local commit;
- safely repeat a non-force push;
- reuse the open PR for the exact head branch; and
- finalize an already-published identity without creating a duplicate PR.

A human-review pause is a control-plane continuation, not an in-process
`codex/v1` resume. The implementation process and independent verifier have
already stopped; only the frozen, verified candidate proceeds to publication.

Graceful process shutdown aborts only the local child process. It does not mark
the Attempt canceled; the run remains non-terminal until its lease expires and
the same or another worker reclaims it. Only an explicit operator cancellation
request produces a terminal `CANCELED` Attempt.

An Attempt stops after its Factory recovery limit. Operator cancellation is a
durable field on the Attempt. Unclaimed work cancels immediately; active Codex
execution receives an abort signal after the next signed heartbeat.
A canceled Work Order remains terminal until an authorized operator explicitly
reopens it. Reopening restores only the Task owned by the latest canceled
Attempt to `READY`; a reasoned retry then creates a new immutable Attempt while
preserving the canceled Attempt in the lineage.

Verification commands are frozen into the claim from the narrowest approved
source: Work Order implementation policy, then policy-envelope commands, then
constraints explicitly labeled `Verification command:`. Unlabeled prose is
never promoted into an executable command. Because the approved contract is a
shell command, plan approval is the authority boundary; runtime isolation and
the post-command Git/scope scan prevent that command from changing publication
identity or expanding the approved repository mutation.

V1 enforces the approved runtime and retry limits and blocks execution when its
preflight cost estimate exceeds the approved amount. The Codex CLI adapter does
not yet expose authoritative actual-cost telemetry, so estimate-versus-actual
reconciliation is an explicit operational-hardening follow-up rather than a
claimed hard stop.

## Runtime configuration

The App must be installed only on the selected existing repository with this
permission envelope:

- Metadata: read
- Contents: write
- Pull requests: write
- Checks: read

Required configurable webhook events are `check_run`, `pull_request`, and
`pull_request_review`. GitHub delivers `installation` and
`installation_repositories` to every GitHub App automatically; those lifecycle
events cannot be manually selected.

Set these on the orchestration runtime:

```text
CODEX_FACTORY_WORKER_ENABLED=true
CODEX_WORKER_PROJECT_ID=<Convex project ID>
CODEX_WORKER_REPOSITORY_ID=<Convex workspaceRepositories ID>
MISSION_CONTROL_SERVICE_ID=orchestration-server
MISSION_CONTROL_SERVICE_COMMAND_SECRET=<server-only HMAC secret>
GITHUB_APP_ID=<bound GitHub App ID>
GITHUB_APP_PRIVATE_KEY=<server-only PEM>
```

Keep unscoped compatibility mode disabled (`FACTORY_EXECUTION_ENABLED=0`). The
bounded production setting now starts the same verification-first Attempt
worker used by the human-review checkpoint contract, restricted to the exact
project and repository IDs above. The older parallel durable-worker runtime is
no longer selected at startup, so verification and publication cannot diverge
between two lease models.

Configure the same service ID and HMAC secret on the Convex deployment. Keep
all credentials out of `VITE_*` variables. The worker intentionally handles one
repository in V1; repository scheduling and hundred-agent fan-out wait until
this path has complete browser and restart evidence.

## Operator-visible states

The Execution Run Inspector shows the worker, phase, last heartbeat, base/head
commit, cancellation request, and pull-request identity. Its explicit states
are:

- loading while the live Attempt projection resolves;
- awaiting claim when no lease exists;
- running with phase and heartbeat evidence;
- cancellation requested while the worker aborts;
- failed or policy-blocked with immutable evidence and bounded retry;
- canceled with the reason preserved; and
- completed with a clickable PR number, URL, and commit lineage.

## Fail-closed conditions

No branch push or PR request occurs when the GitHub App is absent or stale,
Factory readiness expired, the host is dirty/stale, governance changed after
dispatch, code scope is incomplete, a changed file violates scope, no approved
verification command exists, a verification command fails, budget estimate is
over limit, verification changes Git identity/history/configuration, a changed
file exceeds the governed scan limit, cancellation is requested, or the lease
is lost.

For a human-review continuation, the control plane must issue a current,
lease-bound publication permit immediately before GitHub mutation. After that
permit is consumed, publication is non-revocable for its bounded validity
window so restart recovery can reconcile an idempotent push or existing PR.
