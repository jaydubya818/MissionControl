import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const CHAT_KIND = "MISSION_CONTROL_CHAT";

function classifyTaskType(content: string) {
  const lower = content.toLowerCase();
  if (/(research|compare|landscape|evidence|source)/.test(lower)) return "CUSTOMER_RESEARCH" as const;
  if (/(document|report|prd|spec|write)/.test(lower)) return "DOCS" as const;
  if (/(build|implement|fix|code|test|ui|bug)/.test(lower)) return "ENGINEERING" as const;
  return "OPS" as const;
}

function requestTitle(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 77)}…` : compact;
}

export const listThreads = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("telegraphThreads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 30);
    return threads.filter((thread) => thread.metadata?.kind === CHAT_KIND);
  },
});

export const getSession = query({
  args: { threadId: v.id("telegraphThreads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.metadata?.kind !== CHAT_KIND) return null;
    const messages = await ctx.db
      .query("telegraphMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(200);
    const task = thread.linkedTaskId ? await ctx.db.get(thread.linkedTaskId) : null;
    const workOrder = thread.linkedWorkOrderId
      ? await ctx.db.get(thread.linkedWorkOrderId)
      : null;
    const workflowRun = workOrder?.currentExecutionRunId
      ? await ctx.db.get(workOrder.currentExecutionRunId)
      : null;
    return { thread, messages, task, workOrder, workflowRun };
  },
});

export const submitRequest = mutation({
  args: {
    projectId: v.id("projects"),
    threadId: v.optional(v.id("telegraphThreads")),
    content: v.string(),
    actorId: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    created: boolean;
    threadId: Id<"telegraphThreads">;
    taskId?: Id<"tasks">;
    workOrderId?: Id<"workOrders">;
  }> => {
    const content = args.content.trim();
    if (!content) throw new Error("Message cannot be empty.");
    if (content.length > 20_000) throw new Error("Message is too long.");

    const existingMessage = await ctx.db
      .query("telegraphMessages")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existingMessage) {
      const thread = await ctx.db.get(existingMessage.threadId);
      return {
        created: false,
        threadId: existingMessage.threadId,
        taskId: thread?.linkedTaskId,
        workOrderId: thread?.linkedWorkOrderId,
      };
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Select a valid project before submitting work.");

    let thread = args.threadId ? await ctx.db.get(args.threadId) : null;
    if (thread) {
      if (thread.projectId !== args.projectId || thread.metadata?.kind !== CHAT_KIND) {
        throw new Error("Chat thread does not belong to the selected project.");
      }
    } else {
      const threadId = await ctx.db.insert("telegraphThreads", {
        tenantId: project.tenantId,
        projectId: args.projectId,
        title: requestTitle(content),
        participants: [args.actorId, "mission-control"],
        channel: "INTERNAL",
        lastMessageAt: Date.now(),
        messageCount: 0,
        metadata: { kind: CHAT_KIND, createdBy: args.actorId },
      });
      thread = await ctx.db.get(threadId);
    }
    if (!thread) throw new Error("Unable to create chat session.");

    await ctx.db.insert("telegraphMessages", {
      tenantId: project.tenantId,
      projectId: args.projectId,
      threadId: thread._id,
      idempotencyKey: args.idempotencyKey,
      senderId: args.actorId,
      senderType: "HUMAN",
      content,
      channel: "INTERNAL",
      status: "SENT",
      metadata: { kind: "WORK_REQUEST" },
    });

    let taskId = thread.linkedTaskId;
    let workOrderId = thread.linkedWorkOrderId;
    let createdWork = false;

    if (!taskId || !workOrderId) {
      const taskResult = (await ctx.runMutation(internal.tasks.createInternal, {
        projectId: args.projectId,
        title: requestTitle(content),
        description: content,
        type: classifyTaskType(content),
        priority: 3,
        labels: ["mission-chat", "operator-request"],
        idempotencyKey: `chat-task:${args.idempotencyKey}`,
        source: "MISSION_PROMPT",
        sourceRef: `mission-chat:${thread._id}`,
        createdBy: "HUMAN",
        createdByRef: args.actorId,
        metadata: { missionChatThreadId: thread._id },
      })) as { task: Doc<"tasks"> | null; created: boolean };
      taskId = taskResult.task?._id;
      if (!taskId) throw new Error("Mission Control could not create a task.");

      const workOrderResult = (await ctx.runMutation(api.workOrders.create, {
        projectId: args.projectId,
        legacyTaskId: taskId,
        idempotencyKey: `chat-work-order:${args.idempotencyKey}`,
        title: requestTitle(content),
        desiredOutcome: content,
        workflowId: classifyTaskType(content) === "ENGINEERING" ? "feature-dev" : "loop-engineering",
        repository: project.githubRepo,
        branchStrategy: "isolated-worktree",
        priority: 3,
        riskLevel: "MEDIUM",
        requestedBy: args.actorId,
        assignedSquad: "Software Factory",
        acceptanceCriteria: [{
          id: "operator-request-accepted",
          title: "The requested outcome is implemented or answered with traceable evidence.",
          verificationMethod: "CHECKLIST",
          status: "PENDING",
        }],
        constraints: [
          "Preserve unrelated workspace changes.",
          "Do not claim completion without test or evidence artifacts.",
          "Repository-changing work remains subject to approval.",
        ],
        dependencies: [],
        sourceOfTruthRefs: [{
          kind: "DOC",
          label: "Mission Control chat request",
          location: `mission-chat:${thread._id}`,
        }],
        requiredApprovals: [],
        state: "READY",
        metadata: { missionChatThreadId: thread._id },
      })) as { workOrder: Doc<"workOrders"> | null; created: boolean };
      workOrderId = workOrderResult.workOrder?._id;
      if (!workOrderId) throw new Error("Mission Control could not create a WorkOrder.");
      createdWork = true;
      await ctx.db.patch(thread._id, {
        linkedTaskId: taskId,
        linkedWorkOrderId: workOrderId,
      });
    } else {
      await ctx.runMutation(api.messages.post, {
        taskId,
        authorType: "HUMAN",
        authorUserId: args.actorId,
        type: "COMMENT",
        content,
        idempotencyKey: `chat-followup:${args.idempotencyKey}`,
      });
    }

    const task = taskId ? await ctx.db.get(taskId) : null;
    const workOrder = workOrderId ? await ctx.db.get(workOrderId) : null;
    const response = createdWork
      ? `Created ${task?.identifier ?? "a task"} and a governed WorkOrder. Progress is linked to this conversation.`
      : `Added your instruction to ${task?.identifier ?? "the linked task"}. Current status: ${task?.status ?? "unknown"}.`;

    await ctx.db.insert("telegraphMessages", {
      tenantId: project.tenantId,
      projectId: args.projectId,
      threadId: thread._id,
      idempotencyKey: `${args.idempotencyKey}:response`,
      senderId: "mission-control",
      senderType: "SYSTEM",
      content: response,
      channel: "INTERNAL",
      status: "SENT",
      metadata: {
        kind: "WORK_RESPONSE",
        taskId,
        workOrderId,
        workOrderState: workOrder?.state,
      },
    });

    await ctx.db.patch(thread._id, {
      lastMessageAt: Date.now(),
      messageCount: thread.messageCount + 2,
    });
    await ctx.db.insert("activities", {
      tenantId: project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: createdWork ? "CHAT_WORK_CREATED" : "CHAT_WORK_UPDATED",
      description: createdWork
        ? `Mission Control chat created work for: ${requestTitle(content)}`
        : `Mission Control chat updated linked work: ${requestTitle(content)}`,
      targetType: "TASK",
      targetId: taskId,
      taskId,
      metadata: { threadId: thread._id, workOrderId },
    });

    return { created: createdWork, threadId: thread._id, taskId, workOrderId };
  },
});
