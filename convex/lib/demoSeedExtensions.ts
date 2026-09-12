/**
 * Extra demo seed data for EOS / Registry / Harness pages.
 * Called from seedMissionControlDemo after core ARM + ops data.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deriveVerificationStatus } from "./workOrderGovernance";
import { sha256Hex } from "./harnessPrChecks";
import { seedFactoryMemoryGoldenPath } from "./factoryMemoryDemoSeed";
import { internal } from "../_generated/api";
import {
  analyzeSpecPlanConsistency,
  evaluateMissionSpecQuality,
  missionSpecDigest,
  projectConstitutionDigest,
} from "./missionSpec";
import {
  demoMissionPlanAssertions,
  demoMissionPlanBlueprint,
  demoMissionSpecRevision1,
  demoMissionSpecRevision2,
  demoMissionSpecRevision3,
  demoProjectConstitution,
} from "./missionSpecDemo";
import { compileApprovedPlanQualityContract } from "./qualityContract";
import { compileMissionWorkOrderContract } from "./missionWorkOrderContract";
import { missionIntentContributionDigest } from "./missionIntentContributions";
import { createWorkOrderRecord } from "./workOrderCreate";
import {
  MISSION_CONTROL_GOLDEN_SUITE_V1,
  buildEvalBaseline,
  canonicalDigest,
  evaluateSuiteRun,
  evalSuiteDigest,
  type EvalRunReceipt,
} from "@mission-control/shared";

export type DemoSeedContext = {
  tenantId: Id<"tenants">;
  projectId: Id<"projects">;
  now: number;
  seedTag: string;
  seedVersion: string;
  withSeedMeta: (seedKey: string, extra?: Record<string, unknown>) => Record<string, unknown>;
};

const REPO_SLUG = "jaydubya818/MissionControl";

async function seedSharedIntentContributions(ctx: MutationCtx, input: DemoSeedContext, missionId: Id<"missions">) {
  const { tenantId, projectId, now } = input;
  const mission = await ctx.db.get(missionId);
  if (!mission?.currentSpecRevisionId) return;
  const revisions = await ctx.db.query("missionSpecRevisions")
    .withIndex("by_mission_revision", (q) => q.eq("missionId", missionId))
    .order("desc").take(3);
  const current = revisions.find((item) => item._id === mission.currentSpecRevisionId);
  const prior = revisions.find((item) => item._id !== mission.currentSpecRevisionId);
  if (!current || !prior) return;

  const specs = [
    {
      idempotencyKey: "mc-demo:intent:qa-stale:r1",
      contributionKey: "QA-AC-001",
      revisionNumber: 1,
      spec: prior,
      contributorRole: "QA" as const,
      targetSection: "ACCEPTANCE_EXPECTATIONS" as const,
      targetItemId: "AC-001",
      title: "Prove permission denial",
      body: "An unauthorized builder is denied without changing the Mission Spec.",
      evidenceExpectation: "Authorization test and browser-visible denied state.",
      proposedBy: "qa-partner@example.com",
      proposedActorType: "HUMAN" as const,
      proposedActorSource: "DEVELOPMENT_FALLBACK" as const,
      proposedAt: now - 18 * 60_000,
    },
    {
      idempotencyKey: "mc-demo:intent:product-conflict:r1",
      contributionKey: "PRODUCT-OUTCOME-001",
      revisionNumber: 1,
      spec: current,
      contributorRole: "PRODUCT" as const,
      targetSection: "OUTCOME" as const,
      title: "Reduce governed planning time",
      body: "A first-time builder reaches a planning-ready exact Spec in under fifteen minutes.",
      evidenceExpectation: "Observed time from Mission creation to finalized Spec.",
      proposedBy: "product-partner@example.com",
      proposedActorType: "HUMAN" as const,
      proposedActorSource: "DEVELOPMENT_FALLBACK" as const,
      proposedAt: now - 12 * 60_000,
    },
    {
      idempotencyKey: "mc-demo:intent:design-conflict:r1",
      contributionKey: "DESIGN-OUTCOME-001",
      revisionNumber: 1,
      spec: current,
      contributorRole: "DESIGN" as const,
      targetSection: "OUTCOME" as const,
      title: "Make decision state immediately legible",
      body: "The current contribution state and next safe action are understandable without knowing the harness.",
      evidenceExpectation: "Keyboard and narrow-width browser evidence with state labels.",
      proposedBy: "design-agent",
      proposedActorType: "AGENT" as const,
      proposedActorSource: "SERVICE_COMMAND" as const,
      proposedAt: now - 10 * 60_000,
    },
    {
      idempotencyKey: "mc-demo:intent:engineering-accepted:r1",
      contributionKey: "ENGINEERING-RECOVERY-001",
      revisionNumber: 1,
      spec: current,
      contributorRole: "ENGINEERING" as const,
      targetSection: "CONSTRAINTS" as const,
      title: "Preserve recovery lineage",
      body: "A rejected or stale contribution remains inspectable and can be revised against the current Spec.",
      evidenceExpectation: "Refresh proves immutable history and a recoverable revise action.",
      proposedBy: "engineering-partner@example.com",
      proposedActorType: "HUMAN" as const,
      proposedActorSource: "DEVELOPMENT_FALLBACK" as const,
      proposedAt: now - 8 * 60_000,
      accepted: true,
    },
  ];
  for (const spec of specs) {
    let contribution = await ctx.db.query("missionIntentContributions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", spec.idempotencyKey)).first();
    const digestInput = {
      contributionKey: spec.contributionKey,
      revisionNumber: spec.revisionNumber,
      missionSpecRevisionId: String(spec.spec._id),
      missionSpecDigest: spec.spec.digest,
      contributorRole: spec.contributorRole,
      targetSection: spec.targetSection,
      targetItemId: spec.targetItemId,
      title: spec.title,
      body: spec.body,
      evidenceExpectation: spec.evidenceExpectation,
      proposedBy: spec.proposedBy,
      proposedActorType: spec.proposedActorType,
      proposedActorSource: spec.proposedActorSource,
    };
    if (!contribution) {
      const contributionId = await ctx.db.insert("missionIntentContributions", {
        tenantId, projectId, missionId,
        missionSpecRevisionId: spec.spec._id,
        missionSpecDigest: spec.spec.digest,
        idempotencyKey: spec.idempotencyKey,
        contributionKey: spec.contributionKey,
        revisionNumber: spec.revisionNumber,
        contributorRole: spec.contributorRole,
        targetSection: spec.targetSection,
        targetItemId: spec.targetItemId,
        title: spec.title,
        body: spec.body,
        evidenceExpectation: spec.evidenceExpectation,
        digest: missionIntentContributionDigest(digestInput),
        proposedBy: spec.proposedBy,
        proposedActorType: spec.proposedActorType,
        proposedActorSource: spec.proposedActorSource,
        proposedAt: spec.proposedAt,
      });
      contribution = await ctx.db.get(contributionId);
    }
    if (spec.accepted) {
      if (!contribution) throw new Error("Shared intent demo contribution was not created");
      const existingDecision = await ctx.db.query("missionIntentContributionDecisions")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", "mc-demo:intent-decision:engineering-accepted:r1")).first();
      if (existingDecision) continue;
      await ctx.db.insert("missionIntentContributionDecisions", {
        tenantId, projectId, missionId, contributionId: contribution._id,
        contributionDigest: missionIntentContributionDigest(digestInput),
        missionSpecRevisionId: spec.spec._id,
        missionSpecDigest: spec.spec.digest,
        idempotencyKey: "mc-demo:intent-decision:engineering-accepted:r1",
        decision: "ACCEPTED",
        reason: "Recovery and preserved history are required by the shared-intent contract.",
        decidedBy: "mission-control-operator@example.com",
        decidedActorSource: "DEVELOPMENT_FALLBACK",
        decidedAt: now - 6 * 60_000,
      });
    }
  }
}

async function seedSpecIntakeGoldenPath(ctx: MutationCtx, input: DemoSeedContext) {
  const { tenantId, projectId, now, withSeedMeta } = input;
  const missionKey = "mc-demo:mission:spec-intake-golden-path";
  const existingMission = await ctx.db
    .query("missions")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", missionKey))
    .first();
  if (existingMission) {
    await seedSharedIntentContributions(ctx, input, existingMission._id);
    return { created: false, missionId: existingMission._id };
  }

  const [project, repository, codeScope, workflow] = await Promise.all([
    ctx.db.get(projectId),
    ctx.db.query("workspaceRepositories").withIndex("by_project", (q) => q.eq("projectId", projectId)).filter((q) => q.eq(q.field("isDefault"), true)).first(),
    ctx.db.query("repositoryCodeScopes").withIndex("by_project", (q) => q.eq("projectId", projectId)).filter((q) => q.eq(q.field("active"), true)).first(),
    ctx.db.query("workflows").withIndex("by_active", (q) => q.eq("active", true)).first(),
  ]);
  if (!project || !repository || !codeScope || !workflow) {
    throw new Error("Spec Intake demo seed requires an active project, repository, code scope, and workflow");
  }

  const constitutionContent = demoProjectConstitution();
  const constitutionDigest = projectConstitutionDigest(constitutionContent);
  const constitutionId = await ctx.db.insert("projectConstitutionRevisions", {
    tenantId,
    projectId,
    idempotencyKey: "mc-demo:constitution:spec-intake:v1",
    revisionNumber: 1,
    title: "Software Factory planning Constitution",
    content: constitutionContent,
    digest: constitutionDigest,
    createdBy: "seedMissionControlDemo",
    createdActorSource: "DEVELOPMENT_FALLBACK",
    createdAt: now - 90 * 60_000,
  });
  await ctx.db.patch(projectId, { currentConstitutionRevisionId: constitutionId, updatedAt: now });

  const missionId = await ctx.db.insert("missions", {
    tenantId,
    projectId,
    idempotencyKey: missionKey,
    title: "Spec Intake Golden Path — immutable revision proof",
    objective: "Prove exact Mission intent can be revised, qualified, finalized for planning, approved separately, and traced into released WorkOrders without silent rebinding.",
    context: "Deterministic demo fixture for Spec-driven Mission Intake V1 qualification.",
    constraints: ["No Spec path may authorize execution or acceptance", "Existing Plan approval remains the release boundary"],
    sourceOfTruthRefs: [{ kind: "DOC", label: "Approved Spec Intake architecture", location: "docs/architecture/2026-08-16-spec-driven-mission-intake-audit.md" }],
    owner: "Mission Control Operator",
    repositoryId: repository._id,
    codeScopeIds: [codeScope._id],
    executionEnvironment: "LOCAL",
    state: "DRAFT",
    executionPolicy: "SERIAL_MUTATIONS",
    maxReadOnlyConcurrency: 2,
    maxCorrectiveIterations: 2,
    correctiveIterations: 0,
    stopCondition: "Stop before dispatch; the demo proves planning and release lineage only.",
    budgetUsd: 30,
    spentUsd: 0,
    createdAt: now - 85 * 60_000,
    updatedAt: now - 85 * 60_000,
    metadata: withSeedMeta("mission:spec-intake-golden-path", { factoryExperience: { selectedRecipeId: "full-sdlc" } }),
  });

  const revision1Content = demoMissionSpecRevision1(String(repository._id), String(codeScope._id));
  const revision1Digest = missionSpecDigest(revision1Content);
  const revision1Id = await ctx.db.insert("missionSpecRevisions", {
    tenantId, projectId, missionId,
    idempotencyKey: "mc-demo:mission-spec:golden:r1",
    revisionNumber: 1,
    projectConstitutionRevisionId: constitutionId,
    projectConstitutionDigest: constitutionDigest,
    content: revision1Content,
    digest: revision1Digest,
    createdBy: "seedMissionControlDemo",
    createdActorSource: "DEVELOPMENT_FALLBACK",
    createdAt: now - 80 * 60_000,
  });
  const revision1Quality = evaluateMissionSpecQuality({ spec: revision1Content, constitution: constitutionContent });
  const evaluation1Id = await ctx.db.insert("missionSpecQualityEvaluations", {
    tenantId, projectId, missionId,
    missionSpecRevisionId: revision1Id,
    missionSpecDigest: revision1Digest,
    projectConstitutionRevisionId: constitutionId,
    projectConstitutionDigest: constitutionDigest,
    idempotencyKey: "mc-demo:mission-spec-evaluation:golden:r1",
    rulesetVersion: revision1Quality.rulesetVersion,
    result: revision1Quality.result,
    findings: revision1Quality.findings,
    evaluatedBy: "seedMissionControlDemo",
    evaluatedActorSource: "DEVELOPMENT_FALLBACK",
    evaluatedAt: now - 75 * 60_000,
  });
  if (revision1Quality.result !== "FAIL") throw new Error("Spec Intake demo revision 1 must fail deterministic quality");

  const revision2Content = demoMissionSpecRevision2(String(repository._id), String(codeScope._id));
  const revision2Digest = missionSpecDigest(revision2Content);
  const revision2Id = await ctx.db.insert("missionSpecRevisions", {
    tenantId, projectId, missionId,
    baseRevisionId: revision1Id,
    idempotencyKey: "mc-demo:mission-spec:golden:r2",
    revisionNumber: 2,
    projectConstitutionRevisionId: constitutionId,
    projectConstitutionDigest: constitutionDigest,
    content: revision2Content,
    digest: revision2Digest,
    createdBy: "seedMissionControlDemo",
    createdActorSource: "DEVELOPMENT_FALLBACK",
    createdAt: now - 70 * 60_000,
  });
  const revision2Quality = evaluateMissionSpecQuality({ spec: revision2Content, constitution: constitutionContent });
  if (revision2Quality.result !== "PASS") throw new Error(`Spec Intake demo revision 2 must pass deterministic quality (${revision2Quality.findings.map((item) => item.code).join(", ")})`);
  const evaluation2Id = await ctx.db.insert("missionSpecQualityEvaluations", {
    tenantId, projectId, missionId,
    missionSpecRevisionId: revision2Id,
    missionSpecDigest: revision2Digest,
    projectConstitutionRevisionId: constitutionId,
    projectConstitutionDigest: constitutionDigest,
    idempotencyKey: "mc-demo:mission-spec-evaluation:golden:r2",
    rulesetVersion: revision2Quality.rulesetVersion,
    result: revision2Quality.result,
    findings: revision2Quality.findings,
    evaluatedBy: "seedMissionControlDemo",
    evaluatedActorSource: "DEVELOPMENT_FALLBACK",
    evaluatedAt: now - 65 * 60_000,
  });
  await ctx.db.insert("missionSpecDecisions", {
    tenantId, projectId, missionId,
    missionSpecRevisionId: revision2Id,
    missionSpecQualityEvaluationId: evaluation2Id,
    idempotencyKey: "mc-demo:mission-spec-finalized:golden:r2",
    decisionType: "FINALIZED",
    rationale: "Exact deterministic quality passed; revision two is complete enough to propose for planning and grants no execution authority.",
    decidedBy: "seedMissionControlDemo",
    decidedActorSource: "DEVELOPMENT_FALLBACK",
    decidedAt: now - 60 * 60_000,
  });
  await ctx.db.patch(missionId, { currentSpecRevisionId: revision2Id, updatedAt: now - 60 * 60_000 });

  const assertions = demoMissionPlanAssertions();
  const blueprint = demoMissionPlanBlueprint({ workflowId: workflow.workflowId, version: workflow.version });
  const planAnalysis = analyzeSpecPlanConsistency({
    spec: revision2Content,
    assertions,
    workOrderBlueprints: [blueprint],
    planSummary: "Implement immutable Spec intake and exact Plan-to-WorkOrder lineage while preserving the existing approval and acceptance path.",
    repositoryId: String(repository._id),
  });
  if (planAnalysis.findings.some((item) => item.blocking)) throw new Error(`Spec Intake demo Plan coverage must pass (${planAnalysis.findings.map((item) => item.code).join(", ")})`);
  const checklistLineage = {
    requirementsQualityItemIds: ["CHECK-REQ-001"],
    governanceConstraintItemIds: ["CHECK-GOV-001"],
    evidenceBearingVerificationItemIds: ["CHECK-VERIFY-001"],
  };
  const planId = await ctx.db.insert("missionPlans", {
    tenantId, projectId, missionId,
    idempotencyKey: "mc-demo:mission-plan:golden:r1",
    revisionNumber: 1,
    draftVersion: 1,
    status: "PROPOSED",
    summary: "Implement immutable Spec intake and exact Plan-to-WorkOrder lineage while preserving the existing approval and acceptance path.",
    rollbackApproach: "Revert the candidate commit and disable missions.spec-intake-v1; existing immutable records remain readable.",
    estimatedCostUsd: 24,
    repository: repository.repository,
    repositoryBranch: repository.defaultBranch,
    createdBy: "seedMissionControlDemo:plan-author",
    submittedBy: "seedMissionControlDemo:plan-author",
    submittedAt: now - 50 * 60_000,
    submittedActorSource: "DEVELOPMENT_FALLBACK",
    missionSpecRevisionId: revision2Id,
    missionSpecDigest: revision2Digest,
    missionSpecQualityEvaluationId: evaluation2Id,
    projectConstitutionRevisionId: constitutionId,
    projectConstitutionDigest: constitutionDigest,
    requirementsCoverageProjection: planAnalysis.coverage,
    specConsistencyFindings: planAnalysis.findings,
    specConsistencyDigest: planAnalysis.digest,
    specConsistencyEvaluatedAt: now - 50 * 60_000,
    assertions,
    workOrderBlueprints: [blueprint],
    createdAt: now - 55 * 60_000,
    metadata: withSeedMeta("mission-plan:spec-intake-golden:r1"),
  });
  const qualityContract = compileApprovedPlanQualityContract({
    missionId: String(missionId),
    missionPlanId: String(planId),
    missionPlanRevision: 1,
    objective: "Prove exact immutable Spec-to-delivery lineage.",
    businessContext: "Spec Intake Golden Path qualification",
    constraints: ["No Spec execution or acceptance authority"],
    sourceOfTruthRefs: [{ kind: "DOC", label: "Approved architecture", location: "docs/architecture/2026-08-16-spec-driven-mission-intake-audit.md" }],
    repository: repository.repository,
    repositoryBranch: repository.defaultBranch,
    summary: "Implement immutable Spec intake and exact Plan-to-WorkOrder lineage while preserving the existing approval and acceptance path.",
    rollbackApproach: "Revert the candidate commit and disable missions.spec-intake-v1.",
    assertions,
    workOrderBlueprints: [blueprint],
    specLineage: {
      missionSpecRevisionId: String(revision2Id),
      missionSpecDigest: revision2Digest,
      missionSpecQualityEvaluationId: String(evaluation2Id),
      projectConstitutionRevisionId: String(constitutionId),
      projectConstitutionDigest: constitutionDigest,
      requirementsCoverage: planAnalysis.coverage,
      checklistLineage,
    },
  });
  const assertionRowIds: Array<Id<"validationAssertions">> = [];
  for (const assertion of assertions) {
    assertionRowIds.push(await ctx.db.insert("validationAssertions", {
      tenantId, projectId, missionId, missionPlanId: planId,
      assertionId: assertion.assertionId,
      title: assertion.title,
      outcome: assertion.outcome,
      verificationMethod: assertion.verificationMethod,
      passCondition: assertion.passCondition,
      requiredEvidence: assertion.requiredEvidence,
      requiresIndependentValidation: assertion.requiresIndependentValidation,
      waiverAllowed: assertion.waiverAllowed,
      linkedWorkOrderIds: [],
      status: "PENDING",
      createdAt: now - 45 * 60_000,
      updatedAt: now - 45 * 60_000,
    }));
  }
  await ctx.db.patch(planId, {
    status: "APPROVED",
    approvedBy: "seedMissionControlDemo:plan-approver",
    approvedAt: now - 40 * 60_000,
    decisionReason: "The exact bound Plan is complete, covered, and preserves all existing release and acceptance gates.",
    decidedBy: "seedMissionControlDemo:plan-approver",
    decidedAt: now - 40 * 60_000,
    decidedActorSource: "DEVELOPMENT_FALLBACK",
    releaseIdempotencyKey: `mission-plan:${String(planId)}:release:v1`,
    materializationVersion: 1,
    qualityContractProjection: qualityContract.projection,
    qualityContractDigest: qualityContract.digest,
  });
  await ctx.db.patch(missionId, { state: "READY", currentPlanId: planId, requiredHumanAction: "Review released WorkOrders. Execution remains a separate governed action.", updatedAt: now - 40 * 60_000 });

  const compiledWorkOrder = compileMissionWorkOrderContract({
    blueprint,
    assertions,
    rollbackApproach: "Revert the candidate commit and disable missions.spec-intake-v1.",
    codeScopes: [{ includePaths: codeScope.includePaths, excludePaths: codeScope.excludePaths }],
    spec: revision2Content,
  });
  const workOrderResult = await createWorkOrderRecord(ctx, {
    projectId, missionId, missionPlanId: planId, missionPlanRevision: 1,
    qualityContractDigest: qualityContract.digest,
    missionSpecLineage: {
      missionSpecRevisionId: revision2Id,
      missionSpecDigest: revision2Digest,
      missionSpecQualityEvaluationId: evaluation2Id,
      projectConstitutionRevisionId: constitutionId,
      projectConstitutionDigest: constitutionDigest,
      requirementsCoverage: planAnalysis.coverage,
      checklistLineage,
    },
    missionBlueprintId: blueprint.id,
    missionRole: blueprint.role,
    isMutating: blueprint.isMutating,
    idempotencyKey: "mc-demo:mission-work-order:spec-intake-golden",
    title: blueprint.title,
    desiredOutcome: blueprint.desiredOutcome,
    context: "Released from the exact human-approved Spec Intake Golden Path Plan.",
    workflowId: workflow.workflowId,
    repository: repository.repository,
    repositoryId: repository._id,
    codeScopeIds: [codeScope._id],
    branchStrategy: blueprint.branchStrategy,
    priority: blueprint.priority,
    riskLevel: blueprint.riskLevel,
    modelComplexity: blueprint.modelComplexity,
    requestedBy: "seedMissionControlDemo:plan-approver",
    requirements: compiledWorkOrder.requirements,
    acceptanceCriteria: compiledWorkOrder.acceptanceCriteria,
    constraints: blueprint.constraints,
    positiveConstraints: compiledWorkOrder.positiveConstraints,
    negativeConstraints: compiledWorkOrder.negativeConstraints,
    changeBudget: compiledWorkOrder.changeBudget,
    verificationContract: compiledWorkOrder.verificationContract,
    autonomyLevel: compiledWorkOrder.autonomyLevel,
    dependencies: [],
    sourceOfTruthRefs: [{ kind: "DOC", label: "Approved architecture", location: "docs/architecture/2026-08-16-spec-driven-mission-intake-audit.md" }],
    requiredApprovals: compiledWorkOrder.requiredApprovals,
    state: "READY",
    metadata: { ...compiledWorkOrder.metadata, approvedWorkflowVersion: workflow.version, ...withSeedMeta("work-order:spec-intake-golden") },
  });
  await ctx.db.patch(planId, { releasedAt: now - 35 * 60_000, releasedWorkOrderIds: [workOrderResult.workOrder._id] });

  const revision3Content = demoMissionSpecRevision3(String(repository._id), String(codeScope._id));
  const revision3Digest = missionSpecDigest(revision3Content);
  const revision3Id = await ctx.db.insert("missionSpecRevisions", {
    tenantId, projectId, missionId,
    baseRevisionId: revision2Id,
    idempotencyKey: "mc-demo:mission-spec:golden:r3",
    revisionNumber: 3,
    projectConstitutionRevisionId: constitutionId,
    projectConstitutionDigest: constitutionDigest,
    content: revision3Content,
    digest: revision3Digest,
    createdBy: "seedMissionControlDemo:spec-author",
    createdActorSource: "DEVELOPMENT_FALLBACK",
    createdAt: now - 20 * 60_000,
  });
  await ctx.db.patch(missionId, { currentSpecRevisionId: revision3Id, updatedAt: now - 20 * 60_000 });

  const eventSpecs = [
    ["MISSION_CREATED", "Defined Spec Intake Golden Path Mission", now - 85 * 60_000],
    ["SPEC_QUALITY_FAILED", `Revision 1 retained with ${revision1Quality.findings.length} deterministic finding(s)`, now - 75 * 60_000],
    ["SPEC_REVISION_FINALIZED", "Revision 2 passed deterministic quality and was finalized for planning only", now - 60 * 60_000],
    ["PLAN_SUBMITTED", "Plan revision 1 submitted with complete exact Spec coverage", now - 50 * 60_000],
    ["PLAN_APPROVED_AND_WORKORDERS_RELEASED", "A separate human decision approved the Plan and released one WorkOrder without dispatch", now - 35 * 60_000],
    ["SPEC_REVISION_CREATED", "Revision 3 became current without rebinding the approved Plan or released WorkOrder", now - 20 * 60_000],
  ] as const;
  for (const [eventType, summary, timestamp] of eventSpecs) {
    await ctx.db.insert("missionEvents", { tenantId, projectId, missionId, eventType, actorType: "HUMAN", actorId: "seedMissionControlDemo", summary, idempotencyKey: `mc-demo:event:spec-intake:${eventType}`, timestamp, metadata: withSeedMeta(`mission-event:spec-intake:${eventType}`, { acceptanceAuthority: false }) });
  }

  await ctx.scheduler.runAfter(0, internal.missionSpecs.indexConstitutionInFactoryMemory, { revisionId: constitutionId });
  await ctx.scheduler.runAfter(0, internal.missionSpecs.indexSpecInFactoryMemory, { revisionId: revision1Id });
  await ctx.scheduler.runAfter(0, internal.missionSpecs.indexSpecInFactoryMemory, { revisionId: revision2Id });
  await ctx.scheduler.runAfter(0, internal.missionSpecs.indexSpecInFactoryMemory, { revisionId: revision3Id });
  await seedSharedIntentContributions(ctx, input, missionId);
  return {
    created: true,
    missionId,
    constitutionId,
    revision1Id,
    evaluation1Id,
    revision2Id,
    evaluation2Id,
    planId,
    workOrderId: workOrderResult.workOrder._id,
    revision3Id,
    assertionRowIds,
  };
}

const SKILL_PACKAGES = [
  {
    slug: "mission-control/factory-health",
    name: "factory-health",
    displayName: "Factory Health Monitor",
    description: "Operational health signals for software factory throughput, human touches, and merge gates.",
    tags: ["factory", "observability", "harness"],
    qualityScore: 91,
  },
  {
    slug: "mission-control/code-review-wizard",
    name: "code-review-wizard",
    displayName: "Code Review Wizard",
    description: "Seven-step harness flow: evidence → skill match → launch → meta-loop feedback.",
    tags: ["harness", "review", "workflow"],
    qualityScore: 88,
  },
  {
    slug: "mission-control/context-compression",
    name: "context-compression",
    displayName: "Context Compression",
    description: "Token-aware context shaping for long agent sessions and registry installs.",
    tags: ["context", "optimization"],
    qualityScore: 86,
  },
  {
    slug: "cursor/create-rule",
    name: "create-rule",
    displayName: "Create Rule",
    description: "Author Cursor rules with MDC frontmatter and scoped globs.",
    tags: ["cursor", "rules"],
    qualityScore: 84,
  },
  {
    slug: "gsd/execute-phase",
    name: "execute-phase",
    displayName: "GSD Execute Phase",
    description: "Run a planned GSD phase with checkpoints and verification hooks.",
    tags: ["gsd", "planning"],
    qualityScore: 90,
  },
  {
    slug: "superpowers/test-driven-development",
    name: "test-driven-development",
    displayName: "Superpowers TDD",
    description: "Red-green-refactor discipline for orchestration-critical code paths.",
    tags: ["superpowers", "testing"],
    qualityScore: 93,
  },
  {
    slug: "harness/change-review",
    name: "change-review",
    displayName: "Harness Change Review",
    description: "Lens-based PR review with mutation testing and merge gate commentary.",
    tags: ["harness", "security"],
    qualityScore: 87,
  },
  {
    slug: "mission-control/eval-framework",
    name: "eval-framework",
    displayName: "Eval Framework Gate",
    description: "Scenario-based eval runs with baseline vs candidate scoring for registry packages.",
    tags: ["eval", "registry"],
    qualityScore: 89,
  },
  {
    slug: "anthropic/skill-creator",
    name: "skill-creator",
    displayName: "Skill Creator",
    description: "Author and lint Agent Skills with validation, activation, and implementation axes.",
    tags: ["anthropic", "authoring"],
    qualityScore: 92,
  },
] as const;

const MEMORY_NODES = [
  { externalId: "mc/architecture", label: "Mission Control Architecture", fileType: "md" },
  { externalId: "mc/factory-loop", label: "Software Factory Loop", fileType: "md" },
  { externalId: "mc/registry-cdl", label: "Context CDL Lifecycle", fileType: "md" },
  { externalId: "mc/harness-patterns", label: "Harness AI Patterns", fileType: "md" },
  { externalId: "mc/merge-gates", label: "Merge Gate Policy", fileType: "md" },
  { externalId: "mc/agent-fleet", label: "Agent Fleet Topology", fileType: "md" },
  { externalId: "mc/eval-scenarios", label: "Eval Scenario Library", fileType: "md" },
  { externalId: "mc/incident-runbook", label: "Incident Response Runbook", fileType: "md" },
  { externalId: "mc/cost-attribution", label: "Cost Attribution Model", fileType: "md" },
] as const;

function hashForIndex(index: number): string {
  const hex = index.toString(16).padStart(2, "0");
  return `sha256:${hex.repeat(32).slice(0, 64)}`;
}

function automationProfileForSkill(index: number, spec: (typeof SKILL_PACKAGES)[number]) {
  const base = {
    deterministic: true,
    category: index === 0 ? "browser validation" : index === 1 ? "api quality gate" : "typescript verification",
    inputSchema: { type: "object", properties: { workspace: { type: "string" } } },
    outputSchema: { type: "object", required: ["status", "evidence"] },
    preconditions: ["Selected workspace repository is available", "Required runtime is installed"],
    successCriteria: ["All deterministic assertions pass", "Evidence artifact is emitted"],
    failureConditions: ["Any required assertion fails", "Runtime exits non-zero"],
    runtimeRequirements: [index === 0 ? "Playwright" : index === 1 ? "HTTP API client" : "Node.js 20"],
    requiredPermissions: ["repository:read", "network:local"],
    secretReferences: [] as string[],
    recommendedAdapter: index === 0 ? "PLAYWRIGHT" : index === 1 ? "API" : "TYPESCRIPT",
    verificationMethod: "Independent receipt validates exit status and evidence hash",
    existingTests: [`tests/automations/${spec.name}.test.ts`],
    deterministicSteps: ["Load bounded input", "Run explicit assertions", "Emit normalized evidence"],
  };
  if (index === 3) return { ...base, outputSchema: undefined };
  if (index >= 4) return { ...base, deterministic: false, unrestrictedReasoning: true };
  return base;
}

async function ensureWorkflow(ctx: any, workflowId: string, name: string, now: number) {
  const existing = await ctx.db
    .query("workflows")
    .withIndex("by_workflow_id", (q: any) => q.eq("workflowId", workflowId))
    .first();
  if (existing) return existing;

  const id = await ctx.db.insert("workflows", {
    workflowId,
    name,
    description: `Seeded workflow for ${name}`,
    agents: [{ id: "hermes", persona: "operator-orchestrator" }],
    steps: [
      { id: "plan", agent: "hermes", input: "Plan work", expects: "Scoped plan", retryLimit: 1, timeoutMinutes: 15 },
      { id: "execute", agent: "hermes", input: "Execute", expects: "Artifacts", retryLimit: 2, timeoutMinutes: 30 },
      { id: "verify", agent: "hermes", input: "Verify", expects: "Receipts", retryLimit: 1, timeoutMinutes: 20 },
    ],
    active: true,
    version: 1,
    createdBy: "seedMissionControlDemo",
    createdAt: now,
    updatedAt: now,
    metadata: { seedTag: "mc-demo" },
  });
  return await ctx.db.get(id);
}

async function seedSkillAutomationScenarios(ctx: any, input: DemoSeedContext, packageIds: Id<"contextPackages">[], versionByPackage: Map<string, Id<"contextPackageVersions">>) {
  const { tenantId, projectId, now, withSeedMeta } = input;
  const scenarios = [
    { key: "playwright-login-draft", packageIndex: 0, adapterType: "PLAYWRIGHT", state: "DISABLED", reviewStatus: "DRAFT", outcome: null },
    { key: "api-health-verified", packageIndex: 1, adapterType: "API", state: "ACTIVE", reviewStatus: "APPROVED", outcome: "PASSED" },
    { key: "typescript-health-rejected", packageIndex: 2, adapterType: "TYPESCRIPT", state: "ACTIVE", reviewStatus: "APPROVED", outcome: "FAILED" },
  ] as const;
  let created = 0;
  for (const [index, scenario] of scenarios.entries()) {
    const sourceRef = `skill-automation-demo:${scenario.key}`;
    let suggestion = (await ctx.db.query("metaLoopSuggestions").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect())
      .find((row: any) => row.sourceRef === sourceRef);
    if (!suggestion) {
      const suggestionId = await ctx.db.insert("metaLoopSuggestions", {
        projectId, kind: "DELEGATION", title: `Automation candidate: ${SKILL_PACKAGES[scenario.packageIndex].displayName}`,
        summary: "Deterministic skill awaiting governed conversion or lifecycle review.",
        status: scenario.state === "DISABLED" ? "OPEN" : "ACCEPTED", sourceRef,
        packageId: packageIds[scenario.packageIndex],
        payload: { type: "SKILL_AUTOMATION_CANDIDATE", candidateId: sourceRef },
        createdAt: now - (index + 1) * 3_600_000,
      });
      suggestion = await ctx.db.get(suggestionId);
    }
    const existing = await ctx.db.query("automationDefinitions").withIndex("by_source_candidate", (q: any) => q.eq("sourceCandidateId", suggestion._id)).first();
    if (existing) continue;
    const spec = SKILL_PACKAGES[scenario.packageIndex];
    const versionId = versionByPackage.get(spec.slug)!;
    const artifactPath = scenario.adapterType === "PLAYWRIGHT"
      ? "tests/automations/login-validation/login-validation.spec.ts"
      : scenario.adapterType === "API"
        ? "automations/api-health/api-health.api.json"
        : "automations/factory-health/factory-health.ts";
    const artifactContent = scenario.adapterType === "API"
      ? JSON.stringify({ method: "GET", endpoint: "/health", expectedStatus: 200 }, null, 2)
      : scenario.adapterType === "TYPESCRIPT"
        ? `console.log(JSON.stringify({ status: "passed", automation: ${JSON.stringify(spec.displayName)} }));\n`
        : `// Seeded deterministic ${scenario.adapterType} artifact for ${spec.displayName}\n`;
    const artifactId = await ctx.db.insert("automationArtifacts", {
      projectId, sourceSkillId: packageIds[scenario.packageIndex], sourceSkillVersionId: versionId,
      adapterType: scenario.adapterType, mode: "GENERATED", repository: REPO_SLUG, branch: "main",
      workingDirectory: ".", path: artifactPath, content: artifactContent,
      contentHash: `sha256:${await sha256Hex(artifactContent)}`, manifest: {
        adapterType: scenario.adapterType, method: "GET", endpoint: "/health", expectedStatus: 200,
        readOnly: true, evidenceCollection: ["stdout", "artifact-hash"],
      },
      validationStatus: "PASSED", validationFindings: [], createdBy: "seedMissionControlDemo",
      createdAt: now - (index + 1) * 3_600_000, updatedAt: now,
    });
    const definitionId = await ctx.db.insert("automationDefinitions", {
      projectId, sourceCandidateId: suggestion._id, definitionVersion: 1,
      name: `${spec.displayName} Automation`, description: spec.description, ownerId: "mission-control-demo",
      sourceSkillId: packageIds[scenario.packageIndex], sourceSkillVersionId: versionId, sourceSkillVersion: "1.1.0",
      adapterType: scenario.adapterType, artifactId, artifactPath, branch: "main", workingDirectory: ".",
      runtime: scenario.adapterType.toLowerCase(), inputBindings: {}, outputContract: { status: "passed|failed" },
      requiredPermissions: ["repository:read", "network:local"], secretReferences: [],
      validationStatus: "PASSED", reviewStatus: scenario.reviewStatus,
      approvedBy: scenario.reviewStatus === "APPROVED" ? "demo-operator" : undefined,
      approvedAt: scenario.reviewStatus === "APPROVED" ? now - 2 * 3_600_000 : undefined,
      correlationId: `demo-automation:${scenario.key}`,
      workflowId: "automation-execution", workflowVersion: "v1",
      triggerType: scenario.state === "ACTIVE" ? "SCHEDULE" : "MANUAL",
      triggerConfig: { cron: "0 8 * * 1", timezone: "America/Los_Angeles", intervalMs: 604_800_000 },
      scope: String(projectId), repositoryIds: [REPO_SLUG], environmentIds: ["local"],
      autonomyLevel: "LEVEL_1", isMutating: false, riskLevel: "LOW", requiredApprovalTypes: ["OPERATOR"],
      verificationContract: { independent: true, receiptRequired: true, method: "artifact-integrity-and-result" },
      evidenceRequirements: ["Approved artifact hash", "Normalized result", "Independent receipt"],
      maxDurationSeconds: 900, maxRetries: 0, maxCostUsd: 1, concurrencyLimit: 1,
      idempotencyStrategy: "definition-version:trigger-window", overlapPolicy: "SKIP", catchUpPolicy: "SKIP_MISSED",
      status: scenario.state, reliabilityState: "PROBATION",
      health: scenario.outcome === "PASSED" ? "HEALTHY" : scenario.outcome === "FAILED" ? "DEGRADED" : "UNKNOWN",
      activatedBy: scenario.state === "ACTIVE" ? "demo-operator" : undefined,
      activatedAt: scenario.state === "ACTIVE" ? now - 2 * 3_600_000 : undefined,
      nextRunAt: scenario.state === "ACTIVE" ? now + 5 * 86_400_000 : undefined,
      lastResult: scenario.outcome === "PASSED" ? "VERIFIED" : scenario.outcome === "FAILED" ? "REJECTED" : undefined,
      createdAt: now - (index + 2) * 86_400_000, updatedAt: now,
    });
    created += 1;
    await ctx.db.insert("automationDecisions", {
      projectId, automationDefinitionId: definitionId, decisionType: "CREATED",
      actorId: "seedMissionControlDemo", reason: "Seeded through the normal demo-data lifecycle",
      policyVersion: "skill-automation-v1", definitionVersion: 1, decidedAt: now - (index + 2) * 86_400_000,
      entityType: "AutomationDefinition", entityId: String(definitionId),
      newState: scenario.state, correlationId: `demo-automation:${scenario.key}`,
    });
    if (!scenario.outcome) continue;
    const acceptanceCriteria = [{
      id: "independent-verification", title: "Independent result and artifact integrity verified",
      verificationMethod: "TEST" as const, status: scenario.outcome === "PASSED" ? "PASS" as const : "FAIL" as const,
    }];
    const workOrderId = await ctx.db.insert("workOrders", {
      tenantId, projectId, idempotencyKey: `mc-demo:automation-work-order:${scenario.key}`,
      title: `Execute ${spec.displayName} Automation`, desiredOutcome: "Produce a verified deterministic result",
      context: "Seeded governed Automation execution history.", workflowId: "automation-execution",
      repository: REPO_SLUG, branchStrategy: "main", priority: 2, riskLevel: "LOW",
      requestedBy: "automation-scheduler", assignedAgent: "bounded-adapter",
      acceptanceCriteria, constraints: ["LEVEL_1", "Read-only", "Independent receipt required"],
      sourceOfTruthRefs: [{ kind: "REPO", label: "Approved artifact", location: artifactPath }],
      state: scenario.outcome === "PASSED" ? "DONE" : "BLOCKED",
      verificationStatus: scenario.outcome === "PASSED" ? "PASS" : "FAIL", approvalStatus: "APPROVED",
      currentRevisionNumber: 1, createdAt: now - 90 * 60_000, updatedAt: now - 60 * 60_000,
      metadata: { ...withSeedMeta(`automation-work-order:${scenario.key}`), automationDefinitionId: definitionId, automationWorkflowVersion: "v1", automationScope: String(projectId), durationMs: 42_000, costUsd: 0.04 },
    });
    const workflowRunId = await ctx.db.insert("workflowRuns", {
      tenantId, projectId, workOrderId, workOrderRevisionNumber: 1,
      runId: `auto-demo-${index + 1}`, workflowId: "automation-execution",
      status: scenario.outcome === "PASSED" ? "COMPLETED" : "FAILED", currentStepIndex: 2, totalSteps: 3,
      steps: ["approve", "execute", "verify"].map((stepId) => ({ stepId, status: scenario.outcome === "PASSED" ? "DONE" : stepId === "verify" ? "FAILED" : "DONE", retryCount: 0 })),
      context: { automationDefinitionId: definitionId }, initialInput: `Execute ${spec.displayName}`,
      runtime: scenario.adapterType.toLowerCase(), startedAt: now - 75 * 60_000, completedAt: now - 60 * 60_000,
      failureReason: scenario.outcome === "FAILED" ? "Independent verifier observed an unexpected result" : undefined,
      metadata: withSeedMeta(`automation-run:${scenario.key}`),
    });
    await ctx.db.patch(workOrderId, { currentExecutionRunId: workflowRunId });
    await ctx.db.insert("verificationReceipts", {
      tenantId, projectId, workOrderId, workflowRunId, acceptanceCriterionId: "independent-verification",
      idempotencyKey: `mc-demo:automation-receipt:${scenario.key}`, verificationMethod: "TEST",
      commandOrCheck: "independent normalized-result and artifact-integrity verification",
      result: scenario.outcome === "PASSED" ? "Expected read-only result observed" : "Observed output did not match the expected contract",
      evidenceLocation: artifactPath, artifactReference: artifactPath, verifier: "independent-automation-verifier",
      status: scenario.outcome, workOrderRevisionNumber: 1, validUntil: now + 7 * 86_400_000,
      recordedAt: now - 60 * 60_000,
      metadata: {
        definitionId, correlationId: `demo-automation:${scenario.key}`, independent: true,
        integrityHash: hashForIndex(70 + index), expectedResult: "Approved immutable artifact completes with expected output",
        observedResult: scenario.outcome === "PASSED" ? "Expected result observed" : "Unexpected result observed",
        recommendedFollowUp: scenario.outcome === "PASSED" ? "None" : "Pause Definition and inspect evidence",
      },
    });
  }
  return created;
}

function demoGoldenEvalActual() {
  const candidateSha = "9ba871d9efad9b224b2f2cd432fbfb5cfbc9d461";
  return {
    lineage: {
      finalizedSpecRevisionId: "mission-spec-demo-r2",
      boundSpecRemainedRevision: "mission-spec-demo-r2",
      currentSpecRevisionId: "mission-spec-demo-r3",
      finalizedSpecDigest: hashForIndex(131),
      qualityContractDigest: hashForIndex(132),
      planApproval: { submittedBy: "demo-plan-author", approvedBy: "demo-plan-approver" },
      workOrderRevision: 1,
      acceptanceActor: "human operator",
      qualityGateState: "ELIGIBLE",
      verificationSubjectId: "verification-subject:demo-current",
      verificationPlanId: "verification-plan:demo-current",
      verificationPlanDigest: hashForIndex(133),
      receiptId: "receipt:demo-current",
      evidenceIds: ["evidence:intent", "evidence:tests", "evidence:security", "evidence:browser"],
      providerHeadSha: candidateSha,
      sourceAttemptIds: ["attempt:source-failed", "attempt:source-current"],
      candidateShas: ["1111111111111111111111111111111111111111", candidateSha],
      verificationAttemptIds: ["attempt:verification-failed", "attempt:verification-current"],
    },
    authority: {
      workOrderAcceptedEventWriters: ["workOrders.ts"],
      learningHasAcceptanceMutation: false,
      observabilityHasAcceptanceMutation: false,
      planSelfApprovalGuard: true,
      sandboxHasGithubAuthority: false,
    },
    performance: {
      durationMs: 8_883,
      sourceRetries: 1,
      modelCalls: 0,
      tokens: null,
      costUsd: 0,
    },
    failureInjection: {
      staleLease: "PASS",
      harnessManifestDigestMismatchBlocked: "PASS",
      exactCurrentVerification: "PASS",
    },
    harnessLineage: {
      execution: { adapter: "codex", version: "v1", capabilityManifestSha256: hashForIndex(134) },
      genericAdmission: { exactAdmission: { eligible: true } },
    },
    observability: {
      sandboxLifecycleEvents: [
        "SANDBOX_REQUESTED",
        "SANDBOX_STARTED",
        "SANDBOX_CREDENTIAL_REVOKED",
        "SANDBOX_TERMINATED",
      ],
    },
    learning: {
      review: { actorType: "HUMAN" },
      promotionRecommendation: { autoPromote: false },
      releasedWorkOrderIds: [],
      submittedPlanStatus: "PROPOSED",
    },
    fixture: { finalCandidateSha: candidateSha },
  };
}

async function persistDemoEvalRun(ctx: any, input: {
  tenantId: Id<"tenants">;
  projectId: Id<"projects">;
  suiteId: Id<"evalSuites">;
  baselineId?: Id<"evalBaselines">;
  caseIds: Map<string, Id<"evalSuiteCases">>;
  receipt: EvalRunReceipt;
  startedAt: number;
  finishedAt: number;
}) {
  const existing = await ctx.db
    .query("evalControlRuns")
    .withIndex("by_project_idempotency", (q: any) => q
      .eq("projectId", input.projectId)
      .eq("idempotencyKey", input.receipt.idempotencyKey))
    .first();
  if (existing) return false;
  const receipt = JSON.parse(JSON.stringify(input.receipt)) as EvalRunReceipt;
  const runId = await ctx.db.insert("evalControlRuns", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    suiteId: input.suiteId,
    baselineId: input.baselineId,
    runKey: receipt.runId,
    idempotencyKey: receipt.idempotencyKey,
    status: receipt.runStatus,
    verdict: receipt.verdict,
    publishable: receipt.publishable,
    releaseBlocking: false,
    acceptanceAuthority: false,
    provenance: receipt.provenance,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    receiptDigest: receipt.receiptDigest,
    createdBy: "seedMissionControlDemo",
    createdAt: input.finishedAt,
  });
  for (const result of receipt.results) {
    await ctx.db.insert("evalCaseResults", {
      tenantId: input.tenantId,
      projectId: input.projectId,
      runId,
      suiteCaseId: input.caseIds.get(result.caseKey),
      caseKey: result.caseKey,
      verdict: result.verdict,
      result,
      createdAt: input.finishedAt,
    });
  }
  await ctx.db.insert("evalRunReceipts", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    suiteId: input.suiteId,
    runId,
    receiptDigest: receipt.receiptDigest,
    verdict: receipt.verdict,
    publishable: receipt.publishable,
    releaseBlocking: false,
    acceptanceAuthority: false,
    receipt,
    createdAt: input.finishedAt,
  });
  return true;
}

async function seedEvalControlPlane(ctx: any, input: DemoSeedContext) {
  const { tenantId, projectId, now } = input;
  const suite = MISSION_CONTROL_GOLDEN_SUITE_V1;
  let suiteDoc = await ctx.db
    .query("evalSuites")
    .withIndex("by_project_key_version", (q: any) => q
      .eq("projectId", projectId)
      .eq("key", suite.key)
      .eq("version", suite.version))
    .first();
  let suiteCreated = 0;
  if (!suiteDoc) {
    const suiteId = await ctx.db.insert("evalSuites", {
      tenantId,
      projectId,
      schemaVersion: suite.schemaVersion,
      key: suite.key,
      name: suite.name,
      description: suite.description,
      version: suite.version,
      suiteDigest: evalSuiteDigest(suite),
      invalidRatioLimit: suite.invalidRatioLimit,
      active: true,
      createdBy: "seedMissionControlDemo",
      createdAt: now - 3 * 86_400_000,
    });
    suiteDoc = await ctx.db.get(suiteId);
    suiteCreated = 1;
    for (const [ordinal, testCase] of suite.cases.entries()) {
      await ctx.db.insert("evalSuiteCases", {
        tenantId,
        projectId,
        suiteId,
        key: testCase.key,
        name: testCase.name,
        severity: testCase.severity,
        definition: testCase,
        ordinal,
        createdAt: now - 3 * 86_400_000,
      });
    }
  }
  if (!suiteDoc) throw new Error("Eval control-plane demo suite could not be created.");
  const cases = await ctx.db.query("evalSuiteCases").withIndex("by_suite", (q: any) => q.eq("suiteId", suiteDoc._id)).collect();
  const caseIds = new Map<string, Id<"evalSuiteCases">>(cases.map((testCase: any) => [testCase.key, testCase._id]));
  const actual = demoGoldenEvalActual();
  const suiteDigest = evalSuiteDigest(suite);
  const provenance = {
    repository: REPO_SLUG,
    revision: "9ba871d9efad9b224b2f2cd432fbfb5cfbc9d461",
    adapter: {
      id: "system-factory-scenario-evidence",
      version: "1.0.0",
      digest: canonicalDigest("mission-control/eval-adapter", { id: "system-factory-scenario-evidence", version: "1.0.0" }),
    },
    runtime: { name: "node", version: "20.19.0" },
    datasetDigest: suiteDigest,
    resolvedConfigDigest: canonicalDigest("mission-control/eval-config", { suiteDigest, seed: "mc-demo" }),
    seed: "mc-demo",
    artifacts: [{ path: "docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json", digest: hashForIndex(135) }],
  };
  const outcomes = suite.cases.map((testCase) => ({
    caseKey: testCase.key,
    status: "SCORED" as const,
    actual,
    evidenceRefs: ["docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json"],
    ...(testCase.key === "economics-attribution" ? { durationMs: 8_883, costUsd: 0 } : {}),
  }));
  const baselineSource = evaluateSuiteRun({
    suite,
    runId: "mc-demo:eval:baseline-source",
    idempotencyKey: "mc-demo:eval:baseline-source",
    runStatus: "COMPLETED",
    provenance,
    outcomes,
    startedAt: new Date(now - 2 * 86_400_000).toISOString(),
    finishedAt: new Date(now - 2 * 86_400_000 + 8_883).toISOString(),
  });
  let baselineDoc = await ctx.db
    .query("evalBaselines")
    .withIndex("by_project_baseline", (q: any) => q.eq("projectId", projectId).eq("baselineId", "mc-demo:golden-v1-main"))
    .first();
  if (!baselineDoc) {
    const baseline = buildEvalBaseline({
      baselineId: "mc-demo:golden-v1-main",
      suite,
      receipt: baselineSource,
      createdAt: new Date(now - 2 * 86_400_000).toISOString(),
    });
    const baselineDocId = await ctx.db.insert("evalBaselines", {
      tenantId,
      projectId,
      suiteId: suiteDoc._id,
      baselineId: baseline.baselineId,
      baselineDigest: baseline.baselineDigest,
      suiteDigest: baseline.suiteDigest,
      sourceReceiptDigest: baseline.sourceReceiptDigest,
      baseline,
      active: true,
      promotionReason: "Seeded deterministic System Qualification V2 reference receipt",
      createdBy: "seedMissionControlDemo",
      createdAt: now - 2 * 86_400_000,
    });
    baselineDoc = await ctx.db.get(baselineDocId);
  }
  if (!baselineDoc) throw new Error("Eval control-plane demo baseline could not be created.");
  const currentStarted = now - 15 * 60_000;
  const current = evaluateSuiteRun({
    suite,
    baseline: baselineDoc.baseline,
    runId: "mc-demo:eval:current",
    idempotencyKey: "mc-demo:eval:current",
    runStatus: "COMPLETED",
    provenance,
    outcomes,
    startedAt: new Date(currentStarted).toISOString(),
    finishedAt: new Date(currentStarted + 8_883).toISOString(),
  });
  const invalidStarted = now - 26 * 60 * 60_000;
  const invalid = evaluateSuiteRun({
    suite,
    baseline: baselineDoc.baseline,
    runId: "mc-demo:eval:harness-invalid",
    idempotencyKey: "mc-demo:eval:harness-invalid",
    runStatus: "COMPLETED",
    provenance,
    outcomes: outcomes.map((entry, index) => index === 0 ? {
      caseKey: entry.caseKey,
      status: "ERROR" as const,
      failureOrigin: "HARNESS" as const,
      error: "Scenario evidence adapter exited before returning exact-intent lineage.",
      evidenceRefs: [],
    } : entry),
    startedAt: new Date(invalidStarted).toISOString(),
    finishedAt: new Date(invalidStarted + 1_240).toISOString(),
  });
  let runsCreated = 0;
  if (await persistDemoEvalRun(ctx, { tenantId, projectId, suiteId: suiteDoc._id, baselineId: baselineDoc._id, caseIds, receipt: invalid, startedAt: invalidStarted, finishedAt: invalidStarted + 1_240 })) runsCreated += 1;
  if (await persistDemoEvalRun(ctx, { tenantId, projectId, suiteId: suiteDoc._id, baselineId: baselineDoc._id, caseIds, receipt: current, startedAt: currentStarted, finishedAt: currentStarted + 8_883 })) runsCreated += 1;
  return { suites: suiteCreated, runs: runsCreated };
}

export async function seedDemoExtensions(ctx: any, input: DemoSeedContext) {
  const { tenantId, projectId, now, withSeedMeta } = input;
  const counts = {
    contextPackages: 0,
    knowledgeGraphNodes: 0,
    workOrders: 0,
    goals: 0,
    harnessPrChecks: 0,
    metaLoopSuggestions: 0,
    contextEvalRuns: 0,
    contextInstallations: 0,
    alerts: 0,
    automationDefinitions: 0,
    factoryMemoryDocuments: 0,
    factoryMemoryChunks: 0,
    factoryEntities: 0,
    factoryRelationships: 0,
    factoryContextPackages: 0,
    specIntakeGoldenPaths: 0,
    evalSuites: 0,
    evalControlRuns: 0,
  };

  const agents = await ctx.db
    .query("agents")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const leadAgent = agents.find((a: any) => a.role === "LEAD" || a.role === "CEO") ?? agents[0];

  const packageIds: Id<"contextPackages">[] = [];
  const versionByPackage = new Map<string, Id<"contextPackageVersions">>();

  for (let i = 0; i < SKILL_PACKAGES.length; i++) {
    const spec = SKILL_PACKAGES[i];
    let pkg = await ctx.db
      .query("contextPackages")
      .withIndex("by_slug", (q: any) => q.eq("slug", spec.slug))
      .first();

    if (!pkg) {
      const packageId = await ctx.db.insert("contextPackages", {
        name: spec.name,
        slug: spec.slug,
        displayName: spec.displayName,
        description: spec.description,
        type: "SKILL",
        status: "DRAFT",
        owner: "mission-control-demo",
        tags: [...spec.tags],
        riskLevel: "GREEN",
        projectId,
        tenantId,
        createdAt: now - i * 3_600_000,
        updatedAt: now - i * 3_600_000,
      });
      pkg = await ctx.db.get(packageId);
      counts.contextPackages++;
    }

    packageIds.push(pkg!._id);

    const demoVersion = "1.1.0";
    const existingVersion = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package_version", (q: any) => q.eq("packageId", pkg!._id).eq("version", demoVersion))
      .first();

    let versionId = existingVersion?._id;
    if (!existingVersion) {
      versionId = await ctx.db.insert("contextPackageVersions", {
        packageId: pkg!._id,
        version: demoVersion,
        status: "PUBLISHED",
        contentHash: hashForIndex(i + 1),
        inlineContent: `# ${spec.displayName}\n\n${spec.description}\n\n## Usage\n\nLoad via registry discover or mc context install.`,
        manifestVersion: "1",
        sourceRepo: REPO_SLUG,
        sourcePath: `.claude/skills/${spec.name}/SKILL.md`,
        automationProfile: automationProfileForSkill(i, spec),
        qualityScore: spec.qualityScore,
        reviewAxes: {
          validation: spec.qualityScore - 2,
          implementation: spec.qualityScore - 4,
          activation: spec.qualityScore,
        },
        securityStatus: "PASSED",
        publishedAt: now - i * 3_600_000,
        createdAt: now - i * 3_600_000,
      });
    }

    versionByPackage.set(spec.slug, versionId!);
    if (pkg!.currentVersionId !== versionId) {
      await ctx.db.patch(pkg!._id, {
        status: "ACTIVE",
        currentVersionId: versionId,
        updatedAt: now,
      });
    }

    const existingScenario = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package", (q: any) => q.eq("packageId", pkg!._id))
      .first();
    if (!existingScenario) {
      await ctx.db.insert("contextEvalScenarios", {
        packageId: pkg!._id,
        name: `${spec.displayName} baseline`,
        description: `Baseline eval for ${spec.slug}`,
        taskPrompt: `Apply ${spec.displayName} to a representative Mission Control task.`,
        criteria: [
          { id: "structure", label: "Follows skill structure", weight: 0.4 },
          { id: "outcome", label: "Produces expected outcome", weight: 0.6 },
        ],
        active: true,
        projectId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const manifest = await ctx.db
    .query("contextManifests")
    .withIndex("by_repo", (q: any) => q.eq("repoSlug", REPO_SLUG))
    .first();
  if (!manifest) {
    await ctx.db.insert("contextManifests", {
      repoSlug: REPO_SLUG,
      manifestJson: JSON.stringify({
        schemaVersion: "1",
        packages: SKILL_PACKAGES.map((p) => ({ slug: p.slug, version: "1.0.0" })),
      }),
      schemaVersion: "1",
      updatedBy: "seedMissionControlDemo",
      createdAt: now,
      updatedAt: now,
    });
  }

  for (let i = 0; i < SKILL_PACKAGES.length; i++) {
    const spec = SKILL_PACKAGES[i];
    const versionId = versionByPackage.get(spec.slug);
    const existingInstall = await ctx.db
      .query("contextInstallations")
      .withIndex("by_repo_package", (q: any) =>
        q.eq("repoSlug", REPO_SLUG).eq("packageSlug", spec.slug)
      )
      .first();
    if (!existingInstall) {
      await ctx.db.insert("contextInstallations", {
        repoSlug: REPO_SLUG,
        packageSlug: spec.slug,
        versionId,
        version: "1.0.0",
        contentHash: hashForIndex(i + 1),
        state: i % 5 === 0 ? "STALE" : "INSTALLED",
        createdAt: now,
        updatedAt: now,
      });
      counts.contextInstallations++;
    }
  }

  for (let i = 0; i < 12; i++) {
    const pkg = packageIds[i % packageIds.length];
    const versionId = versionByPackage.get(SKILL_PACKAGES[i % SKILL_PACKAGES.length].slug)!;
    const idempotencyKey = `mc-demo:eval-run:${i + 1}`;
    const existingRun = await ctx.db
      .query("contextEvalRuns")
      .withIndex("by_package", (q: any) => q.eq("packageId", pkg))
      .collect();
    if (existingRun.some((r: any) => r.idempotencyKey === idempotencyKey)) continue;

    const status = i % 4 === 0 ? "RUNNING" : i % 7 === 0 ? "FAILED" : "COMPLETED";
    await ctx.db.insert("contextEvalRuns", {
      packageId: pkg,
      versionId,
      status,
      scenarioCount: 2,
      completedScenarios: status === "COMPLETED" ? 2 : status === "RUNNING" ? 1 : 0,
      baselineScore: 72 + (i % 8),
      candidateScore: status === "FAILED" ? 68 + (i % 5) : 80 + (i % 10),
      impactScore: 75 + (i % 12),
      impactDelta: status === "FAILED" ? -4 : 6 + (i % 5),
      idempotencyKey,
      actorId: "seedMissionControlDemo",
      projectId,
      errorMessage: status === "FAILED" ? "Scenario timeout during candidate run" : undefined,
      startedAt: now - (i + 1) * 45 * 60_000,
      completedAt: status === "COMPLETED" ? now - i * 30 * 60_000 : undefined,
      createdAt: now - (i + 1) * 45 * 60_000,
    });
    counts.contextEvalRuns++;
  }

  for (let i = 0; i < MEMORY_NODES.length; i++) {
    const node = MEMORY_NODES[i];
    const existing = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_external", (q: any) =>
        q.eq("source", "mission-control").eq("externalId", node.externalId)
      )
      .first();
    if (existing) continue;

    await ctx.db.insert("knowledgeGraphNodes", {
      projectId,
      source: "mission-control",
      externalId: node.externalId,
      label: node.label,
      fileType: node.fileType,
      sourceFile: `docs/memory/${node.externalId}.md`,
      community: i % 3,
      metadata: withSeedMeta(`kg-node:${node.externalId}`),
      importedAt: now - i * 86_400_000,
    });
    counts.knowledgeGraphNodes++;
  }

  for (let i = 0; i < MEMORY_NODES.length - 1; i++) {
    const from = MEMORY_NODES[i].externalId;
    const to = MEMORY_NODES[i + 1].externalId;
    const externalId = `edge:${from}->${to}`;
    const existing = await ctx.db
      .query("knowledgeGraphEdges")
      .withIndex("by_from", (q: any) =>
        q.eq("source", "mission-control").eq("fromExternalId", from)
      )
      .collect();
    if (existing.some((row: any) => row.toExternalId === to)) continue;

    await ctx.db.insert("knowledgeGraphEdges", {
      projectId,
      source: "mission-control",
      externalId,
      fromExternalId: from,
      toExternalId: to,
      relation: "references",
      confidence: "high",
      confidenceScore: 0.85,
      weight: 1,
      sourceFile: `docs/memory/${from}.md`,
      importedAt: now - i * 86_400_000,
    });
  }

  await ensureWorkflow(ctx, "mc-demo-delivery", "MC Demo Delivery", now);
  await ensureWorkflow(ctx, "automation-execution", "Governed deterministic Automation", now);
  counts.automationDefinitions = await seedSkillAutomationScenarios(ctx, input, packageIds, versionByPackage);

  const workOrderSpecs = [
    {
      key: "registry-eval-gate",
      title: "Wire eval framework gate on registry publish",
      state: "IN_PROGRESS" as const,
      riskLevel: "MEDIUM" as const,
      approvalStatus: "APPROVED" as const,
    },
    {
      key: "harness-pr-checks",
      title: "Seed harness PR checks for change review wizard",
      state: "AWAITING_VERIFICATION" as const,
      riskLevel: "LOW" as const,
      approvalStatus: "NOT_REQUIRED" as const,
    },
    {
      key: "eos-command-center",
      title: "Populate EOS Command Center with live projections",
      state: "READY" as const,
      riskLevel: "LOW" as const,
      approvalStatus: "NOT_REQUIRED" as const,
    },
    {
      key: "context-cdl-sync",
      title: "Reconcile context CDL installs across repos",
      state: "BLOCKED" as const,
      riskLevel: "HIGH" as const,
      approvalStatus: "PENDING" as const,
    },
    {
      key: "factory-health-metrics",
      title: "Expose human-touch and token spend factory KPIs",
      state: "IN_PROGRESS" as const,
      riskLevel: "MEDIUM" as const,
      approvalStatus: "APPROVED" as const,
    },
    {
      key: "incident-triage",
      title: "Reduce open incident MTTR on telemetry stream",
      state: "AWAITING_APPROVAL" as const,
      riskLevel: "CRITICAL" as const,
      approvalStatus: "PENDING" as const,
    },
    {
      key: "memory-graph-import",
      title: "Import Agentic-KB graph overlay into Memory pillars",
      state: "READY" as const,
      riskLevel: "LOW" as const,
      approvalStatus: "NOT_REQUIRED" as const,
    },
    {
      key: "cost-attribution-v2",
      title: "Attribute run cost to work orders and missions",
      state: "IN_PROGRESS" as const,
      riskLevel: "MEDIUM" as const,
      approvalStatus: "CONDITIONAL" as const,
    },
  ];

  for (let i = 0; i < workOrderSpecs.length; i++) {
    const spec = workOrderSpecs[i];
    const idempotencyKey = `mc-demo:work-order:${spec.key}`;
    const existing = await ctx.db
      .query("workOrders")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) continue;

    const acceptanceCriteria = [
      {
        id: "ac-visible",
        title: "Visible in Work Orders read model",
        verificationMethod: "CHECKLIST" as const,
        status: i % 3 === 0 ? ("PASS" as const) : ("PENDING" as const),
      },
      {
        id: "ac-evidence",
        title: "Receipt evidence attached",
        verificationMethod: "TEST" as const,
        status: i % 4 === 0 ? ("PASS" as const) : ("PENDING" as const),
      },
    ];

    await ctx.db.insert("workOrders", {
      tenantId,
      projectId,
      idempotencyKey,
      title: spec.title,
      desiredOutcome: spec.title,
      context: `Seeded work order for EOS demo coverage (${spec.key}).`,
      workflowId: "mc-demo-delivery",
      repository: REPO_SLUG,
      branchStrategy: "feature/mc-demo",
      priority: ((i % 4) + 1) as 1 | 2 | 3 | 4,
      riskLevel: spec.riskLevel,
      requestedBy: "Jay West",
      assignedAgent: "Hermes",
      assignedSquad: "Mission Control",
      acceptanceCriteria,
      constraints: ["Demo seed only", "No external writeback"],
      sourceOfTruthRefs: [{ kind: "REPO", label: "MissionControl", location: REPO_SLUG }],
      state: spec.state,
      verificationStatus: deriveVerificationStatus(acceptanceCriteria),
      approvalStatus: spec.approvalStatus,
      blockingIssue: spec.state === "BLOCKED" ? "Waiting on registry lock reconciliation" : undefined,
      currentRevisionNumber: 1,
      createdAt: now - i * 90 * 60_000,
      updatedAt: now - i * 60 * 60_000,
      metadata: withSeedMeta(`work-order:${spec.key}`),
    });
    counts.workOrders++;
  }

  const companyGoals = [
    { title: "Ship EOS Command Center GA", level: "COMPANY" as const, status: "ACTIVE" as const, progressPct: 68 },
    { title: "Reduce agent cost per verified outcome 20%", level: "COMPANY" as const, status: "ACTIVE" as const, progressPct: 42 },
  ];
  const teamGoals = [
    { title: "Registry CDL fully wired", level: "TEAM" as const, status: "ACTIVE" as const, progressPct: 75 },
    { title: "Harness merge gates on every PR", level: "TEAM" as const, status: "PLANNED" as const, progressPct: 30 },
    { title: "104-incident telemetry baseline", level: "TEAM" as const, status: "ACTIVE" as const, progressPct: 88 },
  ];

  const parentIds = new Map<string, Id<"goals">>();
  for (const spec of [...companyGoals, ...teamGoals]) {
    const seedKey = `goal:${spec.level}:${slugify(spec.title)}`;
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
    if (existing.some((g: any) => g.metadata?.seedKey === seedKey)) continue;

    const goalId = await ctx.db.insert("goals", {
      tenantId,
      projectId,
      title: spec.title,
      description: `Seeded ${spec.level.toLowerCase()} objective for demo`,
      level: spec.level,
      parentGoalId: spec.level === "TEAM" ? parentIds.get("company") : undefined,
      ownerAgentId: leadAgent?._id,
      status: spec.status,
      progressPct: spec.progressPct,
      targetDate: now + 90 * 86_400_000,
      metadata: withSeedMeta(seedKey),
    });
    if (spec.level === "COMPANY" && !parentIds.has("company")) {
      parentIds.set("company", goalId);
    }
    counts.goals++;
  }

  for (let i = 0; i < agents.length && i < 6; i++) {
    const agent = agents[i];
    const seedKey = `goal:agent:${agent._id}`;
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_owner_agent", (q: any) => q.eq("ownerAgentId", agent._id))
      .collect();
    if (existing.some((g: any) => g.metadata?.seedKey === seedKey)) continue;

    await ctx.db.insert("goals", {
      tenantId,
      projectId,
      title: `${agent.name} — weekly verified outcomes`,
      level: "AGENT",
      parentGoalId: parentIds.get("company"),
      ownerAgentId: agent._id,
      status: i % 4 === 0 ? "ACHIEVED" : "ACTIVE",
      progressPct: 40 + (i % 6) * 10,
      metadata: withSeedMeta(seedKey),
    });
    counts.goals++;
  }

  for (let i = 0; i < 6; i++) {
    const prNumber = 200 + i;
    const existing = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_pr_url", (q: any) =>
        q.eq("prUrl", `https://github.com/${REPO_SLUG}/pull/${prNumber}`)
      )
      .first();
    if (existing) continue;

    await ctx.db.insert("harnessPrChecks", {
      projectId,
      prUrl: `https://github.com/${REPO_SLUG}/pull/${prNumber}`,
      prNumber,
      repoFullName: REPO_SLUG,
      branch: `feature/demo-${i + 1}`,
      title: `Demo PR ${prNumber}: ${SKILL_PACKAGES[i % SKILL_PACKAGES.length].displayName}`,
      ciStatus: i % 3 === 0 ? "PENDING" : i % 5 === 0 ? "FAIL" : "PASS",
      ciProvider: "github-actions",
      source: i % 2 === 0 ? "WORKFLOW" : "CODEGEN",
      changeReviewLenses: [
        { id: "security", label: "Security", enabled: true, score: 85 + i },
        { id: "correctness", label: "Correctness", enabled: true, score: 80 + i },
        { id: "style", label: "Style", enabled: i % 2 === 0, score: 90 },
      ],
      mutationTesting:
        i % 2 === 0
          ? {
              diffCoveragePct: 72 + i,
              findings: [
                { id: "m1", mutation: "boundary-null", caught: true, file: "convex/lib/mergeGates.ts" },
                { id: "m2", mutation: "invert-condition", caught: i % 3 !== 0, file: "apps/mission-control-ui/src/harness" },
              ],
            }
          : undefined,
      syncedAt: now - i * 15 * 60_000,
      createdAt: now - i * 15 * 60_000,
      metadata: withSeedMeta(`harness-pr:${prNumber}`),
    });
    counts.harnessPrChecks++;
  }

  const metaSpecs = [
    { kind: "EVAL_SCENARIO" as const, title: "Add eval for context compression regressions" },
    { kind: "VERIFIER" as const, title: "Verifier: registry publish requires lint pass" },
    { kind: "SKILL_UPDATE" as const, title: "Refresh code-review-wizard activation triggers" },
    { kind: "MAINTENANCE" as const, title: "Retire stale demo skills from lock file" },
    { kind: "DELEGATION" as const, title: "Delegate flaky-step analysis to QA agent" },
    { kind: "RULE_RETIRE" as const, title: "Deprecate legacy inline-style cursor rule" },
  ];
  for (let i = 0; i < metaSpecs.length; i++) {
    const spec = metaSpecs[i];
    const existing = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_project_status", (q: any) => q.eq("projectId", projectId).eq("status", "OPEN"))
      .collect();
    if (existing.some((row: any) => row.title === spec.title)) continue;

    await ctx.db.insert("metaLoopSuggestions", {
      projectId,
      kind: spec.kind,
      title: spec.title,
      summary: `Seeded meta-loop suggestion ${i + 1} from factory health review.`,
      status: i % 4 === 0 ? "ACCEPTED" : "OPEN",
      sourceRef: `run:demo-${i + 1}`,
      packageId: packageIds[i % packageIds.length],
      payload: withSeedMeta(`meta-loop:${i + 1}`),
      createdAt: now - i * 20 * 60_000,
    });
    counts.metaLoopSuggestions++;
  }

  for (let i = 0; i < 5; i++) {
    const pkg = packageIds[i];
    const idempotencyKey = `mc-demo:verifier:${i + 1}`;
    const existing = await ctx.db
      .query("contextVerifiers")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) continue;

    await ctx.db.insert("contextVerifiers", {
      packageId: pkg,
      projectId,
      label: `Verifier ${i + 1}: ${SKILL_PACKAGES[i].displayName}`,
      invariant: "Published packages must pass skill lint and eval gate",
      globPatterns: ["**/*.ts", "**/SKILL.md"],
      active: true,
      passRate: 0.88 + i * 0.02,
      lastRunAt: now - i * 60 * 60_000,
      validatedModel: "claude-sonnet-4",
      sourceSkillId: pkg,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .take(80);
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .take(80);

  const existingAlerts = await ctx.db
    .query("alerts")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const existingAlertKeys = new Set(
    existingAlerts
      .map((row: any) => row.metadata?.seedKey)
      .filter(Boolean)
  );

  for (let i = 0; i < 76; i++) {
    const idempotencyKey = `mc-demo:alert:extra:${i + 1}`;
    if (existingAlertKeys.has(idempotencyKey)) continue;

    const agent = agents[i % agents.length];
    const task = tasks[i % tasks.length];
    const run = runs[i % runs.length];
    const status = i % 5 === 0 ? "OPEN" : i % 5 === 1 ? "ACKNOWLEDGED" : i % 5 === 2 ? "RESOLVED" : "IGNORED";

    await ctx.db.insert("alerts", {
      tenantId,
      projectId,
      severity: i % 12 === 0 ? "CRITICAL" : i % 7 === 0 ? "ERROR" : i % 3 === 0 ? "WARNING" : "INFO",
      type: i % 2 === 0 ? "RUNTIME_EVENT" : "POLICY_EVENT",
      title: `Incident ${i + 29}: ${i % 2 === 0 ? "Runtime anomaly" : "Policy gate triggered"}`,
      description: `Extended demo alert ${i + 29} for Incidents view density`,
      agentId: agent?._id,
      taskId: task?._id,
      runId: run?._id,
      status,
      acknowledgedBy: status === "ACKNOWLEDGED" ? "operator" : undefined,
      acknowledgedAt: status === "ACKNOWLEDGED" ? now - i * 4 * 60_000 : undefined,
      resolvedAt: status === "RESOLVED" ? now - i * 6 * 60_000 : undefined,
      resolutionNote: status === "RESOLVED" ? "Mitigated and monitored" : undefined,
      metadata: withSeedMeta(idempotencyKey),
    });
    counts.alerts++;
  }

  const demoFlags = [
    "ui.shell.v2",
    "context.registry",
    "delivery.workorders",
    "eos.command-center-preview",
    "executor.pi-bridge",
    "eval.framework",
    "missions.plan-release-v1",
    "missions.spec-intake-v1",
    "missions.shared-builder-intent-v1",
    "factory-memory.hybrid",
    "factory-memory.relationships",
    "factory-memory.agentic-retrieval",
    "factory-memory.knowledge-graph",
    "factory-memory.context-engine",
  ];
  for (const key of demoFlags) {
    const projectScopedFlag = key.startsWith("factory-memory.") || key.startsWith("missions.");
    const rows = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .collect();
    const existing = rows.find((row: { projectId?: string }) =>
      projectScopedFlag ? row.projectId === projectId : row.projectId == null,
    );
    if (existing) {
      if (!existing.enabled) {
        await ctx.db.patch(existing._id, {
          enabled: true,
          description: `Demo seed — ${key}`,
          updatedAt: now,
          updatedBy: "seedMissionControlDemo",
        });
      }
    } else {
      await ctx.db.insert("featureFlags", {
        key,
        enabled: true,
        description: `Demo seed — ${key}`,
        projectId: projectScopedFlag ? projectId : undefined,
        createdAt: now,
        updatedAt: now,
        updatedBy: "seedMissionControlDemo",
      });
    }
  }

  const specIntakeGoldenPath = await seedSpecIntakeGoldenPath(ctx, input);
  counts.specIntakeGoldenPaths = specIntakeGoldenPath.missionId ? 1 : 0;

  const evalControlPlaneCounts = await seedEvalControlPlane(ctx, input);
  counts.evalSuites = evalControlPlaneCounts.suites;
  counts.evalControlRuns = evalControlPlaneCounts.runs;

  const factoryMemoryCounts = await seedFactoryMemoryGoldenPath(ctx, {
    tenantId,
    projectId,
    now,
  });
  counts.factoryMemoryDocuments = factoryMemoryCounts.documents;
  counts.factoryMemoryChunks = factoryMemoryCounts.chunks;
  counts.factoryEntities = factoryMemoryCounts.entities;
  counts.factoryRelationships = factoryMemoryCounts.relationships;
  counts.factoryContextPackages = factoryMemoryCounts.contextPackages;

  return counts;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
