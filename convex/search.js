"use strict";
/**
 * Enhanced Search — Full-Text Search for Tasks
 *
 * Provides more sophisticated search across tasks, messages, and documents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSuggestions = exports.searchDocuments = exports.searchMessages = exports.searchAll = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// SEARCH QUERIES
// ============================================================================
/**
 * Enhanced search across tasks, messages, and artifacts.
 */
exports.searchAll = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        query: values_1.v.string(),
        filters: values_1.v.optional(values_1.v.object({
            status: values_1.v.optional(values_1.v.array(values_1.v.string())),
            type: values_1.v.optional(values_1.v.array(values_1.v.string())),
            priority: values_1.v.optional(values_1.v.array(values_1.v.number())),
            assignedTo: values_1.v.optional(values_1.v.array(values_1.v.id("agents"))),
        })),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const query = args.query.toLowerCase().trim();
        const tokens = query.split(/\s+/).filter(t => t.length > 0);
        // Get tasks
        let tasks;
        if (args.projectId) {
            tasks = await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .collect();
        }
        else {
            tasks = await ctx.db.query("tasks").collect();
        }
        // Apply filters
        if (args.filters) {
            if (args.filters.status && args.filters.status.length > 0) {
                tasks = tasks.filter(t => args.filters.status.includes(t.status));
            }
            if (args.filters.type && args.filters.type.length > 0) {
                tasks = tasks.filter(t => args.filters.type.includes(t.type));
            }
            if (args.filters.priority && args.filters.priority.length > 0) {
                tasks = tasks.filter(t => args.filters.priority.includes(t.priority));
            }
            if (args.filters.assignedTo && args.filters.assignedTo.length > 0) {
                tasks = tasks.filter(t => t.assigneeIds.some(id => args.filters.assignedTo.includes(id)));
            }
        }
        // Score and filter tasks
        const scored = tasks.map(task => {
            const score = calculateSearchScore(task, tokens);
            return { task, score };
        }).filter(item => item.score > 0);
        // Sort by score (descending)
        scored.sort((a, b) => b.score - a.score);
        // Get messages for top results (for context)
        const results = [];
        for (const item of scored.slice(0, limit)) {
            const taskId = item.task._id;
            const messages = await ctx.db
                .query("messages")
                .withIndex("by_task", (q) => q.eq("taskId", taskId))
                .order("desc")
                .take(3);
            results.push({
                task: item.task,
                score: item.score,
                recentMessages: messages,
            });
        }
        return results;
    },
});
/**
 * Search messages by content.
 */
exports.searchMessages = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        query: values_1.v.string(),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const query = args.query.toLowerCase().trim();
        let messages;
        if (args.taskId) {
            const taskId = args.taskId;
            messages = await ctx.db
                .query("messages")
                .withIndex("by_task", (q) => q.eq("taskId", taskId))
                .collect();
        }
        else {
            messages = await ctx.db.query("messages").collect();
            // Filter by project if provided
            if (args.projectId) {
                messages = messages.filter(m => m.projectId === args.projectId);
            }
        }
        // Filter by content
        const filtered = messages.filter(m => m.content.toLowerCase().includes(query));
        // Sort by relevance (creation time for now)
        filtered.sort((a, b) => b._creationTime - a._creationTime);
        return filtered.slice(0, limit);
    },
});
/**
 * Search agent documents.
 */
exports.searchDocuments = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        query: values_1.v.string(),
        agentId: values_1.v.optional(values_1.v.id("agents")),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const query = args.query.toLowerCase().trim();
        let docs;
        if (args.agentId) {
            docs = await ctx.db
                .query("agentDocuments")
                .filter((q) => q.eq(q.field("agentId"), args.agentId))
                .collect();
        }
        else {
            docs = await ctx.db.query("agentDocuments").collect();
            // Filter by project if provided
            if (args.projectId) {
                docs = docs.filter(d => d.projectId === args.projectId);
            }
        }
        // Filter by content
        const filtered = docs.filter(d => d.content.toLowerCase().includes(query));
        // Sort by update time
        filtered.sort((a, b) => b.updatedAt - a.updatedAt);
        return filtered.slice(0, limit);
    },
});
// ============================================================================
// SEARCH SCORING
// ============================================================================
function calculateSearchScore(task, tokens) {
    let score = 0;
    const title = task.title.toLowerCase();
    const description = (task.description || "").toLowerCase();
    const labels = (task.labels || []).map((l) => l.toLowerCase());
    for (const token of tokens) {
        // Title matches (highest weight)
        if (title.includes(token)) {
            score += 10;
            // Exact word match bonus
            if (title.split(/\s+/).includes(token)) {
                score += 5;
            }
            // Starts with token bonus
            if (title.startsWith(token)) {
                score += 3;
            }
        }
        // Description matches (medium weight)
        if (description.includes(token)) {
            score += 5;
        }
        // Label matches (medium weight)
        for (const label of labels) {
            if (label.includes(token)) {
                score += 5;
            }
            if (label === token) {
                score += 3; // Exact match bonus
            }
        }
        // Type match (low weight)
        if (task.type.toLowerCase().includes(token)) {
            score += 2;
        }
    }
    // Boost recent tasks
    const ageHours = (Date.now() - task._creationTime) / (1000 * 60 * 60);
    if (ageHours < 24) {
        score += 2;
    }
    else if (ageHours < 168) { // 1 week
        score += 1;
    }
    // Boost active tasks
    if (["IN_PROGRESS", "REVIEW", "NEEDS_APPROVAL"].includes(task.status)) {
        score += 3;
    }
    return score;
}
// ============================================================================
// SEARCH SUGGESTIONS
// ============================================================================
/**
 * Get search suggestions based on recent tasks and common terms.
 */
exports.getSuggestions = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        prefix: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const prefix = args.prefix.toLowerCase().trim();
        if (prefix.length < 2) {
            return [];
        }
        // Get recent tasks
        let tasks;
        if (args.projectId) {
            tasks = await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .order("desc")
                .take(100);
        }
        else {
            tasks = await ctx.db.query("tasks").order("desc").take(100);
        }
        // Extract terms
        const terms = new Set();
        for (const task of tasks) {
            // Add title words
            const titleWords = task.title.toLowerCase().split(/\s+/);
            for (const word of titleWords) {
                if (word.startsWith(prefix) && word.length > 2) {
                    terms.add(word);
                }
            }
            // Add labels
            if (task.labels) {
                for (const label of task.labels) {
                    if (label.toLowerCase().startsWith(prefix)) {
                        terms.add(label.toLowerCase());
                    }
                }
            }
            // Add type if matches
            if (task.type.toLowerCase().startsWith(prefix)) {
                terms.add(task.type.toLowerCase());
            }
        }
        return Array.from(terms).slice(0, 10);
    },
});
