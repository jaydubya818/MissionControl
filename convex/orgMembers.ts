/**
 * Convex functions for org members (human team + org chart + RBAC)
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ============================================================================
// RBAC VALIDATORS
// ============================================================================

const systemRoleValidator = v.union(
  v.literal("OWNER"),
  v.literal("ADMIN"),
  v.literal("MANAGER"),
  v.literal("MEMBER"),
  v.literal("VIEWER")
);

const accessLevelValidator = v.union(
  v.literal("ADMIN"),
  v.literal("EDIT"),
  v.literal("VIEW")
);

const projectAccessValidator = v.object({
  projectId: v.id("projects"),
  accessLevel: accessLevelValidator,
});

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List all org members for a project (or all if no projectId)
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_project", (q) =>
        args.projectId ? q.eq("projectId", args.projectId) : q
      )
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return members.sort((a, b) => a.level - b.level);
  },
});

/**
 * List ALL org members across all projects (for global People view)
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("orgMembers")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return members.sort((a, b) => a.level - b.level);
  },
});

/**
 * Get org hierarchy tree (for org chart visualization)
 */
export const getHierarchy = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_project", (q) =>
        args.projectId ? q.eq("projectId", args.projectId) : q
      )
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    // Build tree structure
    const memberMap = new Map(members.map((m) => [m._id, { ...m, children: [] as any[] }]));
    const roots: any[] = [];

    for (const member of memberMap.values()) {
      if (member.parentMemberId) {
        const parent = memberMap.get(member.parentMemberId);
        if (parent) {
          parent.children.push(member);
        }
      } else {
        roots.push(member);
      }
    }

    return roots;
  },
});

/**
 * Get unified org hierarchy combining humans and agents
 */
export const getUnifiedHierarchy = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // Fetch human org members
    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_project", (q) =>
        args.projectId ? q.eq("projectId", args.projectId) : q
      )
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    // Fetch agents
    const agents = args.projectId
      ? await ctx.db
          .query("agents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("agents").collect();

    // Build human hierarchy first
    const memberMap = new Map(
      members.map((m) => [
        m._id,
        {
          id: `human-${m._id}`,
          type: "human" as const,
          _id: m._id,
          name: m.name,
          role: m.role,
          avatar: m.avatar,
          active: m.active,
          responsibilities: m.responsibilities,
          children: [] as any[],
        },
      ])
    );

    const roots: any[] = [];

    // Build human tree
    for (const member of memberMap.values()) {
      const originalMember = members.find((m) => m._id === member._id);
      if (originalMember?.parentMemberId) {
        const parent = memberMap.get(originalMember.parentMemberId);
        if (parent) {
          parent.children.push(member);
        }
      } else {
        roots.push(member);
      }
    }

    // Build agent hierarchy
    const agentMap = new Map(
      agents.map((a) => [
        a._id,
        {
          id: `agent-${a._id}`,
          type: "agent" as const,
          _id: a._id,
          name: a.name,
          role: a.role,
          emoji: a.emoji,
          active: a.status === "ACTIVE",
          status: a.status,
          agentRole: a.role,
          model: (a.metadata as any)?.model || "Claude Opus 4.5",
          budgetDaily: a.budgetDaily,
          budgetPerRun: a.budgetPerRun,
          spendToday: a.spendToday,
          allowedTaskTypes: a.allowedTaskTypes,
          parentAgentId: a.parentAgentId,
          children: [] as any[],
        },
      ])
    );

    // Attach agents to hierarchy
    for (const agent of agentMap.values()) {
      if (agent.parentAgentId) {
        const parentAgent = agentMap.get(agent.parentAgentId);
        if (parentAgent) {
          parentAgent.children.push(agent);
        }
      } else {
        if (roots.length > 0) {
          roots[0].children.push(agent);
        } else {
          roots.push(agent);
        }
      }
    }

    return roots;
  },
});

/**
 * Get a single org member by ID
 */
