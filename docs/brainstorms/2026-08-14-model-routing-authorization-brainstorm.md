---
date: 2026-08-14
topic: model-routing-authorization
---

# Model Routing Authorization

## What We're Building

Harden the existing Live Model Routing capability so every workspace-scoped
read is authorized, every policy or override write requires the correct
factory permission, and every audit actor is derived from the authenticated
Mission Control membership rather than browser input.

This slice keeps the current global provider catalog, versioned workspace
policies, agent overrides, simulator, immutable decisions, and dispatch
resolver. It does not introduce a second model registry or change how routes
are selected.

## Why This Approach

Three approaches were considered:

1. Secure the existing contract with the shared workspace authorization
   helpers. This closes the current tenant and attribution gap with a small,
   reviewable change.
2. Build a full model-governance lifecycle with candidate, canary, approval,
   evaluation, suspension, and retirement records. This is valuable, but it
   combines a production security fix with a larger product expansion.
3. Demote Model Routing to Preview until a future redesign. This is safe but
   leaves an already-integrated control-plane capability unnecessarily idle.

Approach 1 is the simplest shippable step. The current schema already supports
versioned policies, deprecation, canaries, risk approval, and immutable routing
decisions. Authorization and trustworthy attribution should be fixed before
adding more lifecycle concepts.

## Key Decisions

- Require `factory.read` for active-policy, override, simulation, decision,
  and workspace-catalog reads.
- Require `factory.automation.manage` to initialize the provider catalog,
  activate routing policies, and change enforcement posture.
- Require `factory.improve` for a scoped agent model override; clearing an
  override uses the same permission.
- Derive audit actor and tenant/workspace scope on the server. Remove public
  `actorId` arguments from human model-routing mutations.
- Keep provider health and local-model synchronization service-owned. Do not
  turn a browser session into a fake service identity.
- Preserve the global catalog table for now; expose it only through an
  authorized workspace query.
- Keep routing resolution, precedence, cost behavior, and existing policy
  schema unchanged.
- Add deterministic authorization, cross-workspace denial, audit-attribution,
  loading, permission-error, and success tests.

## Open Questions

- Trusted service authorization for provider-health and local-model sync should
  later move to the signed service-command boundary. The current orchestration
  bearer boundary remains in place for this slice.
- Full model evaluation and retirement governance remains a separate P1
  product decision after this authorization baseline ships.

## Next Steps

Create and execute a focused implementation plan covering Convex read/write
authorization, server-owned audit attribution, the Model Routing UI call
contract, deterministic tests, documentation, and browser verification.
