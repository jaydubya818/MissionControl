import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function buildSessionId(): string {
  return `rec_${Math.random().toString(36).slice(2, 10)}`;
}

function eventToPlaywright(event: { eventType?: string; data?: Record<string, unknown> }): string {
  const type = event.eventType ?? "unknown";
  const data = event.data ?? {};
  if (type === "navigate") return `await page.goto('${String(data.url ?? "")}');`;
  if (type === "click") return `await page.click('${String(data.selector ?? "")}');`;
  if (type === "input") {
    return `await page.fill('${String(data.selector ?? "")}', '${String(data.value ?? "")}');`;
  }
  if (type === "hover") return `await page.hover('${String(data.selector ?? "")}');`;
  return `// Unsupported event: ${type}`;
}

function eventsToGherkin(name: string, events: { eventType?: string; data?: Record<string, unknown> }[]): string {
  const lines = [`Feature: ${name}`, "  Recorded scenario", "", `  Scenario: ${name}`];
  for (const event of events) {
    if (event.eventType === "navigate") {
      lines.push(`    Given I navigate to "${String(event.data?.url ?? "")}"`);
    } else if (event.eventType === "click") {
      lines.push(`    When I click "${String(event.data?.selector ?? "")}"`);
    } else if (event.eventType === "input") {
      lines.push(
        `    And I enter "${String(event.data?.value ?? "")}" in "${String(event.data?.selector ?? "")}"`
      );
    }
  }
  lines.push("    Then the user flow should complete");
  return lines.join("\n");
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("RECORDING"),
        v.literal("COMPLETED"),
        v.literal("FAILED"),
        v.literal("CANCELED")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const runs = args.projectId
      ? await ctx.db.query("testRecordings").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 50)
      : await ctx.db.query("testRecordings").order("desc").take(args.limit ?? 50);
    return runs.filter((run) => {
      if (args.userId && run.userId !== args.userId) return false;
      if (args.status && run.status !== args.status) return false;
      return true;
    });
  },
});

export const getBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("testRecordings").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).first();
  },
});

export const start = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    userId: v.string(),
    url: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = buildSessionId();
    const now = Date.now();
    const id = await ctx.db.insert("testRecordings", {
      tenantId: undefined,
      projectId: args.projectId,
      sessionId,
      userId: args.userId,
      url: args.url,
      status: "RECORDING",
      events: [],
      startedAt: now,
      metadata: { name: args.name ?? "Recorded flow" },
    });
    return { id, sessionId };
  },
});

export const captureEvent = mutation({
  args: {
    sessionId: v.string(),
    eventType: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const recording = await ctx.db.query("testRecordings").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).first();
    if (!recording) throw new Error("Recording session not found");
    if (recording.status !== "RECORDING") throw new Error("Recording session is not active");

    const events = [...recording.events, { eventType: args.eventType, data: args.data ?? {}, timestamp: Date.now() }];
    await ctx.db.patch(recording._id, { events });
    return { success: true, totalEvents: events.length };
  },
});

export const stop = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const recording = await ctx.db.query("testRecordings").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).first();
    if (!recording) throw new Error("Recording session not found");

    const typedEvents = recording.events as { eventType?: string; data?: Record<string, unknown> }[];
    const playwrightCode = typedEvents.map(eventToPlaywright);
    const gherkinScenario = eventsToGherkin(
      String((recording.metadata as { name?: string } | undefined)?.name ?? recording.sessionId),
      typedEvents
    );

    await ctx.db.patch(recording._id, {
      status: "COMPLETED",
      completedAt: Date.now(),
      playwrightCode,
      gherkinScenario,
    });

    return { success: true, sessionId: args.sessionId, playwrightCode, gherkinScenario };
  },
});
