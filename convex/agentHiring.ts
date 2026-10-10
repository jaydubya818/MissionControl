/**
 * Agent Hiring Pipeline — Convex API
 *
 * Comms > Hiring: role specs, candidates, screen reports, assessments, panel, decision records.
 */

import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";
import type { Id } from "./_generated/dataModel";

const scopeValidator = v.object({
  includes: v.array(v.string()),
  excludes: v.array(v.string()),
});

const toolingValidator = v.object({
  allowed_tools: v.array(v.string()),
  forbidden_tools: v.array(v.string()),
});

const policyEnvelopeValidator = v.object({
  autonomy_level: v.optional(v.number()),
  redlines: v.array(v.string()),
  escalation: v.optional(v.any()),
});

const candidateSourceValidator = v.union(
  v.literal("model_provider"),
  v.literal("template"),
  v.literal("internal")
);

const candidateStatusValidator = v.union(
  v.literal("draft"),
  v.literal("screening"),
  v.literal("assessed"),
  v.literal("panel"),
  v.literal("offer"),
  v.literal("no_hire")
);

const hireDecisionValidator = v.union(
  v.literal("strong_hire"),
  v.literal("hire"),
  v.literal("no_hire")
);

const autonomyLevelValidator = v.union(v.literal(1), v.literal(2), v.literal(3));

// ============================================================================
// QUERIES
// ============================================================================

export const listRoleSpecs = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentRoleSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getRoleSpec = query({
  args: { id: v.id("agentRoleSpecs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listCandidates = query({
  args: {
    projectId: v.optional(v.id("projects")),
    roleSpecId: v.optional(v.id("agentRoleSpecs")),
  },
  handler: async (ctx, args) => {
    if (args.roleSpecId) {
      return await ctx.db
        .query("hiringCandidates")
        .withIndex("by_roleSpec", (q) => q.eq("roleSpecId", args.roleSpecId!))
        .order("desc")
        .collect();
    }
    if (args.projectId) {
      return await ctx.db
        .query("hiringCandidates")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .order("desc")
        .collect();
    }
    return [];
  },
});

export const getCandidate = query({
  args: { id: v.id("hiringCandidates") },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.id);
    if (!candidate) return null;
    const screenReport = await ctx.db
      .query("screenReports")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.id))
      .first();
    const assessmentPacket = await ctx.db
      .query("assessmentPackets")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.id))
      .first();
    const panelPacket = await ctx.db
      .query("panelPackets")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.id))
      .first();
    const decisionRecord = await ctx.db
      .query("decisionRecords")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.id))
      .first();
    return {
      ...candidate,
      screenReport: screenReport ?? null,
      assessmentPacket: assessmentPacket ?? null,
      panelPacket: panelPacket ?? null,
      decisionRecord: decisionRecord ?? null,
    };
  },
});

