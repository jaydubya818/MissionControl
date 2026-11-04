import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./lib/missionScopedFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
  type FactoryPermission,
} from "./lib/companyAccess";
import {
  previewResearchSource,
  researchSourceActivationIssues,
  researchSourceTransitionIssue,
  researchSourceWorkspaceIssue,
  type ResearchSourceKind,
  type ResearchSourceState,
} from "./lib/researchSourcePolicy";

const POLICY_VERSION = "research-source-policy-v1";

const sourceKind = v.union(
  v.literal("X_USER"),
  v.literal("YOUTUBE_CHANNEL"),
  v.literal("WEBSITE"),
  v.literal("RSS_ATOM"),
);

const sourceCadence = v.union(
  v.literal("MANUAL"),
  v.literal("HOURLY"),
  v.literal("DAILY"),
  v.literal("WEEKLY"),
);

type ResearchCtx = QueryCtx | MutationCtx;
type SourceEventType =
  | "DRAFT_CREATED"
  | "VALIDATION_PASSED"
  | "VALIDATION_FAILED"
  | "POLICY_ACKNOWLEDGED"
  | "ACTIVATED"
  | "PAUSED"
  | "RESUMED"
  | "DEGRADED"
  | "REVOKED"
  | "RETIRED"
  | "CREDENTIAL_FAILED"
  | "POLICY_DRIFT"
  | "DELETION_REQUESTED";

function cleanList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function requireBoundedText(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > maxLength) throw new Error(`${label} cannot exceed ${maxLength} characters.`);
  return trimmed;
}

function requireBoundedList(values: string[], label: string, maxItems: number, maxItemLength: number) {
  const cleaned = cleanList(values);
  if (cleaned.length === 0) throw new Error(`At least one ${label.toLowerCase()} is required.`);
  if (cleaned.length > maxItems) throw new Error(`${label} cannot contain more than ${maxItems} entries.`);
  if (cleaned.some((value) => value.length > maxItemLength)) {
    throw new Error(`Each ${label.toLowerCase()} entry cannot exceed ${maxItemLength} characters.`);
  }
  return cleaned;
}

function validatePolicyEnvelope(args: {
  displayName: string;
  schedule: { cadence: string; timezone: string };
  freshnessTargetMinutes: number;
  maxItemsPerRun: number;
  monthlyCostCeilingUsd: number;
  retentionDays: number;
  allowedContentClasses: string[];
  exclusions: string[];
}) {
  const issues: string[] = [];
  if (!args.displayName.trim()) issues.push("A display name is required.");
  if (!args.schedule.timezone.trim()) issues.push("A schedule timezone is required.");
  if (!Number.isInteger(args.freshnessTargetMinutes) || args.freshnessTargetMinutes < 15) {
    issues.push("Freshness target must be at least 15 minutes.");
  }
  if (!Number.isInteger(args.maxItemsPerRun) || args.maxItemsPerRun < 1 || args.maxItemsPerRun > 100) {
    issues.push("Item cap must be between 1 and 100.");
  }
  if (!Number.isFinite(args.monthlyCostCeilingUsd) || args.monthlyCostCeilingUsd < 0) {
    issues.push("Monthly cost ceiling cannot be negative.");
  }
  if (!Number.isInteger(args.retentionDays) || args.retentionDays < 1 || args.retentionDays > 3_650) {
    issues.push("Retention must be between 1 and 3,650 days.");
  }
  if (cleanList(args.allowedContentClasses).length === 0) {
    issues.push("At least one allowed content class is required.");
  }
  if (cleanList(args.exclusions).length === 0) {
    issues.push("At least one explicit exclusion is required.");
  }
  try {
    requireBoundedText(args.displayName, "Display name", 160);
    requireBoundedText(args.schedule.timezone, "Schedule timezone", 128);
    requireBoundedList(args.allowedContentClasses, "Allowed content classes", 20, 160);
    requireBoundedList(args.exclusions, "Exclusions", 30, 500);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Research source policy envelope is invalid.");
  }
  if (issues.length > 0) throw new Error(issues.join(" "));
}

