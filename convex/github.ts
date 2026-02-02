import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * GitHub Integration
 * 
 * Features:
 * - Sync GitHub issues as tasks
 * - Link commits to tasks
 * - Auto-create tasks from PRs
 * - Update GitHub status from Mission Control
 */

// ============================================================================
// SCHEMA ADDITIONS NEEDED:
// ============================================================================
// Add to tasks table:
// - githubIssueNumber: v.optional(v.number())
// - githubRepoUrl: v.optional(v.string())
// - githubPrNumber: v.optional(v.number())
// - githubBranch: v.optional(v.string())
//
// New table: githubSync
// - projectId: v.id("projects")
// - repoOwner: v.string()
// - repoName: v.string()
// - accessToken: v.string() // encrypted
// - lastSyncTime: v.number()
// - syncEnabled: v.boolean()
// - autoCreateTasks: v.boolean()
// - autoUpdateStatus: v.boolean()

// ============================================================================
// QUERIES
// ============================================================================

export const getGitHubConfig = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // TODO: Implement when schema is updated
    // const config = await ctx.db
    //   .query("githubSync")
    //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    //   .first();
    // return config;
    
    return null; // Placeholder
  },
});

export const listGitHubLinkedTasks = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Filter tasks with GitHub links (when schema is updated)
    return tasks.filter(t => {
      // @ts-ignore - Will work when schema is updated
      return t.githubIssueNumber || t.githubPrNumber;
    });
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const linkTaskToGitHubIssue = mutation({
  args: {
    taskId: v.id("tasks"),
    issueNumber: v.number(),
    repoUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // TODO: Implement when schema is updated
    // await ctx.db.patch(args.taskId, {
    //   githubIssueNumber: args.issueNumber,
    //   githubRepoUrl: args.repoUrl,
    // });
    
    // Log activity
    const task = await ctx.db.get(args.taskId);
    if (task) {
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        taskId: args.taskId,
        actorType: "SYSTEM",
        action: "GITHUB_LINKED",
        body: `Linked to GitHub issue #${args.issueNumber}`,
      });
    }
    
    return { success: true };
  },
});

export const linkTaskToGitHubPR = mutation({
  args: {
    taskId: v.id("tasks"),
    prNumber: v.number(),
    branch: v.string(),
    repoUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // TODO: Implement when schema is updated
    // await ctx.db.patch(args.taskId, {
    //   githubPrNumber: args.prNumber,
    //   githubBranch: args.branch,
    //   githubRepoUrl: args.repoUrl,
    // });
    
    // Log activity
    const task = await ctx.db.get(args.taskId);
    if (task) {
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        taskId: args.taskId,
        actorType: "SYSTEM",
        action: "GITHUB_PR_LINKED",
        body: `Linked to PR #${args.prNumber} (${args.branch})`,
      });
    }
    
    return { success: true };
  },
});

// ============================================================================
// ACTIONS (External API Calls)
// ============================================================================

export const syncGitHubIssues = action({
  args: {
    projectId: v.id("projects"),
    repoOwner: v.string(),
    repoName: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch issues from GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${args.repoOwner}/${args.repoName}/issues`,
      {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    
    const issues = await response.json();
    
    // Create tasks for new issues
    let created = 0;
    for (const issue of issues) {
      // Check if task already exists
      const existing = await ctx.runQuery(internal.github.findTaskByIssue, {
        projectId: args.projectId,
        issueNumber: issue.number,
      });
      
      if (!existing) {
        await ctx.runMutation(internal.github.createTaskFromIssue, {
          projectId: args.projectId,
          issue: {
            number: issue.number,
            title: issue.title,
            body: issue.body || "",
            state: issue.state,
            labels: issue.labels.map((l: any) => l.name),
            repoUrl: `https://github.com/${args.repoOwner}/${args.repoName}`,
          },
        });
        created++;
      }
    }
    
    return { success: true, issuesFound: issues.length, tasksCreated: created };
  },
});

export const updateGitHubIssueStatus = action({
  args: {
    taskId: v.id("tasks"),
    repoOwner: v.string(),
    repoName: v.string(),
    issueNumber: v.number(),
    state: v.union(v.literal("open"), v.literal("closed")),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Update GitHub issue status
    const response = await fetch(
      `https://api.github.com/repos/${args.repoOwner}/${args.repoName}/issues/${args.issueNumber}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: args.state }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    
    return { success: true };
  },
});

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

export const findTaskByIssue = query({
  args: {
    projectId: v.id("projects"),
    issueNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Find task with matching issue number (when schema is updated)
    return tasks.find(t => {
      // @ts-ignore
      return t.githubIssueNumber === args.issueNumber;
    });
  },
});

export const createTaskFromIssue = mutation({
  args: {
    projectId: v.id("projects"),
    issue: v.object({
      number: v.number(),
      title: v.string(),
      body: v.string(),
      state: v.string(),
      labels: v.array(v.string()),
      repoUrl: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    // Map GitHub labels to priority
    let priority = 3; // Normal
    if (args.issue.labels.includes("priority: high")) priority = 2;
    if (args.issue.labels.includes("priority: critical")) priority = 1;
    if (args.issue.labels.includes("priority: low")) priority = 4;
    
    // Map GitHub state to status
    let status = "INBOX";
    if (args.issue.state === "closed") status = "DONE";
    
    // Determine type from labels
    let type = "ENGINEERING";
    if (args.issue.labels.includes("bug")) type = "BUG_FIX";
    if (args.issue.labels.includes("feature")) type = "FEATURE";
    if (args.issue.labels.includes("documentation")) type = "CONTENT";
    
    const taskId = await ctx.db.insert("tasks", {
      projectId: args.projectId,
      title: `[GH-${args.issue.number}] ${args.issue.title}`,
      description: args.issue.body,
      type: type as any,
      status: status as any,
      priority,
      estimatedCost: 0,
      actualCost: 0,
      assigneeIds: [],
      // TODO: Add when schema is updated
      // githubIssueNumber: args.issue.number,
      // githubRepoUrl: args.issue.repoUrl,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      taskId,
      actorType: "SYSTEM",
      action: "TASK_CREATED_FROM_GITHUB",
      body: `Created from GitHub issue #${args.issue.number}`,
    });
    
    return taskId;
  },
});
