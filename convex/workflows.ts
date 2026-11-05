/**
 * Workflows — Convex Functions
 * 
 * Multi-agent workflow definitions and execution.
 * Inspired by Antfarm's deterministic workflow patterns.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction, missionAuthorityDatabase } from "./lib/missionScopedFunctions";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { workflowDefinitionChanged } from "./lib/workflowSnapshot";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import {
  factoryWorkflowContractIssues,
  DETERMINISTIC_WORKFLOW_CONTRACT,
  workflowRunCompatibilityProjection,
} from "./lib/factoryWorkflowContract";

const workflowTopology = v.optional(v.union(v.literal("LINEAR"), v.literal("DAG")));
const workflowAgents = v.array(v.object({
  id: v.string(),
  persona: v.string(),
  workspace: v.optional(v.object({ files: v.optional(v.any()) })),
}));
const workflowSteps = v.array(v.object({
  id: v.string(),
  agent: v.string(),
  input: v.string(),
  expects: v.string(),
  retryLimit: v.number(),
  timeoutMinutes: v.number(),
  dependsOn: v.optional(v.array(v.string())),
  kind: v.optional(v.union(v.literal("AGENT"), v.literal("REDUCE"), v.literal("ROUTER"), v.literal("VERIFY"), v.literal("GATE"), v.literal("DETERMINISTIC"))),
  inputSchema: v.optional(v.any()),
  outputSchema: v.optional(v.any()),
  modelTier: v.optional(v.union(v.literal("FAST"), v.literal("BALANCED"), v.literal("POWERFUL"))),
  isolation: v.optional(v.union(v.literal("SHARED"), v.literal("WORKTREE"), v.literal("READ_ONLY"))),
  failurePolicy: v.optional(v.union(v.literal("RETRY"), v.literal("CONTINUE"), v.literal("BLOCK"))),
  condition: v.optional(v.object({
    path: v.string(),
    operator: v.union(v.literal("EQ"), v.literal("NEQ"), v.literal("IN"), v.literal("EXISTS")),
    value: v.optional(v.any()),
  })),
}));

async function visibleWorkflows(ctx: QueryCtx, workflows: Doc<"workflows">[]) {
  const access = new Map<string, Promise<boolean>>();
  const allowed = await Promise.all(workflows.map((workflow) => {
    if (!workflow.projectId) return true; // Legacy global definitions remain read-compatible.
    const projectId = workflow.projectId;
    if (!access.has(projectId)) access.set(projectId,
      requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW).then(() => true, () => false));
    return access.get(projectId)!;
  }));
  return workflows.filter((_, index) => allowed[index]);
}

async function requireWorkflowManagement(ctx: MutationCtx, workflow: Doc<"workflows">) {
  if (!workflow.projectId) throw new Error("Legacy global workflows require deployment administrator retirement before workspace registration.");
  await requireWorkspacePermission(ctx, workflow.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
  return workflow.projectId;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List all workflows
 */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return await visibleWorkflows(ctx, await ctx.db
        .query("workflows")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect());
    }
    
    return await visibleWorkflows(ctx, await ctx.db.query("workflows").collect());
  },
});

/**
 * Get a workflow by ID
 */
export const get = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    return workflow ? (await visibleWorkflows(ctx, [workflow]))[0] ?? null : null;
  },
});

/**
 * Get workflow by Convex _id
 */
export const getById = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    return workflow ? (await visibleWorkflows(ctx, [workflow]))[0] ?? null : null;
  },
});

export const auditProjectRunCompatibility = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const [runs, workflows] = await Promise.all([
      ctx.db.query("workflowRuns").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("workflows").collect(),
    ]);
    const workflowById = new Map(workflows.map((workflow) => [workflow.workflowId, workflow]));
    return runs.map((run) => ({
      workflowRunId: run._id,
      runId: run.runId,
      ...workflowRunCompatibilityProjection(run, workflowById.get(run.workflowId)),
    }));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create or update a workflow definition
 */
