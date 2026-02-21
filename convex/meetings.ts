/**
 * Meeting Orchestration Functions
 *
 * Schedule meetings, generate agendas/notes, convert action items to tasks.
 * Supports Manual provider (markdown) and future Zoom integration.
 */

import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";

const meetingStatusValidator = v.union(
  v.literal("SCHEDULED"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED")
);

const meetingProviderValidator = v.union(
  v.literal("MANUAL"),
  v.literal("ZOOM")
);

const participantValidator = v.object({
  agentId: v.string(),
  orgPosition: v.optional(v.string()),
  role: v.optional(v.string()),
});

const actionItemValidator = v.object({
  description: v.string(),
  assigneeAgentId: v.optional(v.string()),
  taskId: v.optional(v.id("tasks")),
  dueAt: v.optional(v.number()),
  completed: v.boolean(),
});

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List meetings for a project.
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(meetingStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let meetings;
    if (args.projectId) {
      meetings = await ctx.db
        .query("meetings")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    } else {
      meetings = await ctx.db
        .query("meetings")
        .order("desc")
        .take(limit);
    }

    if (args.status) {
      meetings = meetings.filter((m) => m.status === args.status);
    }

    return meetings;
  },
});

/**
 * Get a single meeting with full details.
 */
export const get = query({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.meetingId);
  },
});

/**
 * Get upcoming meetings (scheduled, not yet completed/cancelled).
 */
export const getUpcoming = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const now = Date.now();

    let meetings;
    if (args.projectId) {
      meetings = await ctx.db
        .query("meetings")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      meetings = await ctx.db.query("meetings").collect();
    }

    return meetings
      .filter((m) => m.status === "SCHEDULED" && m.scheduledAt >= now)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .slice(0, limit);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Schedule a new meeting.
 */
export const schedule = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    scheduledAt: v.number(),
    duration: v.number(),
    hostAgentId: v.optional(v.string()),
    participants: v.array(participantValidator),
    provider: v.optional(meetingProviderValidator),
    agendaTopics: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Build agenda from topics
    const topics = args.agendaTopics ?? [
      "Opening remarks and status check",
      "Key discussion items",
      "Blockers and escalations",
      "Action items and next steps",
    ];
    const agenda = topics.map((t, i) => `${i + 1}. ${t}`).join("\n");

    // Build calendar payload
    const start = new Date(args.scheduledAt);
    const end = new Date(args.scheduledAt + args.duration * 60000);
    const calendarPayload = JSON.stringify({
      summary: args.title,
      dtstart: start.toISOString(),
      dtend: end.toISOString(),
      organizer: args.hostAgentId ?? "Mission Control",
      attendees: args.participants.map((p) => ({
        id: p.agentId,
        role: p.role ?? "attendee",
        orgPosition: p.orgPosition,
      })),
      description: `Mission Control Meeting: ${args.title}`,
      location: "Mission Control Platform",
      uid: `mc-meeting-${Date.now()}@missioncontrol`,
    }, null, 2);

    return await ctx.db.insert("meetings", {
      projectId: args.projectId,
      title: args.title,
      agenda,
      scheduledAt: args.scheduledAt,
      duration: args.duration,
      status: "SCHEDULED",
      hostAgentId: args.hostAgentId,
      participants: args.participants,
      provider: args.provider ?? "MANUAL",
      calendarPayload,
    });
  },
});

/**
 * Start a meeting (transition to IN_PROGRESS).
 */
export const start = mutation({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) throw new Error("Meeting not found");
    if (meeting.status !== "SCHEDULED") {
      throw new Error(`Cannot start meeting in status ${meeting.status}`);
    }
    await ctx.db.patch(args.meetingId, { status: "IN_PROGRESS" });
  },
});

/**
 * Complete a meeting with notes and action items.
 */
export const complete = mutation({
  args: {
    meetingId: v.id("meetings"),
    notes: v.optional(v.string()),
    actionItems: v.optional(v.array(actionItemValidator)),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) throw new Error("Meeting not found");

    await ctx.db.patch(args.meetingId, {
      status: "COMPLETED",
      notes: args.notes,
      actionItems: args.actionItems,
    });
  },
});

/**
 * Cancel a meeting.
 */
export const cancel = mutation({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) throw new Error("Meeting not found");
    await ctx.db.patch(args.meetingId, { status: "CANCELLED" });
  },
});

/**
 * Convert meeting action items to tasks with owners and due dates.
 */
export const convertActionItems = mutation({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) throw new Error("Meeting not found");
    if (!meeting.actionItems || meeting.actionItems.length === 0) {
      return { created: 0, taskIds: [] };
    }

    const taskIds: string[] = [];
    const updatedItems = [...meeting.actionItems];

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      if (item.completed || item.taskId) continue;

      // Create task from action item
      const taskId = await ctx.db.insert("tasks", {
        tenantId: meeting.tenantId,
        projectId: meeting.projectId,
        title: item.description,
        description: `Action item from meeting: ${meeting.title}`,
        type: "OPS",
        status: "INBOX",
        priority: 3,
        assigneeIds: [],
        assigneeInstanceIds: [],
        reviewCycles: 0,
        actualCost: 0,
        dueAt: item.dueAt,
        source: "DASHBOARD",
        createdBy: "SYSTEM",
        createdByRef: `meeting:${meeting._id}`,
      });

      taskIds.push(taskId);
      updatedItems[i] = { ...item, taskId };
    }

    // Update meeting with task IDs
    await ctx.db.patch(args.meetingId, { actionItems: updatedItems });

    return { created: taskIds.length, taskIds };
  },
});
