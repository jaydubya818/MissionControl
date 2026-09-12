# Governed Planning Agent V1

## Outcome

Mission Control can generate a repository-researched Plan candidate from the existing Mission Plan Workspace without copy/paste. The candidate is advisory and editable. Only the existing human mutations can save, submit, reject, or approve a Plan, and approval still releases WorkOrders without starting execution.

## Authoritative path

1. An authorized operator requests a candidate from `MissionPlanWorkspace`.
2. `missionPlanning.request` freezes Mission intent, finalized Spec/Constitution lineage when enabled, active workflows, the active SOFTWARE Factory version, approved agent version, qualified PLAN model route, harness identity, host identity, and the host's exact clean repository SHA.
3. A signed, repository-scoped orchestration worker claims the durable run with a renewable lease and shared host concurrency slot.
4. The worker creates a detached worktree at the frozen SHA. The generic harness runs in `READ_ONLY` isolation with no browser or MCP surface and a request-bound structured-output schema.
5. The research phase returns file paths and line ranges. The worker reopens canonical repository files, rejects traversal and symlink escapes, extracts the cited lines itself, and persists a bounded content digest.
6. The generation phase receives only the frozen input and validated research packet. Worker and server validators reject malformed Plans, invented workflow versions, invalid dependencies, uncovered assertions, unsafe mutating WorkOrders, and invalid Spec references.
7. A successful run persists the original candidate, research packet, exact SHA, model route, agent genome pins, harness pins, phase executions, digests, and an explicit zero-authority statement.
8. The UI applies the candidate to the ordinary Plan editor. Human edits are stored as the Plan; the immutable generated candidate remains on the run for comparison and attribution.
9. Submission and approval revalidate planning provenance. Approval copies the planning SHA into the Quality Contract and each WorkOrder. Tasks and workflow Attempts inherit it, and the Factory execution manifest carries it in causation and repository lineage.
10. SOFTWARE dispatch fails closed when the current canonical worker SHA differs from the approved planning SHA. A new candidate and Plan revision are required after repository drift.

## Durable states and recovery

Runs move through `QUEUED`, `RESEARCHING`, `GENERATING`, `VALIDATING`, and either `SUCCEEDED` or `FAILED`. Leases expire safely, validated research survives a worker restart, and retryable infrastructure failures return to `QUEUED` with a maximum of three attempts. Validation, provenance, read-only boundary, and repository identity failures do not retry automatically.

The Mission Plan Workspace shows the latest status, failure remediation, exact SHA, planner/model identity, attempt count, repository citations, run history, and audit events. Partial output never enters the Plan editor.

## Explicit non-claims

- Planning does not grant submission, approval, execution, verification, publication, merge, acceptance, or learning authority.
- The generic Factory `allowedTools` field is still recorded rather than enforced as a universal per-tool broker. Planning safety comes from the frozen read-only harness/worktree boundary and post-execution Git verification.
- The V1 DeepSeek adapter has only partial structured output and does not accept request-bound schemas. Planning therefore fails before queueing unless the selected Factory harness reports full structured-output support.
- This change does not add a sandbox provider, tool broker, Skill package system, or autonomous merge path.

## Operational prerequisites

- `missions.plan-release-v1` is enabled for the project.
- The Mission has a ready repository matching the workspace repository.
- An active, currently assessed SOFTWARE Factory binds an approved agent and a persistent-worker harness with `READ_ONLY` isolation and fully supported structured output.
- A current clean host binding reports the repository, default branch, worker session, harness pins, and immutable base commit.
- The PLAN model-routing lane resolves a production-qualified model compatible with the frozen harness.
- The orchestration server has signed service-command credentials and the durable Factory worker enabled.

## Primary implementation surfaces

- `convex/missionPlanning.ts`
- `apps/orchestration-server/src/missionPlanningWorker.ts`
- `apps/orchestration-server/src/missionPlanningContract.ts`
- `apps/mission-control-ui/src/eos/views/MissionPlanWorkspace.tsx`
- `convex/lib/executionManifest.ts`
- `convex/lib/qualityContract.ts`
