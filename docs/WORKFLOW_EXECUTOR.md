# Worker runtime deployment

## Canonical production process

`apps/orchestration-server` is the canonical long-running Mission Control
worker. It owns the signed service-command boundary, host reporting, governed
Factory Attempt claims, execution, independent verification, evidence, and
provider publication.

The root `ecosystem.config.cjs` is the canonical PM2 definition and contains one
process: `mission-control-orchestration`. It resolves the repository root at
runtime and contains no deployment URLs, credentials, project IDs, or operator
identity.

Build and start it from the repository root:

```bash
pnpm install --frozen-lockfile
npm install --global pm2@6
pnpm run ci:prepare
pnpm --filter @mission-control/orchestration-server build
pnpm run pm2:start
```

Runtime configuration belongs in the deployment environment or `.env.local`;
never add secrets to the PM2 file. At minimum, configure `CONVEX_URL` and the
orchestration/service-command identity described in `.env.example`.

Operational commands:

```bash
pnpm run pm2:reload
pnpm run pm2:logs
pnpm run pm2:stop
pnpm run smoke:pm2-runtime
```

The smoke command builds the orchestration server, starts it with PM2 in an
isolated temporary PM2 home, waits for `/health`, and removes the isolated
process state. It does not connect a Factory worker or mutate a provider.

## Cost and attestation admission

Shared and production deployments admit only remote-sandbox Factory versions
whose Attempt-scoped provider key caps add up to no more than the frozen
Factory `maxCostUsd` across `maxAttempts`. Provider telemetry may remain
unknown; the hard key cap is the enforcement authority.

Persistent Codex and DeepSeek adapters currently report dollar cost as unknown
and have no provider-side hard cap. They remain available only when the Convex
backend explicitly declares `MC_BACKEND_DEPLOYMENT_CLASS=local`. A shared or
production backend fails their Factory readiness and claim checks closed.

Every production-capable worker report must also carry current `READY`
`CODEX_WORKER_NETWORK_POLICY_STATUS` and
`CODEX_WORKER_SECRET_POLICY_STATUS` attestations. Missing, stale, `UNKNOWN`, or
`BLOCKED` values prevent readiness and dispatch.

## Retired standalone scheduler

`apps/workflow-executor` is retained only as an explicit retirement tombstone;
starting it exits with an actionable error. Its legacy public `workflowRuns`
mutation surface and the old `WorkflowExecutor` implementation were removed
during the V1 authorization closeout. Do not point PM2 at it and do not
substitute `packages/agent-runtime`; that package is a library, not a runner.

The unauthenticated OpenClaw SDK, Telegram control runtime, autonomous Task
worker scripts, and legacy workflow CLI are disabled for the same reason: an
Agent ID, bot username, or lease label is not service authentication. This is
an intentional V1 compatibility break recorded by Runtime Contract v33.

If one of these integrations is needed again, port its exact capabilities to
the signed service-command boundary as a separately approved change before
re-enabling a long-running deployment.
