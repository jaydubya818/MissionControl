/**
 * Agent Documents — WORKING.md, daily notes, session memory.
 * Per-agent memory system for OpenClaw agents.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
const documentType = v.union(v.literal("WORKING_MD"), v.literal("DAILY_NOTE"), v.literal("SESSION_MEMORY"));
export const set = mutation({
    args: {
        agentId: v.id("agents"),
        type: documentType,
        content: v.string(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const existing = await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", args.type))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                content: args.content,
                updatedAt: now,
                metadata: args.metadata,
            });
            return { documentId: existing._id, created: false };
        }
        const id = await ctx.db.insert("agentDocuments", {
            agentId: args.agentId,
            type: args.type,
            content: args.content,
            updatedAt: now,
            metadata: args.metadata,
        });
        return { documentId: id, created: true };
    },
});
export const get = query({
    args: {
        agentId: v.id("agents"),
        type: documentType,
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", args.type))
            .first();
    },
});
export const listByAgent = query({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .collect();
    },
});
/** Get WORKING.md content for an agent (convenience). */
export const getWorkingMd = query({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", "WORKING_MD"))
            .first();
        return doc?.content ?? null;
    },
});
/** Get daily note for an agent (convenience). */
export const getDailyNote = query({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", "DAILY_NOTE"))
            .first();
        return doc?.content ?? null;
    },
});
