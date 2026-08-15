---
title: Model Routing authorization validation
date: 2026-08-14
status: passed-with-live-gates
owner: Product Architecture
---

# Model Routing authorization validation

## Result

The existing Model Routing surface is hardened at its public Convex boundary.
Workspace reads now require `factory.read`; policy/catalog/enforcement writes
require `factory.automation.manage`; agent overrides require `factory.improve`;
and Work Order overrides require `factory.approve` plus delivery approval.
Routing write actors are derived from authenticated membership on the server.

Provider-health reporting and local catalog sync are internal-only. The browser
sync action is intentionally disabled until a signed workspace-scoped service
command exists.

## Automated evidence

Passed:

- `pnpm exec vitest run convex/__tests__/modelRoutingAuthorization.test.ts convex/__tests__/companyAccess.test.ts convex/__tests__/featureFlags.test.ts`
  - 3 files, 33 tests
- `pnpm --filter @mission-control/model-router test`
  - 15 tests
- `pnpm run typecheck`
  - all 19 workspace packages
- `pnpm --filter mission-control-ui typecheck`
- `pnpm --filter @mission-control/orchestration-server typecheck`
- `pnpm run lint`
  - full workspace typecheck and skill lint passed
- `pnpm run build`
  - all workspace builds passed; Vite reported only the pre-existing large-chunk
    advisory

Focused authorization coverage proves anonymous denial, authorized access,
cross-workspace denial, insufficient-permission denial, server-derived audit
actors, internal-only service mutations, parent-scoped decision reads, and
approval authority for Work Order overrides.

## Browser evidence

Validated at `http://localhost:5199` against the Software Factory Demo workspace:

- Model Routing catalog, policy editor, simulator, decisions, and shadow/enforced
  transition rendered with the current authorized functions.
- A policy was activated, enforcement was enabled, and the workspace was returned
  to shadow mode.
- MC Atlas was assigned `operator-powerful`; the detail view reported `Agent
  override`; the override was then cleared and the detail view returned to
  `Workspace default`.
- The agent flow exposed and fixed a stale selected-agent version race. The
  registry now passes the latest reactive agent document into the settings panel.
- The Model Routing page surface passed the scoped WCAG 2 A/AA, WCAG 2.1 A/AA,
  and WCAG 2.2 AA Axe scan in both dark and light themes.
- Screenshots: `output/playwright/model-routing-authorization.png` and
  `output/playwright/model-routing-authorization-light.png`.

The Agent Registry still logs its existing unavailable `/gateway/status` request
when the optional gateway is not running. That connector error is unrelated to
Model Routing and does not affect the tested save/restore flow.

## Local environment note

The preserved Research Lab database contains a legacy
`repositoryCodeScopes.approvalPolicyDescription` field that is not accepted by
the current source schema. This initially blocked `convex dev --once`. No data
was deleted. The field was accepted temporarily only to deploy the local function
bundle, and the source schema was restored unchanged afterward. Cleaning this
stored schema drift remains an environment-hygiene gate before relying on a fresh
Research Lab deploy as release evidence.

## Required live gates

These are not simulated or claimed as complete:

1. Run a fresh Live READY canary and retain the receipt, audit, pull-request, and
   release evidence.
2. Use two real Clerk identities from different companies to prove cross-company
   read and write denial.
3. Implement a signed workspace-scoped orchestration command before re-enabling
   local model catalog sync.

## Post-deploy monitoring and validation

Validation window: first 24 hours and the first 25 routed runs after deployment.
Owner: the workspace Factory owner/operator.

Watch activity and error logs for:

- `MODEL_ROUTING_POLICY_ACTIVATED`
- `AGENT_MODEL_OVERRIDE_SET` and `AGENT_MODEL_OVERRIDE_CLEARED`
- `WORK_ORDER_MODEL_OVERRIDE_SET` and `WORK_ORDER_MODEL_OVERRIDE_CLEARED`
- `FEATURE_FLAG_SET` for `model-routing.enabled`
- anonymous, insufficient-permission, and unavailable-or-unauthorized errors

Healthy signals:

- no protected routing record is returned across workspace boundaries;
- every routing write is attributed to a real operator ID or the explicit demo
  actor, never a browser-provided placeholder;
- shadow mode remains the default until the canary evidence is reviewed;
- the disabled local sync returns no false success. Direct POSTs to the legacy
  endpoint return HTTP 501.

Rollback: return Model Routing to shadow mode first. If authorization or routing
behavior remains incorrect, revert this change set and redeploy the previous
function bundle. Do not reopen the public local-sync mutation as a rollback.