async function requireSourcePermission(
  ctx: ResearchCtx,
  projectId: Id<"projects">,
  sourceId: Id<"researchSources">,
  permission: FactoryPermission,
) {
  const access = await requireWorkspacePermission(ctx, projectId, permission);
  const source = await ctx.db.get(sourceId);
  if (!source || researchSourceWorkspaceIssue(String(source.projectId), String(projectId))) {
    throw new Error("Research source is unavailable or unauthorized.");
  }
  return { access, source };
}

async function insertEvent(
  ctx: MutationCtx,
  source: Doc<"researchSources">,
  args: {
    eventType: SourceEventType;
    actorId: string;
    reason: string;
    sourceVersion: number;
    fromState?: ResearchSourceState;
    toState?: ResearchSourceState;
    metadata?: unknown;
  },
) {
  const idempotencyKey = `research-source:${source._id}:v${args.sourceVersion}:${args.eventType}`;
  const existing = await ctx.db
    .query("researchSourceEvents")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("researchSourceEvents", {
    tenantId: source.tenantId,
    projectId: source.projectId,
    sourceId: source._id,
    eventType: args.eventType,
    actorId: args.actorId,
    reason: args.reason.trim().slice(0, 1_000),
    fromState: args.fromState,
    toState: args.toState,
    sourceVersion: args.sourceVersion,
    policyVersion: source.policyVersion,
    metadata: args.metadata,
    idempotencyKey,
    createdAt: Date.now(),
  });
}

function requireTransition(from: ResearchSourceState, to: ResearchSourceState) {
  const issue = researchSourceTransitionIssue(from, to);
  if (issue) throw new Error(issue);
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return await ctx.db
      .query("researchSources")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(500);
  },
});

export const get = query({
  args: { projectId: v.id("projects"), sourceId: v.id("researchSources") },
  handler: async (ctx, args) =>
    (await requireSourcePermission(ctx, args.projectId, args.sourceId, FACTORY_PERMISSIONS.VIEW)).source,
});

export const listEvents = query({
  args: { projectId: v.id("projects"), sourceId: v.id("researchSources") },
  handler: async (ctx, args) => {
    await requireSourcePermission(ctx, args.projectId, args.sourceId, FACTORY_PERMISSIONS.VIEW);
    return await ctx.db
      .query("researchSourceEvents")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .order("desc")
      .take(100);
  },
});

export const previewValidation = query({
  args: {
    projectId: v.id("projects"),
    kind: sourceKind,
    locator: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return previewResearchSource({ kind: args.kind, locator: args.locator });
  },
});

