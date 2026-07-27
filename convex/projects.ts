/**
 * Projects — Convex Functions
 *
 * Multi-project workspaces for Mission Control.
 * Every entity (tasks, agents, approvals, etc.) is scoped to a project.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { buildFactoryProjectSeed } from "./lib/factoryProjectSeed";
import { deriveVerificationStatus } from "./lib/workOrders";

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
      githubRepo: args.githubRepo,
      githubBranch: args.githubBranch,
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
    let defaultTenant = await ctx.db
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

    const seed = buildFactoryProjectSeed(args);
    const now = Date.now();

    let project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", seed.project.slug))
      .first();
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
