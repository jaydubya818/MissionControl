import { v } from "convex/values";
import { internalMutation, mutation, query } from "./lib/missionScopedFunctions";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { COMPANY_PERMISSIONS, type CompanyPermission } from "./lib/companyAccess";
import {
  assertAuthorizedDeliveryRecord,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { resolveFlag, type FlagRow } from "./lib/flags";
import {
  MISSION_SPEC_INTAKE_FLAG,
  assertMissionSpecBounds,
  assertValidProjectConstitution,
  canonicalizeMissionSpec,
  canonicalizeProjectConstitution,
  evaluateMissionSpecQuality,
  missionSpecDigest,
  projectConstitutionDigest,
} from "./lib/missionSpec";
import {
  missionSpecContentValidator,
  projectConstitutionContentValidator,
} from "./lib/missionSpecValidators";
import { canonicalHash } from "@mission-control/shared";
import { prepareFactoryMemoryContent } from "./lib/factoryMemory";

type MissionSpecCtx = QueryCtx | MutationCtx;

async function resolveOperator(ctx: MissionSpecCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return { actorId: identity.subject, actorSource: "AUTHENTICATED" as const };
  return { actorId: "development:local-operator", actorSource: "DEVELOPMENT_FALLBACK" as const };
}

async function resolveSpecFlag(ctx: MissionSpecCtx, projectId: Id<"projects">) {
  const rows = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", MISSION_SPEC_INTAKE_FLAG))
    .collect() as FlagRow[];
  return resolveFlag(rows, MISSION_SPEC_INTAKE_FLAG, projectId);
}

async function assertSpecWritesEnabled(ctx: MissionSpecCtx, projectId: Id<"projects">) {
  const flag = await resolveSpecFlag(ctx, projectId);
  if (!flag.enabled) throw new Error(`Mission Spec intake is disabled (${MISSION_SPEC_INTAKE_FLAG})`);
}

async function requireProject(
  ctx: MissionSpecCtx,
  projectId: Id<"projects">,
  permission?: CompanyPermission,
): Promise<Doc<"projects">> {
  await requireAuthorizedDeliveryScope(ctx, projectId, permission);
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Workspace not found");
  return project;
}

async function requireMission(
  ctx: MissionSpecCtx,
  projectId: Id<"projects">,
  missionId: Id<"missions">,
  permission?: CompanyPermission,
): Promise<{ project: Doc<"projects">; mission: Doc<"missions"> }> {
  const access = await requireAuthorizedDeliveryScope(ctx, projectId, permission);
  const [project, mission] = await Promise.all([ctx.db.get(projectId), ctx.db.get(missionId)]);
  if (!project) throw new Error("Workspace not found");
  if (!mission || mission.projectId !== projectId) throw new Error("Mission does not belong to the selected workspace");
  assertAuthorizedDeliveryRecord(access, mission);
  return { project, mission };
}

async function audit(ctx: MutationCtx, args: {
  project: Doc<"projects">;
  actorId: string;
  action: string;
  description: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}) {
  await ctx.db.insert("activities", {
    tenantId: args.project.tenantId,
    projectId: args.project._id,
    actorType: "HUMAN",
    actorId: args.actorId,
    action: args.action,
    description: args.description,
    targetType: args.targetType,
    targetId: args.targetId,
    metadata: args.metadata,
  });
}

async function indexPlanningSourceInFactoryMemory(ctx: MutationCtx, args: {
  project: Doc<"projects">;
  repositoryId?: Id<"workspaceRepositories">;
  sourceType: "project-constitution" | "mission-spec";
  sourceId: string;
  sourceRevision: string;
  title: string;
  content: string;
  createdBy: string;
  sourceCreatedAt: number;
  metadata: Record<string, unknown>;
}) {
  if (!args.project.tenantId) return { indexed: false, reason: "NO_TENANT" as const };
  const rows = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", "factory-memory.hybrid"))
    .collect() as FlagRow[];
  if (!resolveFlag(rows, "factory-memory.hybrid", args.project._id).enabled) {
    return { indexed: false, reason: "MEMORY_DISABLED" as const };
  }
  const existing = await ctx.db
    .query("factoryMemoryDocuments")
    .withIndex("by_project_repository_source_revision", (q) => q
      .eq("projectId", args.project._id)
      .eq("repositoryId", args.repositoryId)
      .eq("sourceType", args.sourceType)
      .eq("sourceId", args.sourceId)
      .eq("sourceRevision", args.sourceRevision))
    .first();
  if (existing) return { indexed: false, reason: "ALREADY_INDEXED" as const };

  const prepared = prepareFactoryMemoryContent({
    content: args.content,
    metadata: {
      ...args.metadata,
      sourceDigest: args.sourceRevision,
      frozenLineageWins: true,
      advisoryOnly: true,
      acceptanceAuthority: false,
    },
  });
  const now = Date.now();
  const provenance = {
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    revision: args.sourceRevision,
    timestamp: args.sourceCreatedAt,
    derivation: "authoritative" as const,
  };
  const documentId = await ctx.db.insert("factoryMemoryDocuments", {
    tenantId: args.project.tenantId,
    projectId: args.project._id,
    repositoryId: args.repositoryId,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    title: args.title,
    content: prepared.content,
    metadata: prepared.metadata,
    contentHash: `sha256:${canonicalHash(prepared.content)}`,
    sourceRevision: args.sourceRevision,
    createdAt: args.sourceCreatedAt,
    indexedAt: now,
    provenance,
  });
  for (const chunk of prepared.chunks) {
    await ctx.db.insert("factoryMemoryChunks", {
      tenantId: args.project.tenantId,
      projectId: args.project._id,
      repositoryId: args.repositoryId,
      documentId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      title: args.title,
      content: chunk.content,
      searchText: chunk.searchText,
      chunkIndex: chunk.chunkIndex,
      estimatedTokens: chunk.estimatedTokens,
      contentHash: `sha256:${canonicalHash(chunk.content)}`,
      metadata: prepared.metadata,
      provenance: {
        ...provenance,
        parentDocumentId: String(documentId),
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
      },
    });
  }
  await ctx.db.insert("factoryMemoryIngestionRuns", {
    tenantId: args.project.tenantId,
    projectId: args.project._id,
    repositoryId: args.repositoryId,
    status: "SUCCEEDED",
    sourceTypes: [args.sourceType],
    indexedDocuments: 1,
    indexedChunks: prepared.chunks.length,
    redactionCount: prepared.redactionCount,
    actorId: args.createdBy,
    startedAt: now,
    completedAt: Date.now(),
  });
  return { indexed: true, documentId };
}

export const indexConstitutionInFactoryMemory = internalMutation({
  args: { revisionId: v.id("projectConstitutionRevisions") },
  handler: async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) return { indexed: false, reason: "SOURCE_MISSING" as const };
    const project = await ctx.db.get(revision.projectId);
    if (!project) return { indexed: false, reason: "PROJECT_MISSING" as const };
    return indexPlanningSourceInFactoryMemory(ctx, {
      project,
      sourceType: "project-constitution",
      sourceId: String(revision._id),
      sourceRevision: revision.digest,
      title: `${revision.title} · Constitution r${revision.revisionNumber}`,
      content: JSON.stringify({ title: revision.title, content: revision.content }, null, 2),
      createdBy: revision.createdBy,
      sourceCreatedAt: revision.createdAt,
      metadata: {
        projectConstitutionRevisionId: revision._id,
        revisionNumber: revision.revisionNumber,
        governancePolicyId: revision.governancePolicyId,
        policyEnvelopeId: revision.policyEnvelopeId,
      },
    });
  },
});

