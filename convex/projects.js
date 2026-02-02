"use strict";
/**
 * Projects — Convex Functions
 *
 * Multi-project workspaces for Mission Control.
 * Every entity (tasks, agents, approvals, etc.) is scoped to a project.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.remove = exports.update = exports.create = exports.getStats = exports.getBySlug = exports.get = exports.list = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// QUERIES
// ============================================================================
/**
 * List all projects.
 */
exports.list = (0, server_1.query)({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("projects").order("asc").collect();
    },
});
/**
 * Get a project by ID.
 */
exports.get = (0, server_1.query)({
    args: { projectId: values_1.v.id("projects") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.projectId);
    },
});
/**
 * Get a project by slug (unique identifier).
 */
exports.getBySlug = (0, server_1.query)({
    args: { slug: values_1.v.string() },
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
exports.getStats = (0, server_1.query)({
    args: { projectId: values_1.v.id("projects") },
    handler: async (ctx, args) => {
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .collect();
        const agents = await ctx.db
            .query("agents")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .collect();
        const pendingApprovals = await ctx.db
            .query("approvals")
            .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "PENDING"))
            .collect();
        const byStatus = (status) => tasks.filter((t) => t.status === status).length;
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
                pending: pendingApprovals.length,
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
exports.create = (0, server_1.mutation)({
    args: {
        name: values_1.v.string(),
        slug: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        policyDefaults: values_1.v.optional(values_1.v.object({
            budgetDefaults: values_1.v.optional(values_1.v.any()),
            riskThresholds: values_1.v.optional(values_1.v.any()),
        })),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
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
exports.update = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.id("projects"),
        name: values_1.v.optional(values_1.v.string()),
        description: values_1.v.optional(values_1.v.string()),
        policyDefaults: values_1.v.optional(values_1.v.object({
            budgetDefaults: values_1.v.optional(values_1.v.any()),
            riskThresholds: values_1.v.optional(values_1.v.any()),
        })),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.projectId);
        if (!project) {
            return { success: false, error: "Project not found" };
        }
        const updates = {};
        if (args.name !== undefined)
            updates.name = args.name;
        if (args.description !== undefined)
            updates.description = args.description;
        if (args.policyDefaults !== undefined)
            updates.policyDefaults = args.policyDefaults;
        if (args.metadata !== undefined)
            updates.metadata = args.metadata;
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
exports.remove = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.id("projects"),
        force: values_1.v.optional(values_1.v.boolean()),
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
                error: "Project has tasks. Use force=true to delete anyway (not recommended).",
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
                error: "Project has agents. Use force=true to delete anyway (not recommended).",
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