export const createDraft = mutation({
  args: {
    projectId: v.id("projects"),
    kind: sourceKind,
    locator: v.string(),
    displayName: v.string(),
    cadence: sourceCadence,
    timezone: v.string(),
    freshnessTargetMinutes: v.number(),
    maxItemsPerRun: v.number(),
    monthlyCostCeilingUsd: v.number(),
    retentionDays: v.number(),
    allowedContentClasses: v.array(v.string()),
    exclusions: v.array(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    if (!access.project.tenantId) throw new Error("Workspace tenant binding is required.");
    validatePolicyEnvelope({
      displayName: args.displayName,
      schedule: { cadence: args.cadence, timezone: args.timezone },
      freshnessTargetMinutes: args.freshnessTargetMinutes,
      maxItemsPerRun: args.maxItemsPerRun,
      monthlyCostCeilingUsd: args.monthlyCostCeilingUsd,
      retentionDays: args.retentionDays,
      allowedContentClasses: args.allowedContentClasses,
      exclusions: args.exclusions,
    });
    const idempotencyKey = args.idempotencyKey.trim();
    requireBoundedText(idempotencyKey, "Idempotency key", 256);
    const existing = await ctx.db
      .query("researchSources")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) {
      if (existing.projectId !== args.projectId) throw new Error("Idempotency key is already in use.");
      return existing;
    }
    const sourceCount = await ctx.db
      .query("researchSources")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);
    if (sourceCount.length >= 500) {
      throw new Error("This workspace has reached the 500-source registry limit. Archive source history before adding more.");
    }
    const locator = args.locator.trim();
    if (!locator) throw new Error("A source locator is required.");
    const now = Date.now();
    const preview = previewResearchSource({ kind: args.kind, locator });
    if (preview.errors.some((error) => /credential|secret/i.test(error))) {
      throw new Error("Credentials and secrets must not be stored in a research source locator.");
    }
    if (!preview.valid) {
      throw new Error(`Research source target rejected: ${preview.errors.join(" ")}`);
    }
    const sourceId = await ctx.db.insert("researchSources", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      kind: args.kind,
      locator,
      canonicalProviderId: undefined,
      canonicalUrl: undefined,
      displayName: args.displayName.trim(),
      state: "DRAFT",
      version: 1,
      ownerId: access.actorId,
      adapter: {
        name: preview.adapterName,
        version: preview.adapterVersion,
        authenticationMode: preview.authenticationMode,
      },
      schedule: { cadence: args.cadence, timezone: args.timezone.trim() },
      freshnessTargetMinutes: args.freshnessTargetMinutes,
      maxItemsPerRun: args.maxItemsPerRun,
      monthlyCostCeilingUsd: args.monthlyCostCeilingUsd,
      retentionDays: args.retentionDays,
      allowedContentClasses: requireBoundedList(args.allowedContentClasses, "Allowed content classes", 20, 160),
      exclusions: requireBoundedList(args.exclusions, "Exclusions", 30, 500),
      consecutiveFailureCount: 0,
      validationStatus: "PENDING",
      policyReviewState: "DRAFT",
      policyVersion: POLICY_VERSION,
      idempotencyKey,
      createdBy: access.actorId,
      updatedBy: access.actorId,
      createdAt: now,
      updatedAt: now,
    });
    const source = await ctx.db.get(sourceId);
    if (!source) throw new Error("Research source creation failed.");
    await insertEvent(ctx, source, {
      eventType: "DRAFT_CREATED",
      actorId: access.actorId,
      reason: "Research source draft created; no network request was made.",
      sourceVersion: 1,
      toState: "DRAFT",
      metadata: { kind: args.kind, locator },
    });
    return source;
  },
});

