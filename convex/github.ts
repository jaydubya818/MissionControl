import { v } from "convex/values";
import { mutation, query, action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "./lib/companyAccess";

/**
 * GitHub Integration
 * 
 * Syncs GitHub issues as Mission Control tasks via the INBOX invariant:
 * - All tasks created from GitHub land in INBOX (never DONE/IN_PROGRESS).
 * - GitHub issue state is tracked separately in metadata.githubState.
 * - Issue idempotency is scoped to the workspace, with legacy key adoption.
 * - Task types are mapped to valid schema values only.
 * - All task creation goes through api.tasks.create.
 */

// ============================================================================
// HELPERS
// ============================================================================

/** Build a deterministic idempotency key for a GitHub issue */
function githubIdempotencyKey(projectId: Id<"projects">, repoOwner: string, repoName: string, issueNumber: number): string {
  return `github:${projectId}:${repoOwner}/${repoName}#${issueNumber}`;
}

type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
};

async function requireGitHubIdentity(ctx: Pick<QueryCtx, "auth">) {
  if (!await ctx.auth.getUserIdentity()) throw new Error("Authentication is required for GitHub integration.");
}

async function requireGitHubWorkspace(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, write = false) {
  await requireGitHubIdentity(ctx);
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) throw new Error("Workspace is unavailable or unauthorized.");
  return requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission: write ? COMPANY_PERMISSIONS.UPDATE_DELIVERY : undefined,
  });
}

async function requireGitHubTask(ctx: QueryCtx | MutationCtx, taskId: Id<"tasks">) {
  await requireGitHubIdentity(ctx);
  const task = await ctx.db.get(taskId);
  if (!task?.projectId) throw new Error("Task is unavailable or unauthorized.");
  await requireGitHubWorkspace(ctx, task.projectId, true);
  return task;
}

function githubRepository(owner: string, name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner)
    || !/^[a-zA-Z0-9_.-]{1,100}$/.test(name) || name === "." || name === "..") {
    throw new Error("Invalid GitHub repository.");
  }
  return { owner: owner.toLowerCase(), name: name.toLowerCase(), url: `https://github.com/${owner.toLowerCase()}/${name.toLowerCase()}` };
}

function githubRepositoryUrl(value: string) {
  const url = new URL(value);
  const parts = url.pathname.replace(/\/$/, "").split("/");
  if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash || parts.length !== 3) {
    throw new Error("Invalid GitHub repository URL.");
  }
  return githubRepository(parts[1], parts[2]).url;
}

function requireIssueNumber(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid GitHub issue or pull request number.");
}

function githubIssuePage(value: unknown): GitHubIssue[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid GitHub issue page.");
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid GitHub issue response.");
    const row = item as Record<string, unknown>;
    if (row.pull_request) return [];
    if (typeof row.number !== "number" || typeof row.title !== "string"
      || (row.state !== "open" && row.state !== "closed")
      || (row.body != null && typeof row.body !== "string") || !Array.isArray(row.labels)) {
      throw new Error("Invalid GitHub issue response.");
    }
    requireIssueNumber(row.number);
    const labels = row.labels.map((label: unknown) => {
      if (typeof label === "string") return label;
      if (label && typeof label === "object" && "name" in label && typeof label.name === "string") return label.name;
      throw new Error("Invalid GitHub issue labels.");
    });
    return [{ number: row.number, title: row.title, body: typeof row.body === "string" ? row.body : "", state: row.state, labels }];
  });
}

