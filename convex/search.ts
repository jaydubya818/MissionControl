import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Advanced Search System
 * 
 * Full-text search across tasks, comments, documents, and more
 * with filters, saved searches, and search history.
 */

// ============================================================================
// SEARCH QUERIES
// ============================================================================

export const searchAll = query({
  args: {
    query: v.string(),
    projectId: v.optional(v.id("projects")),
    filters: v.optional(v.object({
      status: v.optional(v.array(v.string())),
      priority: v.optional(v.array(v.number())),
      type: v.optional(v.array(v.string())),
      assigneeIds: v.optional(v.array(v.id("agents"))),
      dateFrom: v.optional(v.number()),
      dateTo: v.optional(v.number()),
    })),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const searchQuery = args.query.toLowerCase();
    
    // Search tasks
    let tasks = args.projectId
      ? await ctx.db.query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("tasks").collect();
    
    // Filter by text search
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(searchQuery) ||
      t.description?.toLowerCase().includes(searchQuery)
    );
    
    // Apply filters
    if (args.filters) {
      if (args.filters.status && args.filters.status.length > 0) {
        tasks = tasks.filter(t => args.filters!.status!.includes(t.status));
      }
      if (args.filters.priority && args.filters.priority.length > 0) {
        tasks = tasks.filter(t => args.filters!.priority!.includes(t.priority));
      }
      if (args.filters.type && args.filters.type.length > 0) {
        tasks = tasks.filter(t => args.filters!.type!.includes(t.type));
      }
      if (args.filters.assigneeIds && args.filters.assigneeIds.length > 0) {
        tasks = tasks.filter(t => 
          t.assigneeIds?.some(id => args.filters!.assigneeIds!.includes(id))
        );
      }
      if (args.filters.dateFrom) {
        tasks = tasks.filter(t => t._creationTime >= args.filters!.dateFrom!);
      }
      if (args.filters.dateTo) {
        tasks = tasks.filter(t => t._creationTime <= args.filters!.dateTo!);
      }
    }
    
    // Search messages (use content field, not body)
    let messages = await ctx.db.query("messages").collect();
    messages = messages.filter(m => 
      m.content.toLowerCase().includes(searchQuery)
    );
    
    if (args.projectId) {
      // Filter messages by project through tasks
      const projectTaskIds = tasks.map(t => t._id);
      messages = messages.filter(m => 
        m.taskId && projectTaskIds.includes(m.taskId)
      );
    }
    
    // Search agents
    let agents = args.projectId
      ? await ctx.db.query("agents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("agents").collect();
    
    agents = agents.filter(a => 
      a.name.toLowerCase().includes(searchQuery) ||
      a.role.toLowerCase().includes(searchQuery)
    );
    
    // Search activities (use description field, not body)
    let activities = args.projectId
      ? await ctx.db.query("activities")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("activities").collect();
    
    activities = activities.filter(a => 
      a.description.toLowerCase().includes(searchQuery)
    );
    
    return {
      tasks: tasks.slice(0, limit),
      messages: messages.slice(0, 20),
      agents: agents.slice(0, 10),
      activities: activities.slice(0, 20),
      totalResults: tasks.length + messages.length + agents.length + activities.length,
    };
  },
});

