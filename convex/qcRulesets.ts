/**
 * QC Rulesets — Convex Functions
 * 
 * Configurable quality check definitions and built-in presets.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List rulesets
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.projectId && args.active !== undefined) {
      return await ctx.db
        .query("qcRulesets")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("active"), args.active))
        .collect();
    }
    
    if (args.projectId) {
      return await ctx.db
        .query("qcRulesets")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    }
    
    if (args.active !== undefined) {
      return await ctx.db
        .query("qcRulesets")
        .withIndex("by_active", (q) => q.eq("active", args.active!))
        .collect();
    }
    
    return await ctx.db.query("qcRulesets").collect();
  },
});

/**
 * Get a single ruleset
 */
export const get = query({
  args: { id: v.id("qcRulesets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a ruleset
 */
export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    description: v.optional(v.string()),
    preset: v.optional(v.union(
      v.literal("PRE_RELEASE"),
      v.literal("POST_MERGE"),
      v.literal("WEEKLY_HEALTH"),
      v.literal("SECURITY_FOCUS"),
      v.literal("CUSTOM")
    )),
    requiredDocs: v.array(v.string()),
    coverageThresholds: v.object({
      unit: v.number(),
      integration: v.number(),
      e2e: v.number(),
    }),
    securityPaths: v.array(v.string()),
    gateDefinitions: v.array(v.object({
      name: v.string(),
      condition: v.string(),
      severity: v.string(),
    })),
    severityOverrides: v.optional(v.any()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("qcRulesets", {
      tenantId: undefined, // TODO: resolve from project
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      preset: args.preset ?? "CUSTOM",
      requiredDocs: args.requiredDocs,
      coverageThresholds: args.coverageThresholds,
      securityPaths: args.securityPaths,
      gateDefinitions: args.gateDefinitions,
      severityOverrides: args.severityOverrides,
      active: args.active ?? true,
      isBuiltIn: false,
    });
    
    return { id };
  },
});

/**
 * Update a ruleset
 */
export const update = mutation({
  args: {
    id: v.id("qcRulesets"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    requiredDocs: v.optional(v.array(v.string())),
    coverageThresholds: v.optional(v.object({
      unit: v.number(),
      integration: v.number(),
      e2e: v.number(),
    })),
    securityPaths: v.optional(v.array(v.string())),
    gateDefinitions: v.optional(v.array(v.object({
      name: v.string(),
      condition: v.string(),
      severity: v.string(),
    }))),
    severityOverrides: v.optional(v.any()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ruleset = await ctx.db.get(args.id);
    if (!ruleset) {
      throw new Error("Ruleset not found");
    }
    
    if (ruleset.isBuiltIn) {
      throw new Error("Cannot modify built-in rulesets");
    }
    
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.requiredDocs !== undefined) updates.requiredDocs = args.requiredDocs;
    if (args.coverageThresholds !== undefined) updates.coverageThresholds = args.coverageThresholds;
    if (args.securityPaths !== undefined) updates.securityPaths = args.securityPaths;
    if (args.gateDefinitions !== undefined) updates.gateDefinitions = args.gateDefinitions;
    if (args.severityOverrides !== undefined) updates.severityOverrides = args.severityOverrides;
    if (args.active !== undefined) updates.active = args.active;
    
    await ctx.db.patch(args.id, updates);
    
    return { success: true };
  },
});

/**
 * Delete a ruleset
 */
export const remove = mutation({
  args: { id: v.id("qcRulesets") },
  handler: async (ctx, args) => {
    const ruleset = await ctx.db.get(args.id);
    if (!ruleset) {
      throw new Error("Ruleset not found");
    }
    
    if (ruleset.isBuiltIn) {
      throw new Error("Cannot delete built-in rulesets");
    }
    
    await ctx.db.delete(args.id);
    
    return { success: true };
  },
});

/**
 * Seed default rulesets
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx, args) => {
    const presets = [
      {
        name: "Pre-Release",
        preset: "PRE_RELEASE" as const,
        description: "Full scan with strict gates for production releases",
        requiredDocs: ["README.md", "docs/PRD*.md", "CHANGELOG.md"],
        coverageThresholds: { unit: 80, integration: 70, e2e: 60 },
        securityPaths: ["auth/**", "security/**", "api/**"],
        gateDefinitions: [
          { name: "PRD exists", condition: "requiredDocs", severity: "RED" },
          { name: "Coverage meets threshold", condition: "coverageThresholds", severity: "RED" },
          { name: "Security paths covered", condition: "securityPaths", severity: "RED" },
          { name: "No RED findings", condition: "findings.red === 0", severity: "RED" },
        ],
      },
      {
        name: "Post-Merge",
        preset: "POST_MERGE" as const,
        description: "Delta scan focused on changed files only",
        requiredDocs: ["README.md"],
        coverageThresholds: { unit: 60, integration: 40, e2e: 20 },
        securityPaths: ["auth/**", "security/**"],
        gateDefinitions: [
          { name: "Changed files have tests", condition: "coverageThresholds", severity: "YELLOW" },
          { name: "Docs updated if needed", condition: "docsDrift", severity: "YELLOW" },
        ],
      },
      {
        name: "Weekly Health",
        preset: "WEEKLY_HEALTH" as const,
        description: "Broad scan with relaxed thresholds for trend monitoring",
        requiredDocs: ["README.md", "docs/**/*.md"],
        coverageThresholds: { unit: 50, integration: 30, e2e: 10 },
        securityPaths: ["auth/**"],
        gateDefinitions: [
          { name: "Basic docs present", condition: "requiredDocs", severity: "YELLOW" },
          { name: "Minimal coverage", condition: "coverageThresholds", severity: "YELLOW" },
        ],
      },
      {
        name: "Security Focus",
        preset: "SECURITY_FOCUS" as const,
        description: "Narrow scan on security-critical paths only",
        requiredDocs: ["docs/SECURITY*.md"],
        coverageThresholds: { unit: 90, integration: 80, e2e: 70 },
        securityPaths: ["auth/**", "security/**", "api/auth/**", "middleware/auth/**"],
        gateDefinitions: [
          { name: "Security docs exist", condition: "requiredDocs", severity: "RED" },
          { name: "Security paths fully covered", condition: "securityPaths", severity: "RED" },
          { name: "No security gaps", condition: "findings.category !== SECURITY_GAP", severity: "RED" },
        ],
      },
    ];
    
    const created = [];
    
    for (const preset of presets) {
      // Check if already exists
      const existing = await ctx.db
        .query("qcRulesets")
        .withIndex("by_preset", (q) => q.eq("preset", preset.preset))
        .filter((q) => q.eq(q.field("isBuiltIn"), true))
        .first();
      
      if (!existing) {
        const id = await ctx.db.insert("qcRulesets", {
          tenantId: undefined,
          projectId: undefined,
          name: preset.name,
          description: preset.description,
          preset: preset.preset,
          requiredDocs: preset.requiredDocs,
          coverageThresholds: preset.coverageThresholds,
          securityPaths: preset.securityPaths,
          gateDefinitions: preset.gateDefinitions,
          active: true,
          isBuiltIn: true,
        });
        created.push({ preset: preset.preset, id });
      }
    }
    
    return { created, count: created.length };
  },
});
