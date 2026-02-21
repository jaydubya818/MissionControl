/**
 * Identity/Soul/Tools Governance
 *
 * OpenClaw-aligned agent identity validation, storage, and scanning.
 * Implements the IDENTITY.md, SOUL.md, TOOLS.md governance system.
 */

import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveAgentRef } from "./lib/agentResolver";
import { appendChangeRecord } from "./lib/armAudit";

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateIdentityFields(identity: {
  name?: string;
  creature?: string;
  vibe?: string;
  emoji?: string;
  avatarPath?: string;
}): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!identity.name || identity.name.trim().length === 0) {
    errors.push("IDENTITY: 'name' is required and must be non-empty");
  }
  if (!identity.creature || identity.creature.trim().length === 0) {
    errors.push("IDENTITY: 'creature' is required and must be non-empty");
  }
  if (!identity.vibe || identity.vibe.trim().length === 0) {
    errors.push("IDENTITY: 'vibe' is required and must be non-empty");
  }
  if (!identity.emoji || identity.emoji.trim().length === 0) {
    errors.push("IDENTITY: 'emoji' is required");
  }

  // Avatar path validation (recommended, not required)
  if (identity.avatarPath && identity.avatarPath.trim().length > 0) {
    const path = identity.avatarPath.trim();
    const isHttpUrl = /^https?:\/\//.test(path);
    const isDataUri = /^data:/.test(path);
    const isRelativePath = /^[a-zA-Z0-9_\-./]+$/.test(path) && !path.startsWith("/") && !path.includes("..");
    if (!isHttpUrl && !isDataUri && !isRelativePath) {
      errors.push("IDENTITY: 'avatarPath' must be a workspace-relative path, http(s) URL, or data URI");
    }
  } else {
    warnings.push("IDENTITY: 'avatarPath' is recommended but not set");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateSoulContent(soulContent?: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!soulContent || soulContent.trim().length === 0) {
    errors.push("SOUL: content is required (SOUL.md must not be empty)");
    return { valid: false, errors, warnings };
  }

  // Check for recommended sections
  const content = soulContent.toLowerCase();
  if (!content.includes("core truths") && !content.includes("## core")) {
    warnings.push("SOUL: 'Core Truths' section is recommended");
  }
  if (!content.includes("boundaries") && !content.includes("## bound")) {
    warnings.push("SOUL: 'Boundaries' section is recommended");
  }
  if (!content.includes("vibe") && !content.includes("## vibe")) {
    warnings.push("SOUL: 'Vibe' section is recommended");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function computeSoulHash(content: string): string {
  // Simple hash for change detection (not cryptographic)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Validate an identity document against required fields.
 */
export const validate = query({
  args: {
    name: v.optional(v.string()),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    soulContent: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const identityResult = validateIdentityFields(args);
    const soulResult = validateSoulContent(args.soulContent);

    return {
      valid: identityResult.valid && soulResult.valid,
      errors: [...identityResult.errors, ...soulResult.errors],
      warnings: [...identityResult.warnings, ...soulResult.warnings],
    };
  },
});

/**
 * Get the identity directory: all agents with their identity info.
 */
export const getDirectory = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const identities = await ctx.db.query("agentIdentities").collect();

    // If projectId filter, get agents for that project and filter
    if (args.projectId) {
      const projectAgents = await ctx.db
        .query("agents")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      const agentIds = new Set(projectAgents.map((a) => a._id));
      return identities.filter((i) => agentIds.has(i.agentId));
    }

    return identities;
  },
});

/**
 * Get identity for a specific agent.
 */
export const getByAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const identities = await ctx.db
      .query("agentIdentities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    return identities[0] ?? null;
  },
});

/**
 * Get compliance report: agents grouped by validation status.
 */
