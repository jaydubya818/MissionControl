# Canonical source inventory

Recovered on 2026-10-09 from GitHub into isolated source stores. Primary checkouts were inspected read-only and preserved. The workspace-local source lock retains all fetched branch identities and open PR metadata. These are source observations, not new live qualification.

| Repository | Default branch commit |
| --- | --- |
| MissionControl | `5308727463ec737589bf8072ee9f5de0af1bba7a` |
| MyFactory | `030b1a51017f3159436b93817ed2d5bf6ae18288` |
| MyEveBot | `2ef364024bc1cdd3e10ec28f3d340119c6f87d41` |
| Relay | `a90625776193031ca2303ba2e2162249d1245479` |
| Skillz | `4942dde4b2a442df3ee45879bb22734c658426df` |

## MissionControl

Paths below are relative to each owning repository.

| Concept | Canonical implementation and store | Integration consequence |
| --- | --- | --- |
| Mission and Specification | `convex/mission.ts`, `missionSpecs.ts`, `lib/missionSpec.ts`; `missions`, `missionSpecRevisions` | Preserve owning tenant/project and exact specification revision. No invented Mission revision counter. |
| Plan | `convex/missionPlanning.ts`, `lib/missionPlan.ts`; `missionPlans.revisionNumber` | Bind approved Plan identity, revision, and digest. |
| WorkOrder and revision | `convex/workOrders.ts`, `lib/workOrderGovernance.ts`, `lib/workOrderRevision.ts`; `workOrders`, `workOrderRevisions` | Bind revision ID and number. Enterprise WorkOrder is not partner WorkOrder. |
| Task and Attempt | `convex/factory/attempts.ts`, `lib/factoryAttempt.ts`; `tasks`, `workflowRuns` | Reuse writer lease/fencing and manifest causation. Do not create an alternate Attempt lifecycle. |
| Factory and version | `convex/factory/configuration.ts`, `lib/factoryConfiguration.ts`; `factoryDefinitions`, `factoryDefinitionVersions`, `factoryReadinessAssessments` | Native definitions are repository-bound. Version row IDs and `factory-v1-*` configuration digests differ from MyFactory's content hash. |
| Execution and harness | `apps/orchestration-server/src/factoryGitRuntime.ts`, `factoryVerification.ts`; `convex/lib/factoryWorkerRuntime.ts`, `factory/executionProfiles.ts` | Preserve local worktree, remote, and isolated-container paths. Harness/profile admission remains separate from registry membership. |
| Model policy | `packages/shared/src/execution-routing.ts`, `convex/lib/modelRouteAdmission.ts`, `factoryModelRoute.ts` | Existing deterministic routing checks policy before scores. No silent post-admission fallback. |
| Authority | `convex/lib/companyAccess.ts`, `deliveryAuthorization.ts`, `factoryActionAuthorization.ts`; company/workspace memberships | Legacy delivery scope can be permissive for unprovisioned installations. New delegated admission must require explicit authenticated tenant/workspace. |
| Service authentication | `packages/shared/src/serviceCommandEnvelope.ts`; orchestration service auth | Existing service envelope is scoped and time-bounded. Its canonicalizer is not a new cross-factory trust grant. |
| Budget and accounting | `convex/factory/providerLiability.ts`, `lib/providerLiability.ts`, `lib/governedInferenceAdmission.ts`; provider reservation tables | Existing operation reservations do not establish cross-factory or three-tier aggregate enforcement. |
| Candidate | `factoryGitRuntime.ts`, `lib/factoryAttempt.ts`; manifest/source/candidate identities on workflowRuns | Compare exact base, candidate, tree, and custody. Never substitute mutable HEAD. |
| Quality Contract and evidence | `lib/missionWorkOrderContract.ts`, `lib/missionExecution.ts`; WorkOrder Quality Contract, verificationReceipts | `missionReceiptMatchesExecution` checks revision and verifier provenance. Partner Result cannot directly mark Mission PASS. |
| Publication and release | `factoryGitRuntime.ts` publication functions, `convex/factory/releases.ts`, `githubCi.ts`, `prChecks.ts` | Separate effect authority; no invocation in this mission. |
| Recovery and incidents | `convex/factory/incidents.ts`, `incidentControls.ts`, `lib/factoryAttempt.ts` | Preserve original Attempts, fences, and evidence. Extend for delegated observations. |
| Skills and memory | `convex/factoryMemory.ts`, `lib/factoryMemory*.ts`, repository `skills/` | Keep local resolution until exact MySkills compatibility is established. |

