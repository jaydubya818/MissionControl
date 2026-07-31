/**
 * PRD — Convex Functions
 *
 * PRD Import Pipeline: parse markdown PRDs into structured tasks, store documents, bulk create.
 */

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { logTaskEvent } from "./lib/taskEvents";
import {
  fingerprintPrdContent,
  normalizePrdContent,
  parsePrdHeuristically,
  PRD_TASK_TYPES,
  type ParsedPrdTask,
} from "./lib/prdParser";

export type ParsedTaskPreview = ParsedPrdTask;

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a stored PRD document by ID.
 */
export const getPrdDocument = query({
  args: { id: v.id("prdDocuments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Store raw PRD markdown in prdDocuments for reference and sourceRef linking.
 */
export const storePrdDocument = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    content: v.string(),
    taskCount: v.number(),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = normalizePrdContent(args.content);
    const contentHash = fingerprintPrdContent(content);
    const matchingHashes = await ctx.db
      .query("prdDocuments")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
      .collect();
    const existingByHash = matchingHashes.find(
      (document) =>
        document.projectId === args.projectId &&
        normalizePrdContent(document.content) === content
    );

    if (existingByHash) {
      return { prdDocumentId: existingByHash._id, created: false };
    }

    const projectDocuments = args.projectId
      ? await ctx.db
          .query("prdDocuments")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("prdDocuments").collect();
    const existingLegacyDocument = projectDocuments.find(
      (document) =>
        document.projectId === args.projectId &&
        normalizePrdContent(document.content) === content
    );

    if (existingLegacyDocument) {
      if (!existingLegacyDocument.contentHash) {
        await ctx.db.patch(existingLegacyDocument._id, { contentHash });
      }
      return { prdDocumentId: existingLegacyDocument._id, created: false };
    }

    const id = await ctx.db.insert("prdDocuments", {
      projectId: args.projectId,
      title: args.title,
      content,
      contentHash,
      taskCount: args.taskCount,
      parsedAt: Date.now(),
      createdBy: args.createdBy,
    });
    return { prdDocumentId: id, created: true };
  },
});

/**
 * Bulk create tasks from parsed PRD list. Each task gets source PRD_IMPORT and sourceRef = prdDocumentId.
 * Creates taskDependencies for dependencyIndices when provided.
 */
export const bulkCreateFromPrd = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    prdDocumentId: v.id("prdDocuments"),
    tasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        type: v.string(),
        priority: v.number(),
        dependencyIndices: v.optional(v.array(v.number())),
      })
    ),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.prdDocumentId);
    if (!doc) throw new Error("PRD document not found");

    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    const tenantId = project ? (project as { tenantId?: Id<"tenants"> }).tenantId : undefined;
    const sourceRef = args.prdDocumentId;
    const createdBy = (args.createdBy as "HUMAN" | "AGENT" | "SYSTEM") ?? "SYSTEM";
    const createdIds: Id<"tasks">[] = [];
    let createdCount = 0;

    for (let i = 0; i < args.tasks.length; i++) {
      const t = args.tasks[i];
      const idempotencyKey = `prd:${args.prdDocumentId}:${i}`;
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
        .first();
      if (existing) {
        createdIds.push(existing._id);
        continue;
      }

      const priority = Math.min(4, Math.max(1, t.priority)) as 1 | 2 | 3 | 4;
      const type = PRD_TASK_TYPES.includes(t.type as (typeof PRD_TASK_TYPES)[number])
        ? (t.type as (typeof PRD_TASK_TYPES)[number])
        : "ENGINEERING";

      const taskId = await ctx.db.insert("tasks", {
        tenantId,
        projectId: args.projectId,
        title: t.title.slice(0, 500),
        description: t.description?.slice(0, 5000),
        type,
        status: "INBOX",
        stateEnteredAt: Date.now(),
        priority,
        assigneeIds: [],
        reviewCycles: 0,
        actualCost: 0,
        idempotencyKey,
        source: "PRD_IMPORT",
        sourceRef,
        createdBy,
        metadata: { prdDocumentId: args.prdDocumentId, index: i },
      });
      createdIds.push(taskId);
      createdCount++;

      await ctx.db.insert("activities", {
        projectId: args.projectId,
        actorType: createdBy,
        action: "TASK_CREATED",
        description: `Task "${t.title.slice(0, 50)}" created via PRD_IMPORT`,
        targetType: "TASK",
        targetId: taskId,
        taskId,
      });
      await logTaskEvent(ctx, {
        taskId,
        projectId: args.projectId,
        eventType: "TASK_CREATED",
        actorType: createdBy,
        relatedId: taskId,
        afterState: { status: "INBOX", title: t.title, type, priority },
        metadata: { source: "PRD_IMPORT", sourceRef },
      });
    }

    const batchParentId = createdIds[0] ?? undefined;
    const existingDependencies = batchParentId
      ? await ctx.db
          .query("taskDependencies")
          .withIndex("by_parent", (q) => q.eq("parentTaskId", batchParentId))
          .collect()
      : [];
    const dependencyKeys = new Set(
      existingDependencies.map(
        (dependency) => `${dependency.taskId}:${dependency.dependsOnTaskId}`
      )
    );

    for (let i = 0; i < args.tasks.length; i++) {
      const deps = args.tasks[i].dependencyIndices;
      if (!deps?.length || !createdIds[i]) continue;
      const taskId = createdIds[i];
      for (const depIdx of deps) {
        if (depIdx >= 0 && depIdx < createdIds.length && createdIds[depIdx]) {
          const dependsOnTaskId = createdIds[depIdx];
          const dependencyKey = `${taskId}:${dependsOnTaskId}`;
          if (dependencyKeys.has(dependencyKey)) continue;
          await ctx.db.insert("taskDependencies", {
            parentTaskId: batchParentId ?? dependsOnTaskId,
            taskId,
            dependsOnTaskId,
          });
          dependencyKeys.add(dependencyKey);
        }
      }
    }

    return { createdCount, taskIds: createdIds };
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Parse PRD markdown with LLM and return structured task previews.
 * Uses OPENAI_API_KEY from Convex env when set; otherwise returns heuristic extraction.
 */