function nextGitHubIssuePage(header: string | null, currentUrl: string, issuesPath: string): string | null {
  if (!header) return null;
  let next: string | null = null;
  for (const part of header.split(/,\s*(?=<)/)) {
    const link = /^\s*<([^>]+)>(.*)$/.exec(part);
    const relation = link?.[2].match(/;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    if (!link || !relation) throw new Error("Invalid GitHub pagination link.");
    if (!(relation[1] ?? relation[2]).split(/\s+/).includes("next")) continue;
    if (next) throw new Error("Ambiguous GitHub pagination links.");
    let url: URL;
    try { url = new URL(link[1]); } catch { throw new Error("Invalid GitHub pagination URL."); }
    const pageText = url.searchParams.get("page");
    const page = Number(pageText);
    const currentPage = Number(new URL(currentUrl).searchParams.get("page") ?? 1);
    const keys = [...url.searchParams.keys()];
    const issuePath = url.pathname.toLowerCase() === issuesPath || /^\/repositories\/[1-9]\d*\/issues$/.test(url.pathname);
    if (url.origin !== "https://api.github.com" || url.username || url.password || url.hash
      || !issuePath || (url.searchParams.has("state") && url.searchParams.get("state") !== "all")
      || (url.searchParams.has("per_page") && url.searchParams.get("per_page") !== "100")
      || !Number.isSafeInteger(page) || pageText !== String(page) || page !== currentPage + 1
      || new Set(keys).size !== keys.length || keys.some(key => !["state", "per_page", "page"].includes(key))) {
      throw new Error("Unsafe or incomplete GitHub pagination URL.");
    }
    next = `https://api.github.com${issuesPath}?state=all&per_page=100&page=${page}`;
  }
  return next;
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
  handler: async (ctx, args) => {
    await requireGitHubWorkspace(ctx, args.projectId);
    // TODO: Implement when githubSync table is added to schema
    return null;
  },
});

export const listGitHubLinkedTasks = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireGitHubWorkspace(ctx, args.projectId);
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

export const authorizeGitHubProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireGitHubWorkspace(ctx, args.projectId, true);
    return null;
  },
});

