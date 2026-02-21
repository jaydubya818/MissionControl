import { v } from "convex/values";
import { action } from "./_generated/server";

type EventInput = {
  eventType?: string;
  data?: Record<string, unknown>;
};

function toGherkinFromEvents(events: EventInput[], name: string): string {
  const lines: string[] = [
    `Feature: ${name}`,
    "  Auto-generated from recorded interactions",
    "",
    `  Scenario: ${name}`,
  ];

  for (const event of events) {
    const type = event.eventType ?? "unknown";
    const data = event.data ?? {};
    if (type === "navigate") {
      lines.push(`    Given I navigate to "${String(data.url ?? "")}"`);
    } else if (type === "click") {
      lines.push(`    When I click on "${String(data.selector ?? "element")}"`);
    } else if (type === "input") {
      lines.push(
        `    And I enter "${String(data.value ?? "")}" in "${String(data.selector ?? "field")}"`
      );
    } else if (type === "hover") {
      lines.push(`    And I hover over "${String(data.selector ?? "element")}"`);
    } else {
      lines.push(`    And I perform ${type}`);
    }
  }

  lines.push("    Then the workflow completes successfully");
  return lines.join("\n");
}

function toGherkinFromApiSteps(steps: Record<string, unknown>[], name: string): string {
  const lines: string[] = [
    `Feature: ${name}`,
    "  Auto-generated from API test definitions",
    "",
    `  Scenario: ${name}`,
  ];

  for (const step of steps) {
    const method = String(step.method ?? "GET");
    const url = String(step.url ?? "/");
    lines.push(`    When I call "${method} ${url}"`);
  }

  lines.push("    Then the responses should meet assertions");
  return lines.join("\n");
}

export const generateFromRecording = action({
  args: {
    name: v.string(),
    events: v.array(v.object({ eventType: v.optional(v.string()), data: v.optional(v.any()) })),
  },
  handler: async (_ctx, args) => {
    return { gherkin: toGherkinFromEvents(args.events as EventInput[], args.name) };
  },
});

export const generateFromApiSteps = action({
  args: {
    name: v.string(),
    steps: v.array(v.any()),
  },
  handler: async (_ctx, args) => {
    return { gherkin: toGherkinFromApiSteps(args.steps as Record<string, unknown>[], args.name) };
  },
});

export const parse = action({
  args: { gherkin: v.string() },
  handler: async (_ctx, args) => {
    const lines = args.gherkin
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      steps: lines.filter((line) => line.startsWith("Given") || line.startsWith("When") || line.startsWith("And") || line.startsWith("Then")),
      lineCount: lines.length,
    };
  },
});
