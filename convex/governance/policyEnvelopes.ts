import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appendChangeRecord } from "../lib/armAudit";
import { evaluatePolicyEnvelopes } from "../lib/armPolicy";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

export const createPolicyEnvelope = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("agentTemplates")),
    versionId: v.optional(v.id("agentVersions")),
    name: v.string(),
    priority: v.optional(v.number()),
    rules: v.any(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        tenantId: args.tenantId,
        projectId: args.projectId,
        templateId: args.templateId,
        versionId: args.versionId,
        createDefaultIfMissing: true,
      }
    );

    const now = Date.now();
    const id = await ctx.db.insert("policyEnvelopes", {
      tenantId,
      projectId: args.projectId,
      templateId: args.templateId,
      versionId: args.versionId,
      name: args.name,
      active: true,
      priority: args.priority ?? 100,
      rules: args.rules,
      createdAt: now,
      updatedAt: now,
      metadata: args.metadata,
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId,
      projectId: args.projectId,
      templateId: args.templateId,
      versionId: args.versionId,
      type: "POLICY_ATTACHED",
      summary: `Policy envelope attached: ${args.name}`,
      relatedTable: "policyEnvelopes",
      relatedId: id,
    });

    return await ctx.db.get(id);
  },
});

export const attachPolicy = mutation({
  args: {
    envelopeId: v.id("policyEnvelopes"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.envelopeId, {
      active: args.active,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.envelopeId);
  },
});

export const listPolicyEnvelopes = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    versionId: v.optional(v.id("agentVersions")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let rows = args.versionId
      ? await ctx.db
          .query("policyEnvelopes")
          .withIndex("by_version", (q) => q.eq("versionId", args.versionId))
          .collect()
      : args.projectId
      ? await ctx.db
          .query("policyEnvelopes")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : args.tenantId
      ? await ctx.db
          .query("policyEnvelopes")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : await ctx.db.query("policyEnvelopes").collect();

    if (args.activeOnly ?? true) {
      rows = rows.filter((row) => row.active);
    }

    return rows.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  },
});

export const evaluate = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    versionId: v.optional(v.id("agentVersions")),
    toolName: v.optional(v.string()),
    riskLevel: v.optional(v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED"))),
  },
  handler: async (ctx, args) => {
    const result = await evaluatePolicyEnvelopes(ctx.db as any, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      versionId: args.versionId,
      toolName: args.toolName,
      riskLevel: args.riskLevel ?? "GREEN",
    });

    if (result) {
      return {
        decision: result.decision,
        envelope: result.envelope,
        source: result.source,
      };
    }

    return { decision: "ALLOW", source: "fallback" };
  },
});
