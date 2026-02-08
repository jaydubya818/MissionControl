import { describe, it, expect } from "vitest";
import {
  buildDependencyGraph,
  topologicalSort,
  detectCycles,
  findReadyTasks,
  criticalPath,
} from "../dependency-graph";

const TASKS = [
  { id: "1", title: "Setup DB", status: "DONE", dependsOn: [] },
  { id: "2", title: "Create API", status: "INBOX", dependsOn: ["1"] },
  { id: "3", title: "Build UI", status: "INBOX", dependsOn: ["2"] },
  { id: "4", title: "Write docs", status: "INBOX", dependsOn: ["2"] },
  { id: "5", title: "Deploy", status: "INBOX", dependsOn: ["3", "4"] },
];

describe("buildDependencyGraph", () => {
  it("creates a node for each task", () => {
    const graph = buildDependencyGraph(TASKS);
    expect(graph.nodes.size).toBe(5);
  });

  it("creates edges for dependencies", () => {
    const graph = buildDependencyGraph(TASKS);
    expect(graph.edges.length).toBe(5);
    expect(graph.edges).toContainEqual({ from: "1", to: "2" });
    expect(graph.edges).toContainEqual({ from: "2", to: "3" });
  });

  it("tracks dependedOnBy back-references", () => {
    const graph = buildDependencyGraph(TASKS);
    const node1 = graph.nodes.get("1")!;
    expect(node1.dependedOnBy).toContain("2");
  });
});

describe("topologicalSort", () => {
  it("returns tasks in valid execution order", () => {
    const graph = buildDependencyGraph(TASKS);
    const sorted = topologicalSort(graph);

    // Verify order constraints
    expect(sorted.indexOf("1")).toBeLessThan(sorted.indexOf("2"));
    expect(sorted.indexOf("2")).toBeLessThan(sorted.indexOf("3"));
    expect(sorted.indexOf("2")).toBeLessThan(sorted.indexOf("4"));
    expect(sorted.indexOf("3")).toBeLessThan(sorted.indexOf("5"));
    expect(sorted.indexOf("4")).toBeLessThan(sorted.indexOf("5"));
  });

  it("throws on circular dependencies", () => {
    const cyclicTasks = [
      { id: "A", title: "A", status: "INBOX", dependsOn: ["C"] },
      { id: "B", title: "B", status: "INBOX", dependsOn: ["A"] },
      { id: "C", title: "C", status: "INBOX", dependsOn: ["B"] },
    ];
    const graph = buildDependencyGraph(cyclicTasks);
    expect(() => topologicalSort(graph)).toThrow("Circular dependency");
  });
});

describe("detectCycles", () => {
  it("returns empty for acyclic graph", () => {
    const graph = buildDependencyGraph(TASKS);
    const cycles = detectCycles(graph);
    expect(cycles).toEqual([]);
  });

  it("detects a 3-node cycle", () => {
    const cyclicTasks = [
      { id: "A", title: "A", status: "INBOX", dependsOn: ["C"] },
      { id: "B", title: "B", status: "INBOX", dependsOn: ["A"] },
      { id: "C", title: "C", status: "INBOX", dependsOn: ["B"] },
    ];
    const graph = buildDependencyGraph(cyclicTasks);
    const cycles = detectCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe("findReadyTasks", () => {
  it("finds tasks whose dependencies are DONE", () => {
    const graph = buildDependencyGraph(TASKS);
    const ready = findReadyTasks(graph);
    // Task 1 is DONE, Task 2 depends on 1 (DONE), so 2 is ready
    expect(ready).toContain("2");
    // Task 3 depends on 2 (INBOX), not ready
    expect(ready).not.toContain("3");
  });

  it("excludes IN_PROGRESS tasks", () => {
    const tasks = [
      { id: "1", title: "A", status: "DONE", dependsOn: [] },
      { id: "2", title: "B", status: "IN_PROGRESS", dependsOn: ["1"] },
    ];
    const graph = buildDependencyGraph(tasks);
    const ready = findReadyTasks(graph);
    expect(ready).not.toContain("2");
  });

  it("includes root tasks with no dependencies", () => {
    const tasks = [
      { id: "1", title: "A", status: "INBOX", dependsOn: [] },
    ];
    const graph = buildDependencyGraph(tasks);
    const ready = findReadyTasks(graph);
    expect(ready).toContain("1");
  });
});

describe("criticalPath", () => {
  it("finds the longest dependency chain", () => {
    const graph = buildDependencyGraph(TASKS);
    const estimates = new Map([
      ["1", 10],
      ["2", 20],
      ["3", 30],
      ["4", 15],
      ["5", 5],
    ]);

    const result = criticalPath(graph, estimates);
    // Critical path: 1 -> 2 -> 3 -> 5 (10 + 20 + 30 + 5 = 65)
    // vs:            1 -> 2 -> 4 -> 5 (10 + 20 + 15 + 5 = 50)
    expect(result.totalMinutes).toBe(65);
    expect(result.path).toContain("1");
    expect(result.path).toContain("3"); // Goes through 3 (longer)
    expect(result.path).toContain("5");
  });
});
