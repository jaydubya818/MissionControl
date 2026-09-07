/**
 * Projects — Convex Functions
 *
 * Multi-project workspaces for Mission Control.
 * Every entity (tasks, agents, approvals, etc.) is scoped to a project.
 */

import { v } from "convex/values";
import { isLocalQualificationRepository } from "./lib/localRepositoryAdmission";
import { mutation, query } from "./_generated/server";
import { buildFactoryProjectSeed } from "./lib/factoryProjectSeed";
import { deriveVerificationStatus } from "./lib/workOrders";
import {
  canonicalRepositoryKey,
  findOverlappingScopes,
  normalizeCodePaths,
  repositoryDisplayName,
  validateCodeScopeInput,
  validateRepositoryInput,
} from "./lib/workspaceRepositories";
import {
  COMPANY_PERMISSIONS,
  listCompanyMemberships,
  requireCompanyPermission,
  requireWorkspaceAccess,
} from "./lib/companyAccess";
import { isCompanyContextEnforced } from "./lib/companyContextGate";
import {
  DEFAULT_REPOSITORY_DATA_CLASSIFICATION,
  REPOSITORY_DATA_CLASSIFICATIONS,
  type RepositoryDataClassification,
} from "./lib/repositoryExecutionPolicy";

async function enforceProjectAccess(
  ctx: any,
  project: any,
  permission?: (typeof COMPANY_PERMISSIONS)[keyof typeof COMPANY_PERMISSIONS]
) {
  if (!project) throw new Error("Workspace not found.");
  if (!(await isCompanyContextEnforced(ctx, project._id, permission ? "WRITE" : "READ"))) return null;
  if (!project.tenantId) {
    throw new Error("Workspace company assignment is incomplete. Run the tenant backfill before enabling enforcement.");
  }
  return await requireWorkspaceAccess(ctx, project.tenantId, project._id, { permission });
}

async function syncDefaultRepositoryConnection(
  ctx: any,
  project: any,
  input: {
    repository: string;
    defaultBranch: string;
    status: "CONFIGURED" | "READY" | "DEGRADED" | "ERROR";
    validatedAt?: number;
    validationError?: string;
  }
) {
  const connections = await ctx.db
    .query("workspaceRepositories")
    .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
    .collect();
  const repositoryKey = canonicalRepositoryKey(input.repository);
  const matching = connections.find(
    (connection: any) => canonicalRepositoryKey(connection.repository) === repositoryKey
  );
  const currentDefault = connections.find((connection: any) => connection.isDefault);
  const now = Date.now();

  for (const connection of connections) {
    if (connection.isDefault && connection._id !== matching?._id) {
      await ctx.db.patch(connection._id, { isDefault: false, updatedAt: now });
    }
  }

  if (matching) {
    await ctx.db.patch(matching._id, {
      defaultBranch: input.defaultBranch,
      isDefault: true,
      status: input.status,
      validatedAt: input.validatedAt,
      validationError: input.validationError,
      webhookStatus: project.githubWebhookSecret ? "CONFIGURED" : "MISSING",
      dataClassification: matching.dataClassification ?? DEFAULT_REPOSITORY_DATA_CLASSIFICATION,
      migrationVersion: 1,
      updatedAt: now,
    });
    return matching._id;
  }

  // The legacy edit flow means “replace the default repository.” Preserve that
  // behavior when a default connection exists and has no governed code scopes.
  if (currentDefault) {
    const scopes = await ctx.db
      .query("repositoryCodeScopes")
      .withIndex("by_repository", (q: any) => q.eq("repositoryId", currentDefault._id))
      .take(1);
    if (scopes.length === 0) {
      await ctx.db.patch(currentDefault._id, {
        repository: input.repository,
        displayName: repositoryDisplayName(input.repository),
        defaultBranch: input.defaultBranch,
        isDefault: true,
        status: input.status,
        validatedAt: input.validatedAt,
        validationError: input.validationError,
        webhookStatus: project.githubWebhookSecret ? "CONFIGURED" : "MISSING",
        dataClassification: currentDefault.dataClassification ?? DEFAULT_REPOSITORY_DATA_CLASSIFICATION,
        migrationVersion: 1,
        updatedAt: now,
      });
      return currentDefault._id;
    }
  }

  return await ctx.db.insert("workspaceRepositories", {
    tenantId: project.tenantId,
    projectId: project._id,
    provider: "GITHUB",
    repository: input.repository,
    displayName: repositoryDisplayName(input.repository),
    defaultBranch: input.defaultBranch,
    isDefault: true,
    status: input.status,
    validatedAt: input.validatedAt,
    validationError: input.validationError,
    webhookStatus: project.githubWebhookSecret ? "CONFIGURED" : "MISSING",
    dataClassification: DEFAULT_REPOSITORY_DATA_CLASSIFICATION,
    migrationVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List all projects.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").order("asc").collect();
    const visible = [];
    for (const project of projects) {
      try {
        await enforceProjectAccess(ctx, project);
        visible.push(project);
      } catch {
        // Never disclose an enforced workspace through the legacy portfolio.
      }
    }
    return visible;
  },
});

/**
 * Get a project by ID.
 */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    await enforceProjectAccess(ctx, project);
    return project;
  },
});

/**
 * Get a project by slug (unique identifier).
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!project) return null;
    await enforceProjectAccess(ctx, project);
    return project;
  },
});

/**
 * Get project stats (task counts, agent counts, pending approvals).
 */
export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    await enforceProjectAccess(ctx, project);
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

/**
 * Portfolio-level repository counts used by workspace settings. Legacy project
 * fields count until their additive repository record has been backfilled.
 */
