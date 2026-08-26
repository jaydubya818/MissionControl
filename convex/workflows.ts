/**
 * Workflows — Convex Functions
 * 
 * Multi-agent workflow definitions and execution.
 * Inspired by Antfarm's deterministic workflow patterns.
 */

import { v } from "convex/values";
import { mutation, query, action, internalAction } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { workflowDefinitionChanged } from "./lib/workflowSnapshot";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import {
  factoryWorkflowContractIssues,
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
  kind: v.optional(v.union(v.literal("AGENT"), v.literal("REDUCE"), v.literal("ROUTER"), v.literal("VERIFY"), v.literal("GATE"))),
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
      return await ctx.db
        .query("workflows")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
    }
    
    return await ctx.db.query("workflows").collect();
  },
});

/**
 * Get a workflow by ID
 */
export const get = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
  },
});

/**
 * Get workflow by Convex _id
 */
export const getById = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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
export const upsert = mutation({
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
    const definition = { ...args, active: args.active ?? true };
    const issues = factoryWorkflowContractIssues(definition);
    if (issues.length) throw new Error(`Production workflow contract is unsafe (${issues.join(", ")}).`);
    if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(args.workflowId)
      || !args.name.trim() || args.name.length > 200
      || !args.description.trim() || args.description.length > 2_000
      || args.agents.length < 1 || args.agents.length > 25
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
      contractVersion: "factory-workflow-contract/v1" as const,
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
    
    // Check if there are any active runs
    const activeRuns = await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .filter((q) => q.or(
        q.eq(q.field("status"), "RUNNING"),
        q.eq(q.field("status"), "PENDING")
      ))
      .collect();
    
    if (activeRuns.length > 0) {
      throw new Error(`Cannot delete workflow with ${activeRuns.length} active runs`);
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
