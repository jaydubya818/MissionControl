import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Advanced Search System
 * 
 * Full-text search across tasks, comments, documents, and more
 * with filters, saved searches, and search history.
 */

// ============================================================================
// SCHEMA ADDITIONS NEEDED:
// ============================================================================
// New table: searchHistory
// - userId: v.string()
// - projectId: v.optional(v.id("projects"))
// - query: v.string()
// - filters: v.any()
// - resultCount: v.number()
// - searchedAt: v.number()
//
// New table: savedSearches
// - userId: v.string()
// - projectId: v.optional(v.id("projects"))
// - name: v.string()
// - query: v.string()
// - filters: v.any()
// - createdAt: v.number()

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
    const query = args.query.toLowerCase();
    
    // Search tasks
    let tasksQuery = ctx.db.query("tasks");
    if (args.projectId) {
      tasksQuery = tasksQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    
    let tasks = await tasksQuery.collect();
    
    // Filter by text search
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query)
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
    
    // Search messages
    let messagesQuery = ctx.db.query("messages");
    let messages = await messagesQuery.collect();
    messages = messages.filter(m => 
      m.body.toLowerCase().includes(query)
    );
    
    if (args.projectId) {
      // Filter messages by project through tasks
      const projectTaskIds = tasks.map(t => t._id);
      messages = messages.filter(m => 
        m.taskId && projectTaskIds.includes(m.taskId)
      );
    }
    
    // Search agents
    let agentsQuery = ctx.db.query("agents");
    if (args.projectId) {
      agentsQuery = agentsQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    let agents = await agentsQuery.collect();
    agents = agents.filter(a => 
      a.name.toLowerCase().includes(query) ||
      a.role.toLowerCase().includes(query)
    );
    
    // Search activities
    let activitiesQuery = ctx.db.query("activities");
    if (args.projectId) {
      activitiesQuery = activitiesQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    let activities = await activitiesQuery.collect();
    activities = activities.filter(a => 
      a.body.toLowerCase().includes(query)
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
    const query = args.query.toLowerCase();
    
    let tasksQuery = ctx.db.query("tasks");
    if (args.projectId) {
      tasksQuery = tasksQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    
    let tasks = await tasksQuery.collect();
    
    // Text search
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.type.toLowerCase().includes(query) ||
      t.status.toLowerCase().includes(query)
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
      const aTitle = a.title.toLowerCase().includes(query);
      const bTitle = b.title.toLowerCase().includes(query);
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
    const query = args.query.toLowerCase();
    
    // Quick search across tasks and agents only
    let tasksQuery = ctx.db.query("tasks");
    if (args.projectId) {
      tasksQuery = tasksQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    let tasks = await tasksQuery.collect();
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(query)
    ).slice(0, limit);
    
    let agentsQuery = ctx.db.query("agents");
    if (args.projectId) {
      agentsQuery = agentsQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    let agents = await agentsQuery.collect();
    agents = agents.filter(a => 
      a.name.toLowerCase().includes(query)
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
    const query = args.query.toLowerCase();
    const suggestions: string[] = [];
    
    // Get recent tasks for suggestions
    let tasksQuery = ctx.db.query("tasks");
    if (args.projectId) {
      tasksQuery = tasksQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    const tasks = await tasksQuery.collect();
    
    // Extract unique words from titles
    const words = new Set<string>();
    tasks.forEach(t => {
      t.title.toLowerCase().split(/\s+/).forEach(word => {
        if (word.length > 3 && word.startsWith(query)) {
          words.add(word);
        }
      });
    });
    
    // Add task types
    const types = ["ENGINEERING", "CONTENT", "RESEARCH", "REVIEW", "PLANNING"];
    types.forEach(type => {
      if (type.toLowerCase().startsWith(query)) {
        suggestions.push(type);
      }
    });
    
    // Add statuses
    const statuses = ["INBOX", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"];
    statuses.forEach(status => {
      if (status.toLowerCase().startsWith(query)) {
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
    let tasksQuery = ctx.db.query("tasks");
    if (args.projectId) {
      tasksQuery = tasksQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    const tasks = await tasksQuery.collect();
    
    // Extract unique values
    const statuses = [...new Set(tasks.map(t => t.status))];
    const types = [...new Set(tasks.map(t => t.type))];
    const priorities = [...new Set(tasks.map(t => t.priority))];
    
    // Get agents
    let agentsQuery = ctx.db.query("agents");
    if (args.projectId) {
      agentsQuery = agentsQuery.withIndex("by_project", (q) => 
        q.eq("projectId", args.projectId)
      );
    }
    const agents = await agentsQuery.collect();
    
    return {
      statuses,
      types,
      priorities: priorities.sort(),
      agents: agents.map(a => ({ id: a._id, name: a.name })),
    };
  },
});