export const upsert = internalMutation({
  args: {
    workflowId: v.string(),
    name: v.string(),
    description: v.string(),
    topology: v.optional(v.union(v.literal("LINEAR"), v.literal("DAG"))),
    maxConcurrency: v.optional(v.number()),
    convergence: v.optional(v.object({
      maxIterations: v.number(),
      stopCondition: v.string(),
    })),
    agents: v.array(v.object({
      id: v.string(),
      persona: v.string(),
      workspace: v.optional(v.object({
        files: v.optional(v.any()),
      })),
    })),
    steps: v.array(v.object({
      id: v.string(),
      agent: v.string(),
      input: v.string(),
      expects: v.string(),
      retryLimit: v.number(),
      timeoutMinutes: v.number(),
      dependsOn: v.optional(v.array(v.string())),
      kind: v.optional(v.union(
        v.literal("AGENT"),
        v.literal("REDUCE"),
        v.literal("ROUTER"),
        v.literal("VERIFY"),
        v.literal("GATE")
      )),
      inputSchema: v.optional(v.any()),
      outputSchema: v.optional(v.any()),
      modelTier: v.optional(v.union(
        v.literal("FAST"),
        v.literal("BALANCED"),
        v.literal("POWERFUL")
      )),
      isolation: v.optional(v.union(
        v.literal("SHARED"),
        v.literal("WORKTREE"),
        v.literal("READ_ONLY")
      )),
      failurePolicy: v.optional(v.union(
        v.literal("RETRY"),
        v.literal("CONTINUE"),
        v.literal("BLOCK")
      )),
      condition: v.optional(v.object({
        path: v.string(),
        operator: v.union(
          v.literal("EQ"),
          v.literal("NEQ"),
          v.literal("IN"),
          v.literal("EXISTS")
        ),
        value: v.optional(v.any()),
      })),
    })),
    active: v.optional(v.boolean()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    if (existing?.projectId || existing?.contractVersion) {
      throw new Error("Workspace-owned production workflows must use authorized production registration.");
    }
    
    const now = Date.now();
    
    if (existing) {
      const nextDefinition = {
        ...args,
        active: args.active ?? existing.active,
      };
      if (!workflowDefinitionChanged(existing, nextDefinition)) {
        return existing._id;
      }
      // Update existing workflow
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        topology: args.topology,
        maxConcurrency: args.maxConcurrency,
        convergence: args.convergence,
        agents: args.agents,
        steps: args.steps,
        active: nextDefinition.active,
        version: existing.version + 1,
        updatedAt: now,
      });
      
      return existing._id;
    } else {
      // Create new workflow
      return await ctx.db.insert("workflows", {
        workflowId: args.workflowId,
        name: args.name,
        description: args.description,
        topology: args.topology,
        maxConcurrency: args.maxConcurrency,
        convergence: args.convergence,
        agents: args.agents,
        steps: args.steps,
        active: args.active ?? true,
        version: 1,
        createdBy: args.createdBy,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/** Deployment-administrator recovery for global definitions without an owner.
 * Never let a workspace claim an unowned global definition through public APIs. */
export const retireLegacy = internalMutation({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.query("workflows")
      .withIndex("by_workflow_id", q => q.eq("workflowId", args.workflowId)).first();
    if (!workflow) return { removed: false };
    if (workflow.projectId || workflow.contractVersion) throw new Error("Workspace-owned workflows require authorized workspace management.");
    const active = await Promise.all((["PENDING", "RUNNING", "PAUSED"] as const).map(status =>
      missionAuthorityDatabase(ctx).query("workflowRuns").withIndex("by_status", q => q.eq("status", status))
        .filter(q => q.or(q.eq(q.field("workflowId"), args.workflowId), q.eq(q.field("workflowSnapshot.workflowId"), args.workflowId))).first()));
    if (active.some(Boolean)) throw new Error("Cannot retire legacy workflow with active runs");
    await ctx.db.delete(workflow._id);
    return { removed: true };
  },
});

/** Workspace-authorized registration for definitions eligible for new
 * production Factory runs. Legacy global upsert remains read-compatible but
 * cannot create a production-admissible workflow. */
export const registerProduction = mutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
    name: v.string(),
    description: v.string(),
    topology: workflowTopology,
    maxConcurrency: v.optional(v.number()),
    convergence: v.optional(v.object({ maxIterations: v.number(), stopCondition: v.string() })),
    agents: workflowAgents,
    steps: workflowSteps,
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const deterministic = args.steps.some(step => step.kind === "DETERMINISTIC");
    const contractVersion: "factory-workflow-contract/v1" | typeof DETERMINISTIC_WORKFLOW_CONTRACT = deterministic ? DETERMINISTIC_WORKFLOW_CONTRACT : "factory-workflow-contract/v1";
    const definition = { ...args, contractVersion, active: args.active ?? true };
    const issues = factoryWorkflowContractIssues(definition);
    if (issues.length) throw new Error(`Production workflow contract is unsafe (${issues.join(", ")}).`);
    if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(args.workflowId)
      || !args.name.trim() || args.name.length > 200
      || !args.description.trim() || args.description.length > 2_000
      || (!deterministic && args.agents.length < 1) || args.agents.length > 25
      || args.steps.length < 1 || args.steps.length > 100) {
      throw new Error("Production workflow identity or size is invalid.");
    }
    const existing = await ctx.db.query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    if (existing && existing.projectId !== args.projectId) {
      throw new Error("Production workflow identity is already owned outside this workspace.");
    }
    const now = Date.now();
    const value = {
      projectId: args.projectId,
      contractVersion,
      workflowId: args.workflowId,
      name: args.name.trim(),
      description: args.description.trim(),
      topology: args.topology,
      maxConcurrency: args.maxConcurrency,
      convergence: args.convergence,
      agents: args.agents,
      steps: args.steps,
      active: args.active ?? true,
      createdBy: access.actorId,
      updatedAt: now,
    };
    if (existing) {
      if (!workflowDefinitionChanged(existing, value)) return existing._id;
      await ctx.db.patch(existing._id, { ...value, version: existing.version + 1 });
      return existing._id;
    }
    return await ctx.db.insert("workflows", { ...value, version: 1, createdAt: now });
  },
});

