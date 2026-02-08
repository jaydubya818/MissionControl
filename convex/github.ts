import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

/**
 * GitHub Integration
 * 
 * Syncs GitHub issues as Mission Control tasks via the INBOX invariant:
 * - All tasks created from GitHub land in INBOX (never DONE/IN_PROGRESS).
 * - GitHub issue state is tracked separately in metadata.githubState.
 * - Idempotency is enforced via deterministic keys: `github:{owner}/{repo}#{number}`.
 * - Task types are mapped to valid schema values only.
 * - All task creation goes through api.tasks.create.
 */

// ============================================================================
// HELPERS
// ============================================================================

/** Build a deterministic idempotency key for a GitHub issue */
function githubIdempotencyKey(repoOwner: string, repoName: string, issueNumber: number): string {
  return `github:${repoOwner}/${repoName}#${issueNumber}`;
}

/** Map GitHub labels to a valid TaskType */
function mapLabelsToTaskType(labels: string[]): string {
  const lower = labels.map(l => l.toLowerCase());
  if (lower.some(l => l.includes("bug") || l.includes("fix"))) return "ENGINEERING";
  if (lower.some(l => l.includes("feature") || l.includes("enhancement"))) return "ENGINEERING";
  if (lower.some(l => l.includes("docs") || l.includes("documentation"))) return "DOCS";
  if (lower.some(l => l.includes("content") || l.includes("blog"))) return "CONTENT";
  if (lower.some(l => l.includes("ops") || l.includes("infra") || l.includes("devops"))) return "OPS";
  if (lower.some(l => l.includes("research"))) return "CUSTOMER_RESEARCH";
  return "ENGINEERING"; // safe default
}

/** Map GitHub labels to task priority */
function mapLabelsToPriority(labels: string[]): number {
  const lower = labels.map(l => l.toLowerCase());
  if (lower.some(l => l.includes("critical") || l.includes("p0"))) return 1;
  if (lower.some(l => l.includes("high") || l.includes("p1"))) return 2;
  if (lower.some(l => l.includes("low") || l.includes("p3"))) return 4;
  return 3; // normal
}

// ============================================================================
// QUERIES
// ============================================================================

export const getGitHubConfig = query({
  args: { projectId: v.id("projects") },
  handler: async (_ctx, _args) => {
    // TODO: Implement when githubSync table is added to schema
    return null;
  },
});

export const listGitHubLinkedTasks = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    return tasks.filter(t => t.source === "GITHUB");
  },
});

// ============================================================================
// INTERNAL QUERIES (used by actions)
// ============================================================================

/** Find an existing task by its GitHub idempotency key */
export const findTaskByIdempotencyKey = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
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
    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, error: "Task not found" };
    
    // Store GitHub link in metadata
    const existingMeta = (task.metadata as Record<string, any>) ?? {};
    await ctx.db.patch(args.taskId, {
      source: "GITHUB",
      sourceRef: `${args.repoUrl}#${args.issueNumber}`,
      metadata: {
        ...existingMeta,
        githubIssueNumber: args.issueNumber,
        githubRepoUrl: args.repoUrl,
      },
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      taskId: args.taskId,
      actorType: "SYSTEM",
      action: "GITHUB_LINKED",
      description: `Linked to GitHub issue #${args.issueNumber}`,
      targetType: "TASK",
      targetId: args.taskId,
    });
    
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
    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, error: "Task not found" };
    
    const existingMeta = (task.metadata as Record<string, any>) ?? {};
    await ctx.db.patch(args.taskId, {
      metadata: {
        ...existingMeta,
        githubPrNumber: args.prNumber,
        githubBranch: args.branch,
        githubRepoUrl: args.repoUrl,
      },
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      taskId: args.taskId,
      actorType: "SYSTEM",
      action: "GITHUB_PR_LINKED",
      description: `Linked to PR #${args.prNumber} (${args.branch})`,
      targetType: "TASK",
      targetId: args.taskId,
    });
    
    return { success: true };
  },
});

/**
 * Upsert a task from a GitHub issue.
 * - Creates via api.tasks.create if new (lands in INBOX).
 * - Updates title/description/metadata if existing (does NOT change status).
 * - Tracks GitHub state separately in metadata.githubState.
 */