export const indexSpecInFactoryMemory = internalMutation({
  args: { revisionId: v.id("missionSpecRevisions") },
  handler: async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) return { indexed: false, reason: "SOURCE_MISSING" as const };
    const [project, mission] = await Promise.all([
      ctx.db.get(revision.projectId),
      ctx.db.get(revision.missionId),
    ]);
    if (!project || !mission) return { indexed: false, reason: "SCOPE_MISSING" as const };
    return indexPlanningSourceInFactoryMemory(ctx, {
      project,
      repositoryId: mission.repositoryId,
      sourceType: "mission-spec",
      sourceId: String(revision._id),
      sourceRevision: revision.digest,
      title: `${mission.title} · Spec r${revision.revisionNumber}`,
      content: JSON.stringify(revision.content, null, 2),
      createdBy: revision.createdBy,
      sourceCreatedAt: revision.createdAt,
      metadata: {
        missionId: mission._id,
        missionSpecRevisionId: revision._id,
        revisionNumber: revision.revisionNumber,
        projectConstitutionRevisionId: revision.projectConstitutionRevisionId,
        projectConstitutionDigest: revision.projectConstitutionDigest,
      },
    });
  },
});

async function assertConstitutionPolicyReferences(ctx: MissionSpecCtx, projectId: Id<"projects">, args: {
  governancePolicyId?: Id<"governancePolicies">;
  policyEnvelopeId?: Id<"policyEnvelopes">;
}) {
  const [policy, envelope] = await Promise.all([
    args.governancePolicyId ? ctx.db.get(args.governancePolicyId) : null,
    args.policyEnvelopeId ? ctx.db.get(args.policyEnvelopeId) : null,
  ]);
  if (args.governancePolicyId && (!policy || !policy.active || (policy.scope === "PROJECT" && policy.projectId !== projectId))) {
    throw new Error("Constitution governance policy must be an active global or matching project policy");
  }
  if (args.policyEnvelopeId && (!envelope || !envelope.active || (envelope.projectId && envelope.projectId !== projectId))) {
    throw new Error("Constitution policy envelope must be an active global or matching project envelope");
  }
}

