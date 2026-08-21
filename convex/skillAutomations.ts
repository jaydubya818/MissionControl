import { v } from "convex/values";
import { requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { AUTOMATION_ACTOR_IDENTITY_SOURCE } from "./lib/automationGovernance";
import { sha256Hex } from "./lib/harnessPrChecks";
import {
  ADAPTER_TYPES,
  SKILL_AUTOMATION_POLICY_VERSION,
  evaluateSkillEligibility,
  generateArtifact,
  generatedArtifactPath,
  validateArtifactConfiguration,
  type SkillAutomationAdapter,
} from "./lib/skillAutomation";

const adapterValidator = v.union(...ADAPTER_TYPES.map((adapter) => v.literal(adapter)) as any);
const candidateId = (projectId: string, packageId: string, versionId: string) =>
  `skill:${projectId}:${packageId}:${versionId}`;
const sourceRef = (id: string) => `skill-automation:${id}`;

async function skillContext(ctx: any, projectId: any, packageId: any) {
  const [project, skill] = await Promise.all([ctx.db.get(projectId), ctx.db.get(packageId)]);
  if (!project) throw new Error("Workspace not found or access is unavailable");
  if (!skill || skill.projectId !== projectId || skill.type !== "SKILL") {
    throw new Error("Skill is outside the selected workspace");
  }
  const version = skill.currentVersionId ? await ctx.db.get(skill.currentVersionId) : null;
  if (!version) throw new Error("Skill has no published current version");
  const id = candidateId(String(projectId), String(skill._id), String(version._id));
  return { project, skill, version, id, eligibility: evaluateSkillEligibility({
    skillId: skill.slug,
    version: version.version,
    status: version.status,
    profile: version.automationProfile,
  }) };
}

async function recordDecision(ctx: any, input: {
  projectId: any; definitionId?: any; candidateId?: string; type: any; actorId: string;
  reason: string; version?: number; previousState?: string; newState?: string;
  correlationId?: string; causationId?: string; metadata?: any;
}) {
  return ctx.db.insert("automationDecisions", {
    projectId: input.projectId,
    automationDefinitionId: input.definitionId,
    candidateId: input.candidateId,
    decisionType: input.type,
    actorId: input.actorId,
    actorIdentitySource: AUTOMATION_ACTOR_IDENTITY_SOURCE,
    reason: input.reason,
    policyVersion: SKILL_AUTOMATION_POLICY_VERSION,
    definitionVersion: input.version ?? 0,
    decidedAt: Date.now(),
    entityType: input.definitionId ? "AUTOMATION_DEFINITION" : "SKILL_CANDIDATE",
    entityId: String(input.definitionId ?? input.candidateId ?? ""),
    previousState: input.previousState,
    newState: input.newState,
    correlationId: input.correlationId,
    causationId: input.causationId,
    metadata: input.metadata,
  });
}

export const listCandidates = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const packages = await ctx.db.query("contextPackages").withIndex("by_type", q => q.eq("type", "SKILL")).collect();
    const scoped = packages.filter(item => item.projectId === args.projectId && item.currentVersionId);
    const [suggestions, definitions, drafts] = await Promise.all([
      ctx.db.query("metaLoopSuggestions").withIndex("by_project", q => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("automationDefinitions").withIndex("by_project", q => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("automationConversionDrafts").withIndex("by_project", q => q.eq("projectId", args.projectId)).collect(),
    ]);
    return Promise.all(scoped.map(async skill => {
      const version = await ctx.db.get(skill.currentVersionId!);
      if (!version) return null;
      const id = candidateId(String(args.projectId), String(skill._id), String(version._id));
      const assessment = evaluateSkillEligibility({
        skillId: skill.slug, version: version.version, status: version.status, profile: version.automationProfile,
      });
      const suggestion = suggestions.find(item => item.sourceRef === sourceRef(id));
      const definition = definitions.find(item => item.sourceSkillVersionId === version._id);
      const draft = drafts.filter(item => item.sourceSkillVersionId === version._id && item.status === "IN_PROGRESS")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return {
        id, skill, version, assessment, suggestion, definition, draft,
        disposition: definition ? "CONVERTED" : suggestion?.status === "DISMISSED" ? "DISMISSED" : suggestion?.status === "ACCEPTED" ? "DEFERRED" : "OPEN",
      };
    })).then(rows => rows.filter(Boolean));
  },
});

export const getAssessment = query({
  args: { projectId: v.id("projects"), packageId: v.id("contextPackages") },
  handler: async (ctx, args) => skillContext(ctx, args.projectId, args.packageId),
});