export const getComplianceReport = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const identities = await ctx.db.query("agentIdentities").collect();
    const agents = args.projectId
      ? await ctx.db.query("agents").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect()
      : await ctx.db.query("agents").collect();

    const agentMap = new Map(agents.map((a) => [a._id, a]));
    const identityMap = new Map(identities.map((i) => [i.agentId, i]));

    const valid: any[] = [];
    const invalid: any[] = [];
    const missing: any[] = [];
    const partial: any[] = [];

    for (const agent of agents) {
      const identity = identityMap.get(agent._id);
      if (!identity) {
        missing.push({ agent, identity: null, status: "MISSING" });
      } else if (identity.validationStatus === "VALID") {
        valid.push({ agent, identity, status: "VALID" });
      } else if (identity.validationStatus === "INVALID") {
        invalid.push({ agent, identity, status: "INVALID" });
      } else {
        partial.push({ agent, identity, status: "PARTIAL" });
      }
    }

    return {
      total: agents.length,
      valid: valid.length,
      invalid: invalid.length,
      missing: missing.length,
      partial: partial.length,
      details: { valid, invalid, missing, partial },
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create or update an agent identity record with validation.
 */
export const upsert = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.string(),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    soulContent: v.optional(v.string()),
    toolsNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate
    const identityResult = validateIdentityFields(args);
    const soulResult = validateSoulContent(args.soulContent);
    const allErrors = [...identityResult.errors, ...soulResult.errors];

    let validationStatus: "VALID" | "INVALID" | "PARTIAL" = "VALID";
    if (allErrors.length > 0) {
      // Check if it's partially valid (some required fields present)
      const hasName = !!args.name && args.name.trim().length > 0;
      const hasSoul = !!args.soulContent && args.soulContent.trim().length > 0;
      validationStatus = (hasName || hasSoul) ? "PARTIAL" : "INVALID";
    }

    const soulHash = args.soulContent ? computeSoulHash(args.soulContent) : undefined;

    const agent = await ctx.db.get(args.agentId);
    const resolved = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: args.agentId, createIfMissing: true }
    );

    // Check for existing identity
    const existing = await ctx.db
      .query("agentIdentities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .first();

    // Detect soul change for audit
    const soulChanged = existing && existing.soulHash && soulHash && existing.soulHash !== soulHash;

    if (existing) {
      await ctx.db.patch(existing._id, {
        tenantId: agent?.tenantId,
        name: args.name,
        templateId: resolved?.templateId,
        versionId: resolved?.versionId,
        instanceId: resolved?.instanceId,
        legacyAgentId: args.agentId,
        creature: args.creature,
        vibe: args.vibe,
        emoji: args.emoji,
        avatarPath: args.avatarPath,
        soulContent: args.soulContent,
        soulHash,
        toolsNotes: args.toolsNotes,
        validationStatus,
        validationErrors: allErrors.length > 0 ? allErrors : undefined,
        lastScannedAt: Date.now(),
      });

      // Log soul change audit event
      if (soulChanged) {
        await ctx.db.insert("activities", {
          projectId: undefined,
          actorType: "SYSTEM",
          actorId: args.agentId,
          action: "SOUL_CHANGED",
          description: `SOUL.md changed for agent ${args.name}. Previous hash: ${existing.soulHash}, new hash: ${soulHash}. Per OpenClaw rules, the user has been notified.`,
          targetType: "AGENT",
          targetId: args.agentId,
          agentId: args.agentId,
          metadata: {
            agentId: args.agentId,
            previousSoulHash: existing.soulHash,
            newSoulHash: soulHash,
          },
        });
      }
      await appendChangeRecord(ctx.db as any, {
        tenantId: agent?.tenantId,
        projectId: agent?.projectId,
        templateId: resolved?.templateId,
        versionId: resolved?.versionId,
        instanceId: resolved?.instanceId,
        legacyAgentId: args.agentId,
        type: "IDENTITY_UPDATED",
        summary: `Identity updated for ${args.name}`,
        relatedTable: "agentIdentities",
        relatedId: existing._id,
      });

      return { id: existing._id, validationStatus, errors: allErrors, soulChanged };
    } else {
      const id = await ctx.db.insert("agentIdentities", {
        tenantId: agent?.tenantId,
        agentId: args.agentId,
        templateId: resolved?.templateId,
        versionId: resolved?.versionId,
        instanceId: resolved?.instanceId,
        legacyAgentId: args.agentId,
        name: args.name,
        creature: args.creature,
        vibe: args.vibe,
        emoji: args.emoji,
        avatarPath: args.avatarPath,
        soulContent: args.soulContent,
        soulHash,
        toolsNotes: args.toolsNotes,
        validationStatus,
        validationErrors: allErrors.length > 0 ? allErrors : undefined,
        lastScannedAt: Date.now(),
      });
      await appendChangeRecord(ctx.db as any, {
        tenantId: agent?.tenantId,
        projectId: agent?.projectId,
        templateId: resolved?.templateId,
        versionId: resolved?.versionId,
        instanceId: resolved?.instanceId,
        legacyAgentId: args.agentId,
        type: "IDENTITY_UPDATED",
        summary: `Identity created for ${args.name}`,
        relatedTable: "agentIdentities",
        relatedId: id,
      });

      return { id, validationStatus, errors: allErrors, soulChanged: false };
    }
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Scan all agents for missing/invalid identity/soul/tools files.
 * Writes results to agentIdentities table.
 */
export const scan = action({
  args: {},
  handler: async (ctx) => {
    // Get all agents
    const agents: any[] = await ctx.runQuery(api.identity.listAgentsForScan);

    const results = {
      scanned: 0,
      valid: 0,
      invalid: 0,
      missing: 0,
      partial: 0,
    };

    for (const agent of agents) {
      results.scanned++;

      // Check if identity already exists
      const existing: any = await ctx.runQuery(api.identity.getByAgentInternal, {
        agentId: agent._id,
      });

      if (!existing) {
        // Create a MISSING identity record from agent data
        await ctx.runMutation(api.identity.upsertInternal, {
          agentId: agent._id,
          name: agent.name || "Unknown",
          creature: undefined,
          vibe: undefined,
          emoji: agent.emoji || undefined,
          avatarPath: undefined,
          soulContent: undefined,
          toolsNotes: undefined,
          validationStatus: "MISSING" as const,
          validationErrors: ["No identity record found. Create IDENTITY.md and SOUL.md for this agent."],
        });
        results.missing++;
      } else {
        // Re-validate existing
        const identityResult = validateIdentityFields(existing);
        const soulResult = validateSoulContent(existing.soulContent);
        const allErrors = [...identityResult.errors, ...soulResult.errors];

        let status: "VALID" | "INVALID" | "PARTIAL" = "VALID";
        if (allErrors.length > 0) {
          const hasName = !!existing.name && existing.name.trim().length > 0;
          const hasSoul = !!existing.soulContent && existing.soulContent.trim().length > 0;
          status = (hasName || hasSoul) ? "PARTIAL" : "INVALID";
        }

        await ctx.runMutation(api.identity.updateValidationStatus, {
          identityId: existing._id,
          validationStatus: status,
          validationErrors: allErrors.length > 0 ? allErrors : undefined,
        });

        if (status === "VALID") results.valid++;
        else if (status === "INVALID") results.invalid++;
        else results.partial++;
      }
    }

    return results;
  },
});

// ============================================================================
// INTERNAL HELPERS (for use by actions)
// ============================================================================

export const listAgentsForScan = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const getByAgentInternal = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentIdentities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

export const upsertInternal = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.string(),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    soulContent: v.optional(v.string()),
    toolsNotes: v.optional(v.string()),
    validationStatus: v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING"),
      v.literal("PARTIAL")
    ),
    validationErrors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentIdentities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastScannedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("agentIdentities", {
        ...args,
        lastScannedAt: Date.now(),
      });
    }
  },
});

export const updateValidationStatus = mutation({
  args: {
    identityId: v.id("agentIdentities"),
    validationStatus: v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING"),
      v.literal("PARTIAL")
    ),
    validationErrors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.identityId, {
      validationStatus: args.validationStatus,
      validationErrors: args.validationErrors,
      lastScannedAt: Date.now(),
    });
  },
});
