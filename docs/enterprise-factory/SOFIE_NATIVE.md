# Preserve and qualify native specialist execution

This checkpoint plan implements the later sections 137 through 160 without replacing MyEve's Agent registry, Work lifecycle, Role catalog, Skill registry, or execution fabric. Runtime changes remain gated on canonical dependency merges and preservation of the UX release candidate.

## Reuse canonical configuration

1. Use `apps/eve/lib/agents.ts` for durable owner-scoped Agent identity and configuration. The conversation tool `agent/tools/manage_agent.ts` and UI APIs `app/api/agents/` already call this module. Preserve owner approval and the prohibition on subagents granting capabilities.
2. Reuse `lib/role-catalog.ts`, `builtin-role-catalog.ts`, and `role-packs/`. The broad RolePack type currently lacks an immutable version/digest. The separate `digital-worker/packs.ts` contract has numeric versions. Reconcile these through an admitted immutable projection, not a third Role registry.
3. Resolve exact qualified Skill/version/digest and dependency graphs after MySkills merges. Required tools and Skill declarations restrict eligibility; they never union permissions into an Agent grant.
4. Persist the Role Pack digest and Agent configuration revision on the existing admitted Work/route context. In-flight executions keep their admitted versions. Revocation denies later effects without deleting history.

## Bound native child execution

Use `agent/tools/workflow.ts`, `lib/delegation-policy.ts`, `lib/task-runs.ts`, and existing specialist task-ledger hooks as the starting point. Task creation, parent linkage, subagent registration/completion, budget checks, and step accounting already exist. The current 16-worker cap is an existing guardrail, not permission for 16 unbounded paid executions.

Each child needs parent Work/version/generation, exact Task and Agent identity, persistent or ephemeral lifetime, Role Pack and Skill pins, environment/harness/model identity, authorized input references, allowed operations, output contract, budget reservation, deadline, verification policy, and cancellation generation. Derive child authority as an intersection of owner policy, parent Work, Agent permissions, Role requirements, qualified Skills, harness, and environment. Do not copy all conversations, Files, Memory, accounts, credentials, or sibling state.

Reserve child allowances transactionally against the parent and owner ceilings. Each paid operation has one paying allowance; parent records track exposure without charging it again. UNKNOWN remains reserved exposure until authoritative settlement. Concurrent reservation of the final allowance admits at most the permitted amount.

Ephemeral teams end with the parent Work. Persistent Agents remain reusable identities but receive fresh exact Work authority for each consequential execution. Parent cancellation propagates fences and observed cleanup. Recovery preserves original Attempts and cannot create replacement paid operations or switch local/cloud providers silently.

## Aggregate evidence against the parent objective

Validate child and Task identity, exact output schema, evidence digests, provenance, resource usage, and completion timestamps. Preserve missing/conflicting results, limitations, PARTIAL, and UNKNOWN. All children reporting success is insufficient for parent verification.

Research checks source provenance, citation validity, coverage, and unsupported claims. Data transformations check schema, row counts, integrity, and output consistency. Code checks candidate identity, tests/build, and independent verification where required. Protected verifier materials remain unavailable to producer Agents.

## Keep owner interactions consistent

Use the same canonical configuration for UI and conversation creation/editing, Role/Skill assignment, tools, model/environment policy, limits, history, disable, and revocation. Show missing qualifications and unavailable environments honestly. Do not say execution started before admission. Changes that expand permissions require the owning authority's decision.

## Deterministic journeys and denial cases

- Create or reuse a Research Analyst and Quality Engineer, evaluate a small fixture application, inspect matching configuration through UI and Sofie, and retain exact Result/Proof.
- Research three synthetic HR platform sources with bounded children, aggregate recruiting/onboarding comparisons, verify the report, and retain provenance. No external research or model spending is needed for this fixture.
- Compose native requirements research, a separately authorized MyFactory employee-profile candidate, and a separately authorized MissionControl enterprise/hybrid Mission. Prior Work never becomes enterprise authority automatically.
- Deny cross-owner Agent access, sibling private context, unqualified/revoked Skill, tampered Role Pack, wrong environment, tool escalation, filesystem/network expansion, and unauthorized publication.
- Exercise duplicate dispatch, coordinator/child crash, stale configuration, lost Result, parent cancellation, last-budget races, UNKNOWN, local/cloud unavailability, and browser reconnect.

## Checkpoint order

After source recovery, qualify exact Agent/Role/Skill projections. Then qualify child admission and transactional budget reservations. Then run coordinator recovery and aggregation. Add UI/conversation parity and three-tier composed journeys last. Keep every native path independently operable without MyFactory or MissionControl. DeepAgents remains unavailable until its existing experimental adapter is reconciled and independently qualified for the required capability set.
