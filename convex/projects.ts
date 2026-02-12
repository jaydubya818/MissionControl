/**
 * Projects — Convex Functions
 *
 * Multi-project workspaces for Mission Control.
 * Every entity (tasks, agents, approvals, etc.) is scoped to a project.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List all projects.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("asc").collect();
  },
});

/**
 * Get a project by ID.
 */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

/**
 * Get a project by slug (unique identifier).
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Get project stats (task counts, agent counts, pending approvals).
 */
export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const [pendingApprovals, escalatedApprovals] = await Promise.all([
      ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "PENDING")
        )
        .collect(),
      ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "ESCALATED")
        )
        .collect(),
    ]);

    const byStatus = (status: string) =>
      tasks.filter((t) => t.status === status).length;

    return {
      projectId: args.projectId,
      tasks: {
        total: tasks.length,
        inbox: byStatus("INBOX"),
        assigned: byStatus("ASSIGNED"),
        inProgress: byStatus("IN_PROGRESS"),
        review: byStatus("REVIEW"),
        needsApproval: byStatus("NEEDS_APPROVAL"),
        blocked: byStatus("BLOCKED"),
        done: byStatus("DONE"),
        canceled: byStatus("CANCELED"),
      },
      agents: {
        total: agents.length,
        active: agents.filter((a) => a.status === "ACTIVE").length,
        paused: agents.filter((a) => a.status === "PAUSED").length,
      },
      approvals: {
        pending: pendingApprovals.length + escalatedApprovals.length,
      },
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new project.
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    tenantId: v.optional(v.id("tenants")), // ARM: Required for new projects
    policyDefaults: v.optional(
      v.object({
        budgetDefaults: v.optional(v.any()),
        riskThresholds: v.optional(v.any()),
      })
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // ARM Phase 1: Require tenantId for new projects
    // TODO: Remove this check after migration completes
    if (!args.tenantId) {
      // For now, get or create default tenant
      let defaultTenant = await ctx.db
        .query("tenants")
        .withIndex("by_slug", (q) => q.eq("slug", "default"))
        .first();
      
      if (!defaultTenant) {
        // Create default tenant if it doesn't exist
        const tenantId = await ctx.db.insert("tenants", {
          name: "Default Organization",
          slug: "default",
          description: "Default tenant for migration",
          active: true,
        });
        defaultTenant = await ctx.db.get(tenantId);
      }
      
      args.tenantId = defaultTenant!._id;
    }

    // Check for duplicate slug
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      return {
        success: false,
        error: `Project with slug "${args.slug}" already exists`,
      };
    }

    const projectId = await ctx.db.insert("projects", {
      tenantId: args.tenantId,
      name: args.name,
      slug: args.slug,
      description: args.description,
      policyDefaults: args.policyDefaults,
      metadata: args.metadata,
    });

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "PROJECT_CREATED",
      description: `Project "${args.name}" created`,
      targetType: "PROJECT",
      targetId: projectId,
      projectId,
    });

    return {
      success: true,
      project: await ctx.db.get(projectId),
    };
  },
});

/**
 * Update a project.
 */
export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    policyDefaults: v.optional(
      v.object({
        budgetDefaults: v.optional(v.any()),
        riskThresholds: v.optional(v.any()),
      })
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.policyDefaults !== undefined)
      updates.policyDefaults = args.policyDefaults;
    if (args.metadata !== undefined) updates.metadata = args.metadata;

    await ctx.db.patch(args.projectId, updates);

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "PROJECT_UPDATED",
      description: `Project "${project.name}" updated`,
      targetType: "PROJECT",
      targetId: args.projectId,
      projectId: args.projectId,
      beforeState: project,
      afterState: { ...project, ...updates },
    });

    return {
      success: true,
      project: await ctx.db.get(args.projectId),
    };
  },
});

/**
 * Delete a project (only if empty).
 */
export const remove = mutation({
  args: {
    projectId: v.id("projects"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Check if project has any tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1);

    if (tasks.length > 0 && !args.force) {
      return {
        success: false,
        error:
          "Project has tasks. Use force=true to delete anyway (not recommended).",
      };
    }

    // Check if project has any agents
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1);

    if (agents.length > 0 && !args.force) {
      return {
        success: false,
        error:
          "Project has agents. Use force=true to delete anyway (not recommended).",
      };
    }

    await ctx.db.delete(args.projectId);

    // Log activity (to a null project since we're deleting it)
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "PROJECT_DELETED",
      description: `Project "${project.name}" deleted`,
      targetType: "PROJECT",
      targetId: args.projectId,
      metadata: { deletedProject: project },
    });

    return { success: true };
  },
});

/**
 * Update GitHub integration settings for a project.
 */
export const updateGitHubIntegration = mutation({
  args: {
    projectId: v.id("projects"),
    githubRepo: v.optional(v.string()),
    githubBranch: v.optional(v.string()),
    githubWebhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Authorization check: verify caller identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Unauthorized: No identity found" };
    }
    // TODO: Add project membership/role check when user management is implemented
    // For now, we allow any authenticated user to update their projects

    const updates: any = {};
    if (args.githubRepo !== undefined) updates.githubRepo = args.githubRepo;
    if (args.githubBranch !== undefined) updates.githubBranch = args.githubBranch;
    if (args.githubWebhookSecret !== undefined)
      updates.githubWebhookSecret = args.githubWebhookSecret;

    await ctx.db.patch(args.projectId, updates);

    // Sanitize updates for activity log (remove webhook secret)
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.githubWebhookSecret !== undefined) {
      sanitizedUpdates.githubWebhookSecret = "[REDACTED]";
    }

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "HUMAN",
      actorId: identity.subject,
      action: "PROJECT_GITHUB_UPDATED",
      description: `GitHub integration updated for "${project.name}"`,
      targetType: "PROJECT",
      targetId: args.projectId,
      projectId: args.projectId,
      metadata: { updates: sanitizedUpdates },
    });

    return { success: true, project: await ctx.db.get(args.projectId) };
  },
});

/**
 * Update agent swarm configuration for a project.
 */
export const updateSwarmConfig = mutation({
  args: {
    projectId: v.id("projects"),
    maxAgents: v.optional(v.number()),
    defaultModel: v.optional(v.string()),
    autoScale: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Authorization check: verify caller identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Unauthorized: No identity found" };
    }
    // TODO: Add project membership/role check when user management is implemented
    // For now, we allow any authenticated user to update their projects

    const swarmConfig = {
      maxAgents: args.maxAgents ?? project.swarmConfig?.maxAgents ?? 5,
      defaultModel: args.defaultModel ?? project.swarmConfig?.defaultModel,
      autoScale: args.autoScale ?? project.swarmConfig?.autoScale ?? false,
    };

    await ctx.db.patch(args.projectId, { swarmConfig });

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "HUMAN",
      actorId: identity.subject,
      action: "PROJECT_SWARM_CONFIG_UPDATED",
      description: `Swarm config updated for "${project.name}"`,
      targetType: "PROJECT",
      targetId: args.projectId,
      projectId: args.projectId,
      metadata: { swarmConfig },
    });

    return { success: true, project: await ctx.db.get(args.projectId) };
  },
});
