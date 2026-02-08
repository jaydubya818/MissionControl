import { describe, it, expect } from "vitest";
import { GlobalMemory, PerformanceRecord, PatternRecord } from "../global";

describe("GlobalMemory", () => {
  const perfRecords: PerformanceRecord[] = [
    {
      agentId: "agent-1",
      taskType: "ENGINEERING",
      successCount: 8,
      failureCount: 2,
      avgCompletionTimeMs: 45 * 60 * 1000,
      avgCostUsd: 0.35,
      totalTasksCompleted: 10,
    },
    {
      agentId: "agent-1",
      taskType: "CONTENT",
      successCount: 3,
      failureCount: 5,
      avgCompletionTimeMs: 20 * 60 * 1000,
      avgCostUsd: 0.20,
      totalTasksCompleted: 8,
    },
    {
      agentId: "agent-2",
      taskType: "ENGINEERING",
      successCount: 5,
      failureCount: 1,
      avgCompletionTimeMs: 60 * 60 * 1000,
      avgCostUsd: 0.50,
      totalTasksCompleted: 6,
    },
  ];

  const patterns: PatternRecord[] = [
    {
      agentId: "agent-1",
      pattern: "strength:ENGINEERING",
      confidence: 0.85,
      evidence: ["task-1", "task-2"],
      discoveredAt: Date.now(),
      lastSeenAt: Date.now(),
    },
    {
      agentId: "agent-1",
      pattern: "weakness:CONTENT",
      confidence: 0.7,
      evidence: ["task-3"],
      discoveredAt: Date.now(),
      lastSeenAt: Date.now(),
    },
  ];

  it("builds an agent profile from performance and patterns", () => {
    const memory = new GlobalMemory();
    memory.loadPerformance(perfRecords);
    memory.loadPatterns(patterns);

    const profile = memory.getAgentProfile("agent-1");
    expect(profile.totalTasks).toBe(18); // 8+2 + 3+5
    expect(profile.overallSuccessRate).toBeCloseTo(11 / 18);
    expect(profile.strengths).toContain("ENGINEERING");
    expect(profile.weaknesses).toContain("CONTENT");
    expect(profile.bestTaskTypes).toContain("ENGINEERING");
    expect(profile.worstTaskTypes).toContain("CONTENT");
  });

  it("ranks agents for a task type", () => {
    const memory = new GlobalMemory();
    memory.loadPerformance(perfRecords);

    const rankings = memory.rankAgentsForType("ENGINEERING");
    expect(rankings.length).toBe(2);
    // agent-2 has 5/6 = 83% vs agent-1 has 8/10 = 80%
    // But agent-2 has higher cost ($0.50 vs $0.35), so scores may differ
    // Both should appear in the list
    expect(rankings.map((r) => r.agentId)).toContain("agent-1");
    expect(rankings.map((r) => r.agentId)).toContain("agent-2");
  });

  it("returns default score for unknown agent", () => {
    const memory = new GlobalMemory();
    memory.loadPerformance(perfRecords);

    const rankings = memory.rankAgentsForType("SOCIAL");
    // No agent has SOCIAL history, all get default 0.5
    for (const r of rankings) {
      expect(r.score).toBe(0.5);
    }
  });

  it("estimates task cost and time", () => {
    const memory = new GlobalMemory();
    memory.loadPerformance(perfRecords);

    const estimate = memory.estimateTask("ENGINEERING");
    expect(estimate.sampleSize).toBe(16); // 10 + 6
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.estimatedTimeMs).toBeGreaterThan(0);
    expect(estimate.confidence).toBeGreaterThan(0);
  });

  it("returns defaults for unknown task type", () => {
    const memory = new GlobalMemory();
    memory.loadPerformance([]);

    const estimate = memory.estimateTask("UNKNOWN");
    expect(estimate.sampleSize).toBe(0);
    expect(estimate.confidence).toBe(0);
    expect(estimate.estimatedCostUsd).toBe(0.5); // Default
  });
});