/**
 * Activate or deactivate a workflow
 */
export const setActive = mutation({
  args: {
    workflowId: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    await requireWorkflowManagement(ctx, workflow);
    
    await ctx.db.patch(workflow._id, {
      active: args.active,
      updatedAt: Date.now(),
    });
    
    return workflow._id;
  },
});

/**
 * Delete a workflow
 */
export const remove = mutation({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    const projectId = await requireWorkflowManagement(ctx, workflow);
    
    // Check if there are any active runs
    const activeRun = await missionAuthorityDatabase(ctx)
      .query("workflowRuns")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .filter((q) => q.or(
        q.eq(q.field("status"), "RUNNING"),
        q.eq(q.field("status"), "PENDING"),
        q.eq(q.field("status"), "PAUSED")
      ))
      .first();
    
    // Older dispatches could store the requested alias rather than the actual
    // executable definition. Their frozen snapshot still pins that definition.
    const snapshotRuns = activeRun ? [] : await Promise.all((["PENDING", "RUNNING", "PAUSED"] as const).map(status =>
      missionAuthorityDatabase(ctx).query("workflowRuns")
        .withIndex("by_project_status", q => q.eq("projectId", projectId).eq("status", status))
        .filter(q => q.eq(q.field("workflowSnapshot.workflowId"), args.workflowId)).first()));
    if (activeRun || snapshotRuns.some(Boolean)) {
      throw new Error("Cannot delete workflow with active runs");
    }
    
    await ctx.db.delete(workflow._id);
    
    return { success: true };
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Install a workflow from YAML definition
 * (In production, this would parse YAML files from workflows/ directory)
 */
/**
 * Install a workflow from YAML.
 *
 * Unimplemented, and `internalAction` rather than `action` so it is not a
 * public surface while it waits. Nothing calls it.
 */
export const install = internalAction({
  args: {
    workflowId: v.string(),
    yamlContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // For now, this is a placeholder
    // In full implementation, this would:
    // 1. Parse YAML from workflows/${workflowId}.yaml
    // 2. Validate the workflow definition
    // 3. Call upsert mutation
    
    throw new Error("install action not yet implemented - use upsert mutation directly");
  },
});
