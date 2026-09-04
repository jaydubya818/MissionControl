import {
  FACTORY_DEPLOYMENT_PACKAGE_SCHEMA,
  FactoryPackageContractError,
  type FactoryPackageImportErrorCode,
  type FactoryPackageIssuer,
} from "@mission-control/shared";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  COMPANY_PERMISSIONS,
  requireWorkspaceAccess,
} from "./lib/companyAccess";
import { assertAuthorizedDeliveryRecord } from "./lib/deliveryAuthorization";
import {
  FACTORY_PACKAGE_MAPPING_REVISION,
  assertFactoryPackageLocalProjectBinding,
  assertFactoryPackageTargetBinding,
  factoryPackageGovernanceBlockers,
  factoryPackageMappingDigest,
  factoryPackageTargetFingerprint,
  mapFactoryPackageToDrafts,
  resolveFactoryPackageImportRetry,
  type FactoryPackageLocalTarget,
} from "./lib/factoryPackageImport";
import {
  MISSION_PLAN_RELEASE_FLAG,
  type MissionPlanInput,
} from "./lib/missionPlan";
import { validateMissionDraftInput } from "./lib/missionDraft";
import { MISSION_SPEC_INTAKE_FLAG } from "./lib/missionSpec";
import { resolveFlag, type FlagRow } from "./lib/flags";
import {
  FACTORY_PACKAGE_DEFAULT_TIMEOUT_MS,
  FACTORY_PACKAGE_MAX_TIMEOUT_MS,
  retrieveFactoryPackage,
} from "./lib/factoryPackageRetrieval";

const executionEnvironment = v.union(
  v.literal("LOCAL"),
  v.literal("CLOUD"),
  v.literal("REMOTE"),
  v.literal("POLICY_SELECTED"),
);

const codeScopeMapping = v.object({
  requestedCodeScope: v.string(),
  codeScopeId: v.id("repositoryCodeScopes"),
});

const targetSelectionFields = {
  projectId: v.id("projects"),
  repositoryId: v.id("workspaceRepositories"),
  ownerMemberId: v.id("orgMembers"),
  owningTeamId: v.id("scrumTeams"),
  codeScopeMappings: v.array(codeScopeMapping),
  workflowId: v.string(),
  executionEnvironment,
};

const assertionDraft = v.object({
  assertionId: v.string(),
  title: v.string(),
  outcome: v.string(),
  verificationMethod: v.union(
    v.literal("COMMAND"),
    v.literal("TEST"),
    v.literal("BROWSER"),
    v.literal("MANUAL"),
    v.literal("CHECKLIST"),
  ),
  passCondition: v.string(),
  requiredEvidence: v.string(),
  requiresIndependentValidation: v.boolean(),
  waiverAllowed: v.boolean(),
  sourceRequirementIds: v.optional(v.array(v.string())),
  sourceAcceptanceExpectationIds: v.optional(v.array(v.string())),
  sourceVerificationExpectationIds: v.optional(v.array(v.string())),
});

const blueprintDraft = v.object({
  id: v.string(),
  title: v.string(),
  desiredOutcome: v.string(),
  workflowId: v.string(),
  workflowVersion: v.number(),
  sequence: v.number(),
  role: v.union(v.literal("WORKER"), v.literal("VALIDATOR")),
  isMutating: v.boolean(),
  priority: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
  riskLevel: v.union(
    v.literal("LOW"),
    v.literal("MEDIUM"),
    v.literal("HIGH"),
    v.literal("CRITICAL"),
  ),
  constraints: v.array(v.string()),
  requiredApprovals: v.array(v.string()),
  dependsOnBlueprintIds: v.array(v.string()),
  assertionIds: v.array(v.string()),
});

const missionDraft = v.object({
  title: v.string(),
  objective: v.string(),
  context: v.string(),
  constraints: v.array(v.string()),
  sourceOfTruthRefs: v.array(
    v.object({
      kind: v.literal("URL"),
      label: v.string(),
      location: v.string(),
    }),
  ),
  stopCondition: v.string(),
});

const planDraft = v.object({
  summary: v.string(),
  rollbackApproach: v.string(),
  repository: v.string(),
  repositoryBranch: v.string(),
  assertions: v.array(assertionDraft),
  workOrderBlueprints: v.array(blueprintDraft),
});

const approvalLineage = v.object({
  decisionRef: v.string(),
  decisionVersion: v.number(),
  decisionDigest: v.string(),
  approvedBy: v.string(),
  authorizedByRef: v.string(),
  authorityBasisRef: v.string(),
  authorityBasisVersion: v.number(),
  authorityBasisDigest: v.string(),
  approvedAt: v.number(),
});

const requestedTarget = v.object({
  workspaceRef: v.string(),
  repositoryRef: v.string(),
  codeScopeRefs: v.array(v.string()),
  semanticWorkflowRef: v.string(),
  environmentClass: v.string(),
});

interface ImportFailure {
  ok: false;
  error: {
    code: FactoryPackageImportErrorCode;
    message: string;
    correlationId: string;
  };
}

