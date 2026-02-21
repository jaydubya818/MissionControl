import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { computeGenomeHash } from "../lib/genomeHash";
import { appendChangeRecord } from "../lib/armAudit";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

const versionStatus = v.union(
  v.literal("DRAFT"),
  v.literal("TESTING"),
  v.literal("CANDIDATE"),
  v.literal("APPROVED"),
  v.literal("DEPRECATED"),
  v.literal("RETIRED")
);

export const createVersion = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.id("agentTemplates"),
    genome: v.object({
      modelConfig: v.object({
        provider: v.string(),
        modelId: v.string(),
        temperature: v.optional(v.number()),
        maxTokens: v.optional(v.number()),
      }),
      promptBundleHash: v.string(),
      toolManifestHash: v.string(),
      provenance: v.object({
        createdBy: v.string(),
        source: v.string(),
        createdAt: v.number(),
      }),
    }),
    status: v.optional(versionStatus),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        tenantId: args.tenantId,
        projectId: args.projectId,
        templateId: args.templateId,
        createDefaultIfMissing: true,
      }
    );

    const existing = await ctx.db
      .query("agentVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    const maxVersion = existing.reduce((max, row) => Math.max(max, row.version), 0);
    const now = Date.now();
    const genomeHash = computeGenomeHash(args.genome);

    const versionId = await ctx.db.insert("agentVersions", {
      tenantId,
      projectId: args.projectId,
      templateId: args.templateId,
      version: maxVersion + 1,
      genomeHash,
      genome: args.genome,
      status: args.status ?? "DRAFT",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
      metadata: args.metadata,
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId,
      projectId: args.projectId,
      templateId: args.templateId,
      versionId,
      type: "VERSION_CREATED",
      summary: `Version ${maxVersion + 1} created`,
      payload: { genomeHash },
      relatedTable: "agentVersions",
      relatedId: versionId,
    });

    return await ctx.db.get(versionId);
  },
});

export const getVersion = query({
  args: { versionId: v.id("agentVersions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.versionId);
  },
});

export const listVersions = query({
  args: {
    templateId: v.id("agentTemplates"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agentVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    return rows.sort((a, b) => b.version - a.version);
  },
});

export const transitionVersion = mutation({
  args: {
    versionId: v.id("agentVersions"),
    status: versionStatus,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.versionId);
    if (!existing) {
      throw new Error("Version not found");
    }

    await ctx.db.patch(args.versionId, {
      status: args.status,
      notes: args.notes ?? existing.notes,
      updatedAt: Date.now(),
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId: existing.tenantId,
      projectId: existing.projectId,
      templateId: existing.templateId,
      versionId: args.versionId,
      type: "VERSION_TRANSITIONED",
      summary: `Version transitioned ${existing.status} -> ${args.status}`,
      relatedTable: "agentVersions",
      relatedId: args.versionId,
    });

    return await ctx.db.get(args.versionId);
  },
});