export const getProjectConstitution = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await requireProject(ctx, args.projectId);
    const [flag, revisions] = await Promise.all([
      resolveSpecFlag(ctx, args.projectId),
      ctx.db.query("projectConstitutionRevisions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(50),
    ]);
    const current = project.currentConstitutionRevisionId
      ? await ctx.db.get(project.currentConstitutionRevisionId)
      : null;
    return { enabled: flag.enabled, project, current, revisions };
  },
});

export const getMissionIntake = query({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const { project, mission } = await requireMission(ctx, args.projectId, args.missionId);
    const [flag, revisions, evaluations, decisions, constitutionRevisions] = await Promise.all([
      resolveSpecFlag(ctx, args.projectId),
      ctx.db.query("missionSpecRevisions").withIndex("by_mission", (q) => q.eq("missionId", args.missionId)).order("desc").take(50),
      ctx.db.query("missionSpecQualityEvaluations").withIndex("by_mission", (q) => q.eq("missionId", args.missionId)).order("desc").take(100),
      ctx.db.query("missionSpecDecisions").withIndex("by_mission", (q) => q.eq("missionId", args.missionId)).order("desc").take(50),
      ctx.db.query("projectConstitutionRevisions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(50),
    ]);
    const currentRevision = mission.currentSpecRevisionId
      ? await ctx.db.get(mission.currentSpecRevisionId)
      : null;
    const currentConstitution = project.currentConstitutionRevisionId
      ? await ctx.db.get(project.currentConstitutionRevisionId)
      : null;
    return {
      enabled: flag.enabled,
      mission,
      currentRevision,
      revisions,
      evaluations,
      decisions,
      currentConstitution,
      constitutionRevisions,
    };
  },
});