interface TargetResolutionSuccess {
  ok: true;
  tenantId: Id<"tenants">;
  projectId: Id<"projects">;
  repositoryId: Id<"workspaceRepositories">;
  ownerMemberId: Id<"orgMembers">;
  ownerName: string;
  owningTeamId: Id<"scrumTeams">;
  codeScopeMappings: Array<{
    requestedCodeScope: string;
    codeScopeId: Id<"repositoryCodeScopes">;
  }>;
  workflowId: string;
  workflowVersion: number;
  executionEnvironment: FactoryPackageLocalTarget["executionEnvironment"];
  repository: string;
  repositoryBranch: string;
  actorOperatorId: Id<"operators">;
  actorSubject: string;
  planReleaseEnabled: boolean;
  specIntakeEnabled: boolean;
}

type TargetResolution =
  | TargetResolutionSuccess
  | {
      ok: false;
      code:
        | "AUTHENTICATION_REQUIRED"
        | "TARGET_UNAUTHORIZED"
        | "CODE_SCOPE_REJECTED"
        | "WORKFLOW_UNAVAILABLE";
    };

interface PreviewSuccess {
  ok: true;
  preview: {
    schemaVersion: typeof FACTORY_DEPLOYMENT_PACKAGE_SCHEMA;
    issuerId: string;
    packageId: string;
    packageVersion: number;
    packageDigest: string;
    currentStatus: "PUBLISHED";
    publishedAt: string;
    retrievedAt: string;
    correlationId: string;
    requestedTarget: {
      workspaceRef: string;
      repositoryRef: string;
      codeScopeRefs: string[];
      semanticWorkflowRef: string;
      environmentClass: string;
    };
    localTarget: {
      projectId: string;
      repositoryId: string;
      ownerMemberId: string;
      owningTeamId: string;
      codeScopeIds: string[];
      workflowId: string;
      workflowVersion: number;
      executionEnvironment: FactoryPackageLocalTarget["executionEnvironment"];
    };
    missionDraft: {
      title: string;
      objective: string;
      context: string;
      constraints: string[];
      stopCondition: string;
    };
    planDraft: MissionPlanInput;
    governance: {
      canCreateDrafts: boolean;
      blockers: Array<"PLAN_RELEASE_DISABLED" | "SPEC_INTAKE_REQUIRED">;
    };
    mappingRevision: number;
    mappingDigest: string;
    warnings: string[];
  };
}

interface ImportSuccess {
  ok: true;
  receipt: {
    schema: "fdlc.factory-package-import-receipt/v1";
    idempotencyKey: string;
    issuerId: string;
    packageId: string;
    packageVersion: number;
    packageDigest: string;
    status: "DRAFT_CREATED";
    missionId: string;
    missionPlanId: string;
    mappingRevision: number;
    mappingDigest: string;
    warnings: string[];
    created: boolean;
    importedAt: number;
  };
}

type PreviewResult = PreviewSuccess | ImportFailure;
type ImportResult = ImportSuccess | ImportFailure;

export const preview = action({
  args: {
    packageId: v.string(),
    packageVersion: v.number(),
    ...targetSelectionFields,
  },
  handler: async (ctx, args): Promise<PreviewResult> => {
    const localCorrelationId = crypto.randomUUID();
    if (!(await ctx.auth.getUserIdentity())) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "A Clerk-authenticated Mission Control operator is required.",
        localCorrelationId,
      );
    }
    const target = (await ctx.runQuery(
      internal.factoryPackageImports.resolveTarget,
      targetArgs(args),
    )) as TargetResolution;
    if (target.ok === false) return targetFailure(target, localCorrelationId);
    try {
      const config = loadRetrievalConfig();
      assertFactoryPackageLocalProjectBinding(
        config.projectId,
        String(target.projectId),
      );
      const retrieved = await retrieveFactoryPackage({
        packageId: args.packageId,
        packageVersion: args.packageVersion,
        correlationId: localCorrelationId,
        config,
      });
      assertFactoryPackageTargetBinding(
        retrieved.retrieval,
        config.workspaceRef,
        target.repository,
      );
      const mapped = mapFactoryPackageToDrafts({
        retrieval: retrieved.retrieval,
        target: localTarget(target),
        packageReferenceUrl: retrieved.packageReferenceUrl,
      });
      const blockers = factoryPackageGovernanceBlockers(target);
      const packageDocument = retrieved.retrieval.package;
      const attestation = retrieved.retrieval.attestation;
      return {
        ok: true,
        preview: {
          schemaVersion: FACTORY_DEPLOYMENT_PACKAGE_SCHEMA,
          issuerId: packageDocument.issuer.issuer_id,
          packageId: packageDocument.package_id,
          packageVersion: packageDocument.package_version,
          packageDigest: packageDocument.integrity.digest,
          currentStatus: "PUBLISHED",
          publishedAt: attestation.published_at,
          retrievedAt: attestation.retrieved_at,
          correlationId: attestation.correlation_id,
          requestedTarget: requestedTargetValue(retrieved.retrieval),
          localTarget: {
            projectId: String(target.projectId),
            repositoryId: String(target.repositoryId),
            ownerMemberId: String(target.ownerMemberId),
            owningTeamId: String(target.owningTeamId),
            codeScopeIds: target.codeScopeMappings.map((mapping) =>
              String(mapping.codeScopeId),
            ),
            workflowId: target.workflowId,
            workflowVersion: target.workflowVersion,
            executionEnvironment: target.executionEnvironment,
          },
          missionDraft: {
            title: mapped.mission.title,
            objective: mapped.mission.objective,
            context: mapped.mission.context,
            constraints: mapped.mission.constraints,
            stopCondition: mapped.mission.stopCondition,
          },
          planDraft: mapped.plan,
          governance: { canCreateDrafts: blockers.length === 0, blockers },
          mappingRevision: mapped.mappingRevision,
          mappingDigest: mapped.mappingDigest,
          warnings: mapped.warnings,
        },
      };
    } catch (error) {
      return importFailure(error, localCorrelationId);
    }
  },
});

