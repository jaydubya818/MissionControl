import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./lib/missionScopedFunctions";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "./lib/companyAccess";
import {
  FACTORY_MEMORY_FLAGS,
  requireFactoryMemoryPhaseEnabled,
} from "./lib/factoryMemoryGate";
import {
  FACTORY_MEMORY_LIMITS,
  prepareFactoryMemoryContent,
  sanitizeFactoryObservation,
  sanitizeFactoryText,
  scoreFactorySearchCandidate,
  validateFactoryRelationship,
} from "./lib/factoryMemory";
import {
  ensureFactoryEvalDefinition,
  factoryTelemetryMetadata,
  recordFactoryRetrievalObservation,
  tracePurposeForFactoryPurpose,
} from "./lib/factoryMemoryTelemetry";
import {
  factoryContextBudgetValidator,
  factoryEntityTypeValidator,
  factoryKnowledgeDerivationValidator,
  factoryMemoryProvenanceValidator,
  factoryMemorySourceTypeValidator,
  factoryRelationValidator,
  factoryRelationshipPathStepValidator,
  factoryRetrievalMethodValidator,
  factoryRetrievalStrategyValidator,
} from "./lib/factoryMemoryValidators";
import { resolveFlag, type FlagRow } from "./lib/flags";
import {
  ensureAttemptTrace,
  insertEvalScore,
} from "./lib/observabilityPersistence";
import { factoryPurposeValidator } from "./lib/workOrderSpecificationValidators";

const FACTORY_FLAG_KEYS = Object.values(FACTORY_MEMORY_FLAGS);

function asHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  return `sha256:${asHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  )}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

async function digest(value: unknown): Promise<string> {
  return sha256(JSON.stringify(canonicalize(value)));
}

function assertFactoryPurposeAlignment(
  purpose: Doc<"factoryRetrievalPlans">["purpose"],
  linked: Awaited<ReturnType<typeof requireLinkedScope>>,
) {
  const declaredPurposes = [
    linked.workOrder?.factoryPurpose,
    linked.workflowRun?.factoryPurpose,
    linked.factoryVersion?.purpose,
  ].filter((declared): declared is string => declared !== undefined);
  if (declaredPurposes.some((declared) => declared !== purpose)) {
    throw new Error(
      "Factory Memory purpose must match its WorkOrder, Attempt, and FactoryVersion lineage.",
    );
  }
}

function canonicalAttemptPurpose(
  run: Doc<"workflowRuns">,
): "IMPLEMENTATION" | "VERIFICATION" | "AUTOMATION" {
  if (run.attemptPurpose) return run.attemptPurpose;
  if (run.factoryPurpose === "VERIFICATION") return "VERIFICATION";
  if (run.factoryPurpose === "INTELLIGENT_AUTOMATION") return "AUTOMATION";
  return "IMPLEMENTATION";
}

async function requireRepositoryScope(
  ctx: { db: any },
  projectId: Id<"projects">,
  repositoryId?: Id<"workspaceRepositories">,
) {
  if (!repositoryId) return null;
  const repository = await ctx.db.get(repositoryId);
  if (!repository || repository.projectId !== projectId) {
    throw new Error("Repository is unavailable or unauthorized.");
  }
  return repository;
}

function requireTenantId(project: { tenantId?: Id<"tenants"> }): Id<"tenants"> {
  if (!project.tenantId)
    throw new Error("Workspace company assignment is incomplete.");
  return project.tenantId;
}

async function requireLinkedScope(
  ctx: { db: any },
  projectId: Id<"projects">,
  args: {
    repositoryId?: Id<"workspaceRepositories">;
    workOrderId?: Id<"workOrders">;
    workflowRunId?: Id<"workflowRuns">;
    factoryDefinitionVersionId?: Id<"factoryDefinitionVersions">;
  },
) {
  const [workOrder, workflowRun, factoryVersion] = await Promise.all([
    args.workOrderId ? ctx.db.get(args.workOrderId) : null,
    args.workflowRunId ? ctx.db.get(args.workflowRunId) : null,
    args.factoryDefinitionVersionId
      ? ctx.db.get(args.factoryDefinitionVersionId)
      : null,
  ]);
  if (args.workOrderId && workOrder?.projectId !== projectId)
    throw new Error("WorkOrder is unavailable or unauthorized.");
  if (args.workflowRunId && workflowRun?.projectId !== projectId)
    throw new Error("Attempt is unavailable or unauthorized.");
  if (
    args.factoryDefinitionVersionId &&
    factoryVersion?.projectId !== projectId
  )
    throw new Error("FactoryVersion is unavailable or unauthorized.");
  const linkedRepositoryIds = [
    workOrder?.repositoryId,
    workflowRun?.repositoryId,
    factoryVersion?.repositoryId,
  ].filter(
    (repositoryId): repositoryId is Id<"workspaceRepositories"> =>
      repositoryId !== undefined,
  );
  if (
    args.repositoryId &&
    linkedRepositoryIds.some(
      (repositoryId) => repositoryId !== args.repositoryId,
    )
  )
    throw new Error(
      "Linked Factory Memory records do not share repository scope.",
    );
  if (new Set(linkedRepositoryIds).size > 1)
    throw new Error(
      "Linked Factory Memory records do not share repository scope.",
    );
  if (
    workOrder &&
    workflowRun?.workOrderId &&
    workflowRun.workOrderId !== workOrder._id
  )
    throw new Error("Attempt does not belong to the linked WorkOrder.");
  if (
    factoryVersion &&
    workflowRun?.factoryDefinitionVersionId &&
    workflowRun.factoryDefinitionVersionId !== factoryVersion._id
  )
    throw new Error("Attempt does not use the linked FactoryVersion.");
  return { workOrder, workflowRun, factoryVersion };
}

function resolveLinkedRepositoryId(
  explicitRepositoryId: Id<"workspaceRepositories"> | undefined,
  linked: Awaited<ReturnType<typeof requireLinkedScope>>,
): Id<"workspaceRepositories"> | undefined {
  return (
    explicitRepositoryId ??
    linked.workOrder?.repositoryId ??
    linked.workflowRun?.repositoryId ??
    linked.factoryVersion?.repositoryId
  );
}

function withinRepositoryScope(
  record: { repositoryId?: Id<"workspaceRepositories"> },
  repositoryId?: Id<"workspaceRepositories">,
): boolean {
  return !repositoryId || record.repositoryId === repositoryId;
}

export const overview = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    const flagRows = (await ctx.db
      .query("featureFlags")
      .collect()) as FlagRow[];
    const phases = Object.fromEntries(
      FACTORY_FLAG_KEYS.map((key) => [
        key,
        resolveFlag(flagRows, key, String(args.projectId)).enabled,
      ]),
    );
    if (!phases[FACTORY_MEMORY_FLAGS.HYBRID]) {
      return {
        phases,
        indexedDocuments: 0,
        indexedChunks: 0,
        entityCount: 0,
        relationshipCount: 0,
        contextPackageCount: 0,
        sourceCoverage: [],
        latestIngestion: null,
        bounded: true,
      };
    }
    const [documents, chunks, entities, relationships, packages, ingestions] =
      await Promise.all([
        args.repositoryId
          ? ctx.db
              .query("factoryMemoryDocuments")
              .withIndex("by_project_repository", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .take(1_000)
          : ctx.db
              .query("factoryMemoryDocuments")
              .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
              .take(1_000),
        args.repositoryId
          ? ctx.db
              .query("factoryMemoryChunks")
              .withIndex("by_project_repository", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .take(1_000)
          : ctx.db
              .query("factoryMemoryChunks")
              .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
              .take(1_000),
        args.repositoryId
          ? ctx.db
              .query("factoryEntities")
              .withIndex("by_project_repository", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .take(1_000)
          : ctx.db
              .query("factoryEntities")
              .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
              .take(1_000),
        args.repositoryId
          ? ctx.db
              .query("factoryRelationships")
              .withIndex("by_project_repository", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .take(1_000)
          : ctx.db
              .query("factoryRelationships")
              .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
              .take(1_000),
        args.repositoryId
          ? ctx.db
              .query("factoryContextPackages")
              .withIndex("by_project_repository", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .take(1_000)
          : ctx.db
              .query("factoryContextPackages")
              .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
              .take(1_000),
        args.repositoryId
          ? ctx.db
              .query("factoryMemoryIngestionRuns")
              .withIndex("by_project_repository_started", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .order("desc")
              .take(1)
          : ctx.db
              .query("factoryMemoryIngestionRuns")
              .withIndex("by_project_started", (q) =>
                q.eq("projectId", args.projectId),
              )
              .order("desc")
              .take(1),
      ]);
    const scopedDocuments = documents.filter(
      (document) =>
        !document.invalidatedAt &&
        withinRepositoryScope(document, args.repositoryId),
    );
    const sourceCounts = new Map<string, number>();
    for (const document of scopedDocuments)
      sourceCounts.set(
        document.sourceType,
        (sourceCounts.get(document.sourceType) ?? 0) + 1,
      );
    return {
      phases,
      indexedDocuments: scopedDocuments.length,
      indexedChunks: chunks.filter(
        (chunk) =>
          !chunk.invalidatedAt &&
          withinRepositoryScope(chunk, args.repositoryId),
      ).length,
      entityCount: entities.filter((entity) =>
        withinRepositoryScope(entity, args.repositoryId),
      ).length,
      relationshipCount: relationships.filter((relationship) =>
        withinRepositoryScope(relationship, args.repositoryId),
      ).length,
      contextPackageCount: packages.filter((contextPackage) =>
        withinRepositoryScope(contextPackage, args.repositoryId),
      ).length,
      sourceCoverage: [...sourceCounts.entries()]
        .map(([sourceType, count]) => ({ sourceType, count }))
        .sort((left, right) => right.count - left.count),
      latestIngestion: ingestions[0] ?? null,
      bounded:
        documents.length === 1_000 ||
        chunks.length === 1_000 ||
        entities.length === 1_000 ||
        relationships.length === 1_000 ||
        packages.length === 1_000,
    };
  },
});

export const search = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    query: v.string(),
    sourceTypes: v.optional(v.array(factoryMemorySourceTypeValidator)),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    fromTimestamp: v.optional(v.number()),
    toTimestamp: v.optional(v.number()),
    limit: v.optional(v.number()),
    budget: v.optional(factoryContextBudgetValidator),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(ctx, args.projectId, "HYBRID");
    const linked = await requireLinkedScope(ctx, args.projectId, args);
    const repositoryId = resolveLinkedRepositoryId(args.repositoryId, linked);
    await requireRepositoryScope(ctx, args.projectId, repositoryId);
    const workOrderId = args.workOrderId ?? linked.workflowRun?.workOrderId;
    const factoryDefinitionVersionId =
      args.factoryDefinitionVersionId ??
      linked.workflowRun?.factoryDefinitionVersionId;
    const normalizedQuery = sanitizeFactoryText(args.query.trim(), 2_000);
    const candidates = normalizedQuery
      ? await ctx.db
          .query("factoryMemoryChunks")
          .withSearchIndex("search_text", (q) => {
            const projectQuery = q
              .search("searchText", normalizedQuery)
              .eq("projectId", args.projectId);
            if (repositoryId && args.sourceTypes?.length === 1)
              return projectQuery
                .eq("repositoryId", repositoryId)
                .eq("sourceType", args.sourceTypes[0]);
            if (repositoryId)
              return projectQuery.eq("repositoryId", repositoryId);
            if (args.sourceTypes?.length === 1)
              return projectQuery.eq("sourceType", args.sourceTypes[0]);
            return projectQuery;
          })
          .take(FACTORY_MEMORY_LIMITS.maxSearchCandidates)
      : repositoryId
        ? await ctx.db
            .query("factoryMemoryChunks")
            .withIndex("by_project_repository", (q) =>
              q
                .eq("projectId", args.projectId)
                .eq("repositoryId", repositoryId),
            )
            .order("desc")
            .take(FACTORY_MEMORY_LIMITS.maxSearchCandidates)
        : await ctx.db
            .query("factoryMemoryChunks")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .order("desc")
            .take(FACTORY_MEMORY_LIMITS.maxSearchCandidates);
    const filtered = candidates.filter((candidate) => {
      if (candidate.invalidatedAt) return false;
      if (!withinRepositoryScope(candidate, repositoryId)) return false;
      if (
        args.sourceTypes?.length &&
        !args.sourceTypes.includes(candidate.sourceType)
      )
        return false;
      if (workOrderId && candidate.workOrderId !== workOrderId)
        return false;
      if (args.workflowRunId && candidate.workflowRunId !== args.workflowRunId)
        return false;
      if (
        factoryDefinitionVersionId &&
        candidate.factoryDefinitionVersionId !== factoryDefinitionVersionId
      )
        return false;
      if (
        args.fromTimestamp &&
        candidate.provenance.timestamp < args.fromTimestamp
      )
        return false;
      if (args.toTimestamp && candidate.provenance.timestamp > args.toTimestamp)
        return false;
      return true;
    });
    const now = Date.now();
    const ranked = filtered
      .map((candidate) => ({
        ...candidate,
        ...scoreFactorySearchCandidate(
          normalizedQuery || candidate.searchText,
          candidate,
          now,
        ),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.provenance.timestamp - left.provenance.timestamp ||
          String(left._id).localeCompare(String(right._id)),
      );
    const maxItems = Math.max(
      0,
      Math.min(
        FACTORY_MEMORY_LIMITS.maxSearchResults,
        args.budget?.maxItems ?? args.limit ?? 20,
      ),
    );
    const maxTokens = Math.max(
      0,
      Math.min(
        FACTORY_MEMORY_LIMITS.maxContextTokens,
        args.budget?.maxEstimatedTokens ?? Number.MAX_SAFE_INTEGER,
      ),
    );
    const selected: typeof ranked = [];
    const seen = new Set<string>();
    let estimatedTokens = 0;
    for (const candidate of ranked) {
      if (selected.length >= maxItems) break;
      const key = `${candidate.sourceType}:${candidate.sourceId}:${
        candidate.provenance.revision ?? ""
      }:${candidate.contentHash}`;
      if (seen.has(key)) continue;
      if (estimatedTokens + candidate.estimatedTokens > maxTokens) continue;
      seen.add(key);
      estimatedTokens += candidate.estimatedTokens;
      selected.push(candidate);
    }
    return {
      results: selected,
      candidateCount: filtered.length,
      selectedCount: selected.length,
      rejectedCount: Math.max(0, filtered.length - selected.length),
      estimatedTokens,
      bounded: candidates.length === FACTORY_MEMORY_LIMITS.maxSearchCandidates,
    };
  },
});

export const upsertDocument = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    sourceType: factoryMemorySourceTypeValidator,
    sourceId: v.string(),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    title: v.optional(v.string()),
    content: v.string(),
    path: v.optional(v.string()),
    revision: v.optional(v.string()),
    metadata: v.optional(v.any()),
    sourceCreatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(ctx, args.projectId, "HYBRID");
    const linked = await requireLinkedScope(ctx, args.projectId, args);
    const repositoryId = resolveLinkedRepositoryId(args.repositoryId, linked);
    await requireRepositoryScope(ctx, args.projectId, repositoryId);
    const workOrderId = args.workOrderId ?? linked.workflowRun?.workOrderId;
    const factoryDefinitionVersionId =
      args.factoryDefinitionVersionId ??
      linked.workflowRun?.factoryDefinitionVersionId;
    const prepared = prepareFactoryMemoryContent({
      content: args.content,
      metadata: args.metadata,
    });
    const now = Date.now();
    const sourceId = sanitizeFactoryText(args.sourceId.trim(), 1_000);
    const sourcePath = args.path
      ? sanitizeFactoryText(args.path.trim(), 2_000)
      : undefined;
    const sourceRevision = args.revision
      ? sanitizeFactoryText(args.revision.trim(), 500)
      : undefined;
    if (!sourceId) throw new Error("Factory Memory sourceId is required.");
    const contentHash = await sha256(prepared.content);
    const existingRevision = await ctx.db
      .query("factoryMemoryDocuments")
      .withIndex("by_project_repository_source_revision", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("repositoryId", repositoryId)
          .eq("sourceType", args.sourceType)
          .eq("sourceId", sourceId)
          .eq("sourceRevision", sourceRevision),
      )
      .first();
    if (
      existingRevision &&
      !existingRevision.invalidatedAt &&
      existingRevision.contentHash === contentHash
    ) {
      return {
        documentId: existingRevision._id,
        chunkCount: (
          await ctx.db
            .query("factoryMemoryChunks")
            .withIndex("by_document", (q) =>
              q.eq("documentId", existingRevision._id),
            )
            .collect()
        ).length,
        redactionCount: prepared.redactionCount,
        reindexed: false,
      };
    }
    const previous = await ctx.db
      .query("factoryMemoryDocuments")
      .withIndex("by_project_repository_source", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("repositoryId", repositoryId)
          .eq("sourceType", args.sourceType)
          .eq("sourceId", sourceId),
      )
      .collect();
    for (const document of previous) {
      if (document._id === existingRevision?._id) continue;
      if (!document.invalidatedAt)
        await ctx.db.patch(document._id, { invalidatedAt: now });
      const oldChunks = await ctx.db
        .query("factoryMemoryChunks")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .collect();
      for (const chunk of oldChunks)
        if (!chunk.invalidatedAt)
          await ctx.db.patch(chunk._id, { invalidatedAt: now });
    }
    const title = args.title
      ? sanitizeFactoryText(args.title.trim(), 500)
      : undefined;
    const provenance = {
      sourceType: args.sourceType,
      sourceId,
      path: sourcePath,
      revision: sourceRevision,
      timestamp: args.sourceCreatedAt ?? now,
      derivation: "authoritative" as const,
    };
    let documentId = existingRevision?._id;
    if (existingRevision) {
      const oldChunks = await ctx.db
        .query("factoryMemoryChunks")
        .withIndex("by_document", (q) =>
          q.eq("documentId", existingRevision._id),
        )
        .collect();
      for (const chunk of oldChunks) await ctx.db.delete(chunk._id);
      await ctx.db.patch(existingRevision._id, {
        repositoryId,
        workOrderId,
        workflowRunId: args.workflowRunId,
        factoryDefinitionVersionId,
        title,
        content: prepared.content,
        metadata: prepared.metadata,
        contentHash,
        createdAt: args.sourceCreatedAt ?? now,
        indexedAt: now,
        invalidatedAt: undefined,
        provenance,
      });
    } else {
      documentId = await ctx.db.insert("factoryMemoryDocuments", {
        tenantId: requireTenantId(access.project),
        projectId: args.projectId,
        repositoryId,
        sourceType: args.sourceType,
        sourceId,
        workOrderId,
        workflowRunId: args.workflowRunId,
        factoryDefinitionVersionId,
        title,
        content: prepared.content,
        metadata: prepared.metadata,
        contentHash,
        sourceRevision,
        createdAt: args.sourceCreatedAt ?? now,
        indexedAt: now,
        provenance,
      });
    }
    if (!documentId) throw new Error("Factory Memory document write failed.");
    await Promise.all(
      prepared.chunks.map(async (chunk) =>
        ctx.db.insert("factoryMemoryChunks", {
          tenantId: requireTenantId(access.project),
          projectId: args.projectId,
          repositoryId,
          documentId,
          sourceType: args.sourceType,
          sourceId,
          workOrderId,
          workflowRunId: args.workflowRunId,
          factoryDefinitionVersionId,
          title,
          content: chunk.content,
          searchText: chunk.searchText,
          chunkIndex: chunk.chunkIndex,
          estimatedTokens: chunk.estimatedTokens,
          contentHash: await sha256(chunk.content),
          metadata: prepared.metadata,
          provenance: {
            ...provenance,
            parentDocumentId: String(documentId),
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
          },
        }),
      ),
    );
    await ctx.db.insert("factoryMemoryIngestionRuns", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      repositoryId,
      status: "SUCCEEDED",
      sourceTypes: [args.sourceType],
      indexedDocuments: 1,
      indexedChunks: prepared.chunks.length,
      redactionCount: prepared.redactionCount,
      actorId: access.actorId,
      startedAt: now,
      completedAt: Date.now(),
    });
    await ctx.db.insert("activities", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "FACTORY_MEMORY_INDEXED",
      description: `Indexed ${args.sourceType} source ${sourceId}.`,
      targetType: "factoryMemoryDocument",
      targetId: String(documentId),
      afterState: {
        sourceType: args.sourceType,
        sourceId,
        contentHash,
        chunkCount: prepared.chunks.length,
        redactionCount: prepared.redactionCount,
      },
    });
    return {
      documentId,
      chunkCount: prepared.chunks.length,
      redactionCount: prepared.redactionCount,
      reindexed: true,
    };
  },
});

export const upsertEntity = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    entityType: factoryEntityTypeValidator,
    key: v.string(),
    label: v.string(),
    aliases: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    provenance: v.array(factoryMemoryProvenanceValidator),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "RELATIONSHIPS",
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    const key = sanitizeFactoryText(args.key.trim(), 1_000);
    const label = sanitizeFactoryText(args.label.trim(), 500);
    if (!key || !label)
      throw new Error("Factory entity key and label are required.");
    const aliases = [
      ...new Set(
        (args.aliases ?? [])
          .map((alias) => sanitizeFactoryText(alias.trim(), 500))
          .filter(Boolean),
      ),
    ].slice(0, 100);
    const metadata = sanitizeFactoryObservation(args.metadata ?? {});
    const provenance = sanitizeFactoryObservation(args.provenance);
    if (!provenance.length)
      throw new Error("Factory entities require source provenance.");
    const existing = await ctx.db
      .query("factoryEntities")
      .withIndex("by_project_repository_key", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("repositoryId", args.repositoryId)
          .eq("key", key),
      )
      .first();
    const now = Date.now();
    let entityId: Id<"factoryEntities">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        entityType: args.entityType,
        repositoryId: args.repositoryId,
        label,
        aliases,
        metadata,
        provenance,
        updatedAt: now,
      });
      entityId = existing._id;
    } else {
      entityId = await ctx.db.insert("factoryEntities", {
        tenantId: requireTenantId(access.project),
        projectId: args.projectId,
        repositoryId: args.repositoryId,
        entityType: args.entityType,
        key,
        label,
        aliases,
        metadata,
        provenance,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("activities", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: existing ? "FACTORY_ENTITY_UPDATED" : "FACTORY_ENTITY_CREATED",
      description: `${existing ? "Updated" : "Created"} Factory entity ${key}.`,
      targetType: "factoryEntity",
      targetId: String(entityId),
      beforeState: existing
        ? { entityType: existing.entityType, key: existing.key }
        : undefined,
      afterState: {
        entityType: args.entityType,
        key,
        repositoryId: args.repositoryId,
      },
    });
    return entityId;
  },
});

export const upsertRelationship = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    sourceType: factoryEntityTypeValidator,
    sourceId: v.id("factoryEntities"),
    relation: factoryRelationValidator,
    targetType: factoryEntityTypeValidator,
    targetId: v.id("factoryEntities"),
    provenance: v.array(factoryMemoryProvenanceValidator),
    confidence: v.optional(v.number()),
    derivation: factoryKnowledgeDerivationValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "RELATIONSHIPS",
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    validateFactoryRelationship(args);
    const [source, target] = await Promise.all([
      ctx.db.get(args.sourceId),
      ctx.db.get(args.targetId),
    ]);
    if (
      !source ||
      !target ||
      source.projectId !== args.projectId ||
      target.projectId !== args.projectId ||
      source.entityType !== args.sourceType ||
      target.entityType !== args.targetType
    )
      throw new Error(
        "Factory relationship endpoints are unavailable or invalid.",
      );
    if (source.repositoryId !== target.repositoryId)
      throw new Error(
        "Factory relationship endpoints must share repository scope.",
      );
    if (args.repositoryId && source.repositoryId !== args.repositoryId)
      throw new Error("Factory relationship repository scope mismatch.");
    const existing = await ctx.db
      .query("factoryRelationships")
      .withIndex("by_source_relation_target", (q) =>
        q
          .eq("sourceId", args.sourceId)
          .eq("relation", args.relation)
          .eq("targetId", args.targetId),
      )
      .first();
    const now = Date.now();
    const provenance = sanitizeFactoryObservation(args.provenance);
    let relationshipId: Id<"factoryRelationships">;
    if (existing) {
      if (existing.projectId !== args.projectId)
        throw new Error("Factory relationship workspace scope mismatch.");
      await ctx.db.patch(existing._id, {
        repositoryId: args.repositoryId ?? source.repositoryId,
        provenance,
        confidence: args.confidence,
        derivation: args.derivation,
        updatedAt: now,
      });
      relationshipId = existing._id;
    } else {
      relationshipId = await ctx.db.insert("factoryRelationships", {
        tenantId: requireTenantId(access.project),
        projectId: args.projectId,
        repositoryId: args.repositoryId ?? source.repositoryId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        relation: args.relation,
        targetType: args.targetType,
        targetId: args.targetId,
        provenance,
        confidence: args.confidence,
        derivation: args.derivation,
        createdAt: now,
      });
    }
    await ctx.db.insert("activities", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: existing
        ? "FACTORY_RELATIONSHIP_UPDATED"
        : "FACTORY_RELATIONSHIP_CREATED",
      description: `${existing ? "Updated" : "Created"} ${args.sourceType} ${args.relation} ${args.targetType} relationship.`,
      targetType: "factoryRelationship",
      targetId: String(relationshipId),
      beforeState: existing
        ? {
            derivation: existing.derivation,
            confidence: existing.confidence,
          }
        : undefined,
      afterState: {
        relation: args.relation,
        derivation: args.derivation,
        confidence: args.confidence,
        sourceId: args.sourceId,
        targetId: args.targetId,
      },
    });
    return relationshipId;
  },
});

export const searchEntities = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    query: v.string(),
    entityType: v.optional(factoryEntityTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "KNOWLEDGE_GRAPH",
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    const candidates =
      args.repositoryId && args.entityType
        ? await ctx.db
            .query("factoryEntities")
            .withIndex("by_project_repository_type", (q) =>
              q
                .eq("projectId", args.projectId)
                .eq("repositoryId", args.repositoryId)
                .eq("entityType", args.entityType!),
            )
            .take(200)
        : args.repositoryId
          ? await ctx.db
              .query("factoryEntities")
              .withIndex("by_project_repository_updated", (q) =>
                q
                  .eq("projectId", args.projectId)
                  .eq("repositoryId", args.repositoryId),
              )
              .order("desc")
              .take(200)
          : args.entityType
            ? await ctx.db
                .query("factoryEntities")
                .withIndex("by_project_type", (q) =>
                  q
                    .eq("projectId", args.projectId)
                    .eq("entityType", args.entityType!),
                )
                .take(200)
            : await ctx.db
                .query("factoryEntities")
                .withIndex("by_project_updated", (q) =>
                  q.eq("projectId", args.projectId),
                )
                .order("desc")
                .take(200);
    const search = args.query.trim().toLowerCase().slice(0, 500);
    const limit = Math.max(1, Math.min(50, args.limit ?? 20));
    return candidates
      .filter(
        (entity) =>
          withinRepositoryScope(entity, args.repositoryId) &&
          (!search ||
            [entity.key, entity.label, ...entity.aliases].some((candidate) =>
              candidate.toLowerCase().includes(search),
            )),
      )
      .sort((left, right) => {
        const leftExact =
          left.key.toLowerCase() === search ||
          left.label.toLowerCase() === search;
        const rightExact =
          right.key.toLowerCase() === search ||
          right.label.toLowerCase() === search;
        return (
          Number(rightExact) - Number(leftExact) ||
          right.updatedAt - left.updatedAt ||
          String(left._id).localeCompare(String(right._id))
        );
      })
      .slice(0, limit);
  },
});

async function incidentRelationships(
  ctx: { db: any },
  args: {
    projectId: Id<"projects">;
    entityId: Id<"factoryEntities">;
    repositoryId?: Id<"workspaceRepositories">;
    relations?: string[];
    derivations?: string[];
    direction?: "incoming" | "outgoing" | "both";
    fanOut: number;
  },
): Promise<Array<Doc<"factoryRelationships">>> {
  const direction = args.direction ?? "both";
  const [outgoing, incoming] = await Promise.all([
    direction !== "incoming"
      ? ctx.db
          .query("factoryRelationships")
          .withIndex("by_project_source", (q: any) =>
            q.eq("projectId", args.projectId).eq("sourceId", args.entityId),
          )
          .take(FACTORY_MEMORY_LIMITS.maxGraphFanOut)
      : [],
    direction !== "outgoing"
      ? ctx.db
          .query("factoryRelationships")
          .withIndex("by_project_target", (q: any) =>
            q.eq("projectId", args.projectId).eq("targetId", args.entityId),
          )
          .take(FACTORY_MEMORY_LIMITS.maxGraphFanOut)
      : [],
  ]);
  const authority = { authoritative: 3, deterministic: 2, inferred: 1 };
  const unique = [
    ...new Map(
      [...outgoing, ...incoming].map((edge) => [edge._id, edge]),
    ).values(),
  ] as Doc<"factoryRelationships">[];
  return unique
    .filter(
      (edge) =>
        withinRepositoryScope(edge, args.repositoryId) &&
        (!args.relations?.length || args.relations.includes(edge.relation)) &&
        (!args.derivations?.length ||
          args.derivations.includes(edge.derivation)),
    )
    .sort(
      (left, right) =>
        authority[right.derivation] - authority[left.derivation] ||
        (right.confidence ?? 1) - (left.confidence ?? 1) ||
        String(left._id).localeCompare(String(right._id)),
    )
    .slice(0, args.fanOut);
}

const graphArgs = {
  projectId: v.id("projects"),
  repositoryId: v.optional(v.id("workspaceRepositories")),
  entityId: v.id("factoryEntities"),
  relations: v.optional(v.array(factoryRelationValidator)),
  derivations: v.optional(v.array(factoryKnowledgeDerivationValidator)),
  direction: v.optional(
    v.union(v.literal("incoming"), v.literal("outgoing"), v.literal("both")),
  ),
  maxDepth: v.optional(v.number()),
  maxNodes: v.optional(v.number()),
  fanOut: v.optional(v.number()),
};

export const graphNeighborhood = query({
  args: graphArgs,
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "KNOWLEDGE_GRAPH",
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    const root = await ctx.db.get(args.entityId);
    if (
      !root ||
      root.projectId !== args.projectId ||
      !withinRepositoryScope(root, args.repositoryId)
    )
      return { entities: [], relationships: [], truncated: false };
    const maxDepth = Math.max(
      0,
      Math.min(FACTORY_MEMORY_LIMITS.maxGraphDepth, args.maxDepth ?? 2),
    );
    const maxNodes = Math.max(
      1,
      Math.min(FACTORY_MEMORY_LIMITS.maxGraphNodes, args.maxNodes ?? 50),
    );
    const fanOut = Math.max(
      1,
      Math.min(FACTORY_MEMORY_LIMITS.maxGraphFanOut, args.fanOut ?? 15),
    );
    const entities = new Map([[root._id, root]]);
    const depths = new Map<Id<"factoryEntities">, number>([[root._id, 0]]);
    const relationships = new Map<
      Id<"factoryRelationships">,
      Doc<"factoryRelationships">
    >();
    const queue: Array<{ id: Id<"factoryEntities">; depth: number }> = [
      { id: root._id, depth: 0 },
    ];
    let truncated = false;
    while (queue.length) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const incident = await incidentRelationships(ctx, {
        projectId: args.projectId,
        repositoryId: args.repositoryId,
        entityId: current.id,
        relations: args.relations,
        derivations: args.derivations,
        direction: args.direction,
        fanOut,
      });
      if (incident.length >= fanOut) truncated = true;
      for (const edge of incident) {
        relationships.set(edge._id, edge);
        const nextId =
          edge.sourceId === current.id ? edge.targetId : edge.sourceId;
        if (entities.has(nextId)) continue;
        if (entities.size >= maxNodes) {
          truncated = true;
          continue;
        }
        const entity = await ctx.db.get(nextId);
        if (
          !entity ||
          entity.projectId !== args.projectId ||
          !withinRepositoryScope(entity, args.repositoryId)
        )
          continue;
        entities.set(entity._id, entity);
        depths.set(entity._id, current.depth + 1);
        queue.push({ id: entity._id, depth: current.depth + 1 });
      }
    }
    return {
      entities: [...entities.values()],
      relationships: [...relationships.values()],
      depths: [...depths.entries()].map(([entityId, depth]) => ({
        entityId,
        depth,
      })),
      truncated,
    };
  },
});

export const findPath = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    sourceId: v.id("factoryEntities"),
    targetId: v.id("factoryEntities"),
    relations: v.optional(v.array(factoryRelationValidator)),
    derivations: v.optional(v.array(factoryKnowledgeDerivationValidator)),
    maxDepth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "KNOWLEDGE_GRAPH",
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    const [source, target] = await Promise.all([
      ctx.db.get(args.sourceId),
      ctx.db.get(args.targetId),
    ]);
    if (
      !source ||
      !target ||
      source.projectId !== args.projectId ||
      target.projectId !== args.projectId ||
      !withinRepositoryScope(source, args.repositoryId) ||
      !withinRepositoryScope(target, args.repositoryId)
    )
      return null;
    const maxDepth = Math.max(
      1,
      Math.min(
        FACTORY_MEMORY_LIMITS.maxGraphDepth,
        args.maxDepth ?? FACTORY_MEMORY_LIMITS.maxGraphDepth,
      ),
    );
    const queue: Array<{
      id: Id<"factoryEntities">;
      depth: number;
      edges: Doc<"factoryRelationships">[];
    }> = [{ id: source._id, depth: 0, edges: [] }];
    const visited = new Set<Id<"factoryEntities">>([source._id]);
    while (
      queue.length &&
      visited.size <= FACTORY_MEMORY_LIMITS.maxGraphNodes
    ) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const incident = await incidentRelationships(ctx, {
        projectId: args.projectId,
        repositoryId: args.repositoryId,
        entityId: current.id,
        relations: args.relations,
        derivations: args.derivations,
        fanOut: 20,
      });
      for (const edge of incident) {
        const nextId =
          edge.sourceId === current.id ? edge.targetId : edge.sourceId;
        const edges = [...current.edges, edge];
        if (nextId === target._id) {
          const entityIds = [source._id];
          const steps = [];
          let cursor = source._id;
          for (const pathEdge of edges) {
            const outgoing = pathEdge.sourceId === cursor;
            const next = outgoing ? pathEdge.targetId : pathEdge.sourceId;
            const [from, to] = await Promise.all([
              ctx.db.get(cursor),
              ctx.db.get(next),
            ]);
            if (!from || !to) return null;
            steps.push({
              source: from.label,
              relation: pathEdge.relation,
              target: to.label,
              derivation: pathEdge.derivation,
              direction: outgoing
                ? ("outgoing" as const)
                : ("incoming" as const),
            });
            entityIds.push(next);
            cursor = next;
          }
          const entities = await Promise.all(
            entityIds.map((entityId) => ctx.db.get(entityId)),
          );
          return {
            entities: entities.filter(Boolean),
            relationships: edges,
            steps,
          };
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({
            id: nextId,
            depth: current.depth + 1,
            edges,
          });
        }
      }
    }
    return null;
  },
});

export const saveRetrievalPlan = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    objective: v.string(),
    purpose: factoryPurposeValidator,
    steps: v.array(
      v.object({
        strategy: factoryRetrievalStrategyValidator,
        query: v.optional(v.string()),
        entity: v.optional(
          v.object({
            type: factoryEntityTypeValidator,
            id: v.id("factoryEntities"),
          }),
        ),
        sourceTypes: v.optional(v.array(factoryMemorySourceTypeValidator)),
        reason: v.string(),
      }),
    ),
    budget: factoryContextBudgetValidator,
    requiredSourceTypes: v.array(factoryMemorySourceTypeValidator),
    maxIterations: v.number(),
    sufficiency: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "AGENTIC_RETRIEVAL",
    );
    const linked = await requireLinkedScope(ctx, args.projectId, args);
    const repositoryId = resolveLinkedRepositoryId(args.repositoryId, linked);
    const factoryDefinitionVersionId =
      args.factoryDefinitionVersionId ??
      linked.workflowRun?.factoryDefinitionVersionId;
    await requireRepositoryScope(ctx, args.projectId, repositoryId);
    assertFactoryPurposeAlignment(args.purpose, linked);
    for (const step of args.steps) {
      if (!step.entity) continue;
      const entity = await ctx.db.get(step.entity.id);
      if (
        !entity ||
        entity.projectId !== args.projectId ||
        entity.entityType !== step.entity.type ||
        (repositoryId && entity.repositoryId !== repositoryId)
      )
        throw new Error(
          "Retrieval Plan entity is unavailable or unauthorized.",
        );
    }
    if (!args.objective.trim())
      throw new Error("Retrieval objective is required.");
    if (args.steps.length > 20)
      throw new Error("Retrieval plan has too many steps.");
    if (args.maxIterations < 1 || args.maxIterations > 3)
      throw new Error("Retrieval iterations must be between 1 and 3.");
    const budget = {
      maxItems: Math.max(
        1,
        Math.min(
          FACTORY_MEMORY_LIMITS.maxContextItems,
          args.budget.maxItems ?? 14,
        ),
      ),
      maxEstimatedTokens: Math.max(
        256,
        Math.min(
          FACTORY_MEMORY_LIMITS.maxContextTokens,
          args.budget.maxEstimatedTokens ?? 18_000,
        ),
      ),
    };
    const objective = sanitizeFactoryText(args.objective.trim(), 10_000);
    const steps = args.steps.map((step) => ({
      ...step,
      query: step.query
        ? sanitizeFactoryText(step.query.trim(), 2_000)
        : undefined,
      reason: sanitizeFactoryText(step.reason.trim(), 2_000),
    }));
    const requiredSourceTypes = [...new Set(args.requiredSourceTypes)].sort();
    const sufficiency = sanitizeFactoryObservation(args.sufficiency);
    const planDigest = await digest({
      projectId: args.projectId,
      repositoryId,
      workOrderId: args.workOrderId,
      workflowRunId: args.workflowRunId,
      factoryDefinitionVersionId,
      objective,
      purpose: args.purpose,
      steps,
      budget,
      requiredSourceTypes,
      maxIterations: args.maxIterations,
    });
    const now = Date.now();
    const retrievalPlanId = await ctx.db.insert("factoryRetrievalPlans", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      repositoryId,
      workOrderId: args.workOrderId,
      workflowRunId: args.workflowRunId,
      factoryDefinitionVersionId,
      objective,
      planDigest,
      purpose: args.purpose,
      steps,
      budget,
      requiredSourceTypes,
      maxIterations: args.maxIterations,
      sufficiency,
      createdAt: now,
      createdBy: access.actorId,
    });
    if (linked.workflowRun) {
      await recordFactoryRetrievalObservation(ctx, linked.workflowRun, {
        retrievalPlanId,
        observationType: "context.plan",
        resultCount: args.steps.length,
        estimatedTokens: budget.maxEstimatedTokens,
        latencyMs: 0,
        metadata: {
          strategies: args.steps.map((step) => step.strategy),
          maxIterations: args.maxIterations,
        },
        createdAt: now,
      });
    }
    return retrievalPlanId;
  },
});

export const freezeContextPackage = mutation({
  args: {
    projectId: v.id("projects"),
    retrievalPlanId: v.id("factoryRetrievalPlans"),
    workflowRunId: v.id("workflowRuns"),
    selected: v.array(
      v.object({
        chunkId: v.id("factoryMemoryChunks"),
        reason: v.string(),
        priority: v.union(
          v.literal("required"),
          v.literal("high"),
          v.literal("normal"),
          v.literal("optional"),
        ),
        retrievalMethod: factoryRetrievalMethodValidator,
        relationshipPath: v.optional(
          v.array(factoryRelationshipPathStepValidator),
        ),
      }),
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    const plan = await ctx.db.get(args.retrievalPlanId);
    if (!plan || plan.projectId !== args.projectId)
      throw new Error("Retrieval plan is unavailable or unauthorized.");
    const workflowRunId = args.workflowRunId;
    const linked = await requireLinkedScope(ctx, args.projectId, {
      repositoryId: plan.repositoryId,
      workOrderId: plan.workOrderId,
      workflowRunId,
      factoryDefinitionVersionId: plan.factoryDefinitionVersionId,
    });
    assertFactoryPurposeAlignment(plan.purpose, linked);
    if (!linked.workflowRun)
      throw new Error("Context Packages require an exact Attempt.");
    const repositoryId = resolveLinkedRepositoryId(plan.repositoryId, linked);
    const factoryDefinitionVersionId =
      plan.factoryDefinitionVersionId ??
      linked.workflowRun.factoryDefinitionVersionId;
    if (plan.workflowRunId && workflowRunId !== plan.workflowRunId)
      throw new Error(
        "Context Package Attempt does not match its Retrieval Plan.",
      );
    if (linked.workflowRun.workOrderId !== plan.workOrderId)
      throw new Error(
        "Context Package Attempt does not belong to its WorkOrder.",
      );
    if (args.selected.length > FACTORY_MEMORY_LIMITS.maxContextItems)
      throw new Error("Context Package item limit exceeded.");
    const selected = [];
    const seen = new Set<Id<"factoryMemoryChunks">>();
    let estimatedTokens = 0;
    for (const candidate of args.selected) {
      if (seen.has(candidate.chunkId)) continue;
      seen.add(candidate.chunkId);
      const chunk = await ctx.db.get(candidate.chunkId);
      if (
        !chunk ||
        chunk.projectId !== args.projectId ||
        chunk.invalidatedAt ||
        (repositoryId && chunk.repositoryId !== repositoryId)
      )
        throw new Error("Context candidate is unavailable or unauthorized.");
      estimatedTokens += chunk.estimatedTokens;
      selected.push({
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        documentId: chunk.documentId,
        chunkId: chunk._id,
        content: chunk.content,
        reason: sanitizeFactoryText(candidate.reason.trim(), 2_000),
        priority: candidate.priority,
        estimatedTokens: chunk.estimatedTokens,
        retrievalMethod: candidate.retrievalMethod,
        provenance: chunk.provenance,
        relationshipPath: candidate.relationshipPath,
      });
    }
    const maxItems = plan.budget.maxItems ?? 14;
    const maxTokens = plan.budget.maxEstimatedTokens ?? 18_000;
    if (selected.length > maxItems || estimatedTokens > maxTokens)
      throw new Error("Context Package exceeds its frozen budget.");
    const presentSourceTypes = new Set(selected.map((item) => item.sourceType));
    const missing = plan.requiredSourceTypes.filter(
      (sourceType) => !presentSourceTypes.has(sourceType),
    );
    if (missing.length)
      throw new Error(
        `Context Package is missing required sources: ${missing.join(", ")}.`,
      );
    const trace = await ensureAttemptTrace(ctx, linked.workflowRun, {
      purpose: tracePurposeForFactoryPurpose(linked.workflowRun.factoryPurpose),
    });
    const attemptPurpose = canonicalAttemptPurpose(linked.workflowRun);
    const qualityContractDigest = linked.workflowRun.qualityContractDigest;
    const digestItems = await Promise.all(
      selected.map(async (item) => ({
        chunkId: item.chunkId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        revision: item.provenance.revision,
        contentHash: await sha256(item.content),
        relationshipPath: item.relationshipPath,
      })),
    );
    const contentHash = await digest({
      workOrderId: plan.workOrderId,
      workflowRunId,
      factoryDefinitionVersionId,
      purpose: plan.purpose,
      attemptPurpose,
      primaryTraceId: trace._id,
      qualityContractDigest,
      objective: plan.objective,
      budget: plan.budget,
      items: digestItems,
    });
    if (linked.workflowRun.factoryContextPackageId) {
      const existing = (await ctx.db.get(
        linked.workflowRun.factoryContextPackageId,
      )) as Doc<"factoryContextPackages"> | null;
      if (
        existing?.contentHash === contentHash &&
        existing.workflowRunId === workflowRunId &&
        existing.primaryTraceId === trace._id
      ) {
        await recordFactoryRetrievalObservation(ctx, linked.workflowRun, {
          retrievalPlanId: plan._id,
          contextPackageId: existing._id,
          observationType: "context.assemble",
          selectedCount: selected.length,
          estimatedTokens,
          latencyMs: 0,
          metadata: { contentHash, frozen: true },
        });
        return existing._id;
      }
      throw new Error(
        "Attempt already has a different frozen Context Package.",
      );
    }
    const existingByHash = await ctx.db
      .query("factoryContextPackages")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
      .first();
    if (
      existingByHash &&
      existingByHash.projectId === args.projectId &&
      existingByHash.workOrderId === plan.workOrderId &&
      existingByHash.workflowRunId === workflowRunId &&
      existingByHash.primaryTraceId === trace._id
    ) {
      await ctx.db.patch(workflowRunId, {
        factoryContextPackageId: existingByHash._id,
      });
      await recordFactoryRetrievalObservation(ctx, linked.workflowRun, {
        retrievalPlanId: plan._id,
        contextPackageId: existingByHash._id,
        observationType: "context.assemble",
        selectedCount: selected.length,
        estimatedTokens,
        latencyMs: 0,
        metadata: { contentHash, frozen: true },
      });
      return existingByHash._id;
    }
    const now = Date.now();
    const contextPackageId = await ctx.db.insert("factoryContextPackages", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      repositoryId,
      workOrderId: plan.workOrderId,
      workflowRunId,
      factoryDefinitionVersionId,
      purpose: plan.purpose,
      attemptPurpose,
      primaryTraceId: trace._id,
      qualityContractDigest,
      generatedAt: now,
      objective: plan.objective,
      items: selected,
      estimatedTokens,
      budget: plan.budget,
      retrievalPlanId: plan._id,
      retrievalStrategies: plan.steps.map((step) => step.strategy),
      contentHash,
      frozen: true,
      acceptanceAuthority: false,
      metadata: sanitizeFactoryObservation(args.metadata),
      createdBy: access.actorId,
    });
    await ctx.db.patch(workflowRunId, {
      factoryContextPackageId: contextPackageId,
    });
    await recordFactoryRetrievalObservation(ctx, linked.workflowRun, {
      retrievalPlanId: plan._id,
      contextPackageId,
      observationType: "context.assemble",
      selectedCount: selected.length,
      estimatedTokens,
      latencyMs: 0,
      metadata: { contentHash, frozen: true },
      createdAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "FACTORY_CONTEXT_FROZEN",
      description: `Froze ${selected.length} context items for WorkOrder ${String(
        plan.workOrderId,
      )}.`,
      targetType: "factoryContextPackage",
      targetId: String(contextPackageId),
      afterState: { contentHash, estimatedTokens, itemCount: selected.length },
    });
    return contextPackageId;
  },
});

export const getContextPackage = query({
  args: {
    projectId: v.id("projects"),
    contextPackageId: v.optional(v.id("factoryContextPackages")),
    workflowRunId: v.optional(v.id("workflowRuns")),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    const requestedWorkflowRunId = args.workflowRunId;
    const contextPackage = args.contextPackageId
      ? await ctx.db.get(args.contextPackageId)
      : requestedWorkflowRunId
        ? await ctx.db
            .query("factoryContextPackages")
            .withIndex("by_workflow_run", (q) =>
              q.eq("workflowRunId", requestedWorkflowRunId),
            )
            .first()
        : null;
    if (!contextPackage || contextPackage.projectId !== args.projectId)
      return null;
    if (
      args.workflowRunId &&
      contextPackage.workflowRunId !== args.workflowRunId
    ) {
      return null;
    }
    const [workflowRun, trace] = await Promise.all([
      ctx.db.get(contextPackage.workflowRunId),
      ctx.db.get(contextPackage.primaryTraceId),
    ]);
    if (
      !workflowRun ||
      workflowRun.projectId !== args.projectId ||
      !trace ||
      trace.workflowRunId !== workflowRun._id
    ) {
      throw new Error("Context Package Attempt trace lineage is unavailable.");
    }
    const [verificationAdvisory, traceRows, evaluationRows] = await Promise.all(
      [
        ctx.db
          .query("factoryContextVerificationAdvisories")
          .withIndex("by_context_package", (q) =>
            q.eq("contextPackageId", contextPackage._id),
          )
          .first(),
        ctx.db
          .query("traceObservations")
          .withIndex("by_trace", (q) => q.eq("traceId", trace._id))
          .take(1_000),
        ctx.db
          .query("evalScores")
          .withIndex("by_attempt", (q) =>
            q.eq("workflowRunId", workflowRun._id),
          )
          .take(1_000),
      ],
    );
    const packageId = String(contextPackage._id);
    const planId = contextPackage.retrievalPlanId
      ? String(contextPackage.retrievalPlanId)
      : undefined;
    const observations = traceRows.filter((observation) => {
      const metadata = factoryTelemetryMetadata(observation.metadata);
      if (metadata.domain !== "FACTORY_MEMORY") return false;
      if (metadata.factoryContextPackageId === packageId) return true;
      return (
        !metadata.factoryContextPackageId &&
        planId !== undefined &&
        metadata.factoryRetrievalPlanId === planId
      );
    });
    const packageEvaluations = evaluationRows.filter((evaluation) => {
      const metadata = factoryTelemetryMetadata(evaluation.metadata);
      return (
        metadata.domain === "FACTORY_MEMORY_CONTEXT" &&
        metadata.factoryContextPackageId === packageId
      );
    });
    const evaluationSetIds = [
      ...new Set(
        [...packageEvaluations]
          .sort((left, right) => right.createdAt - left.createdAt)
          .map(
            (evaluation) =>
              factoryTelemetryMetadata(evaluation.metadata).evaluationSetId,
          )
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const latestEvaluationRows = evaluationSetIds[0]
      ? packageEvaluations.filter(
          (evaluation) =>
            factoryTelemetryMetadata(evaluation.metadata).evaluationSetId ===
            evaluationSetIds[0],
        )
      : [];
    const definitions = await Promise.all(
      [...new Set(latestEvaluationRows.map((row) => row.evalDefinitionId))].map(
        (definitionId) => ctx.db.get(definitionId),
      ),
    );
    const definitionById = new Map(
      definitions
        .filter((definition) => definition !== null)
        .map((definition) => [String(definition!._id), definition!]),
    );
    const evaluations = latestEvaluationRows.map((evaluation) => {
      const metadata = factoryTelemetryMetadata(evaluation.metadata);
      const definition = definitionById.get(
        String(evaluation.evalDefinitionId),
      );
      return {
        _id: evaluation._id,
        key:
          typeof metadata.metricKey === "string"
            ? metadata.metricKey
            : (definition?.key ?? "factory-memory-context"),
        score: typeof evaluation.value === "number" ? evaluation.value : 0,
        passed: metadata.passed === true,
        reason: evaluation.reason ?? "",
        sampleSize:
          typeof metadata.sampleSize === "number" ? metadata.sampleSize : 0,
        evaluationSetId: String(metadata.evaluationSetId ?? ""),
        acceptanceAuthority: false as const,
        createdAt: evaluation.createdAt,
      };
    });
    return {
      contextPackage,
      verificationAdvisory,
      evaluations,
      evaluationSetCount: evaluationSetIds.length,
      observations,
    };
  },
});

export const listContextPackages = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    workOrderId: v.optional(v.id("workOrders")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    await requireRepositoryScope(ctx, args.projectId, args.repositoryId);
    const workOrderId = args.workOrderId;
    const rows = workOrderId
      ? await ctx.db
          .query("factoryContextPackages")
          .withIndex("by_work_order", (q) => q.eq("workOrderId", workOrderId))
          .order("desc")
          .take(100)
      : await ctx.db
          .query("factoryContextPackages")
          .withIndex("by_project_generated", (q) =>
            q.eq("projectId", args.projectId),
          )
          .order("desc")
          .take(100);
    return rows
      .filter(
        (row) =>
          row.projectId === args.projectId &&
          withinRepositoryScope(row, args.repositoryId),
      )
      .slice(0, Math.max(1, Math.min(50, args.limit ?? 20)));
  },
});

export const diffContextPackages = query({
  args: {
    projectId: v.id("projects"),
    beforeId: v.id("factoryContextPackages"),
    afterId: v.id("factoryContextPackages"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    const [before, after] = await Promise.all([
      ctx.db.get(args.beforeId),
      ctx.db.get(args.afterId),
    ]);
    if (
      !before ||
      !after ||
      before.projectId !== args.projectId ||
      after.projectId !== args.projectId
    )
      throw new Error("Context Package is unavailable or unauthorized.");
    const key = (item: (typeof before.items)[number]) =>
      `${item.sourceType}:${item.sourceId}`;
    const beforeBySource = new Map(
      before.items.map((item) => [key(item), item]),
    );
    const afterBySource = new Map(after.items.map((item) => [key(item), item]));
    const changedRevisions = [];
    const changedRelationshipPaths = [];
    for (const [sourceKey, beforeItem] of beforeBySource) {
      const afterItem = afterBySource.get(sourceKey);
      if (!afterItem) continue;
      if (beforeItem.provenance.revision !== afterItem.provenance.revision)
        changedRevisions.push({
          sourceId: beforeItem.sourceId,
          before: beforeItem.provenance.revision,
          after: afterItem.provenance.revision,
        });
      if (
        JSON.stringify(beforeItem.relationshipPath ?? []) !==
        JSON.stringify(afterItem.relationshipPath ?? [])
      )
        changedRelationshipPaths.push({
          sourceId: beforeItem.sourceId,
          before: beforeItem.relationshipPath ?? [],
          after: afterItem.relationshipPath ?? [],
        });
    }
    return {
      added: after.items.filter((item) => !beforeBySource.has(key(item))),
      removed: before.items.filter((item) => !afterBySource.has(key(item))),
      changedRevisions,
      changedRelationshipPaths,
    };
  },
});

export const saveVerificationAdvisory = mutation({
  args: {
    projectId: v.id("projects"),
    contextPackageId: v.id("factoryContextPackages"),
    checks: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        rationale: v.string(),
        acceptanceCriterionIds: v.array(v.string()),
        influencedBy: v.array(
          v.object({
            sourceType: factoryMemorySourceTypeValidator,
            sourceId: v.string(),
            revision: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    const contextPackage = await ctx.db.get(args.contextPackageId);
    if (!contextPackage || contextPackage.projectId !== args.projectId)
      throw new Error("Context Package is unavailable or unauthorized.");
    if (args.checks.length > 50)
      throw new Error("Verification context plan has too many checks.");
    const available = new Set(
      contextPackage.items.map(
        (item) =>
          `${item.sourceType}:${item.sourceId}:${item.provenance.revision ?? ""}`,
      ),
    );
    for (const check of args.checks) {
      for (const influence of check.influencedBy) {
        if (
          !available.has(
            `${influence.sourceType}:${influence.sourceId}:${influence.revision ?? ""}`,
          )
        )
          throw new Error(
            "Verification influence is not in the frozen Context Package.",
          );
      }
    }
    const existing = await ctx.db
      .query("factoryContextVerificationAdvisories")
      .withIndex("by_context_package", (q) =>
        q.eq("contextPackageId", args.contextPackageId),
      )
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("factoryContextVerificationAdvisories", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      workOrderId: contextPackage.workOrderId,
      contextPackageId: args.contextPackageId,
      checks: args.checks.map((check) => ({
        ...check,
        id: sanitizeFactoryText(check.id.trim(), 200),
        name: sanitizeFactoryText(check.name.trim(), 500),
        rationale: sanitizeFactoryText(check.rationale.trim(), 2_000),
        evidenceRequired: true as const,
      })),
      advisoryOnly: true,
      acceptanceAuthority: false,
      createdAt: Date.now(),
      createdBy: access.actorId,
    });
  },
});

export const recordObservation = mutation({
  args: {
    projectId: v.id("projects"),
    workflowRunId: v.id("workflowRuns"),
    retrievalPlanId: v.optional(v.id("factoryRetrievalPlans")),
    contextPackageId: v.optional(v.id("factoryContextPackages")),
    observationType: v.union(
      v.literal("context.plan"),
      v.literal("memory.search"),
      v.literal("code.search"),
      v.literal("graph.traversal"),
      v.literal("context.rank"),
      v.literal("context.assemble"),
      v.literal("context.sufficiency"),
    ),
    strategy: v.optional(factoryRetrievalStrategyValidator),
    query: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    selectedCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    estimatedTokens: v.optional(v.number()),
    latencyMs: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "AGENTIC_RETRIEVAL",
    );
    const plan = args.retrievalPlanId
      ? await ctx.db.get(args.retrievalPlanId)
      : null;
    if (args.retrievalPlanId) {
      if (!plan || plan.projectId !== args.projectId)
        throw new Error("Retrieval Plan is unavailable or unauthorized.");
    }
    const contextPackage = args.contextPackageId
      ? await ctx.db.get(args.contextPackageId)
      : null;
    if (args.contextPackageId) {
      if (!contextPackage || contextPackage.projectId !== args.projectId)
        throw new Error("Context Package is unavailable or unauthorized.");
    }
    if (
      (plan?.workflowRunId && plan.workflowRunId !== args.workflowRunId) ||
      (contextPackage && contextPackage.workflowRunId !== args.workflowRunId)
    )
      throw new Error("Retrieval observation Attempt scope mismatch.");
    if (
      plan &&
      contextPackage?.retrievalPlanId &&
      contextPackage.retrievalPlanId !== plan._id
    )
      throw new Error("Retrieval observation plan/package scope mismatch.");
    const linked = await requireLinkedScope(ctx, args.projectId, {
      repositoryId: plan?.repositoryId ?? contextPackage?.repositoryId,
      workOrderId: plan?.workOrderId ?? contextPackage?.workOrderId,
      workflowRunId: args.workflowRunId,
      factoryDefinitionVersionId:
        plan?.factoryDefinitionVersionId ??
        contextPackage?.factoryDefinitionVersionId,
    });
    if (!linked.workflowRun)
      throw new Error("Retrieval observations require an exact Attempt trace.");
    if (plan) assertFactoryPurposeAlignment(plan.purpose, linked);
    if (
      contextPackage?.purpose &&
      linked.workflowRun.factoryPurpose &&
      contextPackage.purpose !== linked.workflowRun.factoryPurpose
    )
      throw new Error("Retrieval observation Factory purpose mismatch.");
    return recordFactoryRetrievalObservation(ctx, linked.workflowRun, {
      retrievalPlanId: args.retrievalPlanId,
      contextPackageId: args.contextPackageId,
      observationType: args.observationType,
      strategy: args.strategy,
      query: args.query,
      resultCount: args.resultCount,
      selectedCount: args.selectedCount,
      rejectedCount: args.rejectedCount,
      estimatedTokens: args.estimatedTokens,
      latencyMs: Math.max(0, args.latencyMs),
      metadata: args.metadata,
    });
  },
});

export const recordContextEvaluations = mutation({
  args: {
    projectId: v.id("projects"),
    contextPackageId: v.id("factoryContextPackages"),
    evaluations: v.array(
      v.object({
        key: v.string(),
        score: v.number(),
        passed: v.boolean(),
        reason: v.string(),
        sampleSize: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    const contextPackage = await ctx.db.get(args.contextPackageId);
    if (!contextPackage || contextPackage.projectId !== args.projectId)
      throw new Error("Context Package is unavailable or unauthorized.");
    const linked = await requireLinkedScope(ctx, args.projectId, {
      repositoryId: contextPackage.repositoryId,
      workOrderId: contextPackage.workOrderId,
      workflowRunId: contextPackage.workflowRunId,
      factoryDefinitionVersionId: contextPackage.factoryDefinitionVersionId,
    });
    if (!linked.workflowRun)
      throw new Error("Context evaluations require an exact Attempt.");
    if (
      linked.workflowRun.factoryPurpose &&
      linked.workflowRun.factoryPurpose !== contextPackage.purpose
    )
      throw new Error("Context evaluation Factory purpose mismatch.");
    if (!args.evaluations.length || args.evaluations.length > 50)
      throw new Error(
        "Context Package evaluations require between 1 and 50 results.",
      );
    const normalized = args.evaluations.map((evaluation) => {
      if (
        !Number.isFinite(evaluation.score) ||
        evaluation.score < 0 ||
        evaluation.score > 1
      )
        throw new Error("Context evaluation scores must be between 0 and 1.");
      return {
        key: sanitizeFactoryText(evaluation.key.trim(), 200),
        score: evaluation.score,
        passed: evaluation.passed,
        reason: sanitizeFactoryText(evaluation.reason.trim(), 2_000),
        sampleSize: Math.max(0, evaluation.sampleSize),
      };
    });
    const evaluationSetId = await digest({
      contextPackageId: args.contextPackageId,
      evaluations: normalized,
    });
    const trace = await ensureAttemptTrace(ctx, linked.workflowRun, {
      purpose: tracePurposeForFactoryPurpose(linked.workflowRun.factoryPurpose),
    });
    if (trace._id !== contextPackage.primaryTraceId) {
      throw new Error("Context evaluation Attempt trace mismatch.");
    }
    const ids = [];
    for (const evaluation of normalized) {
      const definition = await ensureFactoryEvalDefinition(ctx, {
        tenantId: requireTenantId(access.project),
        projectId: args.projectId,
        actorId: access.actorId,
        metricKey: evaluation.key,
      });
      const score = await insertEvalScore(ctx, {
        projectId: args.projectId,
        tenantId: requireTenantId(access.project),
        definition,
        traceId: trace._id,
        workflowRunId: linked.workflowRun._id,
        value: evaluation.score,
        reason: evaluation.reason,
        metadata: {
          domain: "FACTORY_MEMORY_CONTEXT",
          factoryContextPackageId: String(args.contextPackageId),
          evaluationSetId,
          metricKey: evaluation.key,
          passed: evaluation.passed,
          sampleSize: evaluation.sampleSize,
          acceptanceAuthority: false,
        },
        evaluator: { type: "DETERMINISTIC", version: "factory-memory-v1" },
        createdBy: access.actorId,
        idempotencyKey: `factory-memory:${String(args.contextPackageId)}:${evaluationSetId}:${String(definition._id)}`,
      });
      ids.push(score._id);
    }
    return ids;
  },
});

export const proposeContextImprovement = mutation({
  args: {
    projectId: v.id("projects"),
    contextPackageId: v.id("factoryContextPackages"),
    title: v.string(),
    summary: v.string(),
    confidence: v.optional(v.number()),
    impact: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    await requireFactoryMemoryPhaseEnabled(
      ctx,
      args.projectId,
      "CONTEXT_ENGINE",
    );
    const contextPackage = await ctx.db.get(args.contextPackageId);
    if (!contextPackage || contextPackage.projectId !== args.projectId)
      throw new Error("Context Package is unavailable or unauthorized.");
    if (
      args.confidence !== undefined &&
      (args.confidence < 0 || args.confidence > 1)
    )
      throw new Error("Improvement confidence must be between 0 and 1.");
    const title = sanitizeFactoryText(args.title.trim(), 500);
    const summary = sanitizeFactoryText(args.summary.trim(), 5_000);
    const impact = args.impact
      ? sanitizeFactoryText(args.impact.trim(), 2_000)
      : undefined;
    const dedupeKey = await digest({
      contextPackageId: args.contextPackageId,
      title: title.toLowerCase(),
    });
    const existing = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (existing) return existing._id;
    const suggestionId = await ctx.db.insert("metaLoopSuggestions", {
      projectId: args.projectId,
      kind: "EVAL_SCENARIO",
      title,
      summary,
      status: "OPEN",
      sourceRef: `factory-context:${String(args.contextPackageId)}`,
      sourceLinks: [
        String(args.contextPackageId),
        ...(contextPackage.workflowRunId
          ? [String(contextPackage.workflowRunId)]
          : []),
      ],
      dedupeKey,
      confidence: args.confidence,
      impact,
      affectedSurface: "Factory Memory Context Engine",
      workOrderId: contextPackage.workOrderId,
      payload: sanitizeFactoryObservation({
        contextPackageId: args.contextPackageId,
        factoryVersionId: contextPackage.factoryDefinitionVersionId,
        workflowRunId: contextPackage.workflowRunId,
        evidenceSources: contextPackage.items
          .filter((item) => item.sourceType === "verification-evidence")
          .map((item) => ({
            sourceId: item.sourceId,
            revision: item.provenance.revision,
          })),
        proposalOnly: true,
        acceptanceAuthority: false,
        data: args.payload,
      }),
      createdAt: Date.now(),
    });
    await ctx.db.insert("activities", {
      tenantId: requireTenantId(access.project),
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "FACTORY_CONTEXT_IMPROVEMENT_PROPOSED",
      description: `Proposed a governed Context Engine improvement: ${title.slice(0, 200)}.`,
      targetType: "metaLoopSuggestion",
      targetId: String(suggestionId),
      afterState: {
        proposalOnly: true,
        contextPackageId: args.contextPackageId,
      },
    });
    return suggestionId;
  },
});
