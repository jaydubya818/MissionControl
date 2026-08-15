---
title: "fix: Harden Model Routing authorization"
type: fix
status: complete
date: 2026-08-14
owner: Product Architecture
risk: red
---

# Harden Model Routing authorization

## Overview

Model Routing is marked Live, but its catalog, policy, override, simulator, and decision functions currently trust workspace IDs and browser-supplied actor IDs without consistently enforcing company membership or permissions. Secure the existing contract before adding any adaptive-routing or ROI features.

This is a boundary-hardening change, not a routing redesign. The resolver, policy schema, and factory configuration contract remain unchanged.

## Problem this solves

- A caller can read routing data for a workspace it does not belong to.
- A caller can activate a policy or change an agent override without the matching factory permission.
- Audit records can attribute writes to the browser-provided string `"operator"` instead of the authenticated operator.
- The global model catalog is exposed without an authorized workspace context.
- Local-model synchronization is exposed as a public Convex mutation even though it is service-owned.
- A Live surface cannot be trusted until its reads, writes, audit attribution, and denied states fail closed.

## Chosen approach

Reuse `requireWorkspacePermission` and the existing company/factory permission model at every public Model Routing boundary.

| Operation | Required permission | Actor source |
| --- | --- | --- |
| Catalog, active policy, simulator, routing decisions | `factory.read` | Authenticated membership |
| Initialize catalog, activate policy, change enforcement posture | `factory.automation.manage` | Server-derived operator ID |
| Set or clear an agent override | `factory.improve` | Server-derived operator ID |
| Provider health and local model synchronization | Internal/service-owned | Not accepted from browser |

The catalog remains global in storage for V1, but every public catalog read requires a workspace ID solely to establish authorization. This avoids a premature schema migration while removing anonymous access.

## Product and flow contract

### Authorized viewer

1. Opens Model Routing for the active workspace.
2. Sees the approved catalog, active policy, simulator, and recent decisions.
3. Cannot mutate policy or overrides unless its role grants the required permission.

### Authorized manager

1. Initializes default catalog records or activates a new policy.
2. Server resolves the operator from the authenticated Clerk subject.
3. Activity and audit evidence use the resolved operator ID and workspace tenant.
4. Invalid, deprecated, or unavailable model references fail before activation; high/critical decisions still require risk approval in the resolver.

### Authorized improver

1. Opens an agent belonging to the active workspace.
2. Sets or clears a model override.
3. Server verifies both workspace access and agent ownership before writing.
4. Audit evidence records the resolved operator ID.

### Denied and exceptional states

- Anonymous production calls fail closed.
- A member of another company receives a generic unavailable-or-unauthorized error.
- Cross-workspace agent, task, or workflow-run IDs do not leak routing data.
- Demo access remains available only behind `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` and receives the deterministic demo actor.
- UI mutations expose loading, success, and actionable failure feedback without optimistic false success.
- Local model discovery is not presented as a working browser action until a signed service boundary exists.

## Implementation plan

### Phase 1 — Backend authorization boundary

- [x] Add `projectId` to the public catalog query and enforce `factory.read`.
- [x] Require `factory.automation.manage` for default catalog initialization and derive audit actor/tenant server-side.
- [x] Make provider-health and local-model synchronization internal-only; remove any public unauthenticated mutation path.
- [x] Require `factory.read` for active-policy, simulator, override, and decision queries.
- [x] Require `factory.automation.manage` for policy activation and derive the actor server-side.
- [x] Require `factory.improve` for override writes, verify the agent belongs to the workspace, and derive the actor server-side.
- [x] Resolve task and workflow-run workspace ownership before returning routing decisions.
- [x] Protect the Model Routing enforcement feature flag with `factory.automation.manage` and server-derived attribution.

### Phase 2 — Client contract and truthful states