export const importDrafts = action({
  args: {
    packageId: v.string(),
    packageVersion: v.number(),
    expectedPackageDigest: v.string(),
    expectedMappingDigest: v.string(),
    ...targetSelectionFields,
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    const localCorrelationId = crypto.randomUUID();
    if (!(await ctx.auth.getUserIdentity())) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "A Clerk-authenticated Mission Control operator is required.",
        localCorrelationId,
      );
    }
    const target = (await ctx.runQuery(
      internal.factoryPackageImports.resolveTarget,
      targetArgs(args),
    )) as TargetResolution;
    if (target.ok === false) return targetFailure(target, localCorrelationId);
    try {
      const config = loadRetrievalConfig();
      assertFactoryPackageLocalProjectBinding(
        config.projectId,
        String(target.projectId),
      );
      const retrieved = await retrieveFactoryPackage({
        packageId: args.packageId,
        packageVersion: args.packageVersion,
        correlationId: localCorrelationId,
        config,
      });
      assertFactoryPackageTargetBinding(
        retrieved.retrieval,
        config.workspaceRef,
        target.repository,
      );
      const mapped = mapFactoryPackageToDrafts({
        retrieval: retrieved.retrieval,
        target: localTarget(target),
        packageReferenceUrl: retrieved.packageReferenceUrl,
      });
      if (
        retrieved.retrieval.package.integrity.digest !==
          args.expectedPackageDigest ||
        mapped.mappingDigest !== args.expectedMappingDigest
      ) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "Factory package content or its confirmed local mapping changed after preview.",
          retrieved.retrieval.attestation.correlation_id,
        );
      }
      const approval = retrieved.retrieval.attestation.approval;
      return (await ctx.runMutation(
        internal.factoryPackageImports.createDraftsAtomic,
        {
          ...targetArgs(args),
          schemaVersion: FACTORY_DEPLOYMENT_PACKAGE_SCHEMA,
          issuerId: retrieved.retrieval.package.issuer.issuer_id,
          packageId: retrieved.retrieval.package.package_id,
          packageVersion: retrieved.retrieval.package.package_version,
          packageDigest: retrieved.retrieval.package.integrity.digest,
          idempotencyKey: mapped.idempotencyKey,
          targetFingerprint: mapped.targetFingerprint,
          mappingDigest: mapped.mappingDigest,
          mappingRevision: mapped.mappingRevision,
          upstreamCorrelationId: retrieved.retrieval.attestation.correlation_id,
          upstreamPublishedAt: Date.parse(
            retrieved.retrieval.attestation.published_at,
          ),
          upstreamRetrievedAt: Date.parse(
            retrieved.retrieval.attestation.retrieved_at,
          ),
          approval: {
            decisionRef: approval.decision_ref.ref,
            decisionVersion: approval.decision_ref.version!,
            decisionDigest: approval.decision_ref.sha256,
            approvedBy: approval.approved_by,
            authorizedByRef: approval.authorized_by_ref,
            authorityBasisRef: approval.authority_basis_ref.ref,
            authorityBasisVersion: approval.authority_basis_ref.version!,
            authorityBasisDigest: approval.authority_basis_ref.sha256,
            approvedAt: Date.parse(approval.approved_at),
          },
          requestedTarget: requestedTargetValue(retrieved.retrieval),
          mission: {
            title: mapped.mission.title,
            objective: mapped.mission.objective,
            context: mapped.mission.context,
            constraints: mapped.mission.constraints,
            sourceOfTruthRefs: mapped.mission.sourceOfTruthRefs,
            stopCondition: mapped.mission.stopCondition,
          },
          plan: persistablePlan(mapped.plan),
          warnings: mapped.warnings,
        },
      )) as ImportResult;
    } catch (error) {
      return importFailure(error, localCorrelationId);
    }
  },
});

export const resolveTarget = internalQuery({
  args: targetSelectionFields,
  handler: async (ctx, args): Promise<TargetResolution> => {
    return await resolveTargetForAuthenticatedOperator(ctx, args);
  },
});