export const upsertTaskFromIssue = mutation({
  args: {
    projectId: v.id("projects"),
    repoOwner: v.string(),
    repoName: v.string(),
    issue: v.object({
      number: v.number(),
      title: v.string(),
      body: v.string(),
      state: v.string(),       // "open" | "closed"
      labels: v.array(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<{ taskId: any; created: boolean }> => {
    const idemKey = githubIdempotencyKey(args.repoOwner, args.repoName, args.issue.number);
    const repoUrl = `https://github.com/${args.repoOwner}/${args.repoName}`;
    const sourceRef = `${args.repoOwner}/${args.repoName}#${args.issue.number}`;
    
    // Check if task already exists via idempotency key
    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idemKey))
      .first();
    
    if (existing) {
      // ── UPDATE existing task (title, description, metadata) ──
      // NEVER change task.status from GitHub events
      const existingMeta = (existing.metadata as Record<string, any>) ?? {};
      await ctx.db.patch(existing._id, {
        title: `[GH-${args.issue.number}] ${args.issue.title}`,
        description: args.issue.body || existing.description,
        labels: args.issue.labels.length > 0 ? args.issue.labels : existing.labels,
        metadata: {
          ...existingMeta,
          githubState: args.issue.state,
          githubIssueNumber: args.issue.number,
          githubRepoUrl: repoUrl,
          githubLastSyncAt: Date.now(),
        },
      });
      
      // Log the sync
      await ctx.db.insert("activities", {
        projectId: args.projectId,
        taskId: existing._id,
        actorType: "SYSTEM",
        action: "GITHUB_SYNCED",
        description: `Synced from GitHub issue #${args.issue.number} (${args.issue.state})`,
        targetType: "TASK",
        targetId: existing._id,
      });
      
      return { taskId: existing._id, created: false };
    }
    
    // ── CREATE new task via api.tasks.create (enforces INBOX invariant) ──
    const result: any = await ctx.runMutation(api.tasks.create, {
      projectId: args.projectId,
      title: `[GH-${args.issue.number}] ${args.issue.title}`,
      description: args.issue.body,
      type: mapLabelsToTaskType(args.issue.labels),
      priority: mapLabelsToPriority(args.issue.labels),
      labels: args.issue.labels,
      idempotencyKey: idemKey,
      source: "GITHUB",
      sourceRef,
      createdBy: "SYSTEM",
      metadata: {
        githubState: args.issue.state,
        githubIssueNumber: args.issue.number,
        githubRepoUrl: repoUrl,
        githubLastSyncAt: Date.now(),
      },
    });
    
    return { taskId: result.task?._id, created: true };
  },
});

// ============================================================================
// ACTIONS (External API Calls)
// ============================================================================

/**
 * Sync all open issues from a GitHub repo.
 * Uses upsertTaskFromIssue for each issue — idempotent, safe to re-run.
 */
export const syncGitHubIssues = action({
  args: {
    projectId: v.id("projects"),
    repoOwner: v.string(),
    repoName: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch issues from GitHub API (open + recently closed)
    const response = await fetch(
      `https://api.github.com/repos/${args.repoOwner}/${args.repoName}/issues?state=all&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const issues = await response.json();
    
    // Filter out pull requests (GitHub API returns PRs in /issues)
    const realIssues = issues.filter((i: any) => !i.pull_request);
    
    let created = 0;
    let updated = 0;
    
    for (const issue of realIssues) {
      const result = await ctx.runMutation(api.github.upsertTaskFromIssue, {
        projectId: args.projectId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        issue: {
          number: issue.number,
          title: issue.title,
          body: issue.body || "",
          state: issue.state,
          labels: issue.labels.map((l: any) => l.name),
        },
      });
      
      if (result.created) created++;
      else updated++;
    }
    
    return { 
      success: true, 
      issuesFound: realIssues.length, 
      tasksCreated: created,
      tasksUpdated: updated,
    };
  },
});

/**
 * Handle a GitHub webhook event for issues.
 * Called by an HTTP endpoint (or Convex httpAction) when GitHub sends a webhook.
 * Supports: opened, edited, closed, reopened, labeled, unlabeled.
 */
export const handleIssueWebhook = action({
  args: {
    projectId: v.id("projects"),
    repoOwner: v.string(),
    repoName: v.string(),
    action: v.string(),  // "opened" | "edited" | "closed" | "reopened" | "labeled" | "unlabeled"
    issue: v.object({
      number: v.number(),
      title: v.string(),
      body: v.optional(v.string()),
      state: v.string(),
      labels: v.array(v.object({
        name: v.string(),
      })),
    }),
  },
  handler: async (ctx, args): Promise<{ success: boolean; action: string; taskId: any; created: boolean }> => {
    const labelNames = args.issue.labels.map(l => l.name);
    
    // All webhook events go through upsert — it handles create-or-update
    const result: any = await ctx.runMutation(api.github.upsertTaskFromIssue, {
      projectId: args.projectId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      issue: {
        number: args.issue.number,
        title: args.issue.title,
        body: args.issue.body ?? "",
        state: args.issue.state,
        labels: labelNames,
      },
    });
    
    return {
      success: true,
      action: args.action,
      taskId: result.taskId,
      created: result.created,
    };
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
  handler: async (_ctx, args) => {
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
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    return { success: true };
  },
});