export const validate = mutation({
  args: { projectId: v.id("projects"), sourceId: v.id("researchSources") },
  handler: async (ctx, args) => {
    const { access, source } = await requireSourcePermission(
      ctx,
      args.projectId,
      args.sourceId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    if (!["DRAFT", "VERIFIED"].includes(source.state)) {
      throw new Error("Pause or retire this source before validating it again.");
    }
    const preview = previewResearchSource({
      kind: source.kind as ResearchSourceKind,
      locator: source.locator,
    });
    const nextState: ResearchSourceState = preview.activatable ? "VERIFIED" : "DRAFT";
    if (source.state !== nextState) requireTransition(source.state, nextState);
    if (preview.canonicalProviderId) {
      const duplicate = await ctx.db
        .query("researchSources")
        .withIndex("by_canonical_identity", (q) => q
          .eq("projectId", source.projectId)
          .eq("kind", source.kind)
          .eq("canonicalProviderId", preview.canonicalProviderId))
        .first();
      if (duplicate && duplicate._id !== source._id && duplicate.state !== "RETIRED") {
        throw new Error("This canonical research source already exists in the workspace.");
      }
    }
    const now = Date.now();
    const version = source.version + 1;
    const validationStatus = preview.activatable
      ? "PASSED" as const
      : preview.valid
        ? "PROVIDER_RESOLUTION_REQUIRED" as const
        : "FAILED" as const;
    const validationMessage = preview.activatable
      ? "Deterministic source validation passed."
      : [...preview.errors, ...preview.warnings].join(" ").slice(0, 1_000);
    await ctx.db.patch(source._id, {
      canonicalProviderId: preview.canonicalProviderId,
      canonicalUrl: preview.canonicalUrl,
      state: nextState,
      version,
      adapter: {
        name: preview.adapterName,
        version: preview.adapterVersion,
        authenticationMode: preview.authenticationMode,
      },
      validationStatus,
      validationMessage,
      validatedAt: now,
      policyReviewState: "DRAFT",
      approvedBy: undefined,
      approvedAt: undefined,
      updatedBy: access.actorId,
      updatedAt: now,
    });
    const updated = await ctx.db.get(source._id);
    if (!updated) throw new Error("Research source validation failed.");
    await insertEvent(ctx, updated, {
      eventType: preview.activatable ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
      actorId: access.actorId,
      reason: validationMessage || "Source validation failed closed.",
      sourceVersion: version,
      fromState: source.state,
      toState: nextState,
      metadata: {
        valid: preview.valid,
        activatable: preview.activatable,
        exactHostAllowlist: preview.networkPolicy.exactHostAllowlist,
      },
    });
    return { source: updated, preview };
  },
});

export const acknowledgePolicy = mutation({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    acknowledgement: v.string(),
  },
  handler: async (ctx, args) => {
    const { access, source } = await requireSourcePermission(
      ctx,
      args.projectId,
      args.sourceId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    if (source.state !== "VERIFIED") throw new Error("Only a verified source can receive policy approval.");
    if (source.policyReviewState === "APPROVED") throw new Error("This source policy is already approved.");
    const acknowledgement = requireBoundedText(args.acknowledgement, "Policy acknowledgement", 1_000);
    if (acknowledgement.length < 12) {
      throw new Error("Record a meaningful policy acknowledgement before approval.");
    }
    const now = Date.now();
    const version = source.version + 1;
    await ctx.db.patch(source._id, {
      policyReviewState: "APPROVED",
      approvedBy: access.actorId,
      approvedAt: now,
      version,
      updatedBy: access.actorId,
      updatedAt: now,
    });
    const updated = await ctx.db.get(source._id);
    if (!updated) throw new Error("Research source policy acknowledgement failed.");
    await insertEvent(ctx, updated, {
      eventType: "POLICY_ACKNOWLEDGED",
      actorId: access.actorId,
      reason: acknowledgement,
      sourceVersion: version,
      fromState: source.state,
      toState: source.state,
    });
    return updated;
  },
});

export const activate = mutation({
  args: { projectId: v.id("projects"), sourceId: v.id("researchSources") },
  handler: async (ctx, args) => {
    const { access, source } = await requireSourcePermission(
      ctx,
      args.projectId,
      args.sourceId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const issues = researchSourceActivationIssues(source);
    if (issues.length > 0) throw new Error(`Research source is not ready to activate: ${issues.join(", ")}.`);
    requireTransition(source.state, "ACTIVE");
    const now = Date.now();
    const version = source.version + 1;
    await ctx.db.patch(source._id, {
      state: "ACTIVE",
      version,
      lastError: undefined,
      nextRetryAt: undefined,
      consecutiveFailureCount: 0,
      updatedBy: access.actorId,
      updatedAt: now,
    });
    const updated = await ctx.db.get(source._id);
    if (!updated) throw new Error("Research source activation failed.");
    await insertEvent(ctx, updated, {
      eventType: source.state === "PAUSED" ? "RESUMED" : "ACTIVATED",
      actorId: access.actorId,
      reason: source.state === "PAUSED" ? "Operator resumed the approved source." : "Operator activated the approved source.",
      sourceVersion: version,
      fromState: source.state,
      toState: "ACTIVE",
    });
    return updated;
  },
});

export const pause = mutation({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { access, source } = await requireSourcePermission(
      ctx,
      args.projectId,
      args.sourceId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    requireTransition(source.state, "PAUSED");
    const reason = requireBoundedText(args.reason, "Pause reason", 1_000);
    const version = source.version + 1;
    await ctx.db.patch(source._id, {
      state: "PAUSED",
      version,
      updatedBy: access.actorId,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(source._id);
    if (!updated) throw new Error("Research source pause failed.");
    await insertEvent(ctx, updated, {
      eventType: "PAUSED",
      actorId: access.actorId,
      reason,
      sourceVersion: version,
      fromState: source.state,
      toState: "PAUSED",
    });
    return updated;
  },
});

export const retire = mutation({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { access, source } = await requireSourcePermission(
      ctx,
      args.projectId,
      args.sourceId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    requireTransition(source.state, "RETIRED");
    const reason = requireBoundedText(args.reason, "Retirement reason", 1_000);
    const version = source.version + 1;
    await ctx.db.patch(source._id, {
      state: "RETIRED",
      version,
      updatedBy: access.actorId,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(source._id);
    if (!updated) throw new Error("Research source retirement failed.");
    await insertEvent(ctx, updated, {
      eventType: "RETIRED",
      actorId: access.actorId,
      reason,
      sourceVersion: version,
      fromState: source.state,
      toState: "RETIRED",
    });
    return updated;
  },
});

export const requestDeletion = mutation({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { access, source } = await requireSourcePermission(
      ctx,
      args.projectId,
      args.sourceId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    const reason = requireBoundedText(args.reason, "Deletion request reason", 1_000);
    if (source.deletionRequestedAt) return source;
    const now = Date.now();
    const version = source.version + 1;
    await ctx.db.patch(source._id, {
      deletionRequestedAt: now,
      deletionRequestedBy: access.actorId,
      version,
      updatedBy: access.actorId,
      updatedAt: now,
    });
    const updated = await ctx.db.get(source._id);
    if (!updated) throw new Error("Research source deletion request failed.");
    await insertEvent(ctx, updated, {
      eventType: "DELETION_REQUESTED",
      actorId: access.actorId,
      reason,
      sourceVersion: version,
      fromState: source.state,
      toState: source.state,
    });
    return updated;
  },
});

async function recordDegradation(
  ctx: MutationCtx,
  args: {
    sourceId: Id<"researchSources">;
    eventType: "CREDENTIAL_FAILED" | "POLICY_DRIFT";
    reason: string;
    actorId: string;
  },
) {
  const source = await ctx.db.get(args.sourceId);
  if (!source) throw new Error("Research source not found.");
  const reason = requireBoundedText(args.reason, "Degradation reason", 1_000);
  const actorId = requireBoundedText(args.actorId, "Degradation actor", 256);
  if (source.state !== "ACTIVE" && source.state !== "PAUSED") {
    throw new Error("Only an active or paused research source can be degraded.");
  }
  requireTransition(source.state, "DEGRADED");
  const now = Date.now();
  const version = source.version + 1;
  await ctx.db.patch(source._id, {
    state: "DEGRADED",
    version,
    lastError: reason,
    consecutiveFailureCount: source.consecutiveFailureCount + 1,
    policyReviewState: args.eventType === "POLICY_DRIFT" ? "REVIEW_REQUIRED" : source.policyReviewState,
    updatedBy: actorId,
    updatedAt: now,
  });
  const updated = await ctx.db.get(source._id);
  if (!updated) throw new Error("Research source degradation failed.");
  await insertEvent(ctx, updated, {
    eventType: args.eventType,
    actorId,
    reason,
    sourceVersion: version,
    fromState: source.state,
    toState: "DEGRADED",
  });
  return updated;
}

export const recordCredentialFailure = internalMutation({
  args: {
    sourceId: v.id("researchSources"),
    reason: v.string(),
    actorId: v.string(),
  },
  handler: async (ctx, args) => recordDegradation(ctx, { ...args, eventType: "CREDENTIAL_FAILED" }),
});

export const recordPolicyDrift = internalMutation({
  args: {
    sourceId: v.id("researchSources"),
    reason: v.string(),
    actorId: v.string(),
  },
  handler: async (ctx, args) => recordDegradation(ctx, { ...args, eventType: "POLICY_DRIFT" }),
});