export const createDraftsAtomic = internalMutation({
  args: {
    ...targetSelectionFields,
    schemaVersion: v.literal(FACTORY_DEPLOYMENT_PACKAGE_SCHEMA),
    issuerId: v.string(),
    packageId: v.string(),
    packageVersion: v.number(),
    packageDigest: v.string(),
    idempotencyKey: v.string(),
    targetFingerprint: v.string(),
    mappingDigest: v.string(),
    mappingRevision: v.number(),
    upstreamCorrelationId: v.string(),
    upstreamPublishedAt: v.number(),
    upstreamRetrievedAt: v.number(),
    approval: approvalLineage,
    requestedTarget,
    mission: missionDraft,
    plan: planDraft,
    warnings: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    const target = await resolveTargetForAuthenticatedOperator(ctx, args);
    if (target.ok === false)
      return targetFailure(target, args.upstreamCorrelationId);
    try {
      assertFactoryPackageLocalProjectBinding(
        configuredFactoryProjectId(),
        String(target.projectId),
      );
    } catch (error) {
      return importFailure(error, args.upstreamCorrelationId);
    }
    const recomputedTargetFingerprint = factoryPackageTargetFingerprint(
      {
        workspace_ref: args.requestedTarget.workspaceRef,
        repository_ref: args.requestedTarget.repositoryRef,
        requested_code_scopes: args.requestedTarget.codeScopeRefs,
        semantic_execution_workflow_ref:
          args.requestedTarget.semanticWorkflowRef,
        environment_class: args.requestedTarget.environmentClass,
      },
      localTarget(target),
    );
    if (
      args.mappingRevision !== FACTORY_PACKAGE_MAPPING_REVISION ||
      recomputedTargetFingerprint !== args.targetFingerprint ||
      factoryPackageMappingDigest(
        args.packageDigest,
        recomputedTargetFingerprint,
      ) !== args.mappingDigest ||
      target.workflowId !== args.workflowId ||
      args.plan.workOrderBlueprints.some(
        (blueprint) =>
          blueprint.workflowId !== target.workflowId ||
          blueprint.workflowVersion !== target.workflowVersion,
      ) ||
      target.repository !== args.plan.repository ||
      target.repositoryBranch !== args.plan.repositoryBranch
    ) {
      return failure(
        "IDEMPOTENCY_CONFLICT",
        "The confirmed Mission Control target changed before draft creation.",
        args.upstreamCorrelationId,
      );
    }
    const existing = await ctx.db
      .query("factoryPackageImports")
      .withIndex("by_external_identity", (q) =>
        q
          .eq("issuerId", args.issuerId)
          .eq("packageId", args.packageId)
          .eq("packageVersion", args.packageVersion),
      )
      .first();
    const retry = resolveFactoryPackageImportRetry(
      existing
        ? {
            packageDigest: existing.packageDigest,
            targetFingerprint: existing.targetFingerprint,
          }
        : null,
      {
        packageDigest: args.packageDigest,
        targetFingerprint: args.targetFingerprint,
      },
    );
    if (retry === "CONFLICT") {
      return failure(
        "IDEMPOTENCY_CONFLICT",
        "This Factory package identity is already bound to different content or a different target.",
        args.upstreamCorrelationId,
      );
    }
    if (existing) {
      const [mission, plan] = await Promise.all([
        ctx.db.get(existing.missionId),
        ctx.db.get(existing.missionPlanId),
      ]);
      if (!mission || !plan) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "The existing Factory package receipt has incomplete draft lineage.",
          args.upstreamCorrelationId,
        );
      }
      return successReceipt(existing, false);
    }

    const blockers = factoryPackageGovernanceBlockers(target);
    if (blockers.length > 0) {
      const code = blockers[0];
      return failure(code, governanceMessage(code), args.upstreamCorrelationId);
    }

    validateMissionDraftInput({
      ...args.mission,
      ownerMemberId: String(target.ownerMemberId),
      owningTeamId: String(target.owningTeamId),
      repositoryId: String(target.repositoryId),
      codeScopeIds: target.codeScopeMappings.map((mapping) =>
        String(mapping.codeScopeId),
      ),
    });
    const collidingMission = await ctx.db
      .query("missions")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    const collidingPlan = await ctx.db
      .query("missionPlans")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", `${args.idempotencyKey}:plan`),
      )
      .first();
    if (collidingMission || collidingPlan) {
      return failure(
        "IDEMPOTENCY_CONFLICT",
        "Factory package draft identities already exist without a complete import receipt.",
        args.upstreamCorrelationId,
      );
    }

    const now = Date.now();
    const missionId = await ctx.db.insert("missions", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      idempotencyKey: args.idempotencyKey,
      title: args.mission.title,
      objective: args.mission.objective,
      context: args.mission.context,
      constraints: args.mission.constraints,
      sourceOfTruthRefs: args.mission.sourceOfTruthRefs,
      owner: target.ownerName,
      ownerMemberId: target.ownerMemberId,
      owningTeamId: target.owningTeamId,
      repositoryId: target.repositoryId,
      codeScopeIds: target.codeScopeMappings.map(
        (mapping) => mapping.codeScopeId,
      ),
      requestedByOperatorId: target.actorOperatorId,
      executionEnvironment: target.executionEnvironment,
      state: "DRAFT",
      executionPolicy: "SERIAL_MUTATIONS",
      maxReadOnlyConcurrency: 2,
      maxCorrectiveIterations: 2,
      correctiveIterations: 0,
      stopCondition: args.mission.stopCondition,
      spentUsd: 0,
      createdAt: now,
      updatedAt: now,
      metadata: packageMetadata(args),
    });
    await ctx.db.insert("missionAssignments", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      missionId,
      memberId: target.ownerMemberId,
      teamId: target.owningTeamId,
      role: "OWNER",
      activeFrom: now,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: target.actorOperatorId,
      updatedBy: target.actorOperatorId,
    });
    await ctx.db.insert("missionEvents", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      missionId,
      eventType: "MISSION_CREATED",
      actorType: "HUMAN",
      actorId: target.actorSubject,
      summary: `Created Mission draft from Factory package ${args.packageId} v${args.packageVersion}`,
      idempotencyKey: `${args.idempotencyKey}:mission-created`,
      timestamp: now,
      metadata: packageMetadata(args),
    });
    const missionPlanId = await ctx.db.insert("missionPlans", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      missionId,
      idempotencyKey: `${args.idempotencyKey}:plan`,
      revisionNumber: 1,
      draftVersion: 1,
      status: "DRAFT",
      summary: args.plan.summary,
      rollbackApproach: args.plan.rollbackApproach,
      repository: args.plan.repository,
      repositoryBranch: args.plan.repositoryBranch,
      createdBy: target.actorSubject,
      assertions: args.plan.assertions,
      workOrderBlueprints: args.plan.workOrderBlueprints,
      createdAt: now,
      metadata: packageMetadata(args),
    });
    await ctx.db.patch(missionId, { state: "PLANNING", updatedAt: now });
    await ctx.db.insert("missionEvents", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      missionId,
      eventType: "PLAN_DRAFT_CREATED",
      actorType: "HUMAN",
      actorId: target.actorSubject,
      summary:
        "Created editable Plan draft from an authenticated Factory package",
      idempotencyKey: `${args.idempotencyKey}:plan-created`,
      timestamp: now,
      metadata: { ...packageMetadata(args), missionPlanId },
    });
    await ctx.db.insert("missionEvents", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      missionId,
      eventType: "FACTORY_PACKAGE_IMPORTED",
      actorType: "HUMAN",
      actorId: target.actorSubject,
      summary: `Imported authenticated Factory package ${args.packageId} v${args.packageVersion}`,
      idempotencyKey: `${args.idempotencyKey}:imported`,
      timestamp: now,
      metadata: { ...packageMetadata(args), missionPlanId },
    });
    const receiptId = await ctx.db.insert("factoryPackageImports", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      repositoryId: target.repositoryId,
      ownerMemberId: target.ownerMemberId,
      owningTeamId: target.owningTeamId,
      codeScopeIds: target.codeScopeMappings.map(
        (mapping) => mapping.codeScopeId,
      ),
      issuerId: args.issuerId,
      packageId: args.packageId,
      packageVersion: args.packageVersion,
      packageDigest: args.packageDigest,
      schemaVersion: args.schemaVersion,
      idempotencyKey: args.idempotencyKey,
      targetFingerprint: args.targetFingerprint,
      mappingDigest: args.mappingDigest,
      mappingRevision: args.mappingRevision,
      status: "DRAFT_CREATED",
      missionId,
      missionPlanId,
      requestedByOperatorId: target.actorOperatorId,
      requestedBySubject: target.actorSubject,
      upstreamCorrelationId: args.upstreamCorrelationId,
      upstreamPublishedAt: args.upstreamPublishedAt,
      upstreamRetrievedAt: args.upstreamRetrievedAt,
      approval: args.approval,
      requestedTarget: args.requestedTarget,
      workflowId: target.workflowId,
      workflowVersion: target.workflowVersion,
      warnings: args.warnings,
      importedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: target.tenantId,
      projectId: target.projectId,
      actorType: "HUMAN",
      actorId: target.actorSubject,
      action: "FACTORY_PACKAGE_IMPORTED",
      description:
        "Created a Mission draft and Plan draft from an authenticated Factory Engineer package.",
      targetType: "factoryPackageImport",
      targetId: String(receiptId),
      afterState: { missionId, missionPlanId, status: "DRAFT_CREATED" },
      metadata: packageMetadata(args),
    });
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) {
      return failure(
        "TEMPORARY_UNAVAILABLE",
        "Factory package receipt creation failed.",
        args.upstreamCorrelationId,
      );
    }
    return successReceipt(receipt, true);
  },
});