export const authorizeGitHubIssueUpdate = internalQuery({
  args: { taskId: v.id("tasks"), repoOwner: v.string(), repoName: v.string(), issueNumber: v.number() },
  handler: async (ctx, args) => {
    const task = await requireGitHubTask(ctx, args.taskId);
    const repository = githubRepository(args.repoOwner, args.repoName);
    requireIssueNumber(args.issueNumber);
    const metadata = task.metadata as Record<string, unknown> | undefined;
    if (task.source !== "GITHUB" || metadata?.githubIssueNumber !== args.issueNumber
      || typeof metadata.githubRepoUrl !== "string" || githubRepositoryUrl(metadata.githubRepoUrl) !== repository.url) {
      throw new Error("The task is not linked to the requested GitHub issue.");
    }
    return null;
  },
});

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
    const task = await requireGitHubTask(ctx, args.taskId);
    const repoUrl = githubRepositoryUrl(args.repoUrl);
    requireIssueNumber(args.issueNumber);
    
    // Store GitHub link in metadata
    const existingMeta = (task.metadata as Record<string, any>) ?? {};
    await ctx.db.patch(args.taskId, {
      source: "GITHUB",
      sourceRef: `${repoUrl}#${args.issueNumber}`,
      metadata: {
        ...existingMeta,
        githubIssueNumber: args.issueNumber,
        githubRepoUrl: repoUrl,
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
    const task = await requireGitHubTask(ctx, args.taskId);
    const repoUrl = githubRepositoryUrl(args.repoUrl);
    requireIssueNumber(args.prNumber);
    
    const existingMeta = (task.metadata as Record<string, any>) ?? {};
    await ctx.db.patch(args.taskId, {
      metadata: {
        ...existingMeta,
        githubPrNumber: args.prNumber,
        githubBranch: args.branch,
        githubPrRepoUrl: repoUrl,
        ...(existingMeta.githubIssueNumber == null ? { githubRepoUrl: repoUrl } : {}),
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
    await requireGitHubWorkspace(ctx, args.projectId, true);
    const repository = githubRepository(args.repoOwner, args.repoName);
    requireIssueNumber(args.issue.number);
    const idemKey = githubIdempotencyKey(args.projectId, repository.owner, repository.name, args.issue.number);
    const repoUrl = repository.url;
    const sourceRef = `${repository.owner}/${repository.name}#${args.issue.number}`;
    
    // Check if task already exists via idempotency key
    let existing = await ctx.db
      .query("tasks")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idemKey))
      .first();
    if (!existing) {
      const legacyKeys = new Set([
        `github:${args.repoOwner}/${args.repoName}#${args.issue.number}`,
        `github:${repository.owner}/${repository.name}#${args.issue.number}`,
      ]);
      for (const key of legacyKeys) {
        const legacy = await ctx.db.query("tasks")
          .withIndex("by_idempotency", q => q.eq("idempotencyKey", key))
          .filter(q => q.eq(q.field("projectId"), args.projectId))
          .first();
        if (legacy?.source === "GITHUB") { existing = legacy; break; }
      }
    }
    
    if (existing) {
      if (existing.projectId !== args.projectId || existing.source !== "GITHUB") throw new Error("Imported task is unavailable or unauthorized.");
      // ── UPDATE existing task (title, description, metadata) ──
      // NEVER change task.status from GitHub events
      const existingMeta = (existing.metadata as Record<string, any>) ?? {};
      await ctx.db.patch(existing._id, {
        idempotencyKey: idemKey,
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
        projectId: existing.projectId,
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
    
    if (!result.task?._id || result.task.projectId !== args.projectId) throw new Error("Imported task is unavailable or unauthorized.");
    return { taskId: result.task._id, created: result.created };
  },
});

// ============================================================================
// ACTIONS (External API Calls)
// ============================================================================

/**
 * Sync GitHub issues within the bounded pagination limit.
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
    await requireGitHubIdentity(ctx);
    await ctx.runQuery(internal.github.authorizeGitHubProject, { projectId: args.projectId });
    // Authorization: this action spends the deployment's provider budget, and a
    // Convex `action` export is callable by anyone holding the deployment URL —
    // which ships to every browser as VITE_CONVEX_URL. Resolve a real operator
    // before spending, and rate-limit on that server-derived identity.
    const access = await ctx.runQuery(internal.companyContext.assertAuthenticated, {});
    const budget = await ctx.runMutation(internal.companyContext.consumeProviderBudget, {
      operation: "github.syncIssues",
      actorId: access.actorId,
    });
    if (!budget.allowed) throw new Error(budget.message);

    const repository = githubRepository(args.repoOwner, args.repoName);
    const issuesPath = `/repos/${repository.owner}/${repository.name}/issues`;
    let url: string | null = `https://api.github.com${issuesPath}?state=all&per_page=100`;
    const realIssues: GitHubIssue[] = [];
    let pagesFetched = 0;
    const maxPages = 10;
    while (url) {
      if (pagesFetched === maxPages) throw new Error(`GitHub pagination limit of ${maxPages} pages exceeded; sync is incomplete and no issues were imported.`);
      const response = await fetch(url, {
        redirect: "error",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      realIssues.push(...githubIssuePage(await response.json()));
      pagesFetched++;
      url = nextGitHubIssuePage(response.headers.get("link"), url, issuesPath);
    }
    
    let created = 0;
    let updated = 0;
    
    for (const issue of realIssues) {
      const result = await ctx.runMutation(api.github.upsertTaskFromIssue, {
        projectId: args.projectId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        issue,
      });
      
      if (result.created) created++;
      else updated++;
    }
    
    return { 
      success: true, 
      issuesFound: realIssues.length, 
      tasksCreated: created,
      tasksUpdated: updated,
      pagesFetched,
    };
  },
});

/**
 * Replay GitHub issue data as an authenticated workspace operator.
 * This is not the signed external webhook ingress.
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
    await requireGitHubIdentity(ctx);
    await ctx.runQuery(internal.github.authorizeGitHubProject, { projectId: args.projectId });
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
  handler: async (ctx, args) => {
    await requireGitHubIdentity(ctx);
    await ctx.runQuery(internal.github.authorizeGitHubIssueUpdate, {
      taskId: args.taskId, repoOwner: args.repoOwner, repoName: args.repoName, issueNumber: args.issueNumber,
    });
    // Authorization: this action spends the deployment's provider budget, and a
    // Convex `action` export is callable by anyone holding the deployment URL —
    // which ships to every browser as VITE_CONVEX_URL. Resolve a real operator
    // before spending, and rate-limit on that server-derived identity.
    const access = await ctx.runQuery(internal.companyContext.assertAuthenticated, {});
    const budget = await ctx.runMutation(internal.companyContext.consumeProviderBudget, {
      operation: "github.updateIssueStatus",
      actorId: access.actorId,
    });
    if (!budget.allowed) throw new Error(budget.message);

    const repository = githubRepository(args.repoOwner, args.repoName);
    const response = await fetch(
      `https://api.github.com/repos/${repository.owner}/${repository.name}/issues/${args.issueNumber}`,
      {
        method: "PATCH",
        redirect: "error",
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