export const decideCandidate = mutation({
  args: {
    projectId: v.id("projects"), packageId: v.id("contextPackages"),
    decision: v.union(v.literal("DEFER"), v.literal("DISMISS"), v.literal("RESTORE")),
    actorId: v.string(), reason: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.reason.trim()) throw new Error("A reason is required");
    const data = await skillContext(ctx, args.projectId, args.packageId);
    const existing = (await ctx.db.query("metaLoopSuggestions").withIndex("by_project", q => q.eq("projectId", args.projectId)).collect())
      .find(item => item.sourceRef === sourceRef(data.id));
    const status = args.decision === "RESTORE" ? "OPEN" : args.decision === "DEFER" ? "ACCEPTED" : "DISMISSED";
    const payload = { type: "SKILL_AUTOMATION_CANDIDATE", candidateId: data.id, skillId: data.skill._id, skillVersionId: data.version._id, assessment: data.eligibility };
    if (existing) await ctx.db.patch(existing._id, { status, payload, resolvedAt: status === "OPEN" ? undefined : Date.now() });
    else await ctx.db.insert("metaLoopSuggestions", {
      projectId: args.projectId, kind: "DELEGATION", title: `Automate ${data.skill.displayName ?? data.skill.name}`,
      summary: args.reason, status, sourceRef: sourceRef(data.id), packageId: data.skill._id, payload,
      createdAt: Date.now(), resolvedAt: status === "OPEN" ? undefined : Date.now(),
    });
    await recordDecision(ctx, {
      projectId: args.projectId, candidateId: data.id,
      type: args.decision === "DEFER" ? "DEFERRED" : args.decision === "DISMISS" ? "DISMISSED" : "RESTORED",
      actorId: args.actorId, reason: args.reason, newState: status,
    });
    return { status };
  },
});

export const startDraft = mutation({
  args: { projectId: v.id("projects"), packageId: v.id("contextPackages"), actorId: v.string() },
  handler: async (ctx, args) => {
    const data = await skillContext(ctx, args.projectId, args.packageId);
    if (data.eligibility.status !== "ELIGIBLE") throw new Error("Only eligible deterministic skills can be converted");
    const existing = (await ctx.db.query("automationConversionDrafts").withIndex("by_project_skill", q =>
      q.eq("projectId", args.projectId).eq("sourceSkillId", args.packageId)).collect())
      .filter(item => item.status === "IN_PROGRESS").sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (existing) return existing;
    const now = Date.now();
    const adapterType = data.eligibility.recommendedAdapter ?? "TYPESCRIPT";
    const path = generatedArtifactPath(adapterType, data.skill.slug);
    const correlationId = `skill-conversion:${data.id}:${now}`;
    const id = await ctx.db.insert("automationConversionDrafts", {
      projectId: args.projectId, sourceSkillId: data.skill._id, sourceSkillVersionId: data.version._id,
      candidateId: data.id, currentStep: 1, status: "IN_PROGRESS", adapterType,
      configuration: {
        name: data.skill.displayName ?? data.skill.name, description: data.skill.description,
        mode: data.version.automationProfile?.existingImplementation ? "LINKED" : "GENERATED",
        repository: data.project.githubRepo ?? data.version.sourceRepo ?? "", branch: data.project.githubBranch ?? "main",
        workingDirectory: ".", path: data.version.automationProfile?.existingImplementation ?? path,
        triggerType: "MANUAL", cron: "", timezone: "UTC", workflowId: "automation-execution",
        approvalRequired: true, receiptRequired: true, automaticDispatch: false, isMutating: false,
        requiredPermissions: data.version.automationProfile?.requiredPermissions ?? [],
        secretReferences: data.version.automationProfile?.secretReferences ?? [],
        maxDurationSeconds: 900, maxCostUsd: 1, maxRetries: 0,
      },
      eligibilitySnapshot: data.eligibility, correlationId, createdBy: args.actorId, createdAt: now, updatedAt: now,
    });
    await recordDecision(ctx, { projectId: args.projectId, candidateId: data.id, type: "CONVERSION_STARTED", actorId: args.actorId, reason: "Started governed conversion", correlationId });
    return await ctx.db.get(id);
  },
});

export const updateDraft = mutation({
  args: { draftId: v.id("automationConversionDrafts"), currentStep: v.number(), adapterType: adapterValidator, configuration: v.any(), actorId: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.status !== "IN_PROGRESS") throw new Error("Conversion draft is not editable");
    await ctx.db.patch(draft._id, { currentStep: Math.max(1, Math.min(7, args.currentStep)), adapterType: args.adapterType, configuration: args.configuration, updatedAt: Date.now() });
    return await ctx.db.get(draft._id);
  },
});

