# V1 Factory runtime, cost, and attestation closeout

Date: 2026-08-23
Baseline: `af534ae9b5045710ae4017c5502b4fabea6ad090`

## Architecture overview

The production worker boundary already lives in `apps/orchestration-server`:
it owns signed service commands, durable Factory Attempt polling and leases,
host reports, execution, independent verification, evidence, and provider
publication. `packages/agent-runtime` is a library. The retired standalone
`apps/workflow-executor` depended on public `workflowRuns` mutations that the
V1 authorization closeout removed; the package now exits as a compatibility
tombstone rather than advertising a broken scheduler.

## Decisions

1. PM2 remains the production process manager, with one canonical process:
   `mission-control-orchestration`. The root ecosystem file resolves the
   checkout dynamically and stores no deployment identity or secret.
2. The standalone workflow executor and its direct-call integrations are
   retired. Re-enabling the legacy CLI, OpenClaw SDK, Telegram runtime, or
   autonomous worker requires a separately reviewed port to signed service
   commands; none is silently redirected or allowed to self-assert authority.
3. No cost ledger is added. Shared/production Factory execution uses the
   existing Attempt-scoped OpenRouter key cap. The per-Attempt cap multiplied
   by `maxAttempts` must fit inside the frozen Factory `maxCostUsd`.
4. Unknown dollar telemetry remains `null`. The hard provider cap—not an
   invented estimate—authorizes execution. Persistent Codex/DeepSeek adapters
   remain local-only while their manifests truthfully declare cost telemetry
   unsupported and no hard provider cap exists.
5. Existing network and secret policy reports become admission inputs. Missing,
   stale, `UNKNOWN`, or `BLOCKED` reports fail worker eligibility; because
   readiness, routing, dispatch, and claim all use that eligibility function,
   the decision cannot be bypassed by selecting a host directly.

## Compliance and boundaries

- Process supervision remains outside application services; the PM2 file only
  launches the built orchestration package.
- Cost policy is a provider-neutral workflow-engine contract consumed by both
  Convex admission and the orchestration runtime.
- Attestation timestamps are server-derived on authenticated host reports.
- Local compatibility is explicit through
  `MC_BACKEND_DEPLOYMENT_CLASS=local`; an unset, shared, or production class
  fails persistent-worker cost admission closed.
- Provider telemetry is evidence, not enforcement authority. A reported value
  above the hard cap is quarantined as a non-retryable result even though the
  provider should have prevented it.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Existing production configuration selects `persistent-worker` | Readiness and claim fail with a precise cost-cap reason; create a remote-sandbox Factory version rather than silently weakening the budget. |
| A worker replays an old attestation timestamp | The server replaces the timestamp on authenticated worker reports and eligibility imposes the same two-minute freshness bound as heartbeat admission. |
| Unknown cost is treated as free | Cost remains `null`; remote execution is allowed only because the provider key is hard-capped. |
| Retries multiply spend | `perAttemptLimitUsd × maxAttempts <= maxCostUsd` is required before readiness, dispatch, claim, and remote execution. |
| PM2 smoke changes an operator's process list | The smoke uses a unique temporary `PM2_HOME` and deletes only its named process before removing that temporary state. |

## Verification

The closeout is qualified by the workflow-engine cost-policy tests, worker
eligibility tests, remote-sandbox runtime budget-exceeded test, orchestration
typecheck and test suites, and `pnpm run smoke:pm2-runtime`.
