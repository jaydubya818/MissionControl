import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { appendChangeRecord } from "./lib/armAudit";

export const resolveScope = internalQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    workOrderId: v.optional(v.id("workOrders")),
    approvalId: v.optional(v.id("approvals")),
    alertId: v.optional(v.id("alerts")),
    documentId: v.optional(v.id("agentDocuments")),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    runArtifactId: v.optional(v.id("runArtifacts")),
  },
  handler: async (ctx, args) => {
    let projectId = args.projectId;

    if (args.taskId) projectId = (await ctx.db.get(args.taskId))?.projectId ?? projectId;
    if (args.workOrderId) projectId = (await ctx.db.get(args.workOrderId))?.projectId ?? projectId;
    if (args.approvalId) projectId = (await ctx.db.get(args.approvalId))?.projectId ?? projectId;
    if (args.alertId) projectId = (await ctx.db.get(args.alertId))?.projectId ?? projectId;
    if (args.documentId) {
      const document = await ctx.db.get(args.documentId);
      projectId = document?.projectId ?? projectId;
      if (!projectId && document) {
        projectId = (await ctx.db.get(document.agentId))?.projectId;
      }
    }
    if (args.agentId) projectId = (await ctx.db.get(args.agentId))?.projectId ?? projectId;
    if (args.workflowRunId) projectId = (await ctx.db.get(args.workflowRunId))?.projectId ?? projectId;
    if (args.runArtifactId) projectId = (await ctx.db.get(args.runArtifactId))?.projectId ?? projectId;

    const project = projectId ? await ctx.db.get(projectId) : null;
    return {
      projectId,
      tenantId: project?.tenantId,
    };
  },
});

export const recordDenied = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    tenantId: v.optional(v.id("tenants")),
    operation: v.string(),
    identitySubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await appendChangeRecord(ctx.db as any, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      type: "AUTHORIZATION_DENIED",
      summary: `Authorization denied for ${args.operation.slice(0, 120)}`,
      payload: {
        operation: args.operation.slice(0, 120),
        identitySubject: args.identitySubject?.slice(0, 200),
      },
      relatedTable: "authorization",
      relatedId: args.operation.slice(0, 120),
    });
  },
});