export const previewArtifact = mutation({
  args: { draftId: v.id("automationConversionDrafts"), actorId: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft?.adapterType) throw new Error("Select an adapter before generating an artifact");
    const skill = await ctx.db.get(draft.sourceSkillId);
    const config = draft.configuration ?? {};
    const content = config.artifactContent ?? generateArtifact({
      adapterType: draft.adapterType as SkillAutomationAdapter,
      name: config.name ?? skill?.name ?? "Automation",
      description: config.description ?? skill?.description ?? "",
      path: config.path,
      configuration: config,
    });
    const preview = {
      mode: config.mode ?? "GENERATED", path: config.path, content,
      diff: config.mode === "LINKED" ? "Linked artifacts are not overwritten." : `+++ ${config.path}\n${content.split("\n").map((line: string) => `+${line}`).join("\n")}`,
    };
    await ctx.db.patch(draft._id, { artifactPreview: preview, updatedAt: Date.now() });
    await recordDecision(ctx, {
      projectId: draft.projectId, candidateId: draft.candidateId, type: "ARTIFACT_GENERATED",
      actorId: args.actorId, reason: config.artifactContent ? "Edited artifact preview persisted" : "Deterministic artifact preview generated",
      correlationId: draft.correlationId, metadata: { path: config.path, adapterType: draft.adapterType },
    });
    return preview;
  },
});

export const validateDraft = mutation({
  args: { draftId: v.id("automationConversionDrafts"), actorId: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft?.adapterType) throw new Error("Adapter is required");
    const config = draft.configuration ?? {};
    const skill = await ctx.db.get(draft.sourceSkillId);
    const project = await ctx.db.get(draft.projectId);
    const content = config.mode === "LINKED" ? undefined : config.artifactContent ?? generateArtifact({
      adapterType: draft.adapterType as SkillAutomationAdapter,
      name: config.name ?? skill?.name ?? "Automation", description: config.description ?? skill?.description ?? "",
      path: config.path, configuration: config,
    });
    const findings = validateArtifactConfiguration({
      adapterType: draft.adapterType as SkillAutomationAdapter, path: config.path, command: config.command,
      secretReferences: config.secretReferences, isMutating: config.isMutating, automaticDispatch: config.automaticDispatch,
      approvalRequired: config.approvalRequired, receiptRequired: config.receiptRequired, cron: config.cron,
      content, steps: config.steps,
    });
    if (!config.repository || (project?.githubRepo && config.repository !== project.githubRepo)) findings.push("Artifact repository must match the selected workspace");
    const duplicate = (await ctx.db.query("automationArtifacts").withIndex("by_project_path", q =>
      q.eq("projectId", draft.projectId).eq("repository", config.repository).eq("path", config.path)).first());
    if (duplicate) findings.push("An Automation artifact already exists at this repository path");
    const result = { status: findings.length ? "FAILED" : "PASSED", findings, content };
    await ctx.db.patch(draft._id, { artifactPreview: { path: config.path, content, mode: config.mode }, validationResult: result, updatedAt: Date.now() });
    await recordDecision(ctx, { projectId: draft.projectId, candidateId: draft.candidateId, type: "ARTIFACT_VALIDATED", actorId: args.actorId, reason: findings.length ? "Artifact validation failed" : "Artifact validation passed", correlationId: draft.correlationId, metadata: { findings } });
    return result;
  },
});