export const getRepositoryPortfolioSummary = query({
  args: {},
  handler: async (ctx) => {
    const allProjects = await ctx.db.query("projects").collect();
    const projects = [];
    for (const project of allProjects) {
      try {
        await enforceProjectAccess(ctx, project);
        projects.push(project);
      } catch {
        // Omit inaccessible workspaces and their counts.
      }
    }
    const projectIds = new Set(projects.map((project) => project._id));
    const connections = (await ctx.db.query("workspaceRepositories").collect())
      .filter((connection) => projectIds.has(connection.projectId));
    const projectsWithConnections = new Set(
      connections.map((connection) => connection.projectId)
    );
    const legacyOnly = projects.filter(
      (project) => project.githubRepo && !projectsWithConnections.has(project._id)
    );
    return {
      repositories: connections.length + legacyOnly.length,
      workspacesWithRepositories: new Set([
        ...connections.map((connection) => connection.projectId),
        ...legacyOnly.map((project) => project._id),
      ]).size,
      legacyConnections: legacyOnly.length,
    };
  },
});

/**
 * Read repository connections for one workspace. A legacy single-repository
 * project is returned as a compatibility row until the idempotent backfill runs.
 */
export const listRepositories = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    await enforceProjectAccess(ctx, project);
    const connections = await ctx.db
      .query("workspaceRepositories")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (connections.length === 0 && project.githubRepo) {
      return [{
        repositoryId: null,
        source: "LEGACY" as const,
        repository: project.githubRepo,
        displayName: repositoryDisplayName(project.githubRepo),
        defaultBranch: project.githubBranch ?? "main",
        isDefault: true,
        status: project.repositoryStatus ?? "CONFIGURED",
        validatedAt: project.repositoryValidatedAt,
        validationError: project.repositoryValidationError,
        webhookStatus: project.githubWebhookSecret ? "CONFIGURED" as const : "MISSING" as const,
        dataClassification: "UNCLASSIFIED" as const,
        scopeCount: 0,
      }];
    }

    return await Promise.all(
      connections
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
        .map(async (connection) => {
          const scopes = await ctx.db
            .query("repositoryCodeScopes")
            .withIndex("by_repository", (q) => q.eq("repositoryId", connection._id))
            .collect();
          return {
            repositoryId: connection._id,
            source: "CONNECTION" as const,
            repositoryMode: connection.repositoryMode ?? "GITHUB",
            publicationAuthority: isLocalQualificationRepository(connection) ? "NONE" as const : undefined,
            admissionDigest: connection.localAdmissionDigest,
            repository: connection.repository,
            displayName: connection.displayName,
            defaultBranch: connection.defaultBranch,
            isDefault: connection.isDefault,
            status: connection.status,
            validatedAt: connection.validatedAt,
            validationError: connection.validationError,
            webhookStatus: connection.webhookStatus,
            dataClassification: connection.dataClassification ?? "UNCLASSIFIED" as const,
            scopeCount: scopes.filter((scope) => scope.active).length,
          };
        })
    );
  },
});

export const listCodeScopes = query({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) return [];
    const project = await ctx.db.get(repository.projectId);
    await enforceProjectAccess(ctx, project);
    return await ctx.db
      .query("repositoryCodeScopes")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
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
    purpose: v.optional(v.string()),
    owner: v.optional(v.string()),
    defaultPolicy: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("ACTIVE"), v.literal("PAUSED"), v.literal("ARCHIVED"))
    ),
    tenantId: v.optional(v.id("tenants")), // ARM: Required for new projects
    githubRepo: v.optional(v.string()),
    githubBranch: v.optional(v.string()),
    policyDefaults: v.optional(
      v.object({
        budgetDefaults: v.optional(v.any()),
        riskThresholds: v.optional(v.any()),
      })
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const globalEnforced = await isCompanyContextEnforced(ctx, undefined, "WRITE");
    if (globalEnforced) {
      if (!args.tenantId) throw new Error("Company account is required while company enforcement is enabled.");
      await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.CREATE_WORKSPACES);
    }
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
      purpose: args.purpose,
      owner: args.owner,
      defaultPolicy: args.defaultPolicy,
      status: args.status ?? "ACTIVE",
      githubRepo: args.githubRepo,
      githubBranch: args.githubBranch,
      policyDefaults: args.policyDefaults,
      metadata: args.metadata,
    });

    const createdProject = await ctx.db.get(projectId);
    if (createdProject?.githubRepo) {
      await syncDefaultRepositoryConnection(ctx, createdProject, {
        repository: createdProject.githubRepo,
        defaultBranch: createdProject.githubBranch ?? "main",
        status: "CONFIGURED",
      });
    }

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
    purpose: v.optional(v.string()),
    owner: v.optional(v.string()),
    defaultPolicy: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("ACTIVE"), v.literal("PAUSED"), v.literal("ARCHIVED"))
    ),
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
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_WORKSPACES);

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.purpose !== undefined) updates.purpose = args.purpose;
    if (args.owner !== undefined) updates.owner = args.owner;
    if (args.defaultPolicy !== undefined) updates.defaultPolicy = args.defaultPolicy;
    if (args.status !== undefined) updates.status = args.status;
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
 * Validate and attach repository metadata to a project workspace.
 */
