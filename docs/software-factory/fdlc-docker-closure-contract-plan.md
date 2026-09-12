# FDLC Docker closure — public contract change plan

Written before implementing current public contract changes. Baseline main:
`0d1a0908cce380d815069ce0a59e1604d2f26ece`, contract v41. Preserve the separate
historical readiness v40 fork and all previous qualifications. Integrate current
main, then advance exactly once to v42 when these changes are implemented.

Intended public API differences versus current main:

1. Retain the already implemented `workOrders:readiness` query from f82fe1d,
   with its existing workspace/WorkOrder/revision-bound authorization contract.
2. Add `factory/providerLiability:registerPriceVersion`: authenticated workspace
   automation manager; exact provider/model, source/effective/expiry, integer
   inclusive input/output rates, billing semantics and bound evidence, immutable
   digest and idempotency. Registration never certifies provider behavior.
3. Add `factory/providerLiability:createReservation`: authenticated automation
   manager; exact workspace/WO revision/profile/route/price, eligibility constraints,
   integer ceiling, expiration, idempotency. No dispatch authority.
4. Add `factory/providerLiability:getReservation`: scoped VIEW query; safe
   reservation/hold/settlement evidence, no payloads or credentials.
5. Add `factory/providerLiability:reconcileUsage`: authenticated automation manager;
   exact request/receipt and revision, corroborated correction and explicit retained
   unknown liability. Never implicitly release unknown holds.
6. Add signed-service action `serviceCommands:reserveProviderRequest`: authenticated
   scope/capability/lease/generation-bound pre-send reservation through an internal
   atomic mutation. No caller-chosen price or free-form endpoint authority.
7. Add signed-service action `serviceCommands:recordProviderUsage`: same authority,
   exact request/model/usage linkage and duplicate-safe settlement. No refund on
   unknown response, stale lease or unsupported billing categories.

Internal schema/index/mutations and generated API types must change atomically.
Authoritative codegen must generate types; do not edit generated files manually.
New Docker/broker profile fields and validation semantics are part of this v42
change; unrelated main features are retained, not reimplemented or removed.
Any material revision to this intended surface must be documented here before
coding that revision. No model calls, production mutation or WO1 dispatch.

## Recovery refinement (before implementation)

Within the planned v42 internal recovery semantics, reconcile a Docker REQUESTED
journal that lacks a provider resource ID by exact resource name, frozen image,
Attempt lease and manifest. A recovered receipt carries a versioned request proof;
if no container exists, omit its unknown ID rather than fabricate one. The
existing signed reconciliation action and internal mutation validate that proof
against the durable journal and inactive canonical lease. No new public operation
or authority is added. Known-ID receipts retain their existing exact-ID checks.

Recovery review refinement: an empty lookup cannot establish that an outstanding
Docker create will never complete. Therefore a request without a discovered ID
remains unresolved; it cannot issue an absence receipt. Recovery receipts require
an observed exact ID before teardown. Known-ID repeated absence remains supported.
