# Unified capability control plane

Status: in progress. This branch is independent of enterprise-factory and external-alpha work.

## Acceptance contract

The mission is complete only when an authenticated canonical platform owner can inspect and change all registered preferences through MyEve and Sofie, Relay can administer existing organization and agent policy, and every canonical backend enforces current policy without expanding Work authority. Both golden journeys and all requested qualification gates must have evidence at exact commits.

No production deployments, paid operations, production grants, credential changes, destructive migrations, or automatic merges are authorized. The original mission attachment is preserved unchanged outside this repository.

## Source inventory

Canonical main revisions fetched from GitHub on 2026-10-09:

| System | Revision | Existing authoritative contracts |
| --- | --- | --- |
| MissionControl | `5308727463ec737589bf8072ee9f5de0af1bba7a` | `convex/lib/companyAccess.ts`, `convex/workOrders.ts`, `packages/policy-engine` |
| MyEve | `2ef364024bc1cdd3e10ec28f3d340119c6f87d41` | `apps/eve/lib/capability-registry.ts`, `web-auth.ts`, `owner-identity.ts`, `execution-auth.ts`, `engineering/route-admission.ts` |
| Relay | `a90625776193031ca2303ba2e2162249d1245479` | `lib/authorization.ts`, `lib/v2/policy/evaluator.ts`, `lib/v2/bootstrap.ts`, `lib/db/schema.ts` |
| MyFactory | `030b1a51017f3159436b93817ed2d5bf6ae18288` | Inventory-only local main. `apps/cloud-control/src/cloud-work-control.mjs`, `production-authority.mjs`, `production-installation.mjs` |
| MySkills | `4942dde4b2a442df3ee45879bb22734c658426df` | Inventory-only local main in skillz. Execution compatibility unqualified. |
| MyApps | No root HEAD | The project root is an uncommitted orchestration workspace with separate active worktrees. No files modified. Installation/runtime compatibility unqualified. |

MyEve resolves signed owner sessions and current durable revocation separately. Its deployment owner ID is installation configuration, with a legacy `owner` fallback. That fallback is not evidence of platform administration. Its route admission reads current Work, provider qualification, budget, version, and generation, then locks scoped Work in PostgreSQL before queuing a writer.

Relay has account memberships, human principals, OWNER roles, capability grants, policy bundles, and a deny-first evaluator. Its bootstrap can create an owner and must not be used for this mission. An account OWNER role alone does not establish platform ownership.

MissionControl resolves authenticated operator subjects, active tenant membership, roles, and company permissions through `convex/lib/companyAccess.ts`. `convex/identity.ts` describes agent identities and is not an owner authentication contract. Main does not contain the active enterprise integration changes. They must not be silently merged or copied into this workstream.

MyEve's `lib/relay/owner/config.ts` has explicit owner-to-Relay account/principal mappings for channel trust. It does not confer platform administration. Its local qualification permits only fixed synthetic identities. Production installation documentation identifies exact hosting projects and resources, but does not provide a current authenticated cross-system platform-administrator record suitable for this mission. No production database was queried.

No inspected contract proves a shared platform-owner identity across these three systems. No real owner has been assigned new policy or privilege.

## Design decision pending

Recommended: MyEve owns durable owner preferences and eligibility resolution. Relay remains the organization and agent policy authority. Each execution backend retains its exact Work authorization and runtime controls. A shared, dependency-free descriptor and resolver package prevents semantic drift.

Alternative: MissionControl owns unified preferences. This adds a required enterprise service dependency to everyday assistance.

Alternative: Relay owns unified preferences. This adds a communication-service dependency to local assistance and broadens Relay's ownership.

The user has been asked to choose. Persistence, service wiring, UI mutations, and cross-system identity binding wait for that answer. The portable registry and pure resolver do not depend on this ownership decision.

## Domain model and interface sketch

`CapabilityDescriptor` identifies a versioned capability, group, owning system, dependencies, supported environments, required setup, qualification, permissions, and revocation behavior.

`PolicySnapshot` contains only trusted server facts with an exact owner, organization, installation, environment, registry version, policy revision, observation time, and expiry. UI bodies and agent text cannot supply it.

`resolveCapabilities(registry, snapshot, now)` returns preference, availability, readiness, lifecycle, authority, reasons, and admission eligibility separately. Its result is not a transferable execution grant. A caller must enforce existing authorization and revalidate current revision atomically at admission.

`PlatformOwnerPolicy` carries an explicit administrator/installation record reference and exact nonproduction identity scope. Matching changes default preferences only. It cannot manufacture availability, credentials, qualification, permissions, budget, or exact Work authority.

Two model shapes were considered sequentially under the user's no-parallel-agent instruction. A flat enabled/status enum cannot represent enabled-but-unqualified or disabled-for-new-work with a live authorized writer. Separate dimensions preserve those distinctions without introducing another execution service.

## Checkpoints

- [ ] A. Complete source inventory and canonical installation identity resolution.
- [ ] B. Implement and qualify versioned descriptors and deterministic resolution.
- [ ] C. Bind platform-owner defaults to canonical authenticated installation and administration records.
- [ ] D. Implement MyEve Settings with audited commands, setup, dependency, budget, and active-Work states.
- [ ] E. Implement Relay administration using existing authorization and the same command contract.
- [ ] F. Implement Sofie inspection and governed mutations through canonical commands.
- [ ] G. Enforce policy at each admission boundary and implement canonical pause/revoke controls.
- [ ] H. Qualify both golden journeys, inheritance, PostgreSQL, concurrency, browser, accessibility, visual regression, fresh clone, and hosted CI.
- [ ] I. Obtain independent security, architecture, product, and disclosure review.

## Execution workflow

Frame the trust boundaries, sketch the domain, implement the smallest verifiable unit, test adversarial cases, record exact evidence, and commit/push coherent checkpoints. Use sequential review passes until an independent reviewer is available. Self-review does not satisfy checkpoint I.

Throughput checkpoint: three isolated worktrees exist. Six systems require compatibility evidence. Identity binding and service ownership are the first unresolved dependencies. Build registry/resolver tests before persistence or UI to avoid turning a preference toggle into authority.
