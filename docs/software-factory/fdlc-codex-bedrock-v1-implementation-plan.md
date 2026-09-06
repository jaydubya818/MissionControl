# codex/bedrock-v1 offline implementation

Owner approval: attachment f55036a1, 2026-09-05. Start from local c9d7620 on main
eb438f5. No AWS credential access or calls; no live pricing, reservation, profile,
Factory Version, WO1, readiness, push or publication. Preserve previous evidence.

1. Add a distinct experimental Bedrock manifest, sharing only common Codex execution
   mechanics. Preserve codex/v1 manifest/config and historical digests unchanged.
2. Define a bounded host inference bridge using existing Bedrock serialization and
   the canonical Convex reservation/usage service commands. Bind Attempt, WorkOrder,
   revision, lease/generation, profile, harness, runtime, backend, route and price.
   Zero retries; full holds for ambiguous requests; no secrets in workload context.
3. Translate only qualified Codex local Responses input/output into Bedrock Converse;
   this is an explicit protocol translation, not a provider alias. Unsupported fields
   fail closed. Qualify text/tool cycles with bounded non-streaming provider calls.
4. Integrate Docker transport without adding network egress, mounts or container AWS
   credentials. Exact new bootstrap/image bytes, if required, are separately recorded
   and qualified; never overwrite the old image identity or qualification.
5. Derive fixture Execution Profiles/Factory and independent verifier identities.
   Account fields stay required config. Fix ordinary engineering findings and repeat
   affected gates. Independent architecture/security/data/simplicity/docs reviews.
6. Fetch current main, semantically reconcile any advance, run focused, Docker and
   current System qualification, preserve evidence and make local commits only.

## Public contract plan before implementation

Current main v42, existing candidate v43. No second version increment. Reuse the
seven existing additions: workOrders:readiness; factory/providerLiability:
registerPriceVersion, createReservation, getReservation, reconcileUsage;
serviceCommands:reserveProviderRequest, recordProviderUsage. No new public operation
or removal proposed. Narrow additive governed bridge identity is carried through
existing service-command payloadJson and internal validators; reserve return evidence
binds the admitted request. Re-evaluate actual diff before final codegen/qualification.
No new budget table, router, Attempt state or verifier authority.

Review-driven schema addition: two indexes on existing factoryProviderUsageEvents
(provider + usage ID; provider + provider request ID) enforce cross-reservation
receipt ownership in the same transaction. No new table or public operation.
Existing reserve service payload additionally binds exact bridge identity; requires
Converse pricing. Authoritative codegen required before final qualification.

## Implemented refinements from actual CLI and independent review

The existing `factory/configuration:createSandboxProfile` public mutation now also
accepts optional explicit provider and Docker qualification evidence. This is one
changed public operation in addition to the seven additions; zero removals. The
Docker admission descriptor is distinct from EXE_DEV and uses network-none evidence,
not VM/nftables evidence. Schema adds DOCKER/DOCKER_STDIN values and two receipt
indexes. Runtime contract remains the single v42→v43 transition.

Host configuration selects the exact route, canonical reservation and price digest.
A dormant SDK transport is implemented for later separately authorized qualification:
fixed us-east-1 endpoint, maxAttempts=1, explicit temporary credential envelope,
no default credentials/profile discovery. No credential source was read during this
implementation. All SDK tests inject synthetic envelopes and fake clients. The live
call grant, independently verified AWS identity/topology evidence, qualified pricing,
route/profile and operator authorization remain external prerequisites.

Actual Codex CLI qualification uses a disposable repository, Docker network none,
a signed service-command fixture and the canonical worker provider composition.
It exercises two Converse fixture requests, a command tool result, final structured
result and an exact patch. CLI web search and reasoning are explicitly disabled.
Optional encrypted-reasoning inclusion hints generate no reasoning content and are
not sent to Bedrock. No live candidate, admission or verification record is issued.