export const connectRepository = mutation({
  args: {
    projectId: v.id("projects"),
    repository: v.string(),
    defaultBranch: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { success: false, error: "Workspace not found" };
    }
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);

    const repository = args.repository.trim();
    const defaultBranch = args.defaultBranch.trim();

    const validationError = validateRepositoryInput({ repository, defaultBranch });
    if (validationError) return { success: false, error: validationError };

    const previousRepository = project.githubRepo;
    await ctx.db.patch(args.projectId, {
      githubRepo: repository,
      githubBranch: defaultBranch,
      repositoryStatus: "CONFIGURED",
      repositoryValidatedAt: undefined,
      repositoryValidationError: undefined,
    });
    await syncDefaultRepositoryConnection(ctx, project, {
      repository,
      defaultBranch,
      status: "CONFIGURED",
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      action: previousRepository ? "REPOSITORY_UPDATED" : "REPOSITORY_CONNECTED",
      description: `${repository} configured for workspace "${project.name}"`,
      targetType: "PROJECT",
      targetId: args.projectId,
      beforeState: {
        githubRepo: project.githubRepo,
        githubBranch: project.githubBranch,
      },
      afterState: {
        githubRepo: repository,
        githubBranch: defaultBranch,
      },
    });

    return {
      success: true,
      project: await ctx.db.get(args.projectId),
    };
  },
});

/**
 * Record remote repository validation performed by an orchestration host.
 * Credentials remain on the host; Convex stores only the result.
 */
export const reportRepositoryValidation = mutation({
  args: {
    projectId: v.id("projects"),
    status: v.union(
      v.literal("READY"),
      v.literal("DEGRADED"),
      v.literal("ERROR")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { success: false, error: "Workspace not found" };
    if (!project.githubRepo) {
      return { success: false, error: "Connect a repository before reporting validation" };
    }
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);

    const validatedAt = Date.now();
    await ctx.db.patch(args.projectId, {
      repositoryStatus: args.status,
      repositoryValidatedAt: validatedAt,
      repositoryValidationError: args.error,
    });
    await syncDefaultRepositoryConnection(ctx, project, {
      repository: project.githubRepo,
      defaultBranch: project.githubBranch ?? "main",
      status: args.status,
      validatedAt,
      validationError: args.error,
    });
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "SYSTEM",
      action: "REPOSITORY_VALIDATED",
      description: `${project.githubRepo} validation reported ${args.status.toLowerCase()}`,
      targetType: "PROJECT",
      targetId: args.projectId,
      metadata: {
        status: args.status,
        error: args.error,
        validatedAt,
      },
    });

    return { success: true, project: await ctx.db.get(args.projectId) };
  },
});