async function resolveTargetForAuthenticatedOperator(
  ctx: QueryCtx | MutationCtx,
  args: {
    projectId: Id<"projects">;
    repositoryId: Id<"workspaceRepositories">;
    ownerMemberId: Id<"orgMembers">;
    owningTeamId: Id<"scrumTeams">;
    codeScopeMappings: Array<{
      requestedCodeScope: string;
      codeScopeId: Id<"repositoryCodeScopes">;
    }>;
    workflowId: string;
    executionEnvironment: FactoryPackageLocalTarget["executionEnvironment"];
  },
): Promise<TargetResolution> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
  const project = await ctx.db.get(args.projectId);
  if (!project?.tenantId || project.status !== "ACTIVE") {
    return { ok: false, code: "TARGET_UNAUTHORIZED" };
  }
  let deliveryAccess;
  let assignmentAccess;
  try {
    [deliveryAccess, assignmentAccess] = await Promise.all([
      requireWorkspaceAccess(ctx, project.tenantId, project._id, {
        permission: COMPANY_PERMISSIONS.UPDATE_DELIVERY,
      }),
      requireWorkspaceAccess(ctx, project.tenantId, project._id, {
        permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY,
      }),
    ]);
  } catch {
    return { ok: false, code: "TARGET_UNAUTHORIZED" };
  }
  if (
    deliveryAccess.membership.mode !== "AUTHENTICATED" ||
    assignmentAccess.membership.mode !== "AUTHENTICATED" ||
    !assignmentAccess.membership.operatorId
  ) {
    return { ok: false, code: "AUTHENTICATION_REQUIRED" };
  }
  try {
    assertAuthorizedDeliveryRecord(assignmentAccess, {
      ownerMemberId: args.ownerMemberId,
      owningTeamId: args.owningTeamId,
    });
  } catch {
    return { ok: false, code: "TARGET_UNAUTHORIZED" };
  }
  if (args.codeScopeMappings.length < 1 || args.codeScopeMappings.length > 50) {
    return { ok: false, code: "CODE_SCOPE_REJECTED" };
  }
  if (!args.workflowId.trim() || args.workflowId.length > 1_024) {
    return { ok: false, code: "WORKFLOW_UNAVAILABLE" };
  }
  const requestedRefs = args.codeScopeMappings.map((mapping) =>
    mapping.requestedCodeScope.trim(),
  );
  const codeScopeIds = args.codeScopeMappings.map((mapping) =>
    String(mapping.codeScopeId),
  );
  if (
    requestedRefs.some((reference) => !reference || reference.length > 2_000) ||
    new Set(requestedRefs).size !== requestedRefs.length ||
    new Set(codeScopeIds).size !== codeScopeIds.length
  ) {
    return { ok: false, code: "CODE_SCOPE_REJECTED" };
  }
  const [repository, owner, team, teamMembership, workflow, scopes, flagRows] =
    await Promise.all([
      ctx.db.get(args.repositoryId),
      ctx.db.get(args.ownerMemberId),
      ctx.db.get(args.owningTeamId),
      ctx.db
        .query("teamMemberships")
        .withIndex("by_team_member", (q) =>
          q.eq("teamId", args.owningTeamId).eq("memberId", args.ownerMemberId),
        )
        .first(),
      ctx.db
        .query("workflows")
        .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
        .first(),
      Promise.all(
        args.codeScopeMappings.map((mapping) =>
          ctx.db.get(mapping.codeScopeId),
        ),
      ),
      Promise.all([
        ctx.db
          .query("featureFlags")
          .withIndex("by_key", (q) => q.eq("key", MISSION_PLAN_RELEASE_FLAG))
          .collect(),
        ctx.db
          .query("featureFlags")
          .withIndex("by_key", (q) => q.eq("key", MISSION_SPEC_INTAKE_FLAG))
          .collect(),
      ]),
    ]);
  if (
    !repository ||
    repository.projectId !== project._id ||
    repository.tenantId !== project.tenantId ||
    repository.status !== "READY" ||
    !owner ||
    !owner.active ||
    owner.projectId !== project._id ||
    (owner.tenantId && owner.tenantId !== project.tenantId) ||
    !team ||
    team.status !== "ACTIVE" ||
    team.projectId !== project._id ||
    team.tenantId !== project.tenantId ||
    !teamMembership?.active ||
    teamMembership.projectId !== project._id
  ) {
    return { ok: false, code: "TARGET_UNAUTHORIZED" };
  }
  if (
    scopes.some(
      (scope) =>
        !scope ||
        !scope.active ||
        scope.projectId !== project._id ||
        scope.repositoryId !== repository._id ||
        (scope.owningTeamId && scope.owningTeamId !== team._id) ||
        (args.executionEnvironment !== "POLICY_SELECTED" &&
          (args.executionEnvironment === "REMOTE" ||
            !scope.allowedEnvironments.includes(args.executionEnvironment))),
    )
  ) {
    return { ok: false, code: "CODE_SCOPE_REJECTED" };
  }
  if (
    !workflow ||
    !workflow.active ||
    (workflow.projectId && workflow.projectId !== project._id)
  ) {
    return { ok: false, code: "WORKFLOW_UNAVAILABLE" };
  }
  const rows = flagRows.flat() as FlagRow[];
  return {
    ok: true,
    tenantId: project.tenantId,
    projectId: project._id,
    repositoryId: repository._id,
    ownerMemberId: owner._id,
    ownerName: owner.name,
    owningTeamId: team._id,
    codeScopeMappings: args.codeScopeMappings.map((mapping) => ({
      requestedCodeScope: mapping.requestedCodeScope.trim(),
      codeScopeId: mapping.codeScopeId,
    })),
    workflowId: workflow.workflowId,
    workflowVersion: workflow.version,
    executionEnvironment: args.executionEnvironment,
    repository: repository.repository,
    repositoryBranch: repository.defaultBranch,
    actorOperatorId: assignmentAccess.membership.operatorId,
    actorSubject: identity.subject,
    planReleaseEnabled: resolveFlag(
      rows,
      MISSION_PLAN_RELEASE_FLAG,
      project._id,
    ).enabled,
    specIntakeEnabled: resolveFlag(rows, MISSION_SPEC_INTAKE_FLAG, project._id)
      .enabled,
  };
}

