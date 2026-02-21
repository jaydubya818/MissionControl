/**
 * Mission Control demo seeder.
 *
 * Seeds dense, cross-linked data for UI validation across:
 * Alerts, Approvals, Operations, ARM (Directory/Policies/Deployments/Audit/Telemetry),
 * Agents (Registry/Identities/Memory), Projects (Projects/Captures/Docs),
 * Comms (Chat/Council/Telegraph/Meetings/Voice), and Admin (People/Org/Office).
 *
 * Run with:
 *   npx convex run seedMissionControlDemo:run
 */

import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { computeGenomeHash } from "./lib/genomeHash";
import { v } from "convex/values";

const SEED_VERSION = "mc-demo-v1";
const SEED_TAG = "mc-demo";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type AnyId = string;
type IdentityValidationStatus = "VALID" | "INVALID" | "MISSING" | "PARTIAL";

type SeedAgent = {
  _id: Id<"agents">;
  name: string;
  role: "INTERN" | "SPECIALIST" | "LEAD" | "CEO";
  status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
};

function withSeedMeta(seedKey: string, extra?: Record<string, unknown>) {
  return {
    ...(extra ?? {}),
    seedTag: SEED_TAG,
    seedVersion: SEED_VERSION,
    seedKey,
  };
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function ensureTenant(ctx: any) {
  let tenant = await ctx.db
    .query("tenants")
    .withIndex("by_slug", (q: any) => q.eq("slug", "mission-control"))
    .first();

  if (!tenant) {
    const tenantId = await ctx.db.insert("tenants", {
      name: "Mission Control",
      slug: "mission-control",
      description: "Primary tenant for Mission Control demo data",
      active: true,
      metadata: withSeedMeta("tenant:mission-control"),
    });
    tenant = await ctx.db.get(tenantId);
  }

  return tenant!;
}

async function ensureProject(ctx: any, tenantId: Id<"tenants">) {
  let project = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q: any) => q.eq("slug", "mission-control"))
    .first();

  if (!project) {
    const projectId = await ctx.db.insert("projects", {
      tenantId,
      name: "Mission Control",
      slug: "mission-control",
      description: "Operational command center for ARM + Mission Control validation",
      metadata: withSeedMeta("project:mission-control", {
        repo: "MissionControl",
      }),
    });
    project = await ctx.db.get(projectId);
  } else if (!project.tenantId || project.tenantId !== tenantId) {
    await ctx.db.patch(project._id, {
      tenantId,
      metadata: {
        ...(project.metadata ?? {}),
        tenantLinkedAt: Date.now(),
      },
    });
    project = await ctx.db.get(project._id);
  }

  return project!;
}

async function ensureEnvironment(
  ctx: any,
  tenantId: Id<"tenants">,
  name: string,
  type: "dev" | "staging" | "prod"
) {
  const sameType = await ctx.db
    .query("environments")
    .withIndex("by_tenant_type", (q: any) => q.eq("tenantId", tenantId).eq("type", type))
    .collect();
  const existing = sameType.find((row: any) => row.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const id = await ctx.db.insert("environments", {
    tenantId,
    name,
    type,
    description: `${name} environment`,
    metadata: withSeedMeta(`env:${type}`),
  });
  return await ctx.db.get(id);
}

async function ensureOperator(ctx: any, tenantId: Id<"tenants">, name: string, email: string) {
  let op = await ctx.db
    .query("operators")
    .withIndex("by_tenant_email", (q: any) => q.eq("tenantId", tenantId).eq("email", email))
    .first();
  if (!op) {
    const id = await ctx.db.insert("operators", {
      tenantId,
      email,
      name,
      active: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now() - 2 * HOUR,
      metadata: withSeedMeta(`operator:${email}`),
    });
    op = await ctx.db.get(id);
  }
  return op!;
}

async function ensurePermission(ctx: any, resource: string, action: string, description: string) {
  let perm = await ctx.db
    .query("permissions")
    .withIndex("by_resource_action", (q: any) => q.eq("resource", resource).eq("action", action))
    .first();
  if (!perm) {
    const id = await ctx.db.insert("permissions", {
      resource,
      action,
      description,
      metadata: withSeedMeta(`permission:${resource}:${action}`),
    });
    perm = await ctx.db.get(id);
  }
  return perm!;
}

async function ensureRole(
  ctx: any,
  tenantId: Id<"tenants">,
  name: string,
  description: string,
  permissions: string[]
) {
  let role = await ctx.db
    .query("roles")
    .withIndex("by_tenant_name", (q: any) => q.eq("tenantId", tenantId).eq("name", name))
    .first();
  if (!role) {
    const id = await ctx.db.insert("roles", {
      tenantId,
      name,
      description,
      permissions,
      metadata: withSeedMeta(`role:${name}`),
    });
    role = await ctx.db.get(id);
  }
  return role!;
}

async function ensureRoleAssignment(
  ctx: any,
  operatorId: Id<"operators">,
  roleId: Id<"roles">,
  scope: { type: "tenant" | "project" | "environment"; id: string }
) {
  const existing = await ctx.db
    .query("roleAssignments")
    .withIndex("by_operator_role", (q: any) => q.eq("operatorId", operatorId).eq("roleId", roleId))
    .first();
  if (existing) return existing;

  const id = await ctx.db.insert("roleAssignments", {
    operatorId,
    roleId,
    scope,
    assignedAt: Date.now(),
    metadata: withSeedMeta(`assignment:${operatorId}:${roleId}`),
  });
  return await ctx.db.get(id);
}

async function ensureOrgMember(
  ctx: any,
  args: {
    tenantId: Id<"tenants">;
    projectId: Id<"projects">;
    name: string;
    email?: string;
    role: string;
    title?: string;
    avatar?: string;
    parentMemberId?: Id<"orgMembers">;
    level: number;
    systemRole?: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
  }
) {
  let existing = args.email
    ? await ctx.db.query("orgMembers").withIndex("by_email", (q: any) => q.eq("email", args.email)).first()
    : null;

  if (existing) {
    await ctx.db.patch(existing._id, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      name: args.name,
      role: args.role,
      title: args.title,
      avatar: args.avatar,
      parentMemberId: args.parentMemberId,
      level: args.level,
      systemRole: args.systemRole,
      active: true,
    });
    return await ctx.db.get(existing._id);
  }

  const id = await ctx.db.insert("orgMembers", {
    tenantId: args.tenantId,
    projectId: args.projectId,
    name: args.name,
    email: args.email,
    role: args.role,
    title: args.title,
    avatar: args.avatar,
    parentMemberId: args.parentMemberId,
    level: args.level,
    active: true,
    responsibilities: [`${args.role} oversight`, "Operational execution", "Risk management"],
    systemRole: args.systemRole,
    projectAccess: [
      {
        projectId: args.projectId,
        accessLevel: args.systemRole === "VIEWER" ? "VIEW" : args.systemRole === "MEMBER" ? "EDIT" : "ADMIN",
      },
    ],
    permissions: ["tasks.create", "tasks.edit", "agents.view", "approvals.view"],
    invitedAt: Date.now() - DAY,
    metadata: withSeedMeta(`member:${args.email ?? slugify(args.name)}`),
  });
  return await ctx.db.get(id);
}

async function ensureAgent(
  ctx: any,
  args: {
    tenantId: Id<"tenants">;
    projectId: Id<"projects">;
    name: string;
    emoji: string;
    role: "INTERN" | "SPECIALIST" | "LEAD" | "CEO";
    status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
    allowedTaskTypes: string[];
    budgetDaily: number;
    budgetPerRun: number;
    spendToday: number;
    canSpawn: boolean;
    maxSubAgents: number;
    parentAgentId?: Id<"agents">;
  }
) {
  let agent = await ctx.db.query("agents").withIndex("by_name", (q: any) => q.eq("name", args.name)).first();
  if (agent) {
    await ctx.db.patch(agent._id, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      emoji: args.emoji,
      role: args.role,
      status: args.status,
      allowedTaskTypes: args.allowedTaskTypes,
      budgetDaily: args.budgetDaily,
      budgetPerRun: args.budgetPerRun,
      spendToday: args.spendToday,
      canSpawn: args.canSpawn,
      maxSubAgents: args.maxSubAgents,
      parentAgentId: args.parentAgentId,
      workspacePath: `/mission-control/agents/${slugify(args.name)}`,
      errorStreak: 0,
      lastHeartbeatAt: Date.now() - Math.floor(Math.random() * 20 * 60 * 1000),
      metadata: withSeedMeta(`agent:${slugify(args.name)}`, {
        model: args.role === "LEAD" || args.role === "CEO" ? "gpt-5" : "gpt-4.1",
      }),
    });
    return await ctx.db.get(agent._id);
  }

  const id = await ctx.db.insert("agents", {
    tenantId: args.tenantId,
    projectId: args.projectId,
    name: args.name,
    emoji: args.emoji,
    role: args.role,
    status: args.status,
    workspacePath: `/mission-control/agents/${slugify(args.name)}`,
    soulVersionHash: `seed-${slugify(args.name)}-soul-v1`,
    allowedTaskTypes: args.allowedTaskTypes,
    allowedTools: ["read", "write", "shell", "web_search", "web_fetch", "planner"],
    budgetDaily: args.budgetDaily,
    budgetPerRun: args.budgetPerRun,
    spendToday: args.spendToday,
    spendResetAt: Date.now() + DAY,
    canSpawn: args.canSpawn,
    maxSubAgents: args.maxSubAgents,
    parentAgentId: args.parentAgentId,
    errorStreak: 0,
    lastHeartbeatAt: Date.now() - Math.floor(Math.random() * 20 * 60 * 1000),
    metadata: withSeedMeta(`agent:${slugify(args.name)}`, {
      model: args.role === "LEAD" || args.role === "CEO" ? "gpt-5" : "gpt-4.1-mini",
      persona: `${args.name} ${args.role}`,
    }),
  });
  return await ctx.db.get(id);
}

async function collectCounts(ctx: any, projectId: Id<"projects">, tenantId: Id<"tenants">) {
  const tasks = await ctx.db.query("tasks").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const agents = await ctx.db.query("agents").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const approvals = await ctx.db.query("approvals").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const messages = await ctx.db.query("messages").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const captures = await ctx.db.query("captures").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const opEvents = await ctx.db.query("opEvents").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const templates = await ctx.db.query("agentTemplates").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const deployments = await ctx.db.query("deployments").withIndex("by_tenant", (q: any) => q.eq("tenantId", tenantId)).collect();

  return {
    agents: agents.length,
    tasks: tasks.length,
    approvals: approvals.length,
    messages: messages.length,
    captures: captures.length,
    opEvents: opEvents.length,
    armTemplates: templates.length,
    armDeployments: deployments.length,
  };
}

