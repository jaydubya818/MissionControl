/**
 * Org Assignments Functions
 *
 * Manages the hierarchical org model:
 * Organization -> Projects -> Squads -> Agents
 *
 * Roles: CEO (one per project), LEAD, SPECIALIST, INTERN
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const orgPositionValidator = v.union(
  v.literal("CEO"),
  v.literal("LEAD"),
  v.literal("SPECIALIST"),
  v.literal("INTERN")
);

const orgScopeValidator = v.union(
  v.literal("PROJECT"),
  v.literal("SQUAD"),
  v.literal("REPO")
);

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get the full org chart for a project (CEO, leads, specialists, interns).
 */
export const getProjectOrg = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("orgAssignments")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Group by position
    const ceo = assignments.find((a) => a.orgPosition === "CEO") ?? null;
    const leads = assignments.filter((a) => a.orgPosition === "LEAD");
    const specialists = assignments.filter((a) => a.orgPosition === "SPECIALIST");
    const interns = assignments.filter((a) => a.orgPosition === "INTERN");

    // Enrich with agent data
    const enrichAssignment = async (assignment: typeof assignments[0]) => {
      const agent = await ctx.db.get(assignment.agentId);
      return { ...assignment, agent };
    };

    return {
      projectId: args.projectId,
      ceo: ceo ? await enrichAssignment(ceo) : null,
      leads: await Promise.all(leads.map(enrichAssignment)),
      specialists: await Promise.all(specialists.map(enrichAssignment)),
      interns: await Promise.all(interns.map(enrichAssignment)),
      total: assignments.length,
    };
  },
});

/**
 * Get all positions for a specific agent across projects.
 */
export const getAgentPositions = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("orgAssignments")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    // Enrich with project data
    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const project = a.projectId ? await ctx.db.get(a.projectId) : null;
        return { ...a, project };
      })
    );

    return enriched;
  },
});

/**
 * Get the CEO agent for a specific project.
 */
export const getCEO = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const ceoAssignment = await ctx.db
      .query("orgAssignments")
      .withIndex("by_project_position", (q) =>
        q.eq("projectId", args.projectId).eq("orgPosition", "CEO")
      )
      .first();

    if (!ceoAssignment) return null;

    const agent = await ctx.db.get(ceoAssignment.agentId);
    return { ...ceoAssignment, agent };
  },
});

/**
 * Get all lead agents for a project.
 */
export const getLeads = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const leadAssignments = await ctx.db
      .query("orgAssignments")
      .withIndex("by_project_position", (q) =>
        q.eq("projectId", args.projectId).eq("orgPosition", "LEAD")
      )
      .collect();

    return await Promise.all(
      leadAssignments.map(async (a) => {
        const agent = await ctx.db.get(a.agentId);
        return { ...a, agent };
      })
    );
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Assign an agent to a project with an org position.
 * Enforces: only one CEO per project.
 */
export const assign = mutation({
  args: {
    agentId: v.id("agents"),
    projectId: v.id("projects"),
    orgPosition: orgPositionValidator,
    scope: v.optional(orgScopeValidator),
    scopeRef: v.optional(v.string()),
    assignedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate agent exists
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    // Validate project exists
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // CEO uniqueness check
    if (args.orgPosition === "CEO") {
      const existingCEO = await ctx.db
        .query("orgAssignments")
        .withIndex("by_project_position", (q) =>
          q.eq("projectId", args.projectId).eq("orgPosition", "CEO")
        )
        .first();

      if (existingCEO && existingCEO.agentId !== args.agentId) {
        throw new Error(
          `Project already has a CEO (agent ${existingCEO.agentId}). ` +
          "Remove the existing CEO assignment first."
        );
      }

      // If same agent, update instead of duplicate
      if (existingCEO) {
        await ctx.db.patch(existingCEO._id, {
          scope: args.scope ?? "PROJECT",
          scopeRef: args.scopeRef,
          assignedBy: args.assignedBy,
          assignedAt: Date.now(),
        });
        return existingCEO._id;
      }
    }

    // Check for existing assignment (same agent, same project, same position)
    const existing = await ctx.db
      .query("orgAssignments")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    const duplicate = existing.find(
      (a) =>
        a.projectId === args.projectId &&
        a.orgPosition === args.orgPosition &&
        a.scopeRef === args.scopeRef
    );

    if (duplicate) {
      // Update existing assignment
      await ctx.db.patch(duplicate._id, {
        assignedBy: args.assignedBy,
        assignedAt: Date.now(),
      });
      return duplicate._id;
    }

    // Create new assignment
    return await ctx.db.insert("orgAssignments", {
      agentId: args.agentId,
      projectId: args.projectId,
      orgPosition: args.orgPosition,
      scope: args.scope ?? "PROJECT",
      scopeRef: args.scopeRef,
      assignedBy: args.assignedBy,
      assignedAt: Date.now(),
    });
  },
});

/**
 * Remove an org assignment.
 */
export const unassign = mutation({
  args: {
    assignmentId: v.id("orgAssignments"),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    await ctx.db.delete(args.assignmentId);
  },
});
