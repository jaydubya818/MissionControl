# Exact-owner isolation recovery

Implementation checkpoint; final evidence is reported separately. Historical Golden Journey FAIL evidence remains unchanged.

## Canonical policy

`convex/lib/missionAccess.ts` authorizes an authenticated active operator in the Mission's active tenant. `missions.ownerOperatorId` is the immutable identity reference used for ownership, changed only by an explicit owner transfer. Display names, organization membership and the Owner role never grant access. Existing company/workspace permissions still constrain operations.

Existing `missionAssignments` supply explicit collaboration. Both the assignment's frozen `operatorId` and the active `orgMembers.operatorId` must match the authenticated operator, tenant, workspace and activation window. STAKEHOLDER reads; CONTRIBUTOR reads and contributes to plans; REVIEWER reads and records validation/verification evidence. Approval, service delegation, assignment administration and ownership transfer require the exact owner. An OWNER assignment does not independently promote its member to canonical ownership.

No existing audited administrative policy granting cross-owner Mission access was found. Company administration remains available under its existing policy; Mission access requires an explicit grant. This change creates no organization-wide administrator bypass.

## Backend enforcement

The shared Convex builders in `missionScopedFunctions.ts` enforce policy on reads, lists, searches, pagination, subscriptions and writes. Schema-derived lineage follows typed and opaque references across resource tables, including typed children of polymorphic parents and logical graph endpoint checks. Shared identities are projected separately. Writes validate their old and new scope. Request-local memoization is cleared after mutations; there is no persistent authorization cache. Grant expiry schedules a canonical write so subscriptions retract access.

Mission-sensitive projections retain their source Mission references. Unresolved legacy inference comparisons and Mission failure/signal summaries remain hidden. New review signals require an unambiguous canonical PR/WorkOrder/Mission association; unresolved source events remain in their original ledger for later reprocessing. Shared repository webhook health excludes free-form result/error text. Invalid-signature duplicate webhook deliveries cannot alter accepted records.

This touches many backend modules because each public builder import must use the canonical boundary. The permanent AST surface test rejects a new raw public builder. Existing domain-handler tests explicitly use in-memory boundary doubles where their context is not a real Convex database. Those unit passes are business-regression evidence, not Mission authorization evidence; the disposable real-database suites exercise the actual boundary.

## Service authority

Existing `approvalDecisions` store owner-audited `SERVICE_ATTEMPT_ACCESS` grants. The generic approval APIs cannot mint them. Each grant binds tenant, project, owner, Mission, WorkOrder/revision, Attempt, Factory, FactoryVersion/configuration, execution manifest, repository, verifier subject/source, predecessor handoffs, expiry and allowed effects.

Only six signed Attempt lifecycle actions permit credential-only access. Every allowed internal effect rechecks current canonical authority transactionally; nested calls and scheduled verifier work retain the grant. Other actions require an authenticated principal. A service grant cannot promote a Plan, assign ownership, spend with a provider or publish. The service can reference its bound verifier input and validated predecessor handoff policy without receiving unrelated WorkOrders.

Shared accounting admission uses narrow raw aggregate reads to preserve project-wide exposure and independent provider/inference exclusions. It does not return foreign records to callers.

## Migration and rollout

`migrations/bindMissionPrincipals.ts` is internal, dry-run by default and paginated. Apply freezes only unambiguous existing operator/member references, preserves resolvable active collaboration, schedules grant expiry and records audit evidence. Unresolved owners or members are reported and remain inaccessible. Existing frozen ownership is never silently rebound. No production migration has been executed.

Before any eventual deployment: review all dry-run unresolved rows, approve their explicit ownership separately, apply the migration, validate counts and rerun readback. Rolling back the schema fields is unnecessary; preserve the recorded identities and audit history. Do not roll back to tenant-wide visibility.

## Qualification boundaries

Real database tests cover owner/tenant denial, collaborator capabilities/revocation, actual reactive subscriptions, identity rebinding, expiry, concurrent writes, migration idempotence, alternate Task routes, graph provenance, PR summaries, webhook audit and generic service-grant rejection. Native and hybrid execution exercise signed anonymous service calls and immutable tuple mutants. Accounting tests include foreign-owner project exposure and shared provider/inference authority.

Full source-stable, fresh-clone, hosted and independent-review results belong in the checkpoint report. Keep the release gate ADVISORY. Recruiting UI is NOT_RUN (the partner fixture implements only a slug utility). The Sofie contract fixture and demo browser shell do not qualify the live consumer or authenticated browser journey. Claude review remains separate from Codex security review. No merge, deployment, paid operation or publication is authorized by this checkpoint.

## Cached data and shared agents

Workflow/agent metrics, standups, pattern audit events, monitoring alerts and cost alerts retain their canonical source references. Legacy copies lacking trustworthy provenance fail closed. Shared agent identity remains readable; its current Task is included only when authorized, legacy unbound error text/count is omitted, and `authorizedRunSpendToday` is the sum of authorized bound Runs since UTC midnight. `spendToday` remains a compatibility alias for this subtotal, identified by `spendScope=AUTHORIZED_RUNS_UTC_DAY`; it is not the stored fleet total. UI labels state the visible scope and do not infer remaining global budget from it.

Budget admission and additive updates use the actual stored aggregate through the narrow authority helper. Public heartbeat/spend responses and denial text do not disclose that aggregate. Shared-capacity decisions still permit indirect capacity inference; this checkpoint does not claim noninterference of shared budgets. Per-owner budget partitioning is outside this correction.

Resource ancestry is bounded at 256 records and fails closed beyond that bound. Accumulating summaries may become unavailable rather than leak private data. Large-enterprise summary performance/availability is not qualified by this checkpoint and must be addressed before claiming that support.

Independent Codex source review passed the bounded isolation correction after legacy-cache repairs. It is separate from the required Claude review and from source-stable execution evidence.

## Delegated integration inputs

A downstream grant's recomputed dependency digest binds exact completed predecessor handoffs. Runtime-only authority carries those handoff identities. Lineage inspection recognizes their identity text only in execution input snapshots and the own-WorkOrder retained offline request input and resulting candidate file content; stored/returned input bytes remain unchanged. This does not authorize direct predecessor handoff, WorkOrder, Attempt, candidate or Result reads or writes. Other embedded references still follow ordinary lineage. Changed dependencies or canonical handoffs invalidate the old grant.
