/**
 * Convex functions for org members (human team + org chart + RBAC)
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  COMPANY_PERMISSIONS,
  listAccessibleWorkspaces,
  listCompanyMemberships,
  requireCompanyAccess,
  requireCompanyPermission,
  requireWorkspaceAccess,
} from "./lib/companyAccess";

type MemberScope = Pick<Doc<"orgMembers">, "tenantId" | "projectId">;

async function requireMemberIdentity(ctx: QueryCtx | MutationCtx) {
  if (!await ctx.auth.getUserIdentity()) throw new Error("Authentication is required for member administration.");
}

async function memberTenant(ctx: QueryCtx | MutationCtx, scope: MemberScope) {
  const project = scope.projectId ? await ctx.db.get(scope.projectId) : null;
  if (scope.projectId && (!project?.tenantId || (scope.tenantId && project.tenantId !== scope.tenantId))) {
    throw new Error("Member workspace scope is unavailable or unauthorized.");
  }
  const tenantId = scope.tenantId ?? project?.tenantId;
  if (!tenantId) throw new Error("Member company scope is unavailable or unauthorized.");
  return tenantId;
}

async function requireMemberAdministration(ctx: MutationCtx, scope: MemberScope) {
  await requireMemberIdentity(ctx);
  const tenantId = await memberTenant(ctx, scope);
  const membership = await requireCompanyPermission(ctx, tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
  return { tenantId, actorId: String(membership.operatorId) };
}

async function requireMemberRecord(ctx: MutationCtx, id: Id<"orgMembers">) {
  await requireMemberIdentity(ctx);
  const member = await ctx.db.get(id);
  if (!member) throw new Error("Member is unavailable or unauthorized.");
  const authority = await requireMemberAdministration(ctx, member);
  return { member, ...authority };
}

async function readableMemberScope(ctx: QueryCtx | MutationCtx, projectId?: Id<"projects">) {
  await requireMemberIdentity(ctx);
  if (projectId) {
    const tenantId = await memberTenant(ctx, { projectId });
    await requireWorkspaceAccess(ctx, tenantId, projectId);
    return { projects: new Map([[projectId, tenantId]]), tenants: new Set<Id<"tenants">>() };
  }
  const memberships = await listCompanyMemberships(ctx);
  const projects = (await Promise.all(memberships.map(membership =>
    listAccessibleWorkspaces(ctx, membership.tenant._id)
  ))).flat();
  return {
    projects: new Map(projects.map(project => [project._id, project.tenantId])),
    tenants: new Set(memberships.map(membership => membership.tenant._id)),
  };
}

function matchesMemberScope(row: MemberScope, scope: Awaited<ReturnType<typeof readableMemberScope>>) {
  return row.projectId
    ? scope.projects.has(row.projectId) && (!row.tenantId || row.tenantId === scope.projects.get(row.projectId))
    : Boolean(row.tenantId && scope.tenants.has(row.tenantId));
}

async function readableMembers(ctx: QueryCtx, projectId?: Id<"projects">) {
  const scope = await readableMemberScope(ctx, projectId);
  const rows = projectId
    ? await ctx.db.query("orgMembers").withIndex("by_project", q => q.eq("projectId", projectId)).collect()
    : await ctx.db.query("orgMembers").collect();
  return rows.filter(row => row.active && matchesMemberScope(row, scope));
}

async function validateMemberReferences(ctx: MutationCtx, input: {
  tenantId: Id<"tenants">;
  projectId?: Id<"projects">;
  memberId?: Id<"orgMembers">;
  parentMemberId?: Id<"orgMembers">;
  projectAccess?: Doc<"orgMembers">["projectAccess"];
}) {
  for (const entry of input.projectAccess ?? []) {
    const project = await ctx.db.get(entry.projectId);
    if (!project || project.tenantId !== input.tenantId) throw new Error("Project access must remain within the member's company.");
  }
  const seen = new Set<Id<"orgMembers">>();
  let parentId = input.parentMemberId;
  while (parentId) {
    if (parentId === input.memberId || seen.has(parentId)) throw new Error("Member hierarchy cannot contain a cycle.");
    seen.add(parentId);
    const parent = await ctx.db.get(parentId);
    if (!parent || parent.projectId !== input.projectId || await memberTenant(ctx, parent) !== input.tenantId) {
      throw new Error("Parent member must belong to the same workspace scope.");
    }
    parentId = parent.parentMemberId;
  }
}

async function auditMemberChange(ctx: MutationCtx, input: {
  tenantId: Id<"tenants">;
  actorId: string;
  projectId?: Id<"projects">;
  memberId: Id<"orgMembers">;
  action: string;
}) {
  await ctx.db.insert("activities", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    actorType: "HUMAN",
    actorId: input.actorId,
    action: input.action,
    description: "Updated company member profile",
    targetType: "ORG_MEMBER",
    targetId: String(input.memberId),
  });
}

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
    const members = await readableMembers(ctx, args.projectId);

    return members.sort((a, b) => a.level - b.level);
  },
});

/**
 * List ALL org members across all projects (for global People view)
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const members = await readableMembers(ctx);

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
    const members = await readableMembers(ctx, args.projectId);

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
    const members = await readableMembers(ctx, args.projectId);
    const scope = await readableMemberScope(ctx, args.projectId);

    // Fetch agents
    const candidateAgents = args.projectId
      ? await ctx.db
          .query("agents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("agents").collect();
    const agents = candidateAgents.filter(agent => matchesMemberScope(agent, scope));

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
    await requireMemberIdentity(ctx);
    const member = await ctx.db.get(args.id);
    if (!member) return null;
    const tenantId = await memberTenant(ctx, member);
    if (member.projectId) await requireWorkspaceAccess(ctx, tenantId, member.projectId);
    else await requireCompanyAccess(ctx, tenantId);
    return member;
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
    await requireMemberIdentity(ctx);
    if (!args.projectId) throw new Error("A workspace is required when creating a member profile.");
    const authority = await requireMemberAdministration(ctx, args);
    await validateMemberReferences(ctx, { ...args, ...authority });
    // Check for duplicate email
    if (args.email) {
      const existing = await ctx.db
        .query("orgMembers")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .collect();
      const sameCompany = await Promise.all(existing.filter(member => member.active).map(async member => {
        const project = member.projectId ? await ctx.db.get(member.projectId) : null;
        const tenantId = member.tenantId ?? project?.tenantId;
        return tenantId === authority.tenantId && (!member.projectId || project?.tenantId === tenantId);
      }));
      if (sameCompany.some(Boolean)) {
        throw new Error(`A member with email ${args.email} already exists`);
      }
    }

    const memberId = await ctx.db.insert("orgMembers", {
      ...args,
      tenantId: authority.tenantId,
      active: true,
      invitedAt: Date.now(),
    });
    await auditMemberChange(ctx, { ...authority, projectId: args.projectId, memberId, action: "ORG_MEMBER_CREATED" });
    return memberId;
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
    const { id } = args;
    const updates = {
      name: args.name, email: args.email, role: args.role, title: args.title,
      avatar: args.avatar, parentMemberId: args.parentMemberId, level: args.level,
      responsibilities: args.responsibilities, systemRole: args.systemRole,
      projectAccess: args.projectAccess, permissions: args.permissions,
      active: args.active, metadata: args.metadata,
    };
    const { member, ...authority } = await requireMemberRecord(ctx, id);
    await validateMemberReferences(ctx, { ...authority, projectId: member.projectId, memberId: id, parentMemberId: updates.parentMemberId, projectAccess: updates.projectAccess });
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
    await auditMemberChange(ctx, { ...authority, projectId: member.projectId, memberId: id, action: "ORG_MEMBER_UPDATED" });
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
    const { member, ...authority } = await requireMemberRecord(ctx, args.id);
    await validateMemberReferences(ctx, { ...authority, projectId: member.projectId, memberId: args.id, projectAccess: args.projectAccess });

    const updates: Record<string, any> = {};
    if (args.systemRole !== undefined) updates.systemRole = args.systemRole;
    if (args.projectAccess !== undefined) updates.projectAccess = args.projectAccess;
    if (args.permissions !== undefined) updates.permissions = args.permissions;

    await ctx.db.patch(args.id, updates);
    await auditMemberChange(ctx, { ...authority, projectId: member.projectId, memberId: args.id, action: "ORG_MEMBER_PERMISSIONS_UPDATED" });
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
    const { member, ...authority } = await requireMemberRecord(ctx, args.memberId);
    await validateMemberReferences(ctx, { ...authority, projectId: member.projectId, projectAccess: [{ projectId: args.projectId, accessLevel: args.accessLevel }] });

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
    await auditMemberChange(ctx, { ...authority, projectId: member.projectId, memberId: args.memberId, action: "ORG_MEMBER_PROJECT_ACCESS_ADDED" });
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
    const { member, ...authority } = await requireMemberRecord(ctx, args.memberId);
    await validateMemberReferences(ctx, { ...authority, projectId: member.projectId, projectAccess: [{ projectId: args.projectId, accessLevel: "VIEW" }] });

    const existing = member.projectAccess || [];
    const filtered = existing.filter(
      (pa) => pa.projectId !== args.projectId
    );

    await ctx.db.patch(args.memberId, { projectAccess: filtered });
    await auditMemberChange(ctx, { ...authority, projectId: member.projectId, memberId: args.memberId, action: "ORG_MEMBER_PROJECT_ACCESS_REMOVED" });
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
    const { member, ...authority } = await requireMemberRecord(ctx, args.id);
    await ctx.db.patch(args.id, { active: false });
    await auditMemberChange(ctx, { ...authority, projectId: member.projectId, memberId: args.id, action: "ORG_MEMBER_REMOVED" });
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
    const { member, ...authority } = await requireMemberRecord(ctx, args.id);
    await validateMemberReferences(ctx, { ...authority, projectId: member.projectId, memberId: args.id, parentMemberId: args.newParentId });

    const oldLevel = member.level;
    const levelDelta = args.newLevel - oldLevel;

    // Update the member being moved
    await ctx.db.patch(args.id, {
      parentMemberId: args.newParentId,
      level: args.newLevel,
    });

    // Update all descendants' levels recursively
    if (levelDelta !== 0) {
      const candidates = await ctx.db
        .query("orgMembers")
        .withIndex("by_project", (q) =>
          member.projectId ? q.eq("projectId", member.projectId) : q
        )
        .collect();
      const allMembers = candidates.filter(candidate => candidate.projectId === member.projectId
        && (candidate.tenantId === authority.tenantId || (candidate.projectId && !candidate.tenantId)));

      const childrenMap = new Map<Id<"orgMembers">, Id<"orgMembers">[]>();
      for (const m of allMembers) {
        if (m.parentMemberId) {
          const siblings = childrenMap.get(m.parentMemberId) || [];
          siblings.push(m._id);
          childrenMap.set(m.parentMemberId, siblings);
        }
      }

      const visited = new Set<Id<"orgMembers">>([args.id]);
      const updateDescendants = async (parentId: Id<"orgMembers">) => {
        const children = childrenMap.get(parentId) || [];
        for (const childId of children) {
          if (visited.has(childId)) throw new Error("Member hierarchy cannot contain a cycle.");
          visited.add(childId);
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
    await auditMemberChange(ctx, { ...authority, projectId: member.projectId, memberId: args.id, action: "ORG_MEMBER_MOVED" });
    return args.id;
  },
});