Existing tests include `factoryAttempt.test.ts`, `factoryConfiguration.test.ts`, `factoryDispatch.test.ts`, `factoryRuntimeGoldenPath.test.ts`, `missionWorkOrderContract.test.ts`, and `missionGovernance.test.ts` under `convex/__tests__`. Their presence is not a PASS claim for this integration.

The relevant institutional learning is `docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`. Add persistence schema, consumers, and generated-type checks together. No `docs/solutions/patterns/critical-patterns.md` exists at this source.

## MyFactory

| Concept | Canonical implementation | Observed constraint |
| --- | --- | --- |
| WorkOrder and Run | `packages/contracts/src/index.ts`, `cloud-execution.ts` | Cloud variants retain canonical entities, replacing local paths with source/workspace references. |
| Cloud intake | `parseCloudPrepare` in `cloud-execution.ts` | `MYFACTORY_EXECUTION_V2`, exact keys, UUIDv4 request/Work IDs on main, exact granted commands/paths, positive USD ceiling. Adding enterprise or Skill fields fails. |
| ExecutionProvider | `apps/supervisor/src/execution-provider.ts`, `local-execution-provider.ts` | prepare/start/cancel/read/reconcile/collect/health/teardown. Resource observation does not dispatch. |
| Cloud execution | `apps/cloud-control/src/cloud-work-provider.mjs`, `cloud-work-lifecycle.mjs`, `postgres-dispatch.mjs` | Existing provider manages source, harness, candidate, and cleanup. Reuse it; do not create another fabric. |
| Production authority | `apps/cloud-control/src/production-authority.mjs` | Transactional exact installed manifest/client/source/configuration/FactoryVersion binding. Current grants are deployment-specific, not enterprise delegation authority. |
| Spend | `packages/storage/src/spend-policy.ts`, `apps/cloud-control/src/postgres-spend.mjs` | PostgreSQL transaction/advisory lock and execution lease; UNKNOWN retained. |
| Result | `packages/hosted-routing/src/result.ts` | `MYFACTORY_RESULT_V1`; Ed25519 signature, artifact bytes, exact request/WorkOrder/Run/version checks. FactoryVersion is 64 lowercase hex. |
| Signature domain | `packages/hosted-routing/src/index.mjs` | Explicit protocol domains. Existing Result signing cannot authenticate a new delegation domain unchanged. |
| Verification | `apps/cloud-control/src/cloud-verification.mjs`, `cloud-verifier-provider.mjs`, `candidate-custody.mjs` | Separate verifier and candidate custody. Result verification contains PASS/FAIL/UNKNOWN and cleanup evidence. |

Private-source and generalized exact Work authority are active dependency work beyond main. The owner chose to wait for their merge. Source-level inspection of the branch does not authorize deployment or alter its qualification.

## MyEve and Sofie