export const searchTasks = query({
  args: {
    query: v.string(),
    projectId: v.optional(v.id("projects")),
    filters: v.optional(v.object({
      status: v.optional(v.array(v.string())),
      priority: v.optional(v.array(v.number())),
      type: v.optional(v.array(v.string())),
      assigneeIds: v.optional(v.array(v.id("agents"))),
      dateFrom: v.optional(v.number()),
      dateTo: v.optional(v.number()),
    })),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const searchQuery = args.query.toLowerCase();
    
    let tasks = args.projectId
      ? await ctx.db.query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("tasks").collect();
    
    // Text search
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(searchQuery) ||
      t.description?.toLowerCase().includes(searchQuery) ||
      t.type.toLowerCase().includes(searchQuery) ||
      t.status.toLowerCase().includes(searchQuery)
    );
    
    // Apply filters (same as searchAll)
    if (args.filters) {
      if (args.filters.status && args.filters.status.length > 0) {
        tasks = tasks.filter(t => args.filters!.status!.includes(t.status));
      }
      if (args.filters.priority && args.filters.priority.length > 0) {
        tasks = tasks.filter(t => args.filters!.priority!.includes(t.priority));
      }
      if (args.filters.type && args.filters.type.length > 0) {
        tasks = tasks.filter(t => args.filters!.type!.includes(t.type));
      }
      if (args.filters.assigneeIds && args.filters.assigneeIds.length > 0) {
        tasks = tasks.filter(t => 
          t.assigneeIds?.some(id => args.filters!.assigneeIds!.includes(id))
        );
      }
      if (args.filters.dateFrom) {
        tasks = tasks.filter(t => t._creationTime >= args.filters!.dateFrom!);
      }
      if (args.filters.dateTo) {
        tasks = tasks.filter(t => t._creationTime <= args.filters!.dateTo!);
      }
    }
    
    // Sort by relevance (title matches first)
    tasks.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(searchQuery);
      const bTitle = b.title.toLowerCase().includes(searchQuery);
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      return b._creationTime - a._creationTime;
    });
    
    return tasks.slice(0, limit);
  },
});

export const quickSearch = query({
  args: {
    query: v.string(),
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const searchQuery = args.query.toLowerCase();
    
    // Quick search across tasks and agents only
    let tasks = args.projectId
      ? await ctx.db.query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("tasks").collect();
    
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(searchQuery)
    ).slice(0, limit);
    
    let agents = args.projectId
      ? await ctx.db.query("agents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("agents").collect();
    
    agents = agents.filter(a => 
      a.name.toLowerCase().includes(searchQuery)
    ).slice(0, 5);
    
    return { tasks, agents };
  },
});

// ============================================================================
// SEARCH SUGGESTIONS
// ============================================================================

export const getSearchSuggestions = query({
  args: {
    query: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const searchQuery = args.query.toLowerCase();
    const suggestions: string[] = [];
    
    // Get recent tasks for suggestions
    const tasks = args.projectId
      ? await ctx.db.query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("tasks").collect();
    
    // Extract unique words from titles
    const words = new Set<string>();
    tasks.forEach(t => {
      t.title.toLowerCase().split(/\s+/).forEach(word => {
        if (word.length > 3 && word.startsWith(searchQuery)) {
          words.add(word);
        }
      });
    });
    
    // Add task types
    const types = ["ENGINEERING", "CONTENT", "RESEARCH", "REVIEW", "PLANNING"];
    types.forEach(type => {
      if (type.toLowerCase().startsWith(searchQuery)) {
        suggestions.push(type);
      }
    });
    
    // Add statuses
    const statuses = ["INBOX", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"];
    statuses.forEach(status => {
      if (status.toLowerCase().startsWith(searchQuery)) {
        suggestions.push(status);
      }
    });
    
    return [...suggestions, ...Array.from(words)].slice(0, 10);
  },
});

// ============================================================================
// FILTERS
// ============================================================================

export const getAvailableFilters = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const tasks = args.projectId
      ? await ctx.db.query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("tasks").collect();
    
    // Extract unique values
    const statuses = [...new Set(tasks.map(t => t.status))];
    const types = [...new Set(tasks.map(t => t.type))];
    const priorities = [...new Set(tasks.map(t => t.priority))];
    
    // Get agents
    const agents = args.projectId
      ? await ctx.db.query("agents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("agents").collect();
    
    return {
      statuses,
      types,
      priorities: priorities.sort(),
      agents: agents.map(a => ({ id: a._id, name: a.name })),
    };
  },
});
