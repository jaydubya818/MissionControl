/**
 * Workflows — Convex Functions
 * 
 * Multi-agent workflow definitions and execution.
 * Inspired by Antfarm's deterministic workflow patterns.
 */

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

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
    let query = ctx.db.query("workflows");
    
    if (args.activeOnly) {
      query = query.withIndex("by_active", (q) => q.eq("active", true));
    }
    
    return await query.collect();
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
      // Update existing workflow
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        agents: args.agents,
        steps: args.steps,
        active: args.active ?? existing.active,
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
export const install = action({
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