export const getScreenReport = query({
  args: { candidateId: v.id("hiringCandidates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("screenReports")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
  },
});

export const getAssessmentPacket = query({
  args: { candidateId: v.id("hiringCandidates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("assessmentPackets")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
  },
});

export const getPanelPacket = query({
  args: { candidateId: v.id("hiringCandidates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("panelPackets")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
  },
});

export const getDecisionRecord = query({
  args: { candidateId: v.id("hiringCandidates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("decisionRecords")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const createRoleSpec = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    purpose: v.string(),
    outcomes: v.array(v.string()),
    scope: scopeValidator,
    tooling: toolingValidator,
    policyEnvelope: policyEnvelopeValidator,
    successMetrics: v.optional(v.any()),
    communicationStyle: v.optional(v.any()),
    day1Autonomy: v.optional(v.any()),
    offerConfig: v.optional(v.any()),
    scorecard: v.optional(v.any()),
    specYaml: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("agentRoleSpecs")
        .withIndex("by_project_slug", (q) =>
          q.eq("projectId", args.projectId).eq("slug", args.slug)
        )
        .first();
      if (existing) return existing._id;
    }
    return await ctx.db.insert("agentRoleSpecs", {
      projectId: args.projectId,
      name: args.name,
      slug: args.slug,
      purpose: args.purpose,
      outcomes: args.outcomes,
      scope: args.scope,
      tooling: args.tooling,
      policyEnvelope: args.policyEnvelope,
      successMetrics: args.successMetrics,
      communicationStyle: args.communicationStyle,
      day1Autonomy: args.day1Autonomy,
      offerConfig: args.offerConfig,
      scorecard: args.scorecard,
      specYaml: args.specYaml,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRoleSpec = mutation({
  args: {
    id: v.id("agentRoleSpecs"),
    name: v.optional(v.string()),
    purpose: v.optional(v.string()),
    outcomes: v.optional(v.array(v.string())),
    scope: v.optional(scopeValidator),
    tooling: v.optional(toolingValidator),
    policyEnvelope: v.optional(policyEnvelopeValidator),
    successMetrics: v.optional(v.any()),
    communicationStyle: v.optional(v.any()),
    day1Autonomy: v.optional(v.any()),
    offerConfig: v.optional(v.any()),
    scorecard: v.optional(v.any()),
    specYaml: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Role spec not found");
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;
    const updatedAt = Date.now();
    await ctx.db.patch(id, { ...filtered, updatedAt } as Record<string, unknown>);
    return id;
  },
});

export const createCandidate = mutation({
  args: {
    projectId: v.id("projects"),
    roleSpecId: v.id("agentRoleSpecs"),
    label: v.string(),
    source: candidateSourceValidator,
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("hiringCandidates", {
      projectId: args.projectId,
      roleSpecId: args.roleSpecId,
      label: args.label,
      source: args.source,
      status: "draft",
      createdAt: now,
    });
  },
});

export const updateCandidateStatus = mutation({
  args: {
    id: v.id("hiringCandidates"),
    status: candidateStatusValidator,
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Candidate not found");
    await ctx.db.patch(args.id, { status: args.status });
    return args.id;
  },
});

export const saveScreenReport = mutation({
  args: {
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    pass: v.boolean(),
    scores: v.any(),
    disqualifiers: v.array(v.string()),
    rawResponse: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("screenReports")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
    const now = Date.now();
    const payload = {
      candidateId: args.candidateId,
      roleSpecId: args.roleSpecId,
      pass: args.pass,
      scores: args.scores,
      disqualifiers: args.disqualifiers,
      rawResponse: args.rawResponse,
      createdAt: now,
    };
    if (existing) {
      await ctx.db.replace(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("screenReports", payload);
  },
});

export const saveAssessmentPacket = mutation({
  args: {
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    assessments: v.array(v.any()),
    overallScores: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assessmentPackets")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
    const now = Date.now();
    const payload = {
      candidateId: args.candidateId,
      roleSpecId: args.roleSpecId,
      assessments: args.assessments,
      overallScores: args.overallScores,
      createdAt: now,
    };
    if (existing) {
      await ctx.db.replace(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("assessmentPackets", payload);
  },
});

export const savePanelPacket = mutation({
  args: {
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    panelNotes: v.any(),
    hireDecisionDraft: hireDecisionValidator,
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("panelPackets")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
    const now = Date.now();
    const payload = {
      candidateId: args.candidateId,
      roleSpecId: args.roleSpecId,
      panelNotes: args.panelNotes,
      hireDecisionDraft: args.hireDecisionDraft,
      createdAt: now,
    };
    if (existing) {
      await ctx.db.replace(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("panelPackets", payload);
  },
});

export const saveDecisionRecord = mutation({
  args: {
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    decision: hireDecisionValidator,
    autonomyLevel: autonomyLevelValidator,
    offerConfigSnapshot: v.optional(v.any()),
    decidedBy: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("decisionRecords")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .first();
    const now = Date.now();
    const payload = {
      candidateId: args.candidateId,
      roleSpecId: args.roleSpecId,
      decision: args.decision,
      autonomyLevel: args.autonomyLevel,
      offerConfigSnapshot: args.offerConfigSnapshot,
      decidedBy: args.decidedBy,
      createdAt: now,
    };
    if (existing) {
      await ctx.db.replace(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("decisionRecords", payload);
  },
});