| Concept | Canonical implementation | Observed constraint or gap |
| --- | --- | --- |
| Persistent Agents | `apps/eve/lib/agents.ts`; agents and capability records in PostgreSQL | Durable owner-scoped identities, risk, capabilities, model preferences, status, and limits already exist. |
| Conversation Agent management | `apps/eve/agent/tools/manage_agent.ts` | Direct authenticated owner, approval required, unavailable to subagents. Creation/copy grants no capabilities; profile editing cannot expand limits. |
| Role catalog | `apps/eve/lib/role-catalog.ts`, `builtin-role-catalog.ts`, `role-packs/` | Existing reusable role definitions; do not add another registry. Exact admitted Role Pack digest/revocation still needs end-to-end verification. |
| Role and capability composition | `apps/eve/lib/digital-worker/packs.ts` | Versioned strict role/capability/mode manifests. Role/Skill references describe behavior, not grants. Current Skill refs are not the new governed MySkills resolver. |
| Native multi-agent coordinator | `apps/eve/agent/tools/workflow.ts`, `lib/delegation-policy.ts` | Existing Eve workflow tool caps subagents at 16. A fan-out limit alone does not prove transactional parent/child accounting. |
| Child Task ledger | `apps/eve/lib/task-runs.ts`, `agent/hooks/task-ledger.ts` | Existing task_runs/task_subagents state, one-level delegation, subagent registration/completion, step/cost accounting and budget checks. Extend these contracts; do not create a second child lifecycle. Exact reservation/UNKNOWN coverage requires further qualification. |
| Existing specialists | `apps/eve/agent/subagents/{functional-state,trust-resilience,ux-accessibility}/` | Existing tools, assigned skills, hooks, and sandbox definitions. Reuse qualified contracts; do not equate product-QA specialists with universal dynamic-team qualification. |
| Work and authority | `apps/eve/lib/engineering/types.ts`, `store.ts`, `route-admission.ts`, `routing-store.ts` | Canonical Work version/generation, persisted decisions and route Runs. Admission and per-effect authority are separate. |
| Router | `apps/eve/lib/digital-worker/routing.ts` | Existing DIRECT, DEEP_AGENT, EXECUTOR, MYFACTORY, RELAY and HUMAN semantics. New six logical classifications must project onto these, not replace enums blindly. |
| Native execution | `apps/eve/lib/engineering/native-routing.ts`, `native-execution-controller.ts`, `native-results.ts`, `native-qualification.ts` | Owner/profile/model-bound qualification, sole-writer check, budget UNKNOWN denial, exact admitted deadline. |
| Environment | `apps/eve/lib/environment-fabric/{environment,router}.ts`, `engineering/cloud-environment-routing.ts` | Existing environment and qualification policy. Cloud Factory route does not establish Sofie-native cloud qualification. |
| Factory adapter | `apps/eve/lib/engineering/factory-live-adapter.ts`, `factory-routing.ts`, `factory-result-consumer.ts` | Reuse exact prepare/readback and signed result logic. Avoid importing application code across repositories. |
| Proof and decisions | `apps/eve/components/owner/proof.tsx`, engineering result/return modules | Extend canonical owner projections rather than invent enterprise status in chat. |

The exact parent/child authority, shared allowance reservation, Role Pack digest, Skill revocation, scoped context, coordinator restart, and aggregate verification composition remain gaps to qualify. Persistent Agent APIs and workflow registration are implementation evidence, not T2 PASS.

## DeepAgents

At MyEve main, `docs/setup/deepagent-harness.md` explicitly states the experiment is absent from the release and not registered. Historical `codex/q37-private-alpha-continuation` at `cf83e3bec6f02ca812b2e08e04c188eaa271bede` contains `experiments/deepagents/README.md` and an adapter pinned to deepagents 1.14.1. Its decision is ADAPT / NOT QUALIFIED. It supplies scoped virtual file tools, disables built-in shell/MCP/subagents, and requires host-owned authority, checkpoints, writer fencing, and spend reservation. Stop acknowledgment does not prove billing stopped. Preserve that boundary; do not use this experiment to claim qualified multi-agent DeepAgents execution.

## Relay and MySkills

Relay main has `lib/v2/federation/{contracts,registry,service,transport,signing-envelope}.ts`. Registration and communication capabilities do not grant receiving-system execution. Signing-envelope v2 binds key identity. PostgreSQL policy and budget operations remain Relay-owned. No federation feature is activated here.

Skillz main distributes Skills. The unmerged governed platform adds `myskills/{resolver,registry,composition,qualification,owner}.py`. Its `integration-proposal.md` is explicitly inactive. The resolver checks exact installed graph, qualification/trust, runtime, harness, capability/effects, and revocation. Reference in-memory stores must not become production authority. No runtime consumer is connected in this checkpoint.

## Active dependencies at recovery

| Workstream | Observed source | Required action |
| --- | --- | --- |
| MyFactory private source and Work authority | PR 12, head `fa48a820ba185eb9b891130c78166463b61cba74`, based on private-source integration branch | Wait for canonical merge, then re-inspect. |
| MyEve shared accounting and Work authority | PR 67, head `8338309582d6806829dec1ae1beef301d6b52425`, based on Work-authority branch | Wait for canonical merge, then re-inspect. |
| MySkills platform and initial qualification | PRs 6/7, heads `d57ff77b8522f897fc6ae392cf59b3141295ba82` / `21ae05a7be2f73be1378deb896f138700c473e84` | Wait where resolver integration is required; static qualification is not production trust. |
| MyEve owner experience | branch `codex/myeve-owner-experience`, `5110293cb7dd7d2af8eea490c783c736fee72ff7` | Protected dependency. No edits or merges. |
| Relay owner experience | PR 34, `25def56c72128201002dff0f0f179ad5e3074e6d` | Preserve; UI work does not qualify enterprise transport. |

No MissionControl PR was open at recovery. This inventory is a bounded source review; complete runtime/security qualification remains required.
