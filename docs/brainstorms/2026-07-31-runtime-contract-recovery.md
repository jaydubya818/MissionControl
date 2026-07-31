---
date: 2026-07-31
topic: runtime-contract-recovery
---

# Runtime contract recovery

## What we're building

Mission Control will detect when a loaded browser client and the active Convex
backend use different runtime API contracts. The app will stop before mounting
normal query consumers and show a calm, blocking **Update required** recovery
state with a single Reload action. The existing render error boundary will also
recognize Convex argument-validation failures so tabs loaded before this handshake
exists receive the same useful recovery guidance instead of a generic crash.

## Why this approach

Three approaches were considered:

1. Loosen Convex validators to accept old and new fields. Rejected because it
   hides programming errors and weakens workspace and tenant boundaries.
2. Handle validation failures independently in every query consumer. Rejected
   because coverage would be incomplete and repetitive.
3. Add one stable compatibility query above the application plus an error-boundary
   fallback. Selected because it fails closed, centralizes recovery, and remains
   small enough for a bounded cycle.

## Key decisions

- Use one integer runtime-contract version shared by the client bundle and the
  backend query; exact equality is required.
- Mount the compatibility gate inside `ConvexProvider` but above `App`, ensuring
  ordinary application queries do not start until compatibility is confirmed.
- Keep the compatibility query name stable across future versions.
- Treat mismatch as blocking: rendering a partially compatible control plane is
  less trustworthy than asking the operator to reload.
- Keep technical details available for diagnosis without making them the primary
  message.
- Provide a development-only mismatch switch for deterministic browser evidence;
  it is not active in production builds.

## Institutional learning applied

`docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`
requires schema consumers and contracts to ship atomically and explicitly warns
against validator shims. This cycle therefore adds an explicit compatibility
contract and preserves all strict Convex validators.

## Open questions

None for this bounded cycle. Automatic multi-version negotiation and service-worker
cache management are intentionally deferred.

## Next steps

Implement the compatibility query, startup gate, error-boundary classification,
focused tests, browser evidence, and mirrored Mission Control Docs.