export const createDefinition = mutation({
  args: { draftId: v.id("automationConversionDrafts"), actorId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    if (!args.reason.trim()) throw new Error("A reason is required");
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.validationResult?.status !== "PASSED" || !draft.adapterType) throw new Error("Draft must pass validation");
    const [skill, version, project] = await Promise.all([ctx.db.get(draft.sourceSkillId), ctx.db.get(draft.sourceSkillVersionId), ctx.db.get(draft.projectId)]);
    if (!skill || !version || !project) throw new Error("Conversion source is unavailable");
    const config = draft.configuration;
    const now = Date.now();
    const suggestions = await ctx.db.query("metaLoopSuggestions").withIndex("by_project", q => q.eq("projectId", draft.projectId)).collect();
    let suggestion = suggestions.find(item => item.sourceRef === sourceRef(draft.candidateId));
    if (!suggestion) {
      const id = await ctx.db.insert("metaLoopSuggestions", {
        projectId: draft.projectId, kind: "DELEGATION", title: `Automate ${skill.displayName ?? skill.name}`,
        summary: args.reason, status: "ACCEPTED", sourceRef: sourceRef(draft.candidateId), packageId: skill._id,
        payload: { type: "SKILL_AUTOMATION_CANDIDATE", candidateId: draft.candidateId }, createdAt: now, resolvedAt: now,
      });
      suggestion = (await ctx.db.get(id)) ?? undefined;
    } else if (suggestion.status !== "ACCEPTED") await ctx.db.patch(suggestion._id, { status: "ACCEPTED", resolvedAt: now });
    if (!suggestion) throw new Error("Could not persist source candidate");
    const content = draft.artifactPreview?.content;
    const artifactId = await ctx.db.insert("automationArtifacts", {
      projectId: draft.projectId, sourceSkillId: skill._id, sourceSkillVersionId: version._id,
      adapterType: draft.adapterType as SkillAutomationAdapter, mode: config.mode ?? "GENERATED", repository: config.repository,
      branch: config.branch ?? "main", workingDirectory: config.workingDirectory ?? ".", path: config.path,
      content, contentHash: `sha256:${await sha256Hex(content ?? `${config.repository}:${config.path}`)}`,
      manifest: {
        adapterType: draft.adapterType,
        command: config.command,
        baseUrl: config.baseUrl,
        endpoint: config.endpoint,
        method: config.method,
        expectedStatus: config.expectedStatus,
        steps: config.steps,
        browser: config.browser,
        headless: config.headless ?? true,
        screenshotPolicy: config.screenshotPolicy ?? "failure-and-final",
        tracePolicy: config.tracePolicy ?? "retain-on-failure",
        evidenceCollection: config.evidenceCollection ?? ["stdout", "stderr", "artifacts"],
        readOnly: true,
      },
      validationStatus: "PASSED", validationFindings: [], createdBy: args.actorId, createdAt: now, updatedAt: now,
    });
    const definitionId = await ctx.db.insert("automationDefinitions", {
      projectId: draft.projectId, sourceCandidateId: suggestion._id, definitionVersion: 1,
      name: config.name ?? skill.displayName ?? skill.name, description: config.description ?? skill.description, ownerId: skill.owner,
      sourceSkillId: skill._id, sourceSkillVersionId: version._id, sourceSkillVersion: version.version,
      adapterType: draft.adapterType as SkillAutomationAdapter, artifactId, artifactPath: config.path, branch: config.branch ?? "main",
      workingDirectory: config.workingDirectory ?? ".", runtime: draft.adapterType.toLowerCase(),
      inputBindings: config.inputBindings ?? {}, outputContract: version.automationProfile?.outputSchema ?? {},
      requiredPermissions: config.requiredPermissions ?? [], secretReferences: config.secretReferences ?? [],
      validationStatus: "PASSED", reviewStatus: "DRAFT", correlationId: draft.correlationId,
      workflowId: config.workflowId ?? "automation-execution", workflowVersion: "v1",
      triggerType: config.triggerType ?? "MANUAL", triggerConfig: { cron: config.cron, timezone: config.timezone ?? "UTC" },
      scope: String(draft.projectId), repositoryIds: [config.repository], environmentIds: ["local"],
      autonomyLevel: "LEVEL_1", isMutating: false,
      riskLevel: skill.riskLevel === "RED" ? "HIGH" : skill.riskLevel === "YELLOW" ? "MEDIUM" : "LOW",
      requiredApprovalTypes: ["OPERATOR"], verificationContract: { method: version.automationProfile?.verificationMethod, independent: true },
      evidenceRequirements: version.automationProfile?.successCriteria ?? ["Deterministic adapter completed successfully"],
      maxDurationSeconds: config.maxDurationSeconds ?? 900, maxRetries: config.maxRetries ?? 0, maxCostUsd: config.maxCostUsd ?? 1,
      concurrencyLimit: 1, idempotencyStrategy: "definition-version:trigger-window", overlapPolicy: "SKIP", catchUpPolicy: "SKIP_MISSED",
      status: "DISABLED", reliabilityState: "PROBATION", health: "UNKNOWN", createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(draft._id, { status: "COMPLETED", currentStep: 7, updatedAt: now });
    await recordDecision(ctx, { projectId: draft.projectId, definitionId, candidateId: draft.candidateId, type: "CREATED", actorId: args.actorId, reason: args.reason, version: 1, newState: "DISABLED", correlationId: draft.correlationId });
    return { definitionId, artifactId };
  },
});

export const submitForReview = mutation({
  args: { definitionId: v.id("automationDefinitions"), actorId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    if (!args.reason.trim()) throw new Error("A reason is required");
    const definition = await ctx.db.get(args.definitionId);
    if (!definition || definition.validationStatus !== "PASSED") throw new Error("Definition is not reviewable");
    await ctx.db.patch(definition._id, { reviewStatus: "READY_FOR_REVIEW", updatedAt: Date.now() });
    await recordDecision(ctx, { projectId: definition.projectId, definitionId: definition._id, type: "REVIEW_REQUESTED", actorId: args.actorId, reason: args.reason, version: definition.definitionVersion, previousState: definition.reviewStatus, newState: "READY_FOR_REVIEW", correlationId: definition.correlationId });
  },
});

export const approve = mutation({
  args: { definitionId: v.id("automationDefinitions"), actorId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    if (!args.reason.trim()) throw new Error("A reason is required");
    const definition = await ctx.db.get(args.definitionId);
    if (!definition || definition.reviewStatus !== "READY_FOR_REVIEW") throw new Error("Definition must be ready for review");
    const now = Date.now();
    await ctx.db.patch(definition._id, { reviewStatus: "APPROVED", approvedBy: args.actorId, approvedAt: now, updatedAt: now });
    await recordDecision(ctx, { projectId: definition.projectId, definitionId: definition._id, type: "APPROVED", actorId: args.actorId, reason: args.reason, version: definition.definitionVersion, previousState: definition.reviewStatus, newState: "APPROVED", correlationId: definition.correlationId });
  },
});

export const validateDefinition = mutation({
  args: { definitionId: v.id("automationDefinitions"), actorId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    if (args.reason.trim().length < 5) throw new Error("A reason of at least five characters is required");
    const definition = await ctx.db.get(args.definitionId);
    if (!definition) throw new Error("Automation Definition not found");
    const artifact = definition.artifactId
      ? await ctx.db.get(definition.artifactId as Id<"automationArtifacts">)
      : null;
    const findings = [
      ...(!artifact || artifact.validationStatus !== "PASSED" ? ["Approved execution artifact is unavailable or invalid"] : []),
      ...(definition.autonomyLevel !== "LEVEL_1" ? ["Safety level must remain LEVEL_1"] : []),
      ...(definition.isMutating ? ["V1 Definitions must be read-only"] : []),
      ...(definition.requiredApprovalTypes.length === 0 ? ["Operator approval is required"] : []),
      ...(!definition.verificationContract?.independent ? ["Independent verification is required"] : []),
      ...(definition.evidenceRequirements.length === 0 ? ["Evidence requirements are required"] : []),
      ...(definition.maxDurationSeconds <= 0 ? ["Maximum runtime must be positive"] : []),
    ];
    const validationStatus = findings.length ? "FAILED" : "PASSED";
    await ctx.db.patch(definition._id, { validationStatus, updatedAt: Date.now() });
    await recordDecision(ctx, {
      projectId: definition.projectId, definitionId: definition._id, type: "VALIDATED",
      actorId: args.actorId, reason: args.reason.trim(), version: definition.definitionVersion,
      previousState: definition.validationStatus, newState: validationStatus,
      correlationId: definition.correlationId, metadata: { findings },
    });
    return { status: validationStatus, findings };
  },
});

export const updateDefinition = mutation({
  args: {
    definitionId: v.id("automationDefinitions"),
    name: v.string(),
    description: v.string(),
    maxDurationSeconds: v.number(),
    maxCostUsd: v.number(),
    actorId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.reason.trim().length < 5) throw new Error("A reason of at least five characters is required");
    if (!args.name.trim() || !args.description.trim()) throw new Error("Name and description are required");
    if (args.maxDurationSeconds < 1 || args.maxDurationSeconds > 3600) throw new Error("Runtime must be between 1 and 3600 seconds");
    if (args.maxCostUsd < 0 || args.maxCostUsd > 100) throw new Error("Cost limit must be between $0 and $100");
    const definition = await ctx.db.get(args.definitionId);
    if (!definition) throw new Error("Automation Definition not found");
    if (!["DISABLED", "DRAFT"].includes(definition.status) || !["DRAFT", "REJECTED"].includes(definition.reviewStatus ?? "DRAFT")) {
      throw new Error("Only a non-approved draft Definition can be edited; create a new version for approved Definitions");
    }
    await ctx.db.patch(definition._id, {
      name: args.name.trim(), description: args.description.trim(),
      maxDurationSeconds: args.maxDurationSeconds, maxCostUsd: args.maxCostUsd,
      validationStatus: "PENDING", updatedAt: Date.now(),
    });
    await recordDecision(ctx, {
      projectId: definition.projectId, definitionId: definition._id, type: "UPDATED",
      actorId: args.actorId, reason: args.reason.trim(), version: definition.definitionVersion,
      previousState: definition.validationStatus, newState: "PENDING",
      correlationId: definition.correlationId,
      metadata: { changedFields: ["name", "description", "maxDurationSeconds", "maxCostUsd"] },
    });
    return { definitionId: definition._id };
  },
});