function localTarget(
  target: TargetResolutionSuccess,
): FactoryPackageLocalTarget {
  return {
    projectId: String(target.projectId),
    repositoryId: String(target.repositoryId),
    ownerMemberId: String(target.ownerMemberId),
    owningTeamId: String(target.owningTeamId),
    codeScopeMappings: target.codeScopeMappings.map((mapping) => ({
      requestedCodeScope: mapping.requestedCodeScope,
      codeScopeId: String(mapping.codeScopeId),
    })),
    workflowId: target.workflowId,
    workflowVersion: target.workflowVersion,
    executionEnvironment: target.executionEnvironment,
    repository: target.repository,
    repositoryBranch: target.repositoryBranch,
  };
}

function persistablePlan(plan: MissionPlanInput) {
  return {
    summary: plan.summary,
    rollbackApproach: plan.rollbackApproach,
    repository: plan.repository!,
    repositoryBranch: plan.repositoryBranch!,
    assertions: plan.assertions.map((assertion) => ({
      assertionId: assertion.assertionId,
      title: assertion.title,
      outcome: assertion.outcome,
      verificationMethod: assertion.verificationMethod,
      passCondition: assertion.passCondition,
      requiredEvidence: assertion.requiredEvidence,
      requiresIndependentValidation: assertion.requiresIndependentValidation,
      waiverAllowed: assertion.waiverAllowed,
      sourceRequirementIds: assertion.sourceRequirementIds,
      sourceAcceptanceExpectationIds: assertion.sourceAcceptanceExpectationIds,
      sourceVerificationExpectationIds:
        assertion.sourceVerificationExpectationIds,
    })),
    workOrderBlueprints: plan.workOrderBlueprints.map((blueprint) => ({
      id: blueprint.id,
      title: blueprint.title,
      desiredOutcome: blueprint.desiredOutcome,
      workflowId: blueprint.workflowId!,
      workflowVersion: blueprint.workflowVersion!,
      sequence: blueprint.sequence,
      role: blueprint.role,
      isMutating: blueprint.isMutating,
      priority: blueprint.priority!,
      riskLevel: blueprint.riskLevel!,
      constraints: blueprint.constraints,
      requiredApprovals: blueprint.requiredApprovals,
      dependsOnBlueprintIds: blueprint.dependsOnBlueprintIds,
      assertionIds: blueprint.assertionIds,
    })),
  };
}

