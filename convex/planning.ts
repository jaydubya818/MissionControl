/**
 * Planning — AI Task Planning Q&A
 *
 * Generate clarifying questions for a task, then produce a work plan from answers.
 * Submit plan attaches workPlan + planningQa to task and transitions INBOX -> READY.
 */

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveAgentRef } from "./lib/agentResolver";
import { preferInstanceRefs } from "./lib/armCompat";

// ============================================================================
// QUERIES
// ============================================================================

export const getTaskForPlanning = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Attach work plan and Q&A to task, then transition INBOX -> READY.
 * If assigneeIds is provided, patches task with assignees first.
 */
export const submitPlan = mutation({
  args: {
    taskId: v.id("tasks"),
    workPlan: v.object({
      bullets: v.array(v.string()),
      estimatedCost: v.optional(v.number()),
      estimatedDuration: v.optional(v.string()),
    }),
    planningQa: v.array(v.object({
      question: v.string(),
      answer: v.string(),
    })),
    assigneeIds: v.optional(v.array(v.id("agents"))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.status !== "INBOX") {
      throw new Error("Only INBOX tasks can be planned and assigned");
    }

    let resolvedIds: Id<"agents">[];
    if (args.assigneeIds && args.assigneeIds.length > 0) {
      resolvedIds = args.assigneeIds;
    } else {
      const list = task.projectId
        ? await ctx.db
            .query("agents")
            .withIndex("by_project_status", (q) =>
              q.eq("projectId", task.projectId).eq("status", "ACTIVE")
            )
            .take(5)
        : await ctx.db
            .query("agents")
            .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
            .take(5);
      resolvedIds = list.slice(0, 1).map((a) => a._id);
    }

    const resolved = await Promise.all(
      resolvedIds.map((agentId) =>
        resolveAgentRef(
          { db: ctx.db as any },
          { agentId, createIfMissing: true }
        )
      )
    );
    const assigneeInstanceIds = resolved
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => r.instanceId);

    await ctx.db.patch(args.taskId, {
      workPlan: args.workPlan,
      planningQa: args.planningQa,
      assigneeIds: resolvedIds,
      ...(preferInstanceRefs() && assigneeInstanceIds.length > 0
        ? { assigneeInstanceIds }
        : {}),
    });

    await ctx.runMutation(api.tasks.transition, {
      taskId: args.taskId,
      toStatus: "READY",
      actorType: "HUMAN",
      actorUserId: "operator",
      idempotencyKey: args.idempotencyKey,
      reason: "Plan submitted from AI Planning",
      workPlan: args.workPlan,
    });

    return { success: true, taskId: args.taskId };
  },
});

// ============================================================================
// ACTIONS (LLM)
// ============================================================================

/**
 * Generate 3–5 clarifying questions for the task based on title, description, type.
 * Uses OPENAI_API_KEY from Convex env when set; otherwise returns default questions.
 */
export const generateQuestions = action({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
  },
  handler: async (ctx, args): Promise<{ questions: string[] }> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const prompt = `You are helping clarify a task before an AI agent works on it. Given this task, generate 3 to 5 short clarifying questions that will help create a precise work plan. One question per line. No numbering. Be concise.

TASK TYPE: ${args.type}
TITLE: ${args.title}
${args.description ? `DESCRIPTION: ${args.description}` : ""}

Output only the questions, one per line:`;

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
            temperature: 0.3,
            max_tokens: 500,
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
        const questions = text
          .split("\n")
          .map((q) => q.replace(/^\d+[.)]\s*/, "").trim())
          .filter((q) => q.length > 0)
          .slice(0, 5);
        return { questions: questions.length ? questions : getDefaultQuestions(args.type) };
      } catch (e) {
        return {
          questions: getDefaultQuestions(args.type),
        };
      }
    }
    return { questions: getDefaultQuestions(args.type) };
  },
});

/**
 * Generate a structured work plan from task context and Q&A answers.
 */
export const generatePlanFromAnswers = action({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    answers: v.array(v.object({ question: v.string(), answer: v.string() })),
  },
  handler: async (ctx, args): Promise<{
    bullets: string[];
    estimatedCost?: number;
    estimatedDuration?: string;
  }> => {
    const apiKey = process.env.OPENAI_API_KEY;
    const qaBlock = args.answers
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join("\n\n");

    const defaultPlan = {
      bullets: [
        "Review requirements and context",
        "Execute main deliverables",
        "Self-review and submit for review",
      ],
      estimatedCost: 0.5,
      estimatedDuration: "1–2 hours",
    };

    if (apiKey) {
      const prompt = `You are creating a work plan for an AI agent task. Based on the task and the Q&A, output a JSON object with:
- "bullets": array of 3–7 short actionable steps (strings)
- "estimatedCost": number in USD (e.g. 0.5)
- "estimatedDuration": string (e.g. "30 min" or "1–2 hours")

TASK: ${args.title}
TYPE: ${args.type}
${args.description ? `DESCRIPTION: ${args.description}` : ""}

Q&A:
${qaBlock}

Respond with valid JSON only, no markdown:`;

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
            max_tokens: 800,
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
        const parsed = JSON.parse(text) as {
          bullets?: string[];
          estimatedCost?: number;
          estimatedDuration?: string;
        };
        const bullets = Array.isArray(parsed.bullets)
          ? parsed.bullets.map((b) => String(b).slice(0, 300))
          : defaultPlan.bullets;
        const estimatedCost =
          typeof parsed.estimatedCost === "number" ? parsed.estimatedCost : defaultPlan.estimatedCost;
        const estimatedDuration =
          typeof parsed.estimatedDuration === "string"
            ? parsed.estimatedDuration.slice(0, 100)
            : defaultPlan.estimatedDuration;
        return { bullets, estimatedCost, estimatedDuration };
      } catch {
        return defaultPlan;
      }
    }
    return defaultPlan;
  },
});

function getDefaultQuestions(type: string): string[] {
  return [
    "What is the main deliverable or outcome?",
    "Are there any constraints (time, format, tools)?",
    "Who or what system will consume the output?",
  ];
}