const lifecycleAction = v.union(
  v.literal("PAUSE"), v.literal("RESUME"), v.literal("SUSPEND"),
  v.literal("DISABLE"), v.literal("ARCHIVE")
);

export const transitionDefinition = mutation({
  args: { definitionId: v.id("automationDefinitions"), action: lifecycleAction, actorId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    if (args.reason.trim().length < 5) throw new Error("A reason of at least five characters is required");
    const definition = await ctx.db.get(args.definitionId);
    if (!definition) throw new Error("Automation Definition not found");
    const allowed: Record<string, string[]> = {
      PAUSE: ["ACTIVE"], RESUME: ["PAUSED"], SUSPEND: ["ACTIVE", "PAUSED"],
      DISABLE: ["ACTIVE", "PAUSED", "SUSPENDED"], ARCHIVE: ["DISABLED", "RETIRED"],
    };
    if (!allowed[args.action].includes(definition.status)) {
      throw new Error(`${args.action} is not allowed from ${definition.status}`);
    }
    const next = args.action === "PAUSE" ? "PAUSED"
      : args.action === "RESUME" ? "ACTIVE"
        : args.action === "SUSPEND" ? "SUSPENDED"
          : args.action === "ARCHIVE" ? "ARCHIVED" : "DISABLED";
    const decisionType = args.action === "PAUSE" ? "PAUSED"
      : args.action === "RESUME" ? "RESUMED"
        : args.action === "SUSPEND" ? "SUSPENDED"
          : args.action === "ARCHIVE" ? "ARCHIVED" : "DISABLED";
    const now = Date.now();
    await ctx.db.patch(definition._id, {
      status: next as any,
      pausedBy: ["PAUSED", "SUSPENDED"].includes(next) ? args.actorId : undefined,
      pausedAt: ["PAUSED", "SUSPENDED"].includes(next) ? now : undefined,
      pauseReason: ["PAUSED", "SUSPENDED"].includes(next) ? args.reason.trim() : undefined,
      nextRunAt: next === "ACTIVE" ? now : undefined,
      reliabilityState: next === "SUSPENDED" ? "SUSPENDED" : definition.reliabilityState,
      health: next === "SUSPENDED" ? "DEGRADED" : definition.health,
      updatedAt: now,
    });
    await recordDecision(ctx, {
      projectId: definition.projectId, definitionId: definition._id, type: decisionType,
      actorId: args.actorId, reason: args.reason.trim(), version: definition.definitionVersion,
      previousState: definition.status, newState: next, correlationId: definition.correlationId,
    });
    return { definitionId: definition._id, previousState: definition.status, newState: next };
  },
});