- [x] Pass the active `projectId` to every catalog query.
- [x] Remove all browser-supplied Model Routing actor IDs.
- [x] Remove or explicitly disable browser local-model discovery until a signed service command is implemented.
- [x] Preserve loading, success, and error feedback for policy and agent-override writes.
- [x] Ensure task and execution inspectors still load decisions through their authorized parent record.

### Phase 3 — Verification

- [x] Add focused authorization tests for anonymous, authorized, insufficient-permission, and cross-workspace calls.
- [x] Add audit-attribution tests proving browser actor spoofing is impossible.
- [x] Run Model Routing and company-access tests.
- [x] Run Convex generation/type checking and the affected UI test/build checks.
- [x] Browser-test the Model Routing route and agent override flow on the Research Lab demo at `http://localhost:5199`.
- [x] Record any live-Clerk or external-service validation that cannot be proven locally as a named release gate rather than simulated evidence.

## Acceptance criteria

- Every public Model Routing query and mutation is authenticated and authorized in workspace context.
- No Model Routing public mutation accepts or trusts an `actorId` from the client.
- Cross-company and cross-workspace IDs fail with a generic denial and reveal no protected record.
- Agent overrides cannot target an agent from another workspace.
- Policy activation cannot reference a catalog entry that is missing, deprecated, or unavailable; high/critical decisions and Work Order overrides require risk approval.
- Global catalog storage is not anonymously readable.
- Local-model sync and provider-health writes are internal-only.
- Existing demo behavior remains deterministic when the explicit anonymous demo flag is enabled.
- Model Routing and agent settings render and complete their primary flows in the browser without console errors.

## Explicit non-goals

- Adaptive routing or autonomous policy optimization.
- New model-provider lifecycle tables or a catalog schema migration.
- Full signed local-inference service-command support.
- Cost/quality ROI dashboards or Outcome Contracts; those follow after the control boundary is trustworthy.
- Changes to resolver ranking or factory configuration freezing.

## Risks and mitigations

- **Existing callers omit `projectId`.** Update all in-repo catalog callers atomically and rely on TypeScript generation to catch omissions.
- **Auth initializes after the first reactive query.** Preserve the existing authenticated application shell; use explicit loading/error states where the route can render before auth is ready.
- **Local discovery temporarily loses a UI action.** Prefer an honest unavailable state over keeping an unauthenticated service write on a Live surface. Signed service sync is a separate follow-up.
- **Permission names drift.** Reuse `FACTORY_PERMISSIONS` constants instead of string literals.
- **Global catalog could be mistaken for tenant-owned data.** Document that workspace context authorizes access but does not yet scope catalog contents; revisit only when provider governance needs tenant-specific records.

## Verification evidence

- Focused unit/integration test output for authorization and cross-workspace denial.
- Typecheck/build output proving all catalog and mutation callers use the new contract.
- Browser evidence for catalog load, policy activation feedback, and agent override feedback.
- A separately named real-Clerk cross-company denial gate before production promotion.
- [Validation results](/Users/jaywest/MissionControl/docs/testing/2026-08-14-model-routing-authorization-results.md)

## References

- [Model Routing operations](/Users/jaywest/MissionControl/docs/software-factory/MODEL_ROUTING_OPERATIONS.md)
- [Clerk company authorization plan](/Users/jaywest/MissionControl/docs/plans/2026-07-31-feat-clerk-company-authorization-plan.md)
- [Mission Control north star](/Users/jaywest/MissionControl/docs/product/mission-control-north-star.md)
- [Convex authentication in functions](https://docs.convex.dev/auth/functions-auth)
- [Convex authentication and authorization overview](https://docs.convex.dev/auth/overview)
- [Convex authentication debugging](https://docs.convex.dev/auth/debug)

## Follow-up sequence

1. Run a fresh Live READY canary and capture real evidence.
2. Execute a real Clerk cross-company denial proof using two identities.
3. Add Outcome Contracts and factual cost/quality telemetry.
4. Add the accountable Factory owner and adoption gate.
5. Revisit signed local-inference sync and provider lifecycle only when required by a real operator workflow.
