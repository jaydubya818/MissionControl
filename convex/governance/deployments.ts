import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appendChangeRecord } from "../lib/armAudit";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

const deploymentStatus = v.union(
  v.literal("PENDING"),
  v.literal("ACTIVE"),
  v.literal("ROLLING_BACK"),
  v.literal("RETIRED")
);

export const createDeployment = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    templateId: v.id("agentTemplates"),
    environmentId: v.id("environments"),
    targetVersionId: v.id("agentVersions"),
    previousVersionId: v.optional(v.id("agentVersions")),
    rolloutPolicy: v.optional(v.any()),
    createdBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        tenantId: args.tenantId,
        templateId: args.templateId,
        versionId: args.targetVersionId,
        environmentId: args.environmentId,
        createDefaultIfMissing: true,
      }
    );

    const id = await ctx.db.insert("deployments", {
      ...args,
      tenantId,
      status: "PENDING",
      createdAt: Date.now(),
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId,
      templateId: args.templateId,
      versionId: args.targetVersionId,
      type: "DEPLOYMENT_CREATED",
      summary: `Deployment created for template ${args.templateId}`,
      relatedTable: "deployments",
      relatedId: id,
    });

    return await ctx.db.get(id);
  },
});

export const activateDeployment = mutation({
  args: {
    deploymentId: v.id("deployments"),
    approvedBy: v.optional(v.id("operators")),
  },
  handler: async (ctx, args) => {
    const deployment = await ctx.db.get(args.deploymentId);
    if (!deployment) throw new Error("Deployment not found");

    await ctx.db.patch(args.deploymentId, {
      status: "ACTIVE",
      approvedBy: args.approvedBy,
      activatedAt: Date.now(),
    });

    const related = await ctx.db
      .query("deployments")
      .withIndex("by_environment", (q) => q.eq("environmentId", deployment.environmentId))
      .collect();

    for (const row of related) {
      if (row._id !== args.deploymentId && row.status === "ACTIVE") {
        await ctx.db.patch(row._id, { status: "RETIRED" });
      }
    }

    await appendChangeRecord(ctx.db as any, {
      tenantId: deployment.tenantId,
      templateId: deployment.templateId,
      versionId: deployment.targetVersionId,
      type: "DEPLOYMENT_ACTIVATED",
      summary: `Deployment activated: ${args.deploymentId}`,
      relatedTable: "deployments",
      relatedId: args.deploymentId,
    });

    return await ctx.db.get(args.deploymentId);
  },
});

export const rollbackDeployment = mutation({
  args: {
    deploymentId: v.id("deployments"),
    approvedBy: v.optional(v.id("operators")),
  },
  handler: async (ctx, args) => {
    const deployment = await ctx.db.get(args.deploymentId);
    if (!deployment) throw new Error("Deployment not found");
    if (!deployment.previousVersionId) {
      throw new Error("No previousVersionId to roll back to");
    }

    await ctx.db.patch(args.deploymentId, {
      status: "ROLLING_BACK",
    });

    const rollbackId = await ctx.db.insert("deployments", {
      tenantId: deployment.tenantId,
      templateId: deployment.templateId,
      environmentId: deployment.environmentId,
      targetVersionId: deployment.previousVersionId,
      previousVersionId: deployment.targetVersionId,
      rolloutPolicy: deployment.rolloutPolicy,
      status: "ACTIVE",
      createdBy: deployment.createdBy,
      approvedBy: args.approvedBy,
      activatedAt: Date.now(),
      createdAt: Date.now(),
      metadata: {
        rollbackOf: args.deploymentId,
      },
    });

    await ctx.db.patch(args.deploymentId, { status: "RETIRED" });

    await appendChangeRecord(ctx.db as any, {
      tenantId: deployment.tenantId,
      templateId: deployment.templateId,
      versionId: deployment.previousVersionId,
      type: "DEPLOYMENT_ROLLED_BACK",
      summary: `Rollback created deployment ${rollbackId}`,
      relatedTable: "deployments",
      relatedId: rollbackId,
    });

    return {
      rolledBackDeployment: await ctx.db.get(rollbackId),
      retiredDeployment: await ctx.db.get(args.deploymentId),
    };
  },
});

export const listDeployments = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    templateId: v.optional(v.id("agentTemplates")),
    environmentId: v.optional(v.id("environments")),
    status: v.optional(deploymentStatus),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.templateId) {
      rows = await ctx.db
        .query("deployments")
        .withIndex("by_template", (q) => q.eq("templateId", args.templateId!))
        .collect();
    } else if (args.environmentId) {
      rows = await ctx.db
        .query("deployments")
        .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId!))
        .collect();
    } else if (args.tenantId) {
      rows = await ctx.db
        .query("deployments")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId!))
        .collect();
    } else {
      rows = await ctx.db.query("deployments").collect();
    }

    if (args.status) {
      rows = rows.filter((row) => row.status === args.status);
    }

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});
