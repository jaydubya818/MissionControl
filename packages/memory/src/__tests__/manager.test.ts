import { describe, it, expect } from "vitest";
import { MemoryManager } from "../manager";

describe("MemoryManager", () => {
  it("initializes all three memory tiers", () => {
    const manager = new MemoryManager({
      agentId: "agent-1",
      projectId: "proj-1",
    });

    expect(manager.session).toBeDefined();
    expect(manager.project).toBeDefined();
    expect(manager.global).toBeDefined();
  });

  it("starts and ends a task session", () => {
    const manager = new MemoryManager({
      agentId: "agent-1",
      projectId: "proj-1",
    });

    manager.startTask("task-42");
    expect(manager.session.getTaskId()).toBe("task-42");

    manager.session.add("observation", "Found the issue");
    manager.session.add("decision", "Will fix it");

    const result = manager.endTask(true);
    expect(result.sessionSummary).toContain("task-42");
    expect(result.sessionStats.entryCount).toBeGreaterThan(0);
    expect(result.dailyNote).toContain("TASK_COMPLETED");
  });

  it("builds task context from all tiers", () => {
    const manager = new MemoryManager({
      agentId: "agent-1",
      projectId: "proj-1",
    });

    // Load project context
    manager.project.loadWorkingDoc(
      "## Architecture\n\nUsing React + Convex\n\n## Conventions\n\nInline styles only"
    );

    // Load global performance
    manager.global.loadPerformance([
      {
        agentId: "agent-1",
        taskType: "ENGINEERING",
        successCount: 8,
        failureCount: 2,
        avgCompletionTimeMs: 45 * 60 * 1000,
        avgCostUsd: 0.35,
        totalTasksCompleted: 10,
      },
    ]);

    const context = manager.buildTaskContext("ENGINEERING");
    expect(context).toContain("React + Convex");
    expect(context).toContain("ENGINEERING");
    expect(context).toContain("$0.35");
  });

  it("tracks failed task sessions", () => {
    const manager = new MemoryManager({
      agentId: "agent-1",
      projectId: "proj-1",
    });

    manager.startTask("task-99");
    manager.session.add("error", "Module not found");

    const result = manager.endTask(false);
    expect(result.dailyNote).toContain("TASK_FAILED");
    expect(result.sessionStats.errorCount).toBe(1);
  });
});