export const createConstitutionRevision = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    content: projectConstitutionContentValidator,
    governancePolicyId: v.optional(v.id("governancePolicies")),
    policyEnvelopeId: v.optional(v.id("policyEnvelopes")),
    activate: v.boolean(),
    expectedCurrentRevisionId: v.optional(v.id("projectConstitutionRevisions")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await requireProject(ctx, args.projectId, COMPANY_PERMISSIONS.MANAGE_WORKSPACES);
    await assertSpecWritesEnabled(ctx, args.projectId);
    if (!args.title.trim()) throw new Error("Constitution title is required");
    assertValidProjectConstitution(args.content);
    await assertConstitutionPolicyReferences(ctx, args.projectId, args);
    const duplicate = await ctx.db.query("projectConstitutionRevisions").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.projectId !== args.projectId) throw new Error("Idempotency key is already bound to another workspace");
      return { revision: duplicate, created: false };
    }
    if ((project.currentConstitutionRevisionId ?? null) !== (args.expectedCurrentRevisionId ?? null)) {
      throw new Error("Project Constitution changed in another session. Reload before creating a revision.");
    }
    const current = project.currentConstitutionRevisionId ? await ctx.db.get(project.currentConstitutionRevisionId) : null;
    const latest = await ctx.db.query("projectConstitutionRevisions").withIndex("by_project_revision", (q) => q.eq("projectId", args.projectId)).order("desc").first();
    const operator = await resolveOperator(ctx);
    const content = canonicalizeProjectConstitution(args.content);
    const now = Date.now();
    const revisionId = await ctx.db.insert("projectConstitutionRevisions", {
      tenantId: project.tenantId,
      projectId: project._id,
      baseRevisionId: current?._id,
      idempotencyKey: args.idempotencyKey,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      title: args.title.trim(),
      content,
      governancePolicyId: args.governancePolicyId,
      policyEnvelopeId: args.policyEnvelopeId,
      digest: projectConstitutionDigest(content),
      createdBy: operator.actorId,
      createdActorSource: operator.actorSource,
      createdAt: now,
    });
    if (args.activate) await ctx.db.patch(project._id, { currentConstitutionRevisionId: revisionId, updatedAt: now });
    const revision = await ctx.db.get(revisionId);
    await ctx.scheduler.runAfter(0, internal.missionSpecs.indexConstitutionInFactoryMemory, { revisionId });
    await audit(ctx, {
      project,
      actorId: operator.actorId,
      action: args.activate ? "PROJECT_CONSTITUTION_REVISION_CREATED_AND_ACTIVATED" : "PROJECT_CONSTITUTION_REVISION_CREATED",
      description: `${args.activate ? "Created and activated" : "Created"} Constitution revision ${revision?.revisionNumber}`,
      targetType: "PROJECT_CONSTITUTION_REVISION",
      targetId: String(revisionId),
      metadata: { idempotencyKey: args.idempotencyKey, digest: revision?.digest, baseRevisionId: current?._id, actorSource: operator.actorSource, acceptanceAuthority: false },
    });
    return { revision, created: true };
  },
});