export const parsePrd = action({
  args: {
    content: v.string(),
    maxTasks: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ tasks: ParsedTaskPreview[] }> => {
    const maxTasks = args.maxTasks ?? 20;
    const content = args.content.trim();
    if (!content) return { tasks: [] };

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const prompt = `You are parsing a Product Requirements Document (PRD) into discrete, actionable tasks for an orchestration system.

TASK TYPES (use exactly one per task): ENGINEERING, CONTENT, DOCS, OPS, SOCIAL, EMAIL_MARKETING, CUSTOMER_RESEARCH, SEO_RESEARCH
PRIORITY: 1 = critical, 2 = high, 3 = normal, 4 = low. Base on dependency order and criticality.
DEPENDENCIES: For each task, list 0-based indices of tasks that must be completed before this one (optional).

Extract up to ${maxTasks} concrete tasks. Each task must have:
- title: short, actionable (max 80 chars)
- description: 1-3 sentences (optional)
- type: one of the TASK TYPES above
- priority: 1, 2, 3, or 4
- dependencyIndices: optional array of task indices this task depends on

Respond with valid JSON only, no markdown or explanation:
{"tasks":[{"title":"...","description":"...","type":"ENGINEERING","priority":2,"dependencyIndices":[0]}]}

PRD content:
---
${content.slice(0, 28000)}
---`;

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 4096,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`OpenAI API error: ${res.status} ${err}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("Empty response from OpenAI");

        const parsed = JSON.parse(text) as { tasks?: ParsedTaskPreview[] };
        const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
        const normalized = tasks.slice(0, maxTasks).map((t) => ({
          title: String(t.title ?? "").slice(0, 200),
          description: t.description ? String(t.description).slice(0, 2000) : undefined,
          type: PRD_TASK_TYPES.includes(t.type as (typeof PRD_TASK_TYPES)[number]) ? t.type : "ENGINEERING",
          priority: Math.min(4, Math.max(1, Number(t.priority) || 3)) as 1 | 2 | 3 | 4,
          dependencyIndices: Array.isArray(t.dependencyIndices)
            ? t.dependencyIndices.filter((i) => typeof i === "number" && i >= 0)
            : undefined,
        }));
        return { tasks: normalized };
      } catch (e) {
        throw new Error(
          `PRD parsing failed: ${e instanceof Error ? e.message : String(e)}. Ensure OPENAI_API_KEY is set in Convex dashboard.`
        );
      }
    }

    return { tasks: parsePrdHeuristically(content, maxTasks) };
  },
});
