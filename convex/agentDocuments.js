"use strict";
/**
 * Agent Documents — WORKING.md, daily notes, session memory.
 * Per-agent memory system for OpenClaw agents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyNote = exports.getWorkingMd = exports.listByAgent = exports.get = exports.set = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
const documentType = values_1.v.union(values_1.v.literal("WORKING_MD"), values_1.v.literal("DAILY_NOTE"), values_1.v.literal("SESSION_MEMORY"));
exports.set = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        type: documentType,
        content: values_1.v.string(),
        metadata: values_1.v.optional(values_1.v.any()),
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
exports.get = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        type: documentType,
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", args.type))
            .first();
    },
});
exports.listByAgent = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .collect();
    },
});
/** Get WORKING.md content for an agent (convenience). */
exports.getWorkingMd = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", "WORKING_MD"))
            .first();
        return doc?.content ?? null;
    },
});
/** Get daily note for an agent (convenience). */
exports.getDailyNote = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("agentDocuments")
            .withIndex("by_agent_type", (q) => q.eq("agentId", args.agentId).eq("type", "DAILY_NOTE"))
            .first();
        return doc?.content ?? null;
    },
});