export const activateConstitutionRevision = mutation({
  args: {
    projectId: v.id("projects"),
    revisionId: v.id("projectConstitutionRevisions"),
    expectedCurrentRevisionId: v.optional(v.id("projectConstitutionRevisions")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await requireProject(ctx, args.projectId, COMPANY_PERMISSIONS.MANAGE_WORKSPACES);
    await assertSpecWritesEnabled(ctx, args.projectId);
    if (project.currentConstitutionRevisionId === args.revisionId) return { project, created: false };
    if ((project.currentConstitutionRevisionId ?? null) !== (args.expectedCurrentRevisionId ?? null)) throw new Error("Project Constitution changed in another session. Reload before activating a revision.");
    const revision = await ctx.db.get(args.revisionId);
    if (!revision || revision.projectId !== args.projectId) throw new Error("Constitution revision not found");
    await assertConstitutionPolicyReferences(ctx, args.projectId, revision);
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    await ctx.db.patch(project._id, { currentConstitutionRevisionId: revision._id, updatedAt: now });
    await audit(ctx, {
      project,
      actorId: operator.actorId,
      action: "PROJECT_CONSTITUTION_REVISION_ACTIVATED",
      description: `Activated Constitution revision ${revision.revisionNumber}`,
      targetType: "PROJECT_CONSTITUTION_REVISION",
      targetId: String(revision._id),
      metadata: { idempotencyKey: args.idempotencyKey, digest: revision.digest, priorRevisionId: project.currentConstitutionRevisionId, actorSource: operator.actorSource, acceptanceAuthority: false },
    });
    return { project: await ctx.db.get(project._id), created: true };
  },
});

export const saveMissionSpecRevision = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    expectedCurrentRevisionId: v.optional(v.id("missionSpecRevisions")),
    content: missionSpecContentValidator,
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { project, mission } = await requireMission(ctx, args.projectId, args.missionId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertSpecWritesEnabled(ctx, args.projectId);
    if (["DONE", "CANCELED", "SUPERSEDED"].includes(mission.state)) throw new Error(`Mission Spec cannot be revised while ${mission.state}`);
    if (!project.currentConstitutionRevisionId) throw new Error("Activate a Project Constitution before saving a Mission Spec revision");
    const constitution = await ctx.db.get(project.currentConstitutionRevisionId);
    if (!constitution || constitution.projectId !== project._id) throw new Error("Active Project Constitution is unavailable");
    assertMissionSpecBounds(args.content);
    const duplicate = await ctx.db.query("missionSpecRevisions").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
      return { revision: duplicate, created: false };
    }
    if ((mission.currentSpecRevisionId ?? null) !== (args.expectedCurrentRevisionId ?? null)) throw new Error("Mission Spec changed in another session. Reload before saving a revision.");
    if (args.content.repositoryScope.repositoryId && args.content.repositoryScope.repositoryId !== String(mission.repositoryId ?? "")) throw new Error("Mission Spec repository scope must match the Mission repository");
    const allowedCodeScopeIds = new Set((mission.codeScopeIds ?? []).map(String));
    if (args.content.repositoryScope.codeScopeIds.some((id) => !allowedCodeScopeIds.has(id))) throw new Error("Mission Spec code scope must stay within the Mission code scope");
    const latest = await ctx.db.query("missionSpecRevisions").withIndex("by_mission_revision", (q) => q.eq("missionId", mission._id)).order("desc").first();
    const operator = await resolveOperator(ctx);
    const content = canonicalizeMissionSpec(args.content);
    const now = Date.now();
    const revisionId = await ctx.db.insert("missionSpecRevisions", {
      tenantId: mission.tenantId,
      projectId: project._id,
      missionId: mission._id,
      baseRevisionId: mission.currentSpecRevisionId,
      idempotencyKey: args.idempotencyKey,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      projectConstitutionRevisionId: constitution._id,
      projectConstitutionDigest: constitution.digest,
      content,
      digest: missionSpecDigest(content),
      createdBy: operator.actorId,
      createdActorSource: operator.actorSource,
      createdAt: now,
    });
    await ctx.db.patch(mission._id, { currentSpecRevisionId: revisionId, updatedAt: now });
    const revision = await ctx.db.get(revisionId);
    await ctx.scheduler.runAfter(0, internal.missionSpecs.indexSpecInFactoryMemory, { revisionId });
    await audit(ctx, {
      project,
      actorId: operator.actorId,
      action: "MISSION_SPEC_REVISION_CREATED",
      description: `Created Mission Spec revision ${revision?.revisionNumber}`,
      targetType: "MISSION_SPEC_REVISION",
      targetId: String(revisionId),
      metadata: { idempotencyKey: args.idempotencyKey, missionId: mission._id, digest: revision?.digest, baseRevisionId: revision?.baseRevisionId, constitutionRevisionId: constitution._id, actorSource: operator.actorSource, acceptanceAuthority: false },
    });
    return { revision, created: true };
  },
});

export const evaluateMissionSpecRevision = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    revisionId: v.id("missionSpecRevisions"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { project, mission } = await requireMission(ctx, args.projectId, args.missionId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertSpecWritesEnabled(ctx, args.projectId);
    const duplicate = await ctx.db.query("missionSpecQualityEvaluations").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
      return { evaluation: duplicate, created: false };
    }
    const revision = await ctx.db.get(args.revisionId);
    if (!revision || revision.missionId !== mission._id || revision.projectId !== project._id) throw new Error("Mission Spec revision not found");
    const constitution = await ctx.db.get(revision.projectConstitutionRevisionId);
    if (!constitution || constitution.projectId !== project._id || constitution.digest !== revision.projectConstitutionDigest) throw new Error("Mission Spec Constitution lineage is invalid");
    if (revision.digest !== missionSpecDigest(revision.content)) throw new Error("Mission Spec digest does not match immutable content");
    const result = evaluateMissionSpecQuality({ spec: revision.content, constitution: constitution.content });
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    const evaluationId = await ctx.db.insert("missionSpecQualityEvaluations", {
      tenantId: mission.tenantId,
      projectId: project._id,
      missionId: mission._id,
      missionSpecRevisionId: revision._id,
      missionSpecDigest: revision.digest,
      projectConstitutionRevisionId: constitution._id,
      projectConstitutionDigest: constitution.digest,
      idempotencyKey: args.idempotencyKey,
      rulesetVersion: result.rulesetVersion,
      result: result.result,
      findings: result.findings,
      evaluatedBy: operator.actorId,
      evaluatedActorSource: operator.actorSource,
      evaluatedAt: now,
    });
    const evaluation = await ctx.db.get(evaluationId);
    await audit(ctx, {
      project,
      actorId: operator.actorId,
      action: "MISSION_SPEC_QUALITY_EVALUATED",
      description: `Mission Spec revision ${revision.revisionNumber} ${result.result === "PASS" ? "passed" : "failed"} deterministic quality evaluation`,
      targetType: "MISSION_SPEC_QUALITY_EVALUATION",
      targetId: String(evaluationId),
      metadata: { idempotencyKey: args.idempotencyKey, missionId: mission._id, revisionId: revision._id, result: result.result, findingCodes: result.findings.map((item) => item.code), actorSource: operator.actorSource, acceptanceAuthority: false },
    });
    return { evaluation, created: true };
  },
});

