import { v } from "convex/values";
import { mutation, query } from "../lib/missionScopedFunctions";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";

/** Operator-visible automation contracts. Activation is deliberately out of scope. */
export const list = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const projectId = args.projectId;
    if (!projectId) return [];
    await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
    const rows = await ctx.db.query("automationDefinitions").withIndex("by_project", (q) => q.eq("projectId", projectId)).collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Reversible activation gate. It authorizes recurring review only, not work dispatch. */
export const setEnabled = mutation({
  args: {
    definitionId: v.id("automationDefinitions"),
    enabled: v.boolean(),
    /** @deprecated Browser actor labels are ignored; authority is server-derived. */
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const definition = await ctx.db.get(args.definitionId);
    if (!definition) throw new Error("Automation definition not found");
    const access = await requireWorkspacePermission(
      ctx,
      definition.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION
    );
    const actorId = access.actorId;
    if (definition.enabled === args.enabled) return definition._id;

    const now = Date.now();
    await ctx.db.patch(args.definitionId, {
      enabled: args.enabled,
      ...(args.enabled
        ? { activatedAt: now, activatedBy: actorId }
        : { deactivatedAt: now, deactivatedBy: actorId }),
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      projectId: definition.projectId,
      actorType: "HUMAN",
      actorId,
      action: args.enabled ? "AUTOMATION_DEFINITION_ACTIVATED" : "AUTOMATION_DEFINITION_DEACTIVATED",
      description: `${args.enabled ? "Activated" : "Disabled"} automation review loop: ${definition.name}`,
      targetType: "automationDefinition",
      targetId: args.definitionId,
    });
    return args.definitionId;
  },
});