export const cloneDefinition = mutation({
  args: {
    definitionId: v.id("automationDefinitions"), mode: v.union(v.literal("CLONE"), v.literal("NEW_VERSION")),
    actorId: v.string(), reason: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.reason.trim().length < 5) throw new Error("A reason is required");
    const source = await ctx.db.get(args.definitionId);
    if (!source) throw new Error("Automation Definition not found");
    const now = Date.now();
    const { _id, _creationTime, ...copy } = source;
    const definitionVersion = args.mode === "NEW_VERSION" ? source.definitionVersion + 1 : 1;
    const name = args.mode === "CLONE" ? `${source.name} (copy)` : source.name;
    const correlationId = `${source.correlationId ?? source._id}:${args.mode.toLowerCase()}:${now}`;
    const definitionId = await ctx.db.insert("automationDefinitions", {
      ...copy, name, definitionVersion, correlationId,
      status: "DISABLED", reviewStatus: "DRAFT", approvedBy: undefined, approvedAt: undefined,
      activatedBy: undefined, activatedAt: undefined, activationReason: undefined,
      nextRunAt: undefined, lastRunAt: undefined, lastResult: undefined, lastReviewGateWorkOrderId: undefined,
      health: "UNKNOWN", reliabilityState: "PROBATION", createdAt: now, updatedAt: now,
    });
    await recordDecision(ctx, {
      projectId: source.projectId, definitionId, type: args.mode === "CLONE" ? "CLONED" : "VERSION_CREATED",
      actorId: args.actorId, reason: args.reason.trim(), version: definitionVersion,
      previousState: String(source._id), newState: "DISABLED", correlationId,
      metadata: { sourceDefinitionId: source._id, sourceDefinitionVersion: source.definitionVersion },
    });
    return { definitionId };
  },
});