function targetArgs(args: {
  projectId: Id<"projects">;
  repositoryId: Id<"workspaceRepositories">;
  ownerMemberId: Id<"orgMembers">;
  owningTeamId: Id<"scrumTeams">;
  codeScopeMappings: Array<{
    requestedCodeScope: string;
    codeScopeId: Id<"repositoryCodeScopes">;
  }>;
  workflowId: string;
  executionEnvironment: FactoryPackageLocalTarget["executionEnvironment"];
}) {
  return {
    projectId: args.projectId,
    repositoryId: args.repositoryId,
    ownerMemberId: args.ownerMemberId,
    owningTeamId: args.owningTeamId,
    codeScopeMappings: args.codeScopeMappings,
    workflowId: args.workflowId,
    executionEnvironment: args.executionEnvironment,
  };
}

function requestedTargetValue(retrieval: {
  package: {
    target: {
      workspace_ref: string;
      repository_ref: string;
      requested_code_scopes: string[];
      semantic_execution_workflow_ref: string;
      environment_class: string;
    };
  };
}) {
  return {
    workspaceRef: retrieval.package.target.workspace_ref,
    repositoryRef: retrieval.package.target.repository_ref,
    codeScopeRefs: retrieval.package.target.requested_code_scopes,
    semanticWorkflowRef:
      retrieval.package.target.semantic_execution_workflow_ref,
    environmentClass: retrieval.package.target.environment_class,
  };
}