export const run = mutation({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args: { force?: boolean }) => {
    const now = Date.now();
    const tenant = await ensureTenant(ctx);
    const project = await ensureProject(ctx, tenant._id);
    const projectMeta = (project.metadata ?? {}) as Record<string, unknown>;

    if (!args.force && projectMeta.missionControlDemoSeedVersion === SEED_VERSION) {
      return {
        message: "Mission Control demo data already seeded",
        skipped: true,
        tenantId: tenant._id,
        projectId: project._id,
        counts: await collectCounts(ctx, project._id, tenant._id),
      };
    }

    const envDev = await ensureEnvironment(ctx, tenant._id, "Development", "dev");
    const envStaging = await ensureEnvironment(ctx, tenant._id, "Staging", "staging");
    const envProd = await ensureEnvironment(ctx, tenant._id, "Production", "prod");

    const permissionSpecs = [
      ["tasks", "create", "Create tasks"],
      ["tasks", "read", "Read tasks"],
      ["tasks", "update", "Update tasks"],
      ["tasks", "transition", "Transition task status"],
      ["agents", "read", "Read agents"],
      ["agents", "manage", "Manage agents"],
      ["approvals", "read", "Read approvals"],
      ["approvals", "decide", "Approve or deny approvals"],
      ["policy", "read", "Read policy envelopes"],
      ["policy", "manage", "Manage policy envelopes"],
      ["deployments", "create", "Create deployments"],
      ["deployments", "activate", "Activate deployments"],
      ["deployments", "rollback", "Rollback deployments"],
      ["telemetry", "read", "Read telemetry"],
      ["telegraph", "read", "Read telegraph threads"],
      ["telegraph", "write", "Write telegraph messages"],
      ["meetings", "read", "Read meetings"],
      ["meetings", "manage", "Manage meetings"],
      ["people", "read", "Read people directory"],
      ["people", "manage", "Manage people directory"],
    ] as const;
    for (const [resource, action, description] of permissionSpecs) {
      await ensurePermission(ctx, resource, action, description);
    }

    const roles = {
      owner: await ensureRole(ctx, tenant._id, "Owner", "Full control", [
        "tasks.create",
        "tasks.read",
        "tasks.update",
        "tasks.transition",
        "agents.read",
        "agents.manage",
        "approvals.read",
        "approvals.decide",
        "policy.read",
        "policy.manage",
        "deployments.create",
        "deployments.activate",
        "deployments.rollback",
        "telemetry.read",
        "people.manage",
      ]),
      operator: await ensureRole(ctx, tenant._id, "Operator", "Daily operations", [
        "tasks.read",
        "tasks.update",
        "tasks.transition",
        "agents.read",
        "approvals.read",
        "approvals.decide",
        "telemetry.read",
        "telegraph.read",
        "telegraph.write",
      ]),
      reviewer: await ensureRole(ctx, tenant._id, "Reviewer", "Review + compliance", [
        "tasks.read",
        "approvals.read",
        "approvals.decide",
        "policy.read",
        "telemetry.read",
      ]),
      observer: await ensureRole(ctx, tenant._id, "Observer", "Read-only access", [
        "tasks.read",
        "agents.read",
        "approvals.read",
        "telemetry.read",
      ]),
    };

    const operators = {
      jay: await ensureOperator(ctx, tenant._id, "Jay West", "jay@missioncontrol.local"),
      maya: await ensureOperator(ctx, tenant._id, "Maya Cole", "maya@missioncontrol.local"),
      rene: await ensureOperator(ctx, tenant._id, "Rene Park", "rene@missioncontrol.local"),
      iris: await ensureOperator(ctx, tenant._id, "Iris Shaw", "iris@missioncontrol.local"),
      leo: await ensureOperator(ctx, tenant._id, "Leo Finch", "leo@missioncontrol.local"),
    };

    await ensureRoleAssignment(ctx, operators.jay._id, roles.owner._id, {
      type: "tenant",
      id: tenant._id,
    });
    await ensureRoleAssignment(ctx, operators.maya._id, roles.operator._id, {
      type: "project",
      id: project._id,
    });
    await ensureRoleAssignment(ctx, operators.rene._id, roles.reviewer._id, {
      type: "project",
      id: project._id,
    });
    await ensureRoleAssignment(ctx, operators.iris._id, roles.operator._id, {
      type: "environment",
      id: envStaging._id,
    });
    await ensureRoleAssignment(ctx, operators.leo._id, roles.observer._id, {
      type: "project",
      id: project._id,
    });

    const ceo = await ensureOrgMember(ctx, {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Jay West",
      email: "jay@missioncontrol.local",
      role: "Founder",
      title: "CEO",
      avatar: "👤",
      level: 0,
      systemRole: "OWNER",
    });
    const coo = await ensureOrgMember(ctx, {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Maya Cole",
      email: "maya@missioncontrol.local",
      role: "Operations",
      title: "COO",
      avatar: "📈",
      parentMemberId: ceo._id,
      level: 1,
      systemRole: "ADMIN",
    });
    const cto = await ensureOrgMember(ctx, {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Rene Park",
      email: "rene@missioncontrol.local",
      role: "Engineering",
      title: "CTO",
      avatar: "🛠️",
      parentMemberId: ceo._id,
      level: 1,
      systemRole: "ADMIN",
    });
    await ensureOrgMember(ctx, {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Iris Shaw",
      email: "iris@missioncontrol.local",
      role: "Risk",
      title: "Governance Lead",
      avatar: "🧭",
      parentMemberId: coo._id,
      level: 2,
      systemRole: "MANAGER",
    });
    await ensureOrgMember(ctx, {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Leo Finch",
      email: "leo@missioncontrol.local",
      role: "Support",
      title: "Support Lead",
      avatar: "🤝",
      parentMemberId: coo._id,
      level: 2,
      systemRole: "MEMBER",
    });
    await ensureOrgMember(ctx, {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Nora Bell",
      email: "nora@missioncontrol.local",
      role: "Compliance",
      title: "Audit Specialist",
      avatar: "📚",
      parentMemberId: cto._id,
      level: 2,
      systemRole: "MEMBER",
    });

    const agentDefs = [
      {
        name: "MC Atlas",
        emoji: "🧭",
        role: "CEO" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["OPS", "ENGINEERING", "DOCS", "CUSTOMER_RESEARCH"],
        budgetDaily: 30,
        budgetPerRun: 3,
        spendToday: 8.2,
        canSpawn: true,
        maxSubAgents: 8,
      },
      {
        name: "MC Orbit",
        emoji: "🛰️",
        role: "LEAD" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["OPS", "ENGINEERING", "DOCS"],
        budgetDaily: 16,
        budgetPerRun: 2,
        spendToday: 5.4,
        canSpawn: true,
        maxSubAgents: 4,
        parentName: "MC Atlas",
      },
      {
        name: "MC Sentinel",
        emoji: "🛡️",
        role: "LEAD" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["OPS", "ENGINEERING", "DOCS"],
        budgetDaily: 16,
        budgetPerRun: 2,
        spendToday: 7.9,
        canSpawn: true,
        maxSubAgents: 4,
        parentName: "MC Atlas",
      },
      {
        name: "MC Beacon",
        emoji: "📣",
        role: "SPECIALIST" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["CONTENT", "SOCIAL", "EMAIL_MARKETING"],
        budgetDaily: 7,
        budgetPerRun: 0.9,
        spendToday: 2.4,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Orbit",
      },
      {
        name: "MC Forge",
        emoji: "⚙️",
        role: "SPECIALIST" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["ENGINEERING", "OPS"],
        budgetDaily: 8,
        budgetPerRun: 1.1,
        spendToday: 3.6,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Orbit",
      },
      {
        name: "MC Quill",
        emoji: "✍️",
        role: "SPECIALIST" as const,
        status: "PAUSED" as const,
        allowedTaskTypes: ["DOCS", "CONTENT"],
        budgetDaily: 7,
        budgetPerRun: 0.8,
        spendToday: 1.2,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Orbit",
      },
      {
        name: "MC Pulse",
        emoji: "📡",
        role: "SPECIALIST" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH", "OPS"],
        budgetDaily: 7,
        budgetPerRun: 0.9,
        spendToday: 2.1,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Sentinel",
      },
      {
        name: "MC Relay",
        emoji: "📬",
        role: "SPECIALIST" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["EMAIL_MARKETING", "CONTENT", "SOCIAL"],
        budgetDaily: 7,
        budgetPerRun: 0.9,
        spendToday: 3.0,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Sentinel",
      },
      {
        name: "MC Drift",
        emoji: "🧪",
        role: "INTERN" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["CUSTOMER_RESEARCH", "DOCS", "SOCIAL"],
        budgetDaily: 2.5,
        budgetPerRun: 0.3,
        spendToday: 0.6,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Pulse",
      },
      {
        name: "MC Patch",
        emoji: "🧰",
        role: "INTERN" as const,
        status: "ACTIVE" as const,
        allowedTaskTypes: ["ENGINEERING", "DOCS"],
        budgetDaily: 2.5,
        budgetPerRun: 0.3,
        spendToday: 0.8,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Forge",
      },
      {
        name: "MC Echo",
        emoji: "🔊",
        role: "INTERN" as const,
        status: "OFFLINE" as const,
        allowedTaskTypes: ["CONTENT", "SOCIAL"],
        budgetDaily: 2.5,
        budgetPerRun: 0.3,
        spendToday: 0.1,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Beacon",
      },
      {
        name: "MC Vault",
        emoji: "🔐",
        role: "SPECIALIST" as const,
        status: "QUARANTINED" as const,
        allowedTaskTypes: ["ENGINEERING", "OPS"],
        budgetDaily: 8,
        budgetPerRun: 1.0,
        spendToday: 4.8,
        canSpawn: false,
        maxSubAgents: 0,
        parentName: "MC Sentinel",
      },
    ];

    const agentByName = new Map<string, SeedAgent>();
    for (const def of agentDefs) {
      const parentId = def.parentName ? agentByName.get(def.parentName)?._id : undefined;
      const agent = await ensureAgent(ctx, {
        tenantId: tenant._id,
        projectId: project._id,
        name: def.name,
        emoji: def.emoji,
        role: def.role,
        status: def.status,
        allowedTaskTypes: def.allowedTaskTypes,
        budgetDaily: def.budgetDaily,
        budgetPerRun: def.budgetPerRun,
        spendToday: def.spendToday,
        canSpawn: def.canSpawn,
        maxSubAgents: def.maxSubAgents,
        parentAgentId: parentId,
      });
      agentByName.set(def.name, {
        _id: agent._id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
      });
    }

    const allAgents = [...agentByName.values()];
    for (const def of agentDefs) {
      const agent = agentByName.get(def.name)!;
      const position =
        def.role === "CEO" ? "CEO" : def.role === "LEAD" ? "LEAD" : def.role === "SPECIALIST" ? "SPECIALIST" : "INTERN";
      const existingAssignments = await ctx.db
        .query("orgAssignments")
        .withIndex("by_agent", (q: any) => q.eq("agentId", agent._id))
        .collect();
      const duplicate = existingAssignments.find(
        (row: any) => row.projectId === project._id && row.orgPosition === position
      );
      if (!duplicate) {
        await ctx.db.insert("orgAssignments", {
          agentId: agent._id,
          projectId: project._id,
          orgPosition: position,
          scope: "PROJECT",
          scopeRef: "mission-control",
          assignedBy: "seed",
          assignedAt: now,
          metadata: withSeedMeta(`org-assignment:${def.name}`),
        });
      }
    }

    const templateDefs = [
      ["Orchestrator Core", "mc-orchestrator", "Routing and delegation kernel", "openai", "gpt-5"],
      ["Execution Engine", "mc-execution", "Tool execution and runtime lifecycle", "openai", "gpt-4.1"],
      ["Research Analyst", "mc-research", "Research and synthesis profile", "openai", "gpt-4.1-mini"],
      ["Comms Operator", "mc-comms", "Communication and council operations", "openai", "gpt-4.1"],
      ["Policy Guard", "mc-policy", "Policy evaluation and risk controls", "openai", "gpt-5-mini"],
      ["Release Manager", "mc-release", "Deployments and release governance", "openai", "gpt-4.1"],
    ] as const;

    const templateBySlug = new Map<string, any>();
    const versionByTemplateAndVersion = new Map<string, any>();
    const approvedVersionByTemplate = new Map<string, any>();

    for (const [name, slug, description, provider, modelId] of templateDefs) {
      let template = await ctx.db
        .query("agentTemplates")
        .withIndex("by_tenant_slug", (q: any) => q.eq("tenantId", tenant._id).eq("slug", slug))
        .first();
      if (!template) {
        const id = await ctx.db.insert("agentTemplates", {
          tenantId: tenant._id,
          projectId: project._id,
          name,
          slug,
          description,
          active: true,
          createdAt: now - 21 * DAY,
          updatedAt: now - 1 * HOUR,
          metadata: withSeedMeta(`template:${slug}`),
        });
        template = await ctx.db.get(id);
      }
      if (!template) throw new Error(`Failed to create template ${slug}`);
      templateBySlug.set(slug, template);

      const existingVersions = await ctx.db
        .query("agentVersions")
        .withIndex("by_template", (q: any) => q.eq("templateId", template._id))
        .collect();
      const statusByVersion: Record<number, "DEPRECATED" | "APPROVED" | "CANDIDATE"> = {
        1: "DEPRECATED",
        2: "APPROVED",
        3: "CANDIDATE",
      };

      for (const version of [1, 2, 3]) {
        let versionDoc: any = existingVersions.find((row: any) => row.version === version);
        const genome = {
          modelConfig: {
            provider,
            modelId,
            temperature: version === 3 ? 0.5 : 0.2,
            maxTokens: 8192,
          },
          promptBundleHash: `prompt:${slug}:v${version}`,
          toolManifestHash: `tools:${slug}:v${version}`,
          provenance: {
            createdBy: "seedMissionControlDemo",
            source: "seed",
            createdAt: now - (20 - version) * DAY,
          },
        };

        if (!versionDoc) {
          const id = await ctx.db.insert("agentVersions", {
            tenantId: tenant._id,
            projectId: project._id,
            templateId: template._id,
            version,
            genomeHash: computeGenomeHash(genome),
            genome,
            status: statusByVersion[version],
            notes: `Seeded ${statusByVersion[version]} version`,
            createdAt: now - (20 - version) * DAY,
            updatedAt: now - (5 - version) * DAY,
            metadata: withSeedMeta(`version:${slug}:v${version}`),
          });
          versionDoc = await ctx.db.get(id);
        }
        if (!versionDoc) throw new Error(`Failed to create version ${slug}:v${version}`);

        versionByTemplateAndVersion.set(`${slug}:${version}`, versionDoc);
        if (versionDoc.status === "APPROVED") {
          approvedVersionByTemplate.set(slug, versionDoc);
        }
      }
    }

    const instanceByAgentId = new Map<AnyId, any>();
    for (let i = 0; i < allAgents.length; i++) {
      const agent = allAgents[i];
      const templateSlug =
        agent.role === "CEO"
          ? "mc-orchestrator"
          : agent.role === "LEAD"
          ? i % 2 === 0
            ? "mc-release"
            : "mc-policy"
          : agent.role === "SPECIALIST"
          ? i % 2 === 0
            ? "mc-execution"
            : "mc-comms"
          : "mc-research";
      const template = templateBySlug.get(templateSlug);
      const approvedVersion = approvedVersionByTemplate.get(templateSlug);
      if (!template || !approvedVersion) {
        throw new Error(`Missing template/version for ${templateSlug}`);
      }
      const envId = agent.role === "INTERN" ? envDev._id : agent.role === "SPECIALIST" ? envStaging._id : envProd._id;
      const instanceStatus =
        agent.status === "ACTIVE"
          ? "ACTIVE"
          : agent.status === "PAUSED"
          ? "PAUSED"
          : agent.status === "QUARANTINED"
          ? "QUARANTINED"
          : agent.status === "DRAINED"
          ? "DRAINING"
          : "READONLY";

      let instance = await ctx.db
        .query("agentInstances")
        .withIndex("by_legacy_agent", (q: any) => q.eq("legacyAgentId", agent._id))
        .first();

      if (!instance) {
        const id = await ctx.db.insert("agentInstances", {
          tenantId: tenant._id,
          projectId: project._id,
          templateId: template._id,
          versionId: approvedVersion._id,
          environmentId: envId,
          name: `${agent.name} Instance`,
          status: instanceStatus,
          legacyAgentId: agent._id,
          activatedAt: now - (i + 1) * HOUR,
          metadata: withSeedMeta(`instance:${agent.name}`),
        });
        instance = await ctx.db.get(id);
      } else {
        await ctx.db.patch(instance._id, {
          tenantId: tenant._id,
          projectId: project._id,
          templateId: template._id,
          versionId: approvedVersion._id,
          environmentId: envId,
          status: instanceStatus,
          metadata: withSeedMeta(`instance:${agent.name}`),
        });
        instance = await ctx.db.get(instance._id);
      }

      instanceByAgentId.set(agent._id, instance);
    }

    for (let i = 0; i < allAgents.length; i++) {
      const agent = allAgents[i];
      const instance = instanceByAgentId.get(agent._id);
      const validationStatus: IdentityValidationStatus =
        i % 7 === 0 ? "PARTIAL" : i % 11 === 0 ? "INVALID" : i % 5 === 0 ? "MISSING" : "VALID";
      const existing = await ctx.db
        .query("agentIdentities")
        .withIndex("by_agent", (q: any) => q.eq("agentId", agent._id))
        .first();

      const payload = {
        tenantId: tenant._id,
        agentId: agent._id,
        templateId: instance?.templateId,
        versionId: instance?.versionId,
        instanceId: instance?._id,
        legacyAgentId: agent._id,
        name: agent.name,
        creature: i % 2 === 0 ? "Falcon" : "Wolf",
        vibe: i % 3 === 0 ? "Strategic and calm" : "Direct and execution-focused",
        emoji: (agent as any).emoji ?? "🤖",
        avatarPath: `assets/avatars/${slugify(agent.name)}.png`,
        soulContent: `# ${agent.name} Soul\n\n## Core Truths\n- Safety first\n- Deliver complete outcomes\n\n## Boundaries\n- Escalate RED actions\n- Keep audit trails complete`,
        soulHash: `soul-${slugify(agent.name)}-v1`,
        toolsNotes: "read, write, shell, web_search, telegraph",
        validationStatus,
        validationErrors:
          validationStatus === "VALID"
            ? undefined
            : validationStatus === "MISSING"
            ? ["SOUL.md missing", "IDENTITY.md incomplete"]
            : validationStatus === "PARTIAL"
            ? ["vibe field incomplete"]
            : ["invalid avatar path", "empty core truths"],
        lastScannedAt: now - i * HOUR,
        metadata: withSeedMeta(`identity:${agent.name}`),
      };

      if (!existing) {
        await ctx.db.insert("agentIdentities", payload);
      } else {
        await ctx.db.patch(existing._id, payload);
      }
    }

    const existingProjectPolicies = await ctx.db
      .query("policyEnvelopes")
      .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
      .collect();

    const policyDefs = [
      {
        key: "policy:project-default",
        name: "Project Default Guardrail",
        priority: 50,
        templateId: undefined,
        versionId: undefined,
        active: true,
        rules: {
          defaultDecision: "ALLOW",
          requireApprovalOnRisk: ["RED"],
          toolPolicies: {
            shell: "NEEDS_APPROVAL",
            deploy: "NEEDS_APPROVAL",
            delete_file: "DENY",
          },
        },
      },
      {
        key: "policy:execution-v2",
        name: "Execution Engine v2 Restrictions",
        priority: 120,
        templateId: templateBySlug.get("mc-execution")._id,
        versionId: approvedVersionByTemplate.get("mc-execution")._id,
        active: true,
        rules: {
          defaultDecision: "ALLOW",
          toolPolicies: {
            shell: "NEEDS_APPROVAL",
            write_file: "NEEDS_APPROVAL",
            message_external: "DENY",
          },
        },
      },
      {
        key: "policy:research-relaxed",
        name: "Research Sandbox",
        priority: 20,
        templateId: templateBySlug.get("mc-research")._id,
        versionId: approvedVersionByTemplate.get("mc-research")._id,
        active: true,
        rules: {
          defaultDecision: "ALLOW",
          toolPolicies: {
            web_search: "ALLOW",
            web_fetch: "ALLOW",
            shell: "DENY",
          },
        },
      },
      {
        key: "policy:legacy-disabled",
        name: "Legacy Envelope (Disabled)",
        priority: 10,
        templateId: undefined,
        versionId: undefined,
        active: false,
        rules: {
          defaultDecision: "ALLOW",
          notes: "Kept for audit/reference",
        },
      },
    ];

    for (const def of policyDefs) {
      const existing = existingProjectPolicies.find((row: any) => row.metadata?.seedKey === def.key);
      if (existing) {
        await ctx.db.patch(existing._id, {
          active: def.active,
          priority: def.priority,
          rules: def.rules,
          updatedAt: now,
          templateId: def.templateId,
          versionId: def.versionId,
        });
      } else {
        await ctx.db.insert("policyEnvelopes", {
          tenantId: tenant._id,
          projectId: project._id,
          templateId: def.templateId,
          versionId: def.versionId,
          name: def.name,
          active: def.active,
          priority: def.priority,
          rules: def.rules,
          createdAt: now - 2 * DAY,
          updatedAt: now - 1 * HOUR,
          metadata: withSeedMeta(def.key),
        });
      }
    }

    const deploymentsByTenant = await ctx.db
      .query("deployments")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", tenant._id))
      .collect();
    const deploymentDefs = [
      {
        key: "deployment:execution-prod-active",
        templateSlug: "mc-execution",
        envId: envProd._id,
        targetVersion: 2,
        previousVersion: 1,
        status: "ACTIVE",
      },
      {
        key: "deployment:execution-staging-pending",
        templateSlug: "mc-execution",
        envId: envStaging._id,
        targetVersion: 3,
        previousVersion: 2,
        status: "PENDING",
      },
      {
        key: "deployment:policy-prod-active",
        templateSlug: "mc-policy",
        envId: envProd._id,
        targetVersion: 2,
        previousVersion: 1,
        status: "ACTIVE",
      },
      {
        key: "deployment:policy-staging-rollback",
        templateSlug: "mc-policy",
        envId: envStaging._id,
        targetVersion: 1,
        previousVersion: 2,
        status: "ROLLING_BACK",
      },
      {
        key: "deployment:release-prod-retired",
        templateSlug: "mc-release",
        envId: envProd._id,
        targetVersion: 1,
        previousVersion: undefined,
        status: "RETIRED",
      },
    ] as const;

    for (let i = 0; i < deploymentDefs.length; i++) {
      const def = deploymentDefs[i];
      const template = templateBySlug.get(def.templateSlug);
      const targetVersion = versionByTemplateAndVersion.get(`${def.templateSlug}:${def.targetVersion}`);
      const previousVersion = def.previousVersion
        ? versionByTemplateAndVersion.get(`${def.templateSlug}:${def.previousVersion}`)
        : undefined;
      const existing = deploymentsByTenant.find((row: any) => row.metadata?.seedKey === def.key);
      const payload = {
        tenantId: tenant._id,
        templateId: template._id,
        environmentId: def.envId,
        targetVersionId: targetVersion._id,
        previousVersionId: previousVersion?._id,
        rolloutPolicy: {
          strategy: i % 2 === 0 ? "all_at_once" : "canary",
          maxUnavailable: i % 2 === 0 ? 0 : 1,
        },
        status: def.status,
        createdBy: operators.maya._id,
        approvedBy: def.status === "PENDING" ? undefined : operators.rene._id,
        activatedAt: def.status === "ACTIVE" ? now - (i + 1) * HOUR : undefined,
        createdAt: now - (i + 2) * DAY,
        metadata: withSeedMeta(def.key),
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("deployments", payload);
      }
    }

    const taskTypes = [
      "CONTENT",
      "SOCIAL",
      "EMAIL_MARKETING",
      "CUSTOMER_RESEARCH",
      "SEO_RESEARCH",
      "ENGINEERING",
      "DOCS",
      "OPS",
    ] as const;
    const taskStatuses = [
      "INBOX",
      "ASSIGNED",
      "IN_PROGRESS",
      "REVIEW",
      "NEEDS_APPROVAL",
      "BLOCKED",
      "FAILED",
      "DONE",
      "CANCELED",
    ] as const;
    const activeAgents = allAgents.filter((a) => a.status === "ACTIVE");

    const taskIdByKey = new Map<string, Id<"tasks">>();
    for (const epic of [
      ["task:epic:policy", "ARM Policy Hardening Program", "ENGINEERING", "IN_PROGRESS"],
      ["task:epic:growth", "Growth Ops Automation Sprint", "OPS", "REVIEW"],
      ["task:epic:reliability", "Reliability and Recovery Program", "OPS", "ASSIGNED"],
    ] as const) {
      const [key, title, type, status] = epic;
      let task = await ctx.db.query("tasks").withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", key)).first();
      if (!task) {
        const taskId = await ctx.db.insert("tasks", {
          tenantId: tenant._id,
          projectId: project._id,
          idempotencyKey: key,
          title,
          description: `${title} - seeded mission program`,
          type,
          status,
          priority: 1,
          assigneeIds: [pick(activeAgents, taskIdByKey.size)._id],
          reviewCycles: status === "REVIEW" ? 2 : 0,
          actualCost: 12.75,
          estimatedCost: 15,
          source: "SEED",
          createdBy: "SYSTEM",
          createdByRef: "seedMissionControlDemo",
          labels: ["epic", "mission-control", "arm"],
          metadata: withSeedMeta(key),
        });
        task = await ctx.db.get(taskId);
      }
      taskIdByKey.set(key, task!._id);
    }

    const epicKeys = [...taskIdByKey.keys()];
    const insertedTaskIds: Id<"tasks">[] = [];
    for (let i = 0; i < 54; i++) {
      const key = `task:item:${i + 1}`;
      let task = await ctx.db.query("tasks").withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", key)).first();
      if (!task) {
        const status = pick([...taskStatuses], i);
        const type = pick([...taskTypes], i);
        const assignee = pick(activeAgents, i);
        const secondAssignee = i % 9 === 0 ? pick(activeAgents, i + 1)._id : undefined;
        const scheduleBase = now - (i % 6) * DAY + (i % 10) * HOUR;
        const parentTaskId = i < 27 ? taskIdByKey.get(pick(epicKeys, i)) : undefined;
        const reviewChecklist =
          status === "REVIEW" || status === "DONE"
            ? {
                type: "quality_gate",
                items: [
                  { label: "Scope complete", checked: true },
                  { label: "Policy compliant", checked: i % 4 !== 0 },
                  { label: "Audit trail attached", checked: i % 5 !== 0 },
                ],
              }
            : undefined;
        const deliverable =
          status === "REVIEW" || status === "DONE"
            ? {
                summary: `Deliverable package ${i + 1}`,
                content: `Artifacts and notes for item ${i + 1}`,
                artifactIds: [`artifact-${i + 1}-a`, `artifact-${i + 1}-b`],
              }
            : undefined;
        const workPlan =
          status === "IN_PROGRESS" || status === "REVIEW" || status === "BLOCKED"
            ? {
                bullets: [
                  "Gather context and constraints",
                  "Execute implementation path",
                  "Validate quality and governance checks",
                ],
                estimatedCost: 0.5 + (i % 7) * 0.2,
                estimatedDuration: `${45 + (i % 4) * 15} minutes`,
              }
            : undefined;

        const taskId = await ctx.db.insert("tasks", {
          tenantId: tenant._id,
          projectId: project._id,
          idempotencyKey: key,
          title: `MC Task ${String(i + 1).padStart(2, "0")} · ${type} · ${status}`,
          description: `Seeded task ${i + 1} for Mission Control view coverage`,
          type,
          status,
          priority: ((i % 4) + 1) as 1 | 2 | 3 | 4,
          assigneeIds: status === "INBOX" || status === "CANCELED" ? [] : [assignee._id, ...(secondAssignee ? [secondAssignee] : [])],
          assigneeInstanceIds:
            status === "INBOX" || status === "CANCELED"
              ? []
              : [instanceByAgentId.get(assignee._id)?._id, ...(secondAssignee ? [instanceByAgentId.get(secondAssignee)?._id] : [])].filter(Boolean),
          reviewerId: status === "REVIEW" ? pick(activeAgents, i + 2)._id : undefined,
          parentTaskId,
          workPlan,
          deliverable,
          reviewChecklist,
          reviewCycles: status === "REVIEW" ? 1 + (i % 2) : 0,
          estimatedCost: 0.8 + (i % 9) * 0.35,
          actualCost: 0.25 + (i % 8) * 0.22,
          dueAt: now + ((i % 14) - 7) * DAY,
          startedAt: ["IN_PROGRESS", "REVIEW", "BLOCKED", "FAILED", "DONE"].includes(status)
            ? now - ((i % 4) + 1) * HOUR
            : undefined,
          submittedAt: ["REVIEW", "DONE"].includes(status) ? now - (i % 4) * HOUR : undefined,
          completedAt: status === "DONE" ? now - (i % 18) * HOUR : undefined,
          scheduledFor: i % 3 === 0 ? scheduleBase : undefined,
          recurrence:
            i % 11 === 0
              ? {
                  frequency: i % 2 === 0 ? "DAILY" : "WEEKLY",
                  interval: i % 2 === 0 ? 1 : 2,
                  daysOfWeek: i % 2 === 0 ? undefined : [1, 3, 5],
                  endDate: now + 30 * DAY,
                }
              : undefined,
          labels: [
            "mission-control",
            `wave-${Math.floor(i / 9) + 1}`,
            type.toLowerCase(),
            status.toLowerCase(),
          ],
          blockedReason: status === "BLOCKED" ? "Awaiting upstream dependency and operator review" : undefined,
          source: "SEED",
          sourceRef: `seed://${key}`,
          createdBy: "SYSTEM",
          createdByRef: "seedMissionControlDemo",
          metadata: withSeedMeta(key),
        });
        task = await ctx.db.get(taskId);
      }
      taskIdByKey.set(key, task!._id);
      insertedTaskIds.push(task!._id);
    }

    const transitionActorPool = [allAgents[0], allAgents[1], allAgents[2]];
    for (let i = 0; i < insertedTaskIds.length; i++) {
      const taskId = insertedTaskIds[i];
      const task = await ctx.db.get(taskId);
      if (!task || task.status === "INBOX") continue;
      const transitionKey = `transition:${task.idempotencyKey ?? taskId}:to:${task.status}`;
      const existingTransition = await ctx.db
        .query("taskTransitions")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", transitionKey))
        .first();
      if (!existingTransition) {
        const actor = pick(transitionActorPool, i);
        await ctx.db.insert("taskTransitions", {
          tenantId: tenant._id,
          projectId: project._id,
          idempotencyKey: transitionKey,
          taskId,
          fromStatus: "INBOX",
          toStatus: task.status,
          actorType: "AGENT",
          actorAgentId: actor._id,
          reason: "Seeded status placement",
          sessionKey: `seed-session-${Math.floor(i / 6)}`,
        });
      }

      await ctx.db.insert("taskEvents", {
        tenantId: tenant._id,
        projectId: project._id,
        taskId,
        eventType: "TASK_CREATED",
        actorType: "SYSTEM",
        actorId: "seedMissionControlDemo",
        timestamp: now - (insertedTaskIds.length - i) * 10 * 60 * 1000,
        afterState: {
          status: task.status,
          type: task.type,
        },
        metadata: withSeedMeta(`task-event:create:${taskId}`),
      });
    }

    const dependencyRows = await ctx.db.query("taskDependencies").collect();
    for (let i = 0; i < 30; i++) {
      const epicKey = pick(epicKeys, i);
      const parentTaskId = taskIdByKey.get(epicKey)!;
      const taskA = taskIdByKey.get(`task:item:${i + 1}`)!;
      const taskB = taskIdByKey.get(`task:item:${i + 2}`)!;
      const exists = dependencyRows.find(
        (row: any) =>
          row.parentTaskId === parentTaskId && row.taskId === taskB && row.dependsOnTaskId === taskA
      );
      if (!exists) {
        await ctx.db.insert("taskDependencies", {
          parentTaskId,
          taskId: taskB,
          dependsOnTaskId: taskA,
        });
      }
    }

    const messageTypes = ["WORK_PLAN", "PROGRESS", "COMMENT", "ARTIFACT", "SYSTEM"] as const;
    const messageIds: Id<"messages">[] = [];
    for (let i = 0; i < 110; i++) {
      const taskId = pick(insertedTaskIds, i);
      const agent = pick(activeAgents, i);
      const instance = instanceByAgentId.get(agent._id);
      const type = pick([...messageTypes], i);
      const idempotencyKey = `message:${i + 1}`;
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
        .first();
      if (existing) {
        messageIds.push(existing._id);
        continue;
      }

      const id = await ctx.db.insert("messages", {
        tenantId: tenant._id,
        projectId: project._id,
        idempotencyKey,
        taskId,
        authorType: i % 7 === 0 ? "HUMAN" : "AGENT",
        authorAgentId: i % 7 === 0 ? undefined : agent._id,
        authorInstanceId: i % 7 === 0 ? undefined : instance?._id,
        authorUserId: i % 7 === 0 ? "operator" : undefined,
        type,
        content:
          type === "WORK_PLAN"
            ? `Plan ${i + 1}: define scope, execute path, validate outcomes`
            : type === "PROGRESS"
            ? `Progress update ${i + 1}: execution moving forward with no blockers`
            : type === "ARTIFACT"
            ? `Artifact drop ${i + 1}: attached logs and output snapshots`
            : type === "SYSTEM"
            ? `System note ${i + 1}: automated coordination signal`
            : `Thread comment ${i + 1}: coordination note and clarification`,
        artifacts:
          type === "ARTIFACT"
            ? [
                { name: `artifact-${i + 1}.md`, type: "text/markdown", url: `https://example.com/artifacts/${i + 1}` },
                { name: `trace-${i + 1}.json`, type: "application/json" },
              ]
            : undefined,
        mentions: i % 8 === 0 ? ["@MC Atlas", "@MC Orbit"] : undefined,
        metadata: withSeedMeta(`message:${i + 1}`),
      });
      messageIds.push(id);
    }

    const runIds: Id<"runs">[] = [];
    for (let i = 0; i < 52; i++) {
      const taskId = pick(insertedTaskIds, i);
      const assignee = pick(activeAgents, i);
      const instance = instanceByAgentId.get(assignee._id);
      const runStatus = i % 9 === 0 ? "FAILED" : i % 7 === 0 ? "RUNNING" : "COMPLETED";
      const startedAt = now - (i + 1) * 25 * 60 * 1000;
      const endedAt = runStatus === "RUNNING" ? undefined : startedAt + (5 + (i % 20)) * 60 * 1000;
      const runIdempotency = `run:${i + 1}`;
      const existing = await ctx.db
        .query("runs")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", runIdempotency))
        .first();
      if (existing) {
        runIds.push(existing._id);
        continue;
      }

      const id = await ctx.db.insert("runs", {
        tenantId: tenant._id,
        projectId: project._id,
        idempotencyKey: runIdempotency,
        agentId: assignee._id,
        instanceId: instance?._id,
        versionId: instance?.versionId,
        templateId: instance?.templateId,
        taskId,
        sessionKey: `mc-session-${Math.floor(i / 4) + 1}`,
        startedAt,
        endedAt,
        durationMs: endedAt ? endedAt - startedAt : undefined,
        model: assignee.role === "LEAD" || assignee.role === "CEO" ? "gpt-5" : "gpt-4.1-mini",
        inputTokens: 250 + i * 5,
        outputTokens: 480 + i * 7,
        cacheReadTokens: 50 + (i % 10) * 3,
        cacheWriteTokens: 20 + (i % 8) * 2,
        costUsd: 0.08 + (i % 11) * 0.03,
        budgetAllocated: 0.4 + (i % 7) * 0.1,
        status: runStatus,
        error: runStatus === "FAILED" ? `Synthetic failure ${i + 1}: timeout during tool execution` : undefined,
        metadata: withSeedMeta(`run:${i + 1}`),
      });
      runIds.push(id);
    }

    const toolCallIds: Id<"toolCalls">[] = [];
    const tools = ["shell", "web_search", "write_file", "read_file", "deploy", "message_external"];
    for (let i = 0; i < runIds.length * 2; i++) {
      const runId = pick(runIds, i);
      const run = await ctx.db.get(runId);
      if (!run) continue;
      const toolName = pick(tools, i);
      const riskLevel = toolName === "deploy" || toolName === "message_external" ? "RED" : toolName === "shell" ? "YELLOW" : "GREEN";
      const status =
        riskLevel === "RED" && i % 3 === 0
          ? "DENIED"
          : i % 11 === 0
          ? "FAILED"
          : i % 7 === 0
          ? "RUNNING"
          : "SUCCESS";
      const startedAt = run.startedAt + (i % 5) * 60 * 1000;
      const endedAt = status === "RUNNING" ? undefined : startedAt + (20 + (i % 90)) * 1000;
      const id = await ctx.db.insert("toolCalls", {
        tenantId: tenant._id,
        projectId: project._id,
        runId: run._id,
        agentId: run.agentId,
        instanceId: run.instanceId,
        versionId: run.versionId,
        taskId: run.taskId,
        toolName,
        toolVersion: "1.0.0",
        riskLevel,
        policyResult:
          status === "DENIED"
            ? { decision: "DENY", reason: "Blocked by envelope", approvalId: undefined }
            : riskLevel === "RED"
            ? { decision: "NEEDS_APPROVAL", reason: "High risk", approvalId: `approval:${i + 1}` }
            : { decision: "ALLOW", reason: "Within guardrails", approvalId: undefined },
        inputPreview: `input payload ${i + 1}`,
        outputPreview: status === "SUCCESS" ? `output payload ${i + 1}` : undefined,
        inputHash: `in-${i + 1}`,
        outputHash: status === "SUCCESS" ? `out-${i + 1}` : undefined,
        startedAt,
        endedAt,
        durationMs: endedAt ? endedAt - startedAt : undefined,
        status,
        error: status === "FAILED" ? "Runtime command failure" : status === "DENIED" ? "Policy denied" : undefined,
        retryCount: i % 4,
      });
      toolCallIds.push(id);
    }

    const approvalIds: Id<"approvals">[] = [];
    const approvalRecordIds: Id<"approvalRecords">[] = [];
    for (let i = 0; i < 26; i++) {
      const agent = pick(activeAgents, i);
      const instance = instanceByAgentId.get(agent._id);
      const status = i % 6 === 0 ? "DENIED" : i % 5 === 0 ? "APPROVED" : i % 7 === 0 ? "ESCALATED" : "PENDING";
      const riskLevel = i % 2 === 0 ? "RED" : "YELLOW";
      const taskId = pick(insertedTaskIds, i);
      const toolCallId = pick(toolCallIds, i);
      const approvalId = await ctx.db.insert("approvals", {
        tenantId: tenant._id,
        projectId: project._id,
        idempotencyKey: `approval:${i + 1}`,
        taskId,
        toolCallId,
        requestorAgentId: agent._id,
        actionType: i % 3 === 0 ? "DEPLOY" : i % 3 === 1 ? "SHELL_EXEC" : "EXTERNAL_MESSAGE",
        actionSummary: `Approval request ${i + 1}: high-impact operation`,
        riskLevel,
        actionPayload: { sample: true, index: i + 1 },
        estimatedCost: 0.75 + (i % 7) * 0.5,
        rollbackPlan: "Revert deployment and restore previous stable build",
        justification: `Approval rationale ${i + 1}: required for mission-critical change`,
        status,
        decidedByAgentId: status === "APPROVED" ? pick(activeAgents, i + 1)._id : undefined,
        decidedByUserId: status === "DENIED" ? "operator" : undefined,
        decidedAt: status === "PENDING" || status === "ESCALATED" ? undefined : now - (i + 1) * 30 * 60 * 1000,
        decisionReason: status === "APPROVED" ? "Approved after validation" : status === "DENIED" ? "Denied due to risk exposure" : undefined,
        firstDecisionByUserId: riskLevel === "RED" && status === "APPROVED" ? "operator" : undefined,
        firstDecisionAt: riskLevel === "RED" && status === "APPROVED" ? now - (i + 2) * 45 * 60 * 1000 : undefined,
        firstDecisionReason: riskLevel === "RED" && status === "APPROVED" ? "Dual-control first pass" : undefined,
        escalationLevel: status === "ESCALATED" ? 1 : 0,
        escalatedAt: status === "ESCALATED" ? now - (i + 1) * 20 * 60 * 1000 : undefined,
        escalatedBy: status === "ESCALATED" ? "system" : undefined,
        escalationReason: status === "ESCALATED" ? "SLA threshold exceeded" : undefined,
        requiredDecisionCount: riskLevel === "RED" ? 2 : 1,
        decisionCount: status === "APPROVED" ? (riskLevel === "RED" ? 2 : 1) : status === "DENIED" ? 1 : 0,
        expiresAt: now + (3 + (i % 5)) * HOUR,
      });
      approvalIds.push(approvalId);

      const approvalRecordId = await ctx.db.insert("approvalRecords", {
        tenantId: tenant._id,
        projectId: project._id,
        instanceId: instance?._id,
        versionId: instance?.versionId,
        legacyApprovalId: approvalId,
        actionType: i % 3 === 0 ? "DEPLOY" : i % 3 === 1 ? "SHELL_EXEC" : "EXTERNAL_MESSAGE",
        riskLevel: riskLevel as "GREEN" | "YELLOW" | "RED",
        rollbackPlan: "Rollback playbook documented",
        justification: `ARM approval record ${i + 1}`,
        escalationLevel: status === "ESCALATED" ? 1 : 0,
        status: status === "ESCALATED" ? "PENDING" : status === "APPROVED" ? "APPROVED" : status === "DENIED" ? "DENIED" : "PENDING",
        requestedBy: pick([operators.maya._id, operators.rene._id, operators.iris._id], i),
        requestedAt: now - (i + 1) * HOUR,
        decidedBy: status === "APPROVED" || status === "DENIED" ? operators.rene._id : undefined,
        decidedAt: status === "APPROVED" || status === "DENIED" ? now - i * 30 * 60 * 1000 : undefined,
        decisionReason: status === "APPROVED" ? "Compliant" : status === "DENIED" ? "Policy conflict" : undefined,
        metadata: withSeedMeta(`approval-record:${i + 1}`),
      });
      approvalRecordIds.push(approvalRecordId);
    }

    const coordinatorActions = [
      "COORDINATOR_TASK_DECOMPOSED",
      "COORDINATOR_DELEGATED",
      "COORDINATOR_REBALANCED",
      "COORDINATOR_ESCALATED",
      "COORDINATOR_LOOP_DETECTED",
      "COORDINATOR_BUDGET_WARNING",
      "COORDINATOR_CONFLICT_RESOLVED",
      "COORDINATOR_STANDUP_COMPILED",
      "COORDINATOR_ROUTING_UPDATED",
    ];
    for (let i = 0; i < 180; i++) {
      const agent = pick(allAgents, i);
      const taskId = pick(insertedTaskIds, i);
      await ctx.db.insert("activities", {
        tenantId: tenant._id,
        projectId: project._id,
        actorType: i % 5 === 0 ? "SYSTEM" : i % 4 === 0 ? "HUMAN" : "AGENT",
        actorId: i % 4 === 0 ? "operator" : agent._id,
        action: i % 3 === 0 ? pick(coordinatorActions, i) : "MISSION_ACTIVITY",
        description:
          i % 3 === 0
            ? `Coordinator event ${i + 1}: ${pick(coordinatorActions, i)}`
            : `Activity ${i + 1}: execution and collaboration update`,
        targetType: "TASK",
        targetId: taskId,
        taskId,
        agentId: agent._id,
        metadata: withSeedMeta(`activity:${i + 1}`),
      });
    }

    for (let i = 0; i < 28; i++) {
      const taskId = pick(insertedTaskIds, i);
      const runId = pick(runIds, i);
      const agent = pick(allAgents, i);
      const status = i % 4 === 0 ? "OPEN" : i % 4 === 1 ? "ACKNOWLEDGED" : i % 4 === 2 ? "RESOLVED" : "IGNORED";
      await ctx.db.insert("alerts", {
        tenantId: tenant._id,
        projectId: project._id,
        severity: i % 10 === 0 ? "CRITICAL" : i % 6 === 0 ? "ERROR" : i % 3 === 0 ? "WARNING" : "INFO",
        type: i % 2 === 0 ? "POLICY_EVENT" : "RUNTIME_EVENT",
        title: `Alert ${i + 1}: ${i % 2 === 0 ? "Policy gate triggered" : "Runtime anomaly detected"}`,
        description: `Synthetic alert payload ${i + 1} for UI validation`,
        agentId: agent._id,
        taskId,
        runId,
        status,
        acknowledgedBy: status === "ACKNOWLEDGED" ? "operator" : undefined,
        acknowledgedAt: status === "ACKNOWLEDGED" ? now - i * 5 * 60 * 1000 : undefined,
        resolvedAt: status === "RESOLVED" ? now - i * 8 * 60 * 1000 : undefined,
        resolutionNote: status === "RESOLVED" ? "Handled and monitored" : status === "IGNORED" ? "False positive" : undefined,
        metadata: withSeedMeta(`alert:${i + 1}`),
      });
    }

    for (let i = 0; i < allAgents.length * 8; i++) {
      const recipient = pick(allAgents, i);
      await ctx.db.insert("notifications", {
        tenantId: tenant._id,
        projectId: project._id,
        agentId: recipient._id,
        type: pick(["MENTION", "TASK_ASSIGNED", "TASK_TRANSITION", "APPROVAL_REQUESTED", "APPROVAL_DECIDED", "SYSTEM"], i),
        title: `Notification ${i + 1} for ${recipient.name}`,
        body: `Seeded notification event ${i + 1}`,
        taskId: pick(insertedTaskIds, i),
        messageId: pick(messageIds, i),
        approvalId: pick(approvalIds, i),
        fromAgentId: pick(allAgents, i + 1)._id,
        fromUserId: i % 9 === 0 ? "operator" : undefined,
        readAt: i % 3 === 0 ? now - i * 60 * 1000 : undefined,
        metadata: withSeedMeta(`notification:${i + 1}`),
      });
    }

    for (let i = 0; i < 32; i++) {
      const taskId = pick(insertedTaskIds, i);
      const agent = pick(allAgents, i);
      await ctx.db.insert("captures", {
        tenantId: tenant._id,
        projectId: project._id,
        taskId,
        agentId: agent._id,
        title: `Capture ${i + 1}`,
        description: `Visual artifact ${i + 1} for task traceability`,
        type: pick(["SCREENSHOT", "DIAGRAM", "MOCKUP", "CHART", "VIDEO", "OTHER"], i),
        url: `https://example.com/captures/${i + 1}.png`,
        thumbnailUrl: `https://example.com/captures/${i + 1}-thumb.png`,
        width: 1280,
        height: 720,
        fileSize: 250000 + i * 1000,
        mimeType: "image/png",
        tags: ["mission-control", "seed", `capture-${i + 1}`],
        capturedAt: now - i * 2 * HOUR,
        metadata: withSeedMeta(`capture:${i + 1}`),
      });
    }

    for (let i = 0; i < allAgents.length; i++) {
      const agent = allAgents[i];
      const docs = [
        {
          type: "WORKING_MD",
          content: `# ${agent.name} Working\n\n- Active objective: deliver mission outcomes\n- Current queue depth: ${2 + (i % 4)}\n- Next checkpoint: in ${30 + i * 3} minutes`,
        },
        {
          type: "DAILY_NOTE",
          content: `# Daily Note\n\n- Focus area: ${pick([...taskTypes], i)}\n- Risks: ${i % 5 === 0 ? "Policy lock" : "None"}\n- Alignment: green`,
        },
        {
          type: "SESSION_MEMORY",
          content: `# Session Memory\n\n- Preferred flow: explicit -> verify -> report\n- Last major action: seeded session ${i + 1}\n- Guidance: keep operator informed`,
        },
      ] as const;

      for (const doc of docs) {
        const existing = await ctx.db
          .query("agentDocuments")
          .withIndex("by_agent_type", (q: any) => q.eq("agentId", agent._id).eq("type", doc.type))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            tenantId: tenant._id,
            projectId: project._id,
            content: doc.content,
            updatedAt: now - i * 20 * 60 * 1000,
            metadata: withSeedMeta(`doc:${agent.name}:${doc.type}`),
          });
        } else {
          await ctx.db.insert("agentDocuments", {
            tenantId: tenant._id,
            projectId: project._id,
            agentId: agent._id,
            type: doc.type,
            content: doc.content,
            updatedAt: now - i * 20 * 60 * 1000,
            metadata: withSeedMeta(`doc:${agent.name}:${doc.type}`),
          });
        }
      }

      for (const taskType of ["ENGINEERING", "OPS", "DOCS"]) {
        const perf = await ctx.db
          .query("agentPerformance")
          .withIndex("by_agent_type", (q: any) => q.eq("agentId", agent._id).eq("taskType", taskType))
          .first();
        if (perf) {
          await ctx.db.patch(perf._id, {
            tenantId: tenant._id,
            projectId: project._id,
            successCount: 8 + i,
            failureCount: i % 4,
            avgCompletionTimeMs: (15 + i) * 60 * 1000,
            avgCostUsd: 0.2 + (i % 5) * 0.09,
            totalTasksCompleted: 12 + i,
            lastUpdatedAt: now - i * HOUR,
          });
        } else {
          await ctx.db.insert("agentPerformance", {
            tenantId: tenant._id,
            agentId: agent._id,
            projectId: project._id,
            taskType,
            successCount: 8 + i,
            failureCount: i % 4,
            avgCompletionTimeMs: (15 + i) * 60 * 1000,
            avgCostUsd: 0.2 + (i % 5) * 0.09,
            totalTasksCompleted: 12 + i,
            lastUpdatedAt: now - i * HOUR,
          });
        }
      }

      const patterns = [
        `strength:${pick([...taskTypes], i)}`,
        `weakness:${pick([...taskTypes], i + 2)}`,
      ];
      for (let p = 0; p < patterns.length; p++) {
        const pattern = patterns[p];
        const existing = await ctx.db
          .query("agentPatterns")
          .withIndex("by_agent_pattern", (q: any) => q.eq("agentId", agent._id).eq("pattern", pattern))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            tenantId: tenant._id,
            projectId: project._id,
            confidence: 0.58 + ((i + p) % 4) * 0.09,
            evidence: [`task-${i + 1}`, `task-${i + 9}`],
            lastSeenAt: now - i * 40 * 60 * 1000,
            metadata: withSeedMeta(`pattern:${agent.name}:${pattern}`),
          });
        } else {
          await ctx.db.insert("agentPatterns", {
            tenantId: tenant._id,
            agentId: agent._id,
            projectId: project._id,
            pattern,
            confidence: 0.58 + ((i + p) % 4) * 0.09,
            evidence: [`task-${i + 1}`, `task-${i + 9}`],
            discoveredAt: now - (i + p) * DAY,
            lastSeenAt: now - i * 40 * 60 * 1000,
            metadata: withSeedMeta(`pattern:${agent.name}:${pattern}`),
          });
        }
      }
    }

    const threadIds: Id<"telegraphThreads">[] = [];
    for (let i = 0; i < 10; i++) {
      const threadId = await ctx.db.insert("telegraphThreads", {
        tenantId: tenant._id,
        projectId: project._id,
        title: `Thread ${i + 1}: ${i % 2 === 0 ? "Operations" : "Council"} updates`,
        participants: [pick(allAgents, i)._id, pick(allAgents, i + 1)._id, "OPERATOR"],
        channel: i % 4 === 0 ? "TELEGRAM" : "INTERNAL",
        externalThreadRef: i % 4 === 0 ? `telegram-thread-${1000 + i}` : undefined,
        linkedTaskId: pick(insertedTaskIds, i),
        linkedApprovalId: pick(approvalIds, i),
        linkedIncidentId: i % 5 === 0 ? `incident-${i + 1}` : undefined,
        lastMessageAt: now - i * HOUR,
        messageCount: 0,
        metadata: withSeedMeta(`thread:${i + 1}`),
      });
      threadIds.push(threadId);
    }

    const telegraphMessageIds: Id<"telegraphMessages">[] = [];
    for (let i = 0; i < 68; i++) {
      const threadId = pick(threadIds, i);
      const sender = pick(allAgents, i);
      const msgId = await ctx.db.insert("telegraphMessages", {
        tenantId: tenant._id,
        projectId: project._id,
        threadId,
        senderId: i % 6 === 0 ? "OPERATOR" : sender._id,
        senderType: i % 6 === 0 ? "HUMAN" : "AGENT",
        content: `Telegraph message ${i + 1}: coordination payload`,
        replyToId: i > 0 && i % 5 !== 0 ? telegraphMessageIds[i - 1] : undefined,
        channel: i % 5 === 0 ? "TELEGRAM" : "INTERNAL",
        externalRef: i % 5 === 0 ? `tg-msg-${5000 + i}` : undefined,
        status: i % 8 === 0 ? "READ" : i % 7 === 0 ? "DELIVERED" : "SENT",
        metadata: withSeedMeta(`telegraph-message:${i + 1}`),
      });
      telegraphMessageIds.push(msgId);
    }

    for (const threadId of threadIds) {
      const messages = await ctx.db
        .query("telegraphMessages")
        .withIndex("by_thread", (q: any) => q.eq("threadId", threadId))
        .collect();
      const latest = messages.reduce((max: number, row: any) => Math.max(max, row._creationTime), 0);
      await ctx.db.patch(threadId, {
        messageCount: messages.length,
        lastMessageAt: latest || now,
      });
    }

    const meetingIds: Id<"meetings">[] = [];
    for (let i = 0; i < 12; i++) {
      const status = i % 5 === 0 ? "CANCELLED" : i % 4 === 0 ? "COMPLETED" : i % 3 === 0 ? "IN_PROGRESS" : "SCHEDULED";
      const meetingId = await ctx.db.insert("meetings", {
        tenantId: tenant._id,
        projectId: project._id,
        title: `Mission Meeting ${i + 1}`,
        agenda: `1. Review operations\n2. Decisions and approvals\n3. Risks and mitigations`,
        scheduledAt: now + (i - 5) * 6 * HOUR,
        duration: 30 + (i % 3) * 15,
        status,
        hostAgentId: pick(allAgents, i)._id,
        participants: [
          { agentId: pick(allAgents, i)._id, orgPosition: "LEAD", role: "host" },
          { agentId: pick(allAgents, i + 1)._id, orgPosition: "SPECIALIST", role: "attendee" },
          { agentId: pick(allAgents, i + 2)._id, orgPosition: "SPECIALIST", role: "attendee" },
        ],
        provider: i % 4 === 0 ? "ZOOM" : "MANUAL",
        externalMeetingRef: i % 4 === 0 ? `zoom-${9000 + i}` : undefined,
        notesDocPath: `/notes/meeting-${i + 1}.md`,
        notes: status === "COMPLETED" ? `Meeting ${i + 1} completed with actions.` : undefined,
        actionItems:
          status === "COMPLETED" || status === "IN_PROGRESS"
            ? [
                {
                  description: `Action item A for meeting ${i + 1}`,
                  assigneeAgentId: pick(allAgents, i + 3)._id,
                  taskId: pick(insertedTaskIds, i),
                  dueAt: now + (i + 1) * DAY,
                  completed: i % 2 === 0,
                },
                {
                  description: `Action item B for meeting ${i + 1}`,
                  assigneeAgentId: pick(allAgents, i + 4)._id,
                  dueAt: now + (i + 2) * DAY,
                  completed: false,
                },
              ]
            : undefined,
        calendarPayload: JSON.stringify({
          summary: `Mission Meeting ${i + 1}`,
          provider: i % 4 === 0 ? "ZOOM" : "MANUAL",
        }),
        metadata: withSeedMeta(`meeting:${i + 1}`),
      });
      meetingIds.push(meetingId);
    }

    for (let i = 0; i < 24; i++) {
      await ctx.db.insert("voiceArtifacts", {
        tenantId: tenant._id,
        agentId: pick(allAgents, i)._id,
        projectId: project._id,
        text: `Voice payload ${i + 1}: mission update synthesis`,
        transcript: `Transcript ${i + 1}: mission update synthesis`,
        audioUrl: `https://example.com/audio/${i + 1}.mp3`,
        provider: i % 3 === 0 ? "OTHER" : "ELEVENLABS",
        voiceId: `voice-${(i % 5) + 1}`,
        durationMs: 3000 + (i % 6) * 900,
        linkedMessageId: pick(telegraphMessageIds, i),
        linkedMeetingId: pick(meetingIds, i),
        metadata: withSeedMeta(`voice:${i + 1}`),
      });
    }

    const changeRecordIds: Id<"changeRecords">[] = [];
    for (const [slug, template] of templateBySlug.entries()) {
      const changeId = await ctx.db.insert("changeRecords", {
        tenantId: tenant._id,
        projectId: project._id,
        templateId: template._id,
        type: "TEMPLATE_CREATED",
        summary: `Template seeded: ${slug}`,
        relatedTable: "agentTemplates",
        relatedId: template._id,
        timestamp: now - 30 * DAY,
        metadata: withSeedMeta(`change:template:${slug}`),
      });
      changeRecordIds.push(changeId);
    }

    for (const [key, versionDoc] of versionByTemplateAndVersion.entries()) {
      const changeId = await ctx.db.insert("changeRecords", {
        tenantId: tenant._id,
        projectId: project._id,
        templateId: versionDoc.templateId,
        versionId: versionDoc._id,
        type: "VERSION_CREATED",
        summary: `Version seeded: ${key}`,
        relatedTable: "agentVersions",
        relatedId: versionDoc._id,
        timestamp: now - 20 * DAY + versionDoc.version * DAY,
        metadata: withSeedMeta(`change:version:${key}`),
      });
      changeRecordIds.push(changeId);
    }

    for (const [agentId, instance] of instanceByAgentId.entries()) {
      const changeId = await ctx.db.insert("changeRecords", {
        tenantId: tenant._id,
        projectId: project._id,
        templateId: instance.templateId,
        versionId: instance.versionId,
        instanceId: instance._id,
        legacyAgentId: agentId as any,
        type: "INSTANCE_CREATED",
        summary: `Instance seeded for ${instance.name}`,
        relatedTable: "agentInstances",
        relatedId: instance._id,
        timestamp: now - 10 * DAY,
        metadata: withSeedMeta(`change:instance:${instance._id}`),
      });
      changeRecordIds.push(changeId);
    }

    const deploymentRows = await ctx.db
      .query("deployments")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", tenant._id))
      .collect();
    for (const dep of deploymentRows) {
      const createdId = await ctx.db.insert("changeRecords", {
        tenantId: tenant._id,
        projectId: project._id,
        templateId: dep.templateId,
        versionId: dep.targetVersionId,
        type: "DEPLOYMENT_CREATED",
        summary: `Deployment created (${dep.status})`,
        relatedTable: "deployments",
        relatedId: dep._id,
        timestamp: dep.createdAt,
        metadata: withSeedMeta(`change:deployment:create:${dep._id}`),
      });
      changeRecordIds.push(createdId);
      if (dep.status === "ACTIVE") {
        const activeId = await ctx.db.insert("changeRecords", {
          tenantId: tenant._id,
          projectId: project._id,
          templateId: dep.templateId,
          versionId: dep.targetVersionId,
          type: "DEPLOYMENT_ACTIVATED",
          summary: `Deployment activated`,
          relatedTable: "deployments",
          relatedId: dep._id,
          timestamp: dep.activatedAt ?? dep.createdAt + HOUR,
          metadata: withSeedMeta(`change:deployment:active:${dep._id}`),
        });
        changeRecordIds.push(activeId);
      }
      if (dep.status === "ROLLING_BACK") {
        const rollbackId = await ctx.db.insert("changeRecords", {
          tenantId: tenant._id,
          projectId: project._id,
          templateId: dep.templateId,
          versionId: dep.previousVersionId ?? dep.targetVersionId,
          type: "DEPLOYMENT_ROLLED_BACK",
          summary: "Deployment rollback initiated",
          relatedTable: "deployments",
          relatedId: dep._id,
          timestamp: dep.createdAt + 2 * HOUR,
          metadata: withSeedMeta(`change:deployment:rollback:${dep._id}`),
        });
        changeRecordIds.push(rollbackId);
      }
    }

    const opEventTypes = [
      "RUN_STARTED",
      "RUN_COMPLETED",
      "RUN_FAILED",
      "TOOL_CALL_STARTED",
      "TOOL_CALL_COMPLETED",
      "TOOL_CALL_BLOCKED",
      "HEARTBEAT",
      "COST_TICK",
      "MESSAGE_SENT",
      "DECISION_MADE",
    ] as const;

    for (let i = 0; i < 420; i++) {
      const runId = pick(runIds, i);
      const run = await ctx.db.get(runId);
      if (!run) continue;
      const toolCallId = pick(toolCallIds, i);
      const taskId = pick(insertedTaskIds, i);
      const eventType =
        i < runIds.length
          ? "RUN_STARTED"
          : i < runIds.length * 2
          ? (run.status === "FAILED" ? "RUN_FAILED" : "RUN_COMPLETED")
          : pick([...opEventTypes], i);
      await ctx.db.insert("opEvents", {
        tenantId: tenant._id,
        projectId: project._id,
        type: eventType,
        timestamp: now - (420 - i) * 3 * 60 * 1000,
        instanceId: run.instanceId,
        versionId: run.versionId,
        taskId,
        runId: run._id,
        toolCallId: i % 2 === 0 ? toolCallId : undefined,
        changeRecordId: i % 6 === 0 ? pick(changeRecordIds, i) : undefined,
        payload: {
          index: i + 1,
          status: run.status,
          costUsd: run.costUsd,
          source: "seedMissionControlDemo",
        },
      });
    }

    const existingControl = await ctx.db
      .query("operatorControls")
      .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
      .first();
    if (!existingControl) {
      await ctx.db.insert("operatorControls", {
        tenantId: tenant._id,
        projectId: project._id,
        mode: "NORMAL",
        reason: "Seeded default mode",
        updatedBy: "seedMissionControlDemo",
        updatedAt: now,
        metadata: withSeedMeta("operator-control:default"),
      });
    }

    // ========================================================================
    // QUALITY CONTROL (QC) — Rulesets, Runs, Findings, Artifacts
    // ========================================================================
    
    // Seed default rulesets
    const preReleaseRuleset = await ctx.db.insert("qcRulesets", {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Pre-Release",
      description: "Full scan with strict gates for production releases",
      preset: "PRE_RELEASE",
      requiredDocs: ["README.md", "docs/PRD*.md", "CHANGELOG.md"],
      coverageThresholds: { unit: 80, integration: 70, e2e: 60 },
      securityPaths: ["auth/**", "security/**", "api/**"],
      gateDefinitions: [
        { name: "PRD exists", condition: "requiredDocs", severity: "RED" },
        { name: "Coverage meets threshold", condition: "coverageThresholds", severity: "RED" },
        { name: "Security paths covered", condition: "securityPaths", severity: "RED" },
        { name: "No RED findings", condition: "findings.red === 0", severity: "RED" },
      ],
      active: true,
      isBuiltIn: false,
      metadata: withSeedMeta("qc-ruleset:pre-release"),
    });

    const postMergeRuleset = await ctx.db.insert("qcRulesets", {
      tenantId: tenant._id,
      projectId: project._id,
      name: "Post-Merge",
      description: "Delta scan focused on changed files only",
      preset: "POST_MERGE",
      requiredDocs: ["README.md"],
      coverageThresholds: { unit: 60, integration: 40, e2e: 20 },
      securityPaths: ["auth/**", "security/**"],
      gateDefinitions: [
        { name: "Changed files have tests", condition: "coverageThresholds", severity: "YELLOW" },
        { name: "Docs updated if needed", condition: "docsDrift", severity: "YELLOW" },
      ],
      active: true,
      isBuiltIn: false,
      metadata: withSeedMeta("qc-ruleset:post-merge"),
    });

    // Seed QC runs with varied statuses and risk grades
    const qcRunIds: Id<"qcRuns">[] = [];
    const qcRunStatuses = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "RUNNING", "PENDING", "FAILED"];
    const qcRiskGrades = ["GREEN", "GREEN", "YELLOW", "RED", undefined, undefined, undefined];
    const qcQualityScores = [92, 88, 75, 62, undefined, undefined, undefined];

    for (let i = 0; i < 7; i++) {
      const runSequence = i + 1;
      const runId = `QC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const status = qcRunStatuses[i];
      const riskGrade = qcRiskGrades[i];
      const qualityScore = qcQualityScores[i];
      
      const startedAt = now - (7 - i) * 2 * DAY;
      const completedAt = status === "COMPLETED" || status === "FAILED" ? startedAt + 15 * 60 * 1000 : undefined;
      const durationMs = completedAt ? completedAt - startedAt : undefined;

      const findingCounts = status === "COMPLETED" ? {
        red: i === 3 ? 2 : 0,
        yellow: i === 2 ? 3 : i === 3 ? 1 : 0,
        green: i < 2 ? 5 : 2,
        info: 3,
      } : undefined;

      const qcRunId = await ctx.db.insert("qcRuns", {
        tenantId: tenant._id,
        projectId: project._id,
        runId,
        runSequence,
        status: status as any,
        riskGrade: riskGrade as any,
        qualityScore,
        repoUrl: "https://github.com/mission-control/mission-control",
        commitSha: `abc${i}def${i}123${i}456${i}`,
        branch: i % 2 === 0 ? "main" : "feat/quality-control",
        scopeType: i % 3 === 0 ? "FULL_REPO" : i % 3 === 1 ? "BRANCH_DIFF" : "DIRECTORY",
        scopeSpec: i % 3 === 2 ? { path: "packages/workflow-engine" } : undefined,
        rulesetId: i % 2 === 0 ? preReleaseRuleset : postMergeRuleset,
        initiatorType: i % 4 === 0 ? "WORKFLOW" : i % 4 === 1 ? "HUMAN" : i % 4 === 2 ? "AGENT" : "SYSTEM",
        initiatorId: i % 4 === 2 ? pick(allAgents, i)._id : undefined,
        findingCounts,
        gatePassed: status === "COMPLETED" ? riskGrade !== "RED" : undefined,
        evidenceHash: status === "COMPLETED" ? `sha256:${Math.random().toString(36).substring(2)}` : undefined,
        startedAt,
        completedAt,
        durationMs,
        idempotencyKey: `seed-qc-run-${i}`,
        metadata: withSeedMeta(`qc-run:${runId}`),
      });

      qcRunIds.push(qcRunId);

      // Add findings for completed runs
      if (status === "COMPLETED" && findingCounts) {
        const severities = ["RED", "YELLOW", "GREEN", "INFO"];
        const categories = ["REQUIREMENT_GAP", "DOCS_DRIFT", "COVERAGE_GAP", "SECURITY_GAP", "CONFIG_MISSING", "DELIVERY_GATE"];
        
        let findingIdx = 0;
        for (const severity of severities) {
          const count = findingCounts[severity.toLowerCase() as keyof typeof findingCounts];
          for (let j = 0; j < count; j++) {
            await ctx.db.insert("qcFindings", {
              tenantId: tenant._id,
              projectId: project._id,
              qcRunId,
              severity: severity as any,
              category: pick(categories, findingIdx) as any,
              title: `${severity} Finding ${j + 1}: ${pick(categories, findingIdx).replace(/_/g, " ").toLowerCase()}`,
              description: `Detailed description of ${severity.toLowerCase()} severity issue found during QC run ${runId}`,
              filePaths: [`src/file${findingIdx}.ts`, `tests/file${findingIdx}.test.ts`],
              lineRanges: [{ file: `src/file${findingIdx}.ts`, start: 10 + findingIdx, end: 20 + findingIdx }],
              prdRefs: j % 2 === 0 ? [`REQ-${100 + findingIdx}`] : undefined,
              suggestedFix: severity !== "INFO" ? `Suggested fix for ${severity.toLowerCase()} issue` : undefined,
              confidence: 0.7 + (findingIdx % 3) * 0.1,
              metadata: withSeedMeta(`qc-finding:${runId}:${findingIdx}`),
            });
            findingIdx++;
          }
        }
      }

      // Add artifacts for completed runs
      if (status === "COMPLETED") {
        await ctx.db.insert("qcArtifacts", {
          tenantId: tenant._id,
          projectId: project._id,
          qcRunId,
          type: "EVIDENCE_PACK_JSON",
          name: `${runId}_evidence_pack.json`,
          content: JSON.stringify({
            schemaVersion: "1.0.0",
            producer: "assurance-agents-stub/0.1.0",
            runId,
            repoUrl: "https://github.com/mission-control/mission-control",
            commitSha: `abc${i}def${i}123${i}456${i}`,
            timestamp: new Date(startedAt).toISOString(),
            riskGrade,
            qualityScore,
            summary: `QC Run ${runId} completed with ${riskGrade} risk grade and quality score ${qualityScore}`,
          }, null, 2),
          mimeType: "application/json",
          sizeBytes: 1024,
          metadata: withSeedMeta(`qc-artifact:${runId}:evidence`),
        });

        await ctx.db.insert("qcArtifacts", {
          tenantId: tenant._id,
          projectId: project._id,
          qcRunId,
          type: "SUMMARY_MD",
          name: `${runId}_summary.md`,
          content: `# QC Run ${runId}\n\n**Status:** ${status}\n**Risk Grade:** ${riskGrade}\n**Quality Score:** ${qualityScore}\n\n## Summary\nQuality control run completed successfully.`,
          mimeType: "text/markdown",
          sizeBytes: 256,
          metadata: withSeedMeta(`qc-artifact:${runId}:summary`),
        });
      }

      // Create alert for RED run
      if (status === "COMPLETED" && riskGrade === "RED") {
        await ctx.db.insert("alerts", {
          tenantId: tenant._id,
          projectId: project._id,
          qcRunId,
          severity: "CRITICAL",
          type: "QC_GATE_FAILED",
          title: `QC Run ${runId} failed RED gate`,
          description: `Quality Control run for mission-control failed critical delivery gates. Review findings immediately.`,
          status: "OPEN",
          metadata: withSeedMeta(`alert:qc-red:${runId}`),
        });
      }

      // Log QC events
      await ctx.db.insert("opEvents", {
        tenantId: tenant._id,
        projectId: project._id,
        qcRunId,
        type: "QC_RUN_STARTED",
        timestamp: startedAt,
        payload: { runId, repoUrl: "https://github.com/mission-control/mission-control" },
      });

      if (status === "COMPLETED" || status === "FAILED") {
        await ctx.db.insert("opEvents", {
          tenantId: tenant._id,
          projectId: project._id,
          qcRunId,
          type: status === "COMPLETED" ? "QC_RUN_COMPLETED" : "QC_RUN_FAILED",
          timestamp: completedAt!,
          payload: { runId, riskGrade, qualityScore, durationMs },
        });
      }

      // Log change record for run creation
      await ctx.db.insert("changeRecords", {
        tenantId: tenant._id,
        projectId: project._id,
        type: "QC_RUN_CREATED",
        summary: `QC run ${runId} created for mission-control`,
        relatedTable: "qcRuns",
        relatedId: qcRunId,
        timestamp: startedAt,
        payload: { runId, repoUrl: "https://github.com/mission-control/mission-control", scopeType: "FULL_REPO" },
      });

      if (status === "COMPLETED" && findingCounts) {
        await ctx.db.insert("changeRecords", {
          tenantId: tenant._id,
          projectId: project._id,
          type: "QC_FINDINGS_RECORDED",
          summary: `${findingCounts.red + findingCounts.yellow + findingCounts.green + findingCounts.info} findings recorded for run ${runId}`,
          relatedTable: "qcFindings",
          relatedId: qcRunId,
          timestamp: completedAt!,
          payload: { runId, findingCounts },
        });
      }
    }

    const seedMeta = {
      ...(projectMeta ?? {}),
      missionControlDemoSeedVersion: SEED_VERSION,
      missionControlDemoSeededAt: now,
      missionControlDemoSeedTag: SEED_TAG,
    };
    await ctx.db.patch(project._id, { metadata: seedMeta });

    return {
      message: "Mission Control demo data seeded",
      skipped: false,
      tenantId: tenant._id,
      projectId: project._id,
      counts: await collectCounts(ctx, project._id, tenant._id),
    };
  },
});