export const finalizeMissionSpecRevision = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    revisionId: v.id("missionSpecRevisions"),
    evaluationId: v.id("missionSpecQualityEvaluations"),
    rationale: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { project, mission } = await requireMission(ctx, args.projectId, args.missionId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertSpecWritesEnabled(ctx, args.projectId);
    if (!args.rationale.trim()) throw new Error("Spec finalization requires a rationale");
    const duplicate = await ctx.db.query("missionSpecDecisions").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
      return { decision: duplicate, created: false };
    }
    const [revision, evaluation] = await Promise.all([ctx.db.get(args.revisionId), ctx.db.get(args.evaluationId)]);
    if (!revision || revision.missionId !== mission._id || mission.currentSpecRevisionId !== revision._id) throw new Error("Only the current exact Mission Spec revision can be finalized");
    const constitution = await ctx.db.get(revision.projectConstitutionRevisionId);
    if (!constitution || constitution.projectId !== project._id || constitution.digest !== revision.projectConstitutionDigest || constitution.digest !== projectConstitutionDigest(constitution.content)) throw new Error("Mission Spec Constitution lineage is unavailable or invalid");
    if (project.currentConstitutionRevisionId !== constitution._id) throw new Error("The active Project Constitution changed. Save and evaluate a new Spec revision before finalizing.");
    await assertConstitutionPolicyReferences(ctx, project._id, constitution);
    if (revision.digest !== missionSpecDigest(revision.content)) throw new Error("Mission Spec digest does not match immutable content");
    if (!evaluation || evaluation.missionSpecRevisionId !== revision._id || evaluation.result !== "PASS" || evaluation.findings.some((item) => item.blocking)) throw new Error("Mission Spec finalization requires a passing exact deterministic evaluation");
    if (evaluation.missionSpecDigest !== revision.digest || evaluation.projectConstitutionRevisionId !== revision.projectConstitutionRevisionId || evaluation.projectConstitutionDigest !== revision.projectConstitutionDigest) throw new Error("Mission Spec evaluation lineage does not match the exact revision");
    const existing = await ctx.db.query("missionSpecDecisions").withIndex("by_spec", (q) => q.eq("missionSpecRevisionId", revision._id)).first();
    if (existing) return { decision: existing, created: false };
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    const decisionId = await ctx.db.insert("missionSpecDecisions", {
      tenantId: mission.tenantId,
      projectId: project._id,
      missionId: mission._id,
      missionSpecRevisionId: revision._id,
      missionSpecQualityEvaluationId: evaluation._id,
      idempotencyKey: args.idempotencyKey,
      decisionType: "FINALIZED",
      rationale: args.rationale.trim(),
      decidedBy: operator.actorId,
      decidedActorSource: operator.actorSource,
      decidedAt: now,
    });
    const decision = await ctx.db.get(decisionId);
    await audit(ctx, {
      project,
      actorId: operator.actorId,
      action: "MISSION_SPEC_REVISION_FINALIZED",
      description: `Finalized Mission Spec revision ${revision.revisionNumber} for planning`,
      targetType: "MISSION_SPEC_DECISION",
      targetId: String(decisionId),
      metadata: { idempotencyKey: args.idempotencyKey, missionId: mission._id, revisionId: revision._id, evaluationId: evaluation._id, digest: revision.digest, actorSource: operator.actorSource, executionAuthority: false, acceptanceAuthority: false },
    });
    return { decision, created: true };
  },
});