export const getExecutionManifest = query({
  args: {
    workOrderId: v.id("workOrders"),
    allowCompleted: v.optional(v.boolean()),
    claimId: v.optional(v.string()),
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found");
    const definitionId = workOrder.metadata?.automationDefinitionId as Id<"automationDefinitions"> | undefined;
    if (!definitionId) throw new Error("WorkOrder is not linked to an Automation Definition");
    const definition = await ctx.db.get(definitionId);
    if (!definition) throw new Error("Automation Definition is unavailable");
    if (definition.reviewStatus !== "APPROVED" || definition.validationStatus !== "PASSED") {
      throw new Error("Automation Definition is not approved and validated");
    }
    if (definition.autonomyLevel !== "LEVEL_1" || definition.isMutating) throw new Error("Execution violates the LEVEL_1 boundary");
    let run = workOrder.currentExecutionRunId ? await ctx.db.get(workOrder.currentExecutionRunId) : null;
    if (!run && args.allowCompleted) {
      run = await ctx.db.query("workflowRuns")
        .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id))
        .order("desc")
        .filter((q: any) => q.eq(q.field("status"), "COMPLETED"))
        .first();
    }
    const allowedRunStatuses = args.allowCompleted ? ["COMPLETED"] : ["PENDING", "RUNNING"];
    if (!run || !allowedRunStatuses.includes(run.status)) throw new Error("WorkOrder has no eligible dispatch-created run");
    if (!args.allowCompleted) {
      const matchingActiveClaim = Boolean(
        args.claimId
        && args.ownerId
        && run.executionClaimId === args.claimId
        && run.executionClaimedBy === args.ownerId
        && (run.executionLeaseExpiresAt ?? 0) > Date.now()
      );
      if (!matchingActiveClaim) throw new Error("Automation execution requires the active matching claim");
      if (definition.status !== "ACTIVE" && definition.status !== "PAUSED") {
        throw new Error("Automation Definition is not executable");
      }
    }
    const artifact = definition.artifactId ? await ctx.db.get(definition.artifactId as Id<"automationArtifacts">) : null;
    if (!artifact || artifact.validationStatus !== "PASSED") throw new Error("Approved artifact is unavailable");
    const evaluation = await ctx.db.query("automationEvaluations")
      .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").first();
    return {
      workOrderId: workOrder._id,
      workflowRunId: run._id,
      runId: run.runId,
      definitionId: definition._id,
      evaluationId: evaluation?._id,
      correlationId: definition.correlationId ?? evaluation?.correlationId ?? String(workOrder._id),
      adapterType: definition.adapterType,
      repository: artifact.repository,
      workingDirectory: artifact.workingDirectory,
      artifactPath: artifact.path,
      artifactContent: artifact.content,
      artifactContentHash: artifact.contentHash,
      timeoutMs: definition.maxDurationSeconds * 1000,
      secretReferences: definition.secretReferences ?? [],
      requiredPermissions: definition.requiredPermissions ?? [],
      configuration: artifact.manifest ?? {},
      acceptanceCriteria: workOrder.acceptanceCriteria,
    };
  },
});

/**
 * Record what the adapter execution reported.
 *
 * This is an EXECUTION CLAIM, not evidence — note that a `passed` status moves
 * the evaluation to AWAITING_VERIFICATION, never to VERIFIED. It previously had
 * no authorization and took a client-supplied `actorId`; it now requires
 * dispatch authority in the Definition's workspace and derives the actor.
 */
export const recordExecutionResult = mutation({
  args: {
    workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"),
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("timed_out"), v.literal("cancelled"), v.literal("infrastructure_error")),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const [workOrder, run] = await Promise.all([ctx.db.get(args.workOrderId), ctx.db.get(args.workflowRunId)]);
    if (!workOrder || !run || run.workOrderId !== workOrder._id) throw new Error("Execution lineage is invalid");
    const definitionId = workOrder.metadata?.automationDefinitionId as Id<"automationDefinitions"> | undefined;
    const definition = definitionId ? await ctx.db.get(definitionId) : null;
    if (!definition) throw new Error("Automation Definition not found");
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      definition.projectId,
      COMPANY_PERMISSIONS.DISPATCH_WORK,
    );
    const actorId = actorIdForAccess(access);
    const evaluation = await ctx.db.query("automationEvaluations")
      .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").first();
    const passed = args.status === "passed";
    const now = Date.now();
    if (evaluation) await ctx.db.patch(evaluation._id, {
      status: passed ? "AWAITING_VERIFICATION" : "FAILED",
      reason: passed ? "Adapter completed; independent verification required" : `Adapter ${args.status}`,
      checks: { ...(evaluation.checks ?? {}), execution: args.result },
      updatedAt: now,
    });
    await ctx.db.patch(definition._id, {
      lastResult: passed ? "AWAITING_VERIFICATION" : args.status.toUpperCase(),
      health: passed ? "ATTENTION" : "DEGRADED",
      updatedAt: now,
    });
    await recordDecision(ctx, {
      projectId: definition.projectId, definitionId: definition._id,
      type: passed ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED", actorId,
      reason: passed ? "Adapter execution completed; receipt pending" : `Adapter execution ${args.status}`,
      version: definition.definitionVersion, previousState: run.status,
      newState: passed ? "AWAITING_VERIFICATION" : "FAILED", correlationId: definition.correlationId,
      causationId: String(run._id), metadata: { result: args.result },
    });
    return { requiresVerification: passed, evaluationId: evaluation?._id };
  },
});