/** Add another repository to a workspace without replacing the default one. */
export const createRepositoryConnection = mutation({
  args: {
    projectId: v.id("projects"),
    repository: v.string(),
    defaultBranch: v.string(),
    makeDefault: v.optional(v.boolean()),
    dataClassification: v.optional(v.union(
      v.literal("PUBLIC"),
      v.literal("INTERNAL"),
      v.literal("CONFIDENTIAL"),
      v.literal("RESTRICTED")
    )),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { success: false, error: "Workspace not found" };
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
    const repository = args.repository.trim();
    const defaultBranch = args.defaultBranch.trim();
    const validationError = validateRepositoryInput({ repository, defaultBranch });
    if (validationError) return { success: false, error: validationError };

    const connections = await ctx.db
      .query("workspaceRepositories")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const duplicate = connections.find(
      (connection) =>
        canonicalRepositoryKey(connection.repository) === canonicalRepositoryKey(repository)
    );
    if (duplicate) {
      return { success: false, error: "This repository is already connected to the workspace." };
    }

    const now = Date.now();
    const makeDefault = args.makeDefault === true || connections.length === 0;
    if (makeDefault) {
      for (const connection of connections.filter((item) => item.isDefault)) {
        await ctx.db.patch(connection._id, { isDefault: false, updatedAt: now });
      }
    }
    const repositoryId = await ctx.db.insert("workspaceRepositories", {
      tenantId: project.tenantId,
      projectId: project._id,
      provider: "GITHUB",
      repository,
      displayName: repositoryDisplayName(repository),
      defaultBranch,
      isDefault: makeDefault,
      status: "CONFIGURED",
      webhookStatus: "MISSING",
      dataClassification: args.dataClassification ?? DEFAULT_REPOSITORY_DATA_CLASSIFICATION,
      migrationVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    if (makeDefault) {
      await ctx.db.patch(project._id, {
        githubRepo: repository,
        githubBranch: defaultBranch,
        repositoryStatus: "CONFIGURED",
        repositoryValidatedAt: undefined,
        repositoryValidationError: undefined,
      });
    }
    await ctx.db.insert("activities", {
      projectId: project._id,
      actorType: "HUMAN",
      action: "WORKSPACE_REPOSITORY_CONNECTED",
      description: `${repository} connected to workspace "${project.name}"`,
      targetType: "WORKSPACE_REPOSITORY",
      targetId: repositoryId,
      metadata: {
        repository,
        defaultBranch,
        makeDefault,
        dataClassification: args.dataClassification ?? DEFAULT_REPOSITORY_DATA_CLASSIFICATION,
      },
    });
    return { success: true, repositoryId };
  },
});

/** Classify repository data before governed Factory admission. */
export const setRepositoryDataClassification = mutation({
  args: {
    repositoryId: v.id("workspaceRepositories"),
    dataClassification: v.union(
      v.literal("PUBLIC"),
      v.literal("INTERNAL"),
      v.literal("CONFIDENTIAL"),
      v.literal("RESTRICTED")
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) return { success: false, error: "Repository connection not found" };
    const project = await ctx.db.get(repository.projectId);
    if (!project) return { success: false, error: "Workspace not found" };
    const access = await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
    const reason = args.reason.trim();
    if (!reason || reason.length > 1_000 || /[\0\r]/.test(reason)) {
      return { success: false, error: "A classification reason between 1 and 1,000 characters is required." };
    }
    if (!REPOSITORY_DATA_CLASSIFICATIONS.includes(args.dataClassification as RepositoryDataClassification)) {
      return { success: false, error: "Repository data classification is invalid." };
    }
    const priorClassification = repository.dataClassification ?? "UNCLASSIFIED";
    const now = Date.now();
    await ctx.db.patch(repository._id, {
      dataClassification: args.dataClassification,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: repository.tenantId,
      projectId: repository.projectId,
      actorType: "HUMAN",
      actorId: access?.membership?.operatorId,
      action: "WORKSPACE_REPOSITORY_DATA_CLASSIFIED",
      description: `Classified ${repository.repository} as ${args.dataClassification}`,
      targetType: "WORKSPACE_REPOSITORY",
      targetId: repository._id,
      metadata: {
        priorClassification,
        dataClassification: args.dataClassification,
        reason,
      },
    });
    return { success: true, dataClassification: args.dataClassification };
  },
});

/** Promote a connected repository and synchronize the legacy default projection. */
export const setDefaultRepository = mutation({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (ctx, args) => {
    const selected = await ctx.db.get(args.repositoryId);
    if (!selected) return { success: false, error: "Repository connection not found" };
    if (isLocalQualificationRepository(selected)) {
      throw new Error("Local qualification cannot become a GitHub compatibility default.");
    }
    const project = await ctx.db.get(selected.projectId);
    if (!project) return { success: false, error: "Workspace not found" };
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
    const connections = await ctx.db
      .query("workspaceRepositories")
      .withIndex("by_project", (q) => q.eq("projectId", selected.projectId))
      .collect();
    const now = Date.now();
    for (const connection of connections) {
      if (connection.isDefault !== (connection._id === selected._id)) {
        await ctx.db.patch(connection._id, {
          isDefault: connection._id === selected._id,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(project._id, {
      githubRepo: selected.repository,
      githubBranch: selected.defaultBranch,
      repositoryStatus: selected.status,
      repositoryValidatedAt: selected.validatedAt,
      repositoryValidationError: selected.validationError,
    });
    await ctx.db.insert("activities", {
      projectId: project._id,
      actorType: "HUMAN",
      action: "WORKSPACE_DEFAULT_REPOSITORY_CHANGED",
      description: `${selected.repository} is now the default repository for "${project.name}"`,
      targetType: "WORKSPACE_REPOSITORY",
      targetId: selected._id,
    });
    return { success: true };
  },
});

/** Idempotently materialize legacy project repository fields as connections. */
export const backfillLegacyRepositories = mutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const projects = args.projectId
      ? [await ctx.db.get(args.projectId)].filter(Boolean)
      : await ctx.db.query("projects").collect();
    const result = { migrationVersion: 1, created: 0, existing: 0, skipped: 0, failed: 0 };

    for (const project of projects) {
      try {
        await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
      } catch {
        result.skipped += 1;
        continue;
      }
      if (!project?.githubRepo) {
        result.skipped += 1;
        continue;
      }
      try {
        const existing = await ctx.db
          .query("workspaceRepositories")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const match = existing.find(
          (connection) =>
            canonicalRepositoryKey(connection.repository) ===
            canonicalRepositoryKey(project.githubRepo!)
        );
        if (match) {
          result.existing += 1;
          continue;
        }
        await syncDefaultRepositoryConnection(ctx, project, {
          repository: project.githubRepo,
          defaultBranch: project.githubBranch ?? "main",
          status:
            !project.repositoryStatus || project.repositoryStatus === "UNCONFIGURED"
              ? "CONFIGURED"
              : project.repositoryStatus,
          validatedAt: project.repositoryValidatedAt,
          validationError: project.repositoryValidationError,
        });
        result.created += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  },
});

/** Add a governed monorepo path boundary. Overlap requires explicit confirmation. */
export const createRepositoryCodeScope = mutation({
  args: {
    repositoryId: v.id("workspaceRepositories"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    includePaths: v.array(v.string()),
    excludePaths: v.array(v.string()),
    owningTeamId: v.optional(v.id("scrumTeams")),
    owningTeam: v.optional(v.string()),
    requiredReviewers: v.array(v.string()),
    allowedEnvironments: v.array(
      v.union(v.literal("LOCAL"), v.literal("CLOUD"))
    ),
    verificationPolicy: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
    approvalPolicyDescription: v.optional(v.string()),
    overlapPriority: v.optional(v.number()),
    allowOverlap: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) return { success: false, error: "Repository connection not found" };
    const project = await ctx.db.get(repository.projectId);
    const access = await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
    const validationError = validateCodeScopeInput(args);
    if (validationError) return { success: false, error: validationError };

    const scopes = await ctx.db
      .query("repositoryCodeScopes")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
    if (scopes.some((scope) => scope.slug === args.slug.trim())) {
      return { success: false, error: "A code scope with this slug already exists." };
    }
    const overlaps = findOverlappingScopes(args.includePaths, scopes.filter((scope) => scope.active));
    if (overlaps.length > 0 && !args.allowOverlap) {
      return {
        success: false,
        error: `This path overlaps ${overlaps.join(", ")}. Review ownership before saving.`,
        overlaps,
      };
    }
    if (overlaps.length > 0 && (!args.overlapPriority || args.overlapPriority < 1 || !args.approvalPolicy?.trim())) {
      return {
        success: false,
        error: "Overlapping scopes require an explicit positive priority and approval policy.",
        overlaps,
      };
    }
    const owningTeam = args.owningTeamId ? await ctx.db.get(args.owningTeamId) : null;
    if (args.owningTeamId && (!owningTeam || owningTeam.projectId !== repository.projectId || owningTeam.status !== "ACTIVE")) {
      return { success: false, error: "Owning team must be active in this workspace." };
    }

    const now = Date.now();
    const scopeId = await ctx.db.insert("repositoryCodeScopes", {
      tenantId: repository.tenantId,
      projectId: repository.projectId,
      repositoryId: repository._id,
      name: args.name.trim(),
      slug: args.slug.trim(),
      description: args.description?.trim() || undefined,
      includePaths: normalizeCodePaths(args.includePaths),
      excludePaths: normalizeCodePaths(args.excludePaths),
      owningTeamId: owningTeam?._id,
      owningTeam: owningTeam?.name ?? (args.owningTeam?.trim() || undefined),
      requiredReviewers: args.requiredReviewers.map((item) => item.trim()).filter(Boolean),
      allowedEnvironments: args.allowedEnvironments,
      verificationPolicy: args.verificationPolicy?.trim() || undefined,
      approvalPolicy: args.approvalPolicy?.trim() || undefined,
      approvalPolicyDescription: args.approvalPolicyDescription?.trim() || undefined,
      overlapPriority: args.overlapPriority,
      migrationVersion: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: access?.membership.operatorId,
      updatedBy: access?.membership.operatorId,
    });
    await ctx.db.insert("activities", {
      projectId: repository.projectId,
      actorType: "HUMAN",
      action: "REPOSITORY_CODE_SCOPE_CREATED",
      description: `${args.name.trim()} code scope created for ${repository.repository}`,
      targetType: "REPOSITORY_CODE_SCOPE",
      targetId: scopeId,
      metadata: { repositoryId: repository._id, includePaths: normalizeCodePaths(args.includePaths) },
    });
    return { success: true, scopeId, overlaps };
  },
});

export const archiveRepositoryCodeScope = mutation({
  args: { scopeId: v.id("repositoryCodeScopes") },
  handler: async (ctx, args) => {
    const scope = await ctx.db.get(args.scopeId);
    if (!scope) return { success: false, error: "Code scope not found" };
    const project = await ctx.db.get(scope.projectId);
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
    await ctx.db.patch(scope._id, { active: false, updatedAt: Date.now() });
    await ctx.db.insert("activities", {
      projectId: scope.projectId,
      actorType: "HUMAN",
      action: "REPOSITORY_CODE_SCOPE_ARCHIVED",
      description: `${scope.name} code scope archived`,
      targetType: "REPOSITORY_CODE_SCOPE",
      targetId: scope._id,
      metadata: { repositoryId: scope.repositoryId },
    });
    return { success: true };
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
    await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_WORKSPACES);

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

    // Incident Command evidence is retained and must never be orphaned by a
    // force-delete. Archival/tombstoning is a separate governed capability.
    const [incident, dispatchControl, controlReceipt, controlAuthorization] = await Promise.all([
      ctx.db.query("factoryIncidents").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).first(),
      ctx.db.query("repositoryDispatchControls").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).first(),
      ctx.db.query("factoryIncidentControlReceipts").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).first(),
      ctx.db.query("factoryIncidentControlAuthorizations").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).first(),
    ]);
    if (incident || dispatchControl || controlReceipt || controlAuthorization) {
      return {
        success: false,
        error: "Project has retained Incident Command history and cannot be deleted. Governed archival is required.",
      };
    }

    // Convex does not enforce foreign keys. Delete the additive repository
    // configuration in the same mutation so workspace removal cannot leave
    // orphaned code scopes or repository connections behind.
    const repositoryScopes = await ctx.db
      .query("repositoryCodeScopes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const repositoryConnections = await ctx.db
      .query("workspaceRepositories")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const scope of repositoryScopes) {
      await ctx.db.delete(scope._id);
    }
    for (const connection of repositoryConnections) {
      await ctx.db.delete(connection._id);
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
 * Create an idempotent software-factory project with WorkOrders, workflows, runs,
 * approvals, artifacts, and receipt rows so the factory overview has a complete
 * project-scoped read model immediately after creation.
 */
export const createSoftwareFactoryProject = mutation({
  args: {
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    repository: v.optional(v.string()),
    githubBranch: v.optional(v.string()),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const companyEnforced = await isCompanyContextEnforced(ctx, undefined, "WRITE");
    let defaultTenant;
    if (companyEnforced) {
      const manageable = (await listCompanyMemberships(ctx)).filter((membership) => membership.canManageCompany);
      if (manageable.length !== 1) {
        throw new Error("Select exactly one manageable company account before creating a factory workspace.");
      }
      await requireCompanyPermission(ctx, manageable[0].tenant._id, COMPANY_PERMISSIONS.CREATE_WORKSPACES);
      defaultTenant = manageable[0].tenant;
    } else {
      defaultTenant = await ctx.db
        .query("tenants")
        .withIndex("by_slug", (q) => q.eq("slug", "default"))
        .first();

      if (!defaultTenant) {
        const tenantId = await ctx.db.insert("tenants", {
          name: "Default Organization",
          slug: "default",
          description: "Default tenant for migration",
          active: true,
        });
        defaultTenant = await ctx.db.get(tenantId);
      }
    }

    const seed = buildFactoryProjectSeed(args);
    const now = Date.now();

    let project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", seed.project.slug))
      .first();
    if (project && companyEnforced && project.tenantId !== defaultTenant!._id) {
      throw new Error("A workspace with this slug exists in another company account.");
    }
    let projectCreated = false;

    if (!project) {
      const projectId = await ctx.db.insert("projects", {
        tenantId: defaultTenant!._id,
        name: seed.project.name,
        slug: seed.project.slug,
        description: seed.project.description,
        githubRepo: seed.project.githubRepo,
        githubBranch: seed.project.githubBranch,
        swarmConfig: {
          maxAgents: 3,
          defaultModel: "operator-default",
          autoScale: false,
        },
        taskPrefix: seed.project.slug
          .split("-")
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("")
          .slice(0, 6) || "FACT",
        nextTaskNumber: 1,
        metadata: seed.project.metadata,
      });
      project = await ctx.db.get(projectId);
      projectCreated = true;

      await ctx.db.insert("activities", {
        tenantId: defaultTenant!._id,
        actorType: "SYSTEM",
        action: "PROJECT_CREATED",
        description: `Software factory project \"${seed.project.name}\" created`,
        targetType: "PROJECT",
        targetId: projectId,
        projectId,
        metadata: { source: "createSoftwareFactoryProject", idempotencyScope: seed.idempotencyScope },
      });
    } else {
      await ctx.db.patch(project._id, {
        description: project.description ?? seed.project.description,
        githubRepo: project.githubRepo ?? seed.project.githubRepo,
        githubBranch: project.githubBranch ?? seed.project.githubBranch,
        metadata: { ...(project.metadata ?? {}), ...seed.project.metadata, replayedAt: now },
      });
      project = await ctx.db.get(project._id);
    }

    const workflows: any[] = [];
    for (const workflow of seed.workflows) {
      let workflowDoc = await ctx.db
        .query("workflows")
        .withIndex("by_workflow_id", (q) => q.eq("workflowId", workflow.workflowId))
        .first();

      if (!workflowDoc) {
        const workflowDocId = await ctx.db.insert("workflows", {
          workflowId: workflow.workflowId,
          name: workflow.name,
          description: workflow.description,
          agents: workflow.agents,
          steps: workflow.steps,
          active: true,
          version: 1,
          createdBy: args.requestedBy ?? "Hermes",
          createdAt: now,
          updatedAt: now,
          metadata: { source: "createSoftwareFactoryProject", idempotencyScope: seed.idempotencyScope },
        });
        workflowDoc = await ctx.db.get(workflowDocId);
      } else if (!workflowDoc.active) {
        await ctx.db.patch(workflowDoc._id, { active: true, updatedAt: now });
        workflowDoc = await ctx.db.get(workflowDoc._id);
      }

      workflows.push(workflowDoc);
    }

    const workOrders: any[] = [];
    const runs: any[] = [];
    const receipts: any[] = [];
    const artifacts: any[] = [];
    let createdWorkOrders = 0;

    for (const [index, order] of seed.workOrders.entries()) {
      const workOrderIdempotencyKey = `${seed.idempotencyScope}:work-order:${order.key}`;
      let workOrder = await ctx.db
        .query("workOrders")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", workOrderIdempotencyKey))
        .first();

      if (!workOrder) {
        const workOrderId = await ctx.db.insert("workOrders", {
          tenantId: project!.tenantId,
          projectId: project!._id,
          idempotencyKey: workOrderIdempotencyKey,
          title: order.title,
          desiredOutcome: order.desiredOutcome,
          context: order.context,
          workflowId: order.workflowId,
          repository: order.repository,
          branchStrategy: order.branchStrategy,
          priority: order.priority,
          riskLevel: order.riskLevel,
          requestedBy: order.requestedBy,
          assignedAgent: order.assignedAgent,
          assignedSquad: order.assignedSquad,
          acceptanceCriteria: order.acceptanceCriteria,
          constraints: order.constraints,
          dependencies: order.dependencies,
          sourceOfTruthRefs: order.sourceOfTruthRefs,
          requiredApprovals: order.requiredApprovals,
          state: order.state,
          verificationStatus: deriveVerificationStatus(order.acceptanceCriteria as any),
          approvalStatus: order.approvalStatus,
          blockingIssue: order.blockingIssue,
          requiredHumanAction: order.requiredHumanAction,
          currentRevisionNumber: 1,
          createdAt: now - index * 60_000,
          updatedAt: now - index * 45_000,
          metadata: { source: "createSoftwareFactoryProject", orderKey: order.key },
        });

        const snapshot = {
          title: order.title,
          desiredOutcome: order.desiredOutcome,
          workflowId: order.workflowId,
          repository: order.repository,
          branchStrategy: order.branchStrategy,
          priority: order.priority,
          riskLevel: order.riskLevel,
          acceptanceCriteria: order.acceptanceCriteria,
          constraints: order.constraints,
          dependencies: order.dependencies,
          sourceOfTruthRefs: order.sourceOfTruthRefs,
          requiredApprovals: order.requiredApprovals,
          metadata: { source: "createSoftwareFactoryProject", orderKey: order.key },
        };

        const revisionId = await ctx.db.insert("workOrderRevisions", {
          tenantId: project!.tenantId,
          projectId: project!._id,
          workOrderId,
          idempotencyKey: `${workOrderIdempotencyKey}:revision:1`,
          revisionNumber: 1,
          status: "APPLIED",
          changedFields: ["title", "desiredOutcome", "workflowId", "repository", "riskLevel", "acceptanceCriteria"],
          changeSummary: "Initial factory project work order",
          reason: "Software factory project creation",
          requestedBy: order.requestedBy,
          approvedBy: order.requestedBy,
          createdAt: now - index * 60_000,
          effectiveAt: now - index * 60_000,
          riskReassessment: "UNCHANGED",
          materiality: "NO_ACTION",
          requiresReapproval: false,
          requiresReverification: false,
          requiresFullReopen: false,
          impactedAcceptanceCriteria: [],
          impactedApprovals: [],
          impactedVerificationReceiptIds: [],
          requestedChanges: snapshot,
          previousSnapshot: snapshot,
          nextSnapshot: snapshot,
          metadata: { initial: true, source: "createSoftwareFactoryProject" },
        });

        const workflow = seed.workflows.find((item) => item.workflowId === order.workflowId) ?? seed.workflows[0];
        const steps = workflow.steps.map((step, stepIndex) => ({
          stepId: step.id,
          status: stepIndex < order.runStepIndex ? "DONE" as const : stepIndex === order.runStepIndex && order.runStatus === "RUNNING" ? "RUNNING" as const : stepIndex === order.runStepIndex && order.runStatus === "FAILED" ? "FAILED" as const : "PENDING" as const,
          retryCount: order.runStatus === "FAILED" && stepIndex === order.runStepIndex ? 1 : 0,
          startedAt: stepIndex <= order.runStepIndex ? now - (index + stepIndex + 1) * 30_000 : undefined,
          completedAt: stepIndex < order.runStepIndex || (order.runStatus === "FAILED" && stepIndex === order.runStepIndex) ? now - (index + stepIndex + 1) * 20_000 : undefined,
          taskId: undefined,
          agentId: undefined,
          error: order.runStatus === "FAILED" && stepIndex === order.runStepIndex ? order.failureReason : undefined,
          output: stepIndex < order.runStepIndex ? `${step.id} complete` : undefined,
        }));

        const runDocId = await ctx.db.insert("workflowRuns", {
          tenantId: project!.tenantId,
          runId: `factory-${seed.project.slug}-${index + 1}`,
          workflowId: order.workflowId,
          projectId: project!._id,
          workOrderId,
          workOrderRevisionNumber: 1,
          workOrderRevisionId: revisionId,
          status: order.runStatus,
          currentStepIndex: order.runStepIndex,
          totalSteps: steps.length,
          steps,
          context: { source: "createSoftwareFactoryProject", orderKey: order.key },
          initialInput: order.desiredOutcome,
          runtime: order.assignedAgent === "Pi" ? "Pi" : "Hermes",
          model: order.assignedAgent === "Pi" ? "bounded-runtime" : "operator-default",
          worktree: order.repository === "jaydubya818/MissionControl" ? ".worktrees/mission-control-factory" : undefined,
          failureReason: order.failureReason,
          humanInterventions: order.humanInterventions ?? 0,
          startedAt: now - (index + 1) * 120_000,
          completedAt: order.runStatus === "FAILED" || order.runStatus === "COMPLETED" ? now - index * 30_000 : undefined,
          metadata: { source: "createSoftwareFactoryProject", orderKey: order.key },
        });

        await ctx.db.patch(workOrderId, {
          currentRevisionId: revisionId,
          currentExecutionRunId: runDocId,
        });

        await ctx.db.insert("runEvents", {
          tenantId: project!.tenantId,
          projectId: project!._id,
          workOrderId,
          workflowRunId: runDocId,
          idempotencyKey: `${workOrderIdempotencyKey}:run-started`,
          eventType: "RUN_STARTED",
          workflowStep: steps[0]?.stepId,
          sequenceNumber: 1,
          actor: order.assignedAgent,
          commandSummary: `Seeded ${order.workflowId}`,
          status: order.runStatus,
          startedAt: now - (index + 1) * 120_000,
          metadata: { source: "createSoftwareFactoryProject" },
        });

        if (order.runStatus === "FAILED") {
          await ctx.db.insert("runEvents", {
            tenantId: project!.tenantId,
            projectId: project!._id,
            workOrderId,
            workflowRunId: runDocId,
            idempotencyKey: `${workOrderIdempotencyKey}:run-failed`,
            eventType: "RUN_FAILED",
            workflowStep: steps[order.runStepIndex]?.stepId,
            sequenceNumber: 2,
            actor: order.assignedAgent,
            commandSummary: order.failureReason,
            status: "FAILED",
            startedAt: now - (index + 1) * 60_000,
            endedAt: now - (index + 1) * 30_000,
            errorCategory: "BLOCKED_PRECHECK",
            errorSummary: order.failureReason,
            metadata: { source: "createSoftwareFactoryProject" },
          });
        }

        const artifactId = await ctx.db.insert("runArtifacts", {
          tenantId: project!.tenantId,
          projectId: project!._id,
          workOrderId,
          workflowRunId: runDocId,
          idempotencyKey: `${workOrderIdempotencyKey}:artifact:plan`,
          artifactType: "STRUCTURED_OUTPUT",
          name: `${order.title} receipt packet preview`,
          description: "Seeded evidence artifact for factory project read-model validation.",
          repositoryPath: order.repository,
          producer: order.assignedAgent,
          sensitivity: "INTERNAL",
          createdAt: now - index * 30_000,
          metadata: { source: "createSoftwareFactoryProject", orderKey: order.key },
        });

        for (const criterion of order.acceptanceCriteria) {
          const receiptStatus = criterion.status === "PASS" ? "PASSED" : criterion.status === "FAIL" ? "FAILED" : criterion.status === "STALE" ? "STALE" : criterion.status === "WAIVED" ? "WAIVED" : "PENDING";
          const receiptId = await ctx.db.insert("verificationReceipts", {
            tenantId: project!.tenantId,
            projectId: project!._id,
            workOrderId,
            acceptanceCriterionId: criterion.id,
            workflowRunId: runDocId,
            idempotencyKey: `${workOrderIdempotencyKey}:receipt:${criterion.id}`,
            verificationMethod: criterion.verificationMethod,
            commandOrCheck: criterion.title,
            result: receiptStatus === "PENDING" ? undefined : criterion.title,
            evidenceLocation: `mission-control://factory/${seed.project.slug}/${order.key}/${criterion.id}`,
            artifactReference: `${artifactId}`,
            verifier: order.assignedAgent,
            status: receiptStatus,
            linkedRunArtifactIds: [artifactId],
            workOrderRevisionNumber: 1,
            validUntil: receiptStatus === "STALE" ? now - 1 : now + 24 * 60 * 60 * 1000,
            recordedAt: now - index * 30_000,
            metadata: { source: "createSoftwareFactoryProject" },
          });
          receipts.push(await ctx.db.get(receiptId));
        }

        for (const approvalType of order.requiredApprovals ?? []) {
          await ctx.db.insert("approvalDecisions", {
            tenantId: project!.tenantId,
            projectId: project!._id,
            workOrderId,
            workflowRunId: runDocId,
            idempotencyKey: `${workOrderIdempotencyKey}:approval:${approvalType}`,
            approvalType,
            requestedAction: order.requiredHumanAction ?? `Approve ${order.title}`,
            riskLevel: order.riskLevel,
            requestedBy: order.requestedBy,
            status: "PENDING",
            workOrderRevisionNumber: 1,
            expiresAt: now + 24 * 60 * 60 * 1000,
            createdAt: now - index * 20_000,
            metadata: { source: "createSoftwareFactoryProject" },
          });
        }

        await ctx.db.insert("workOrderEvents", {
          tenantId: project!.tenantId,
          projectId: project!._id,
          workOrderId,
          workflowRunId: runDocId,
          idempotencyKey: `${workOrderIdempotencyKey}:created`,
          eventType: "WORK_ORDER_CREATED",
          actorType: "SYSTEM",
          actorId: args.requestedBy ?? "Hermes",
          summary: `Created factory work order ${order.title}`,
          timestamp: now - index * 30_000,
          metadata: { source: "createSoftwareFactoryProject" },
        });

        await ctx.db.insert("activities", {
          tenantId: project!.tenantId,
          projectId: project!._id,
          actorType: "SYSTEM",
          actorId: args.requestedBy ?? "Hermes",
          action: "WORK_ORDER_CREATED",
          description: `Factory WorkOrder \"${order.title}\" created`,
          targetType: "WORK_ORDER",
          targetId: workOrderId,
          metadata: { source: "createSoftwareFactoryProject", workflowRunId: runDocId },
        });

        artifacts.push(await ctx.db.get(artifactId));
        workOrder = await ctx.db.get(workOrderId);
        runs.push(await ctx.db.get(runDocId));
        createdWorkOrders += 1;
      } else {
        const latestRun = await ctx.db
          .query("workflowRuns")
          .withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder!._id))
          .order("desc")
          .first();
        if (latestRun) runs.push(latestRun);
      }

      workOrders.push(workOrder);
    }

    return {
      success: true,
      project,
      created: projectCreated || createdWorkOrders > 0,
      projectCreated,
      createdWorkOrders,
      workflows,
      workOrders,
      runs,
      receipts,
      artifacts,
      idempotencyScope: seed.idempotencyScope,
    };
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
    const access = await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES);
    const identity = await ctx.auth.getUserIdentity();

    const updates: any = {};
    if (args.githubRepo !== undefined) updates.githubRepo = args.githubRepo;
    if (args.githubBranch !== undefined) updates.githubBranch = args.githubBranch;
    if (args.githubWebhookSecret !== undefined)
      updates.githubWebhookSecret = args.githubWebhookSecret;

    await ctx.db.patch(args.projectId, updates);

    const nextRepository = args.githubRepo ?? project.githubRepo;
    if (nextRepository) {
      await syncDefaultRepositoryConnection(ctx, {
        ...project,
        githubWebhookSecret:
          args.githubWebhookSecret ?? project.githubWebhookSecret,
      }, {
        repository: nextRepository,
        defaultBranch: args.githubBranch ?? project.githubBranch ?? "main",
        status:
          !project.repositoryStatus || project.repositoryStatus === "UNCONFIGURED"
            ? "CONFIGURED"
            : project.repositoryStatus,
        validatedAt: project.repositoryValidatedAt,
        validationError: project.repositoryValidationError,
      });
    }

    // Sanitize updates for activity log (remove webhook secret)
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.githubWebhookSecret !== undefined) {
      sanitizedUpdates.githubWebhookSecret = "[REDACTED]";
    }

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "HUMAN",
      actorId: access?.membership.operatorId ?? identity?.subject,
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
    const access = await enforceProjectAccess(ctx, project, COMPANY_PERMISSIONS.MANAGE_WORKSPACES);
    const identity = await ctx.auth.getUserIdentity();

    const swarmConfig = {
      maxAgents: args.maxAgents ?? project.swarmConfig?.maxAgents ?? 5,
      defaultModel: args.defaultModel ?? project.swarmConfig?.defaultModel,
      autoScale: args.autoScale ?? project.swarmConfig?.autoScale ?? false,
    };

    await ctx.db.patch(args.projectId, { swarmConfig });

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "HUMAN",
      actorId: access?.membership.operatorId ?? identity?.subject,
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