function loadRetrievalConfig(): {
  baseUrl: string;
  bearerToken: string;
  issuer: FactoryPackageIssuer;
  workspaceRef: string;
  projectId: string;
  maxAttestationAgeMs: number;
  timeoutMs: number;
} {
  const baseUrl = process.env.FACTORY_ENGINEER_BASE_URL?.trim();
  const bearerToken = process.env.FACTORY_ENGINEER_RETRIEVAL_TOKEN?.trim();
  const issuerId = process.env.FACTORY_ENGINEER_ISSUER_ID?.trim();
  const environment = process.env.FACTORY_ENGINEER_ENVIRONMENT?.trim();
  const workspaceRef = process.env.FACTORY_ENGINEER_WORKSPACE_REF?.trim();
  const projectId = configuredFactoryProjectId();
  const configuredAge = Number(
    process.env.FACTORY_ENGINEER_ATTESTATION_MAX_AGE_MS ?? 300_000,
  );
  const configuredTimeout = Number(
    process.env.FACTORY_ENGINEER_RETRIEVAL_TIMEOUT_MS ??
      FACTORY_PACKAGE_DEFAULT_TIMEOUT_MS,
  );
  if (
    !baseUrl ||
    !bearerToken ||
    !issuerId ||
    !environment ||
    !workspaceRef ||
    !Number.isSafeInteger(configuredAge) ||
    configuredAge < 60_000 ||
    configuredAge > 15 * 60_000 ||
    !Number.isSafeInteger(configuredTimeout) ||
    configuredTimeout < 1_000 ||
    configuredTimeout > FACTORY_PACKAGE_MAX_TIMEOUT_MS
  ) {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer retrieval is not completely configured.",
    );
  }
  return {
    baseUrl,
    bearerToken,
    issuer: {
      issuer_id: issuerId,
      issuer_type: "FDLC_FACTORY_ENGINEER",
      environment,
      authority_scope: "DEPLOYMENT_PACKAGE_PUBLISH",
    },
    workspaceRef,
    projectId,
    maxAttestationAgeMs: configuredAge,
    timeoutMs: configuredTimeout,
  };
}

function configuredFactoryProjectId(): string {
  const projectId = process.env.FACTORY_ENGINEER_PROJECT_ID?.trim();
  if (!projectId) {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer retrieval is not completely configured.",
    );
  }
  return projectId;
}

function packageMetadata(args: {
  issuerId: string;
  packageId: string;
  packageVersion: number;
  packageDigest: string;
  mappingDigest: string;
  mappingRevision: number;
  upstreamCorrelationId: string;
}) {
  return {
    source: "FACTORY_ENGINEER",
    issuerId: args.issuerId,
    packageId: args.packageId,
    packageVersion: args.packageVersion,
    packageDigest: args.packageDigest,
    mappingDigest: args.mappingDigest,
    mappingRevision: args.mappingRevision,
    upstreamCorrelationId: args.upstreamCorrelationId,
  };
}

function successReceipt(
  receipt: Doc<"factoryPackageImports">,
  created: boolean,
): ImportSuccess {
  return {
    ok: true,
    receipt: {
      schema: "fdlc.factory-package-import-receipt/v1",
      idempotencyKey: receipt.idempotencyKey,
      issuerId: receipt.issuerId,
      packageId: receipt.packageId,
      packageVersion: receipt.packageVersion,
      packageDigest: receipt.packageDigest,
      status: "DRAFT_CREATED",
      missionId: String(receipt.missionId),
      missionPlanId: String(receipt.missionPlanId),
      mappingRevision: receipt.mappingRevision,
      mappingDigest: receipt.mappingDigest,
      warnings: receipt.warnings,
      created,
      importedAt: receipt.importedAt,
    },
  };
}

function targetFailure(
  target: Extract<TargetResolution, { ok: false }>,
  correlationId: string,
): ImportFailure {
  const messages: Record<typeof target.code, string> = {
    AUTHENTICATION_REQUIRED:
      "A Clerk-authenticated Mission Control operator is required.",
    TARGET_UNAUTHORIZED:
      "The requested Mission Control target is unavailable or unauthorized.",
    CODE_SCOPE_REJECTED:
      "The requested code-scope mapping is invalid or unauthorized.",
    WORKFLOW_UNAVAILABLE:
      "The selected Mission Control workflow is unavailable.",
  };
  return failure(target.code, messages[target.code], correlationId);
}

function governanceMessage(
  code: "PLAN_RELEASE_DISABLED" | "SPEC_INTAKE_REQUIRED",
): string {
  return code === "PLAN_RELEASE_DISABLED"
    ? "Mission Plan draft import is disabled for this workspace."
    : "This workspace requires a finalized Mission Spec before a Plan draft can be created.";
}

function importFailure(error: unknown, correlationId: string): ImportFailure {
  if (error instanceof FactoryPackageContractError) {
    return failure(error.code, error.message, correlationId);
  }
  const message = error instanceof Error ? error.message : "";
  if (/code scopes|code-scope/i.test(message)) {
    return failure(
      "CODE_SCOPE_REJECTED",
      "The requested code-scope mapping is invalid.",
      correlationId,
    );
  }
  console.error(`Factory package import failed correlation=${correlationId}`);
  return failure(
    "TEMPORARY_UNAVAILABLE",
    "Factory package import is temporarily unavailable.",
    correlationId,
  );
}

function failure(
  code: FactoryPackageImportErrorCode,
  message: string,
  correlationId: string,
): ImportFailure {
  return { ok: false, error: { code, message, correlationId } };
}