/**
 * Record the final verification decision for an Automation Definition.
 *
 * This had no authorization at all and took both the verdict and the actor as
 * arguments: `receiptStatus: "PASSED"` from any caller flipped the evaluation
 * to VERIFIED and the Definition to HEALTHY, attributed to whatever `actorId`
 * string the caller chose. Nothing in the handler consulted a
 * `verificationReceipts` row — the word "PASSED" was the entire evidence.
 *
 * It now requires delivery-verification authority in the Definition's own
 * workspace, and the actor is the authenticated caller.
 */
export const finalizeVerification = mutation({
  args: {
    workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"),
    receiptStatus: v.union(v.literal("PASSED"), v.literal("FAILED"), v.literal("PENDING")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const [workOrder, run] = await Promise.all([ctx.db.get(args.workOrderId), ctx.db.get(args.workflowRunId)]);
    if (!workOrder || !run || run.workOrderId !== workOrder._id || run.status !== "COMPLETED") {
      throw new Error("Verification lineage is invalid");
    }
    const definitionId = workOrder.metadata?.automationDefinitionId as Id<"automationDefinitions"> | undefined;
    const definition = definitionId ? await ctx.db.get(definitionId) : null;
    if (!definition) throw new Error("Automation Definition not found");
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      definition.projectId,
      COMPANY_PERMISSIONS.VERIFY_DELIVERY,
    );
    const actorId = actorIdForAccess(access);
    const evaluation = await ctx.db.query("automationEvaluations")
      .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").first();
    const next = args.receiptStatus === "PASSED" ? "VERIFIED" : args.receiptStatus === "FAILED" ? "REJECTED" : "AWAITING_VERIFICATION";
    const now = Date.now();
    if (evaluation) await ctx.db.patch(evaluation._id, { status: next as any, reason: args.reason, updatedAt: now });
    await ctx.db.patch(definition._id, {
      lastResult: next,
      health: next === "VERIFIED" ? "HEALTHY" : next === "REJECTED" ? "DEGRADED" : "ATTENTION",
      status: next === "REJECTED" ? "SUSPENDED" : definition.status,
      reliabilityState: next === "REJECTED" ? "SUSPENDED" : definition.reliabilityState,
      pausedBy: next === "REJECTED" ? actorId : definition.pausedBy,
      pausedAt: next === "REJECTED" ? now : definition.pausedAt,
      pauseReason: next === "REJECTED" ? args.reason : definition.pauseReason,
      nextRunAt: next === "REJECTED" ? undefined : definition.nextRunAt,
      updatedAt: now,
    });
    await recordDecision(ctx, {
      projectId: definition.projectId, definitionId: definition._id,
      type: next === "VERIFIED" ? "VERIFIED" : next === "REJECTED" ? "RECEIPT_CREATED" : "FINALIZED",
      actorId, reason: args.reason, version: definition.definitionVersion,
      previousState: evaluation?.status, newState: next, correlationId: definition.correlationId,
      causationId: String(args.workflowRunId), metadata: { receiptStatus: args.receiptStatus },
    });
    return { finalDecision: next };
  },
});

/**
 * Server-derived actor for governed automation decisions.
 *
 * `requireAuthorizedDeliveryScope` returns null only when authorization is not
 * yet enforced on this deployment (see lib/authorizationRollout.ts); in that
 * state the actor is recorded as unattributed rather than as a name the caller
 * supplied.
 */
function actorIdForAccess(access: Awaited<ReturnType<typeof requireAuthorizedDeliveryScope>>): string {
  const operatorId = access?.membership?.operatorId;
  if (operatorId) return String(operatorId);
  return access ? "authorized:unattributed-operator" : "unenforced:legacy-caller";
}