export const get = query({
  args: {
    id: v.id("orgMembers"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new org member with RBAC
 */
export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    title: v.optional(v.string()),
    avatar: v.optional(v.string()),
    parentMemberId: v.optional(v.id("orgMembers")),
    level: v.number(),
    responsibilities: v.optional(v.array(v.string())),
    systemRole: v.optional(systemRoleValidator),
    projectAccess: v.optional(v.array(projectAccessValidator)),
    permissions: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate email
    if (args.email) {
      const existing = await ctx.db
        .query("orgMembers")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
      if (existing && existing.active) {
        throw new Error(`A member with email ${args.email} already exists`);
      }
    }

    return await ctx.db.insert("orgMembers", {
      ...args,
      active: true,
      invitedAt: Date.now(),
    });
  },
});

/**
 * Update an org member (including RBAC fields)
 */
export const update = mutation({
  args: {
    id: v.id("orgMembers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    title: v.optional(v.string()),
    avatar: v.optional(v.string()),
    parentMemberId: v.optional(v.id("orgMembers")),
    level: v.optional(v.number()),
    responsibilities: v.optional(v.array(v.string())),
    systemRole: v.optional(systemRoleValidator),
    projectAccess: v.optional(v.array(projectAccessValidator)),
    permissions: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
    return id;
  },
});

/**
 * Update ONLY the role & permissions for a member
 */
export const updatePermissions = mutation({
  args: {
    id: v.id("orgMembers"),
    systemRole: v.optional(systemRoleValidator),
    projectAccess: v.optional(v.array(projectAccessValidator)),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.id);
    if (!member) throw new Error("Member not found");

    const updates: Record<string, any> = {};
    if (args.systemRole !== undefined) updates.systemRole = args.systemRole;
    if (args.projectAccess !== undefined) updates.projectAccess = args.projectAccess;
    if (args.permissions !== undefined) updates.permissions = args.permissions;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

/**
 * Add project access for a member
 */
export const addProjectAccess = mutation({
  args: {
    memberId: v.id("orgMembers"),
    projectId: v.id("projects"),
    accessLevel: accessLevelValidator,
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found");

    const existing = member.projectAccess || [];
    // Remove any existing access for this project
    const filtered = existing.filter(
      (pa) => pa.projectId !== args.projectId
    );
    filtered.push({
      projectId: args.projectId,
      accessLevel: args.accessLevel,
    });

    await ctx.db.patch(args.memberId, { projectAccess: filtered });
    return args.memberId;
  },
});

/**
 * Remove project access for a member
 */
export const removeProjectAccess = mutation({
  args: {
    memberId: v.id("orgMembers"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found");

    const existing = member.projectAccess || [];
    const filtered = existing.filter(
      (pa) => pa.projectId !== args.projectId
    );

    await ctx.db.patch(args.memberId, { projectAccess: filtered });
    return args.memberId;
  },
});

/**
 * Delete an org member (soft delete by setting active = false)
 */
export const remove = mutation({
  args: {
    id: v.id("orgMembers"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false });
    return args.id;
  },
});

/**
 * Move an org member to a new parent (reorganize hierarchy)
 */
export const move = mutation({
  args: {
    id: v.id("orgMembers"),
    newParentId: v.optional(v.id("orgMembers")),
    newLevel: v.number(),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.id);
    if (!member) {
      throw new Error("Member not found");
    }

    const oldLevel = member.level;
    const levelDelta = args.newLevel - oldLevel;

    // Update the member being moved
    await ctx.db.patch(args.id, {
      parentMemberId: args.newParentId,
      level: args.newLevel,
    });

    // Update all descendants' levels recursively
    if (levelDelta !== 0) {
      const allMembers = await ctx.db
        .query("orgMembers")
        .withIndex("by_project", (q) =>
          member.projectId ? q.eq("projectId", member.projectId) : q
        )
        .collect();

      const childrenMap = new Map<Id<"orgMembers">, Id<"orgMembers">[]>();
      for (const m of allMembers) {
        if (m.parentMemberId) {
          const siblings = childrenMap.get(m.parentMemberId) || [];
          siblings.push(m._id);
          childrenMap.set(m.parentMemberId, siblings);
        }
      }

      const updateDescendants = async (parentId: Id<"orgMembers">) => {
        const children = childrenMap.get(parentId) || [];
        for (const childId of children) {
          const child = allMembers.find((m) => m._id === childId);
          if (child) {
            await ctx.db.patch(childId, {
              level: child.level + levelDelta,
            });
            await updateDescendants(childId);
          }
        }
      };

      await updateDescendants(args.id);
    }

    return args.id;
  },
});
