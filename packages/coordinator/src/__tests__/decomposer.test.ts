import { describe, it, expect } from "vitest";
import { decompose, TaskInput } from "../decomposer";

describe("decompose", () => {
  const engineeringTask: TaskInput = {
    id: "task-1",
    title: "Add user authentication",
    description: "Implement JWT-based authentication with login/logout",
    type: "ENGINEERING",
    priority: 1,
  };

  const contentTask: TaskInput = {
    id: "task-2",
    title: "Write blog post about launch",
    description: "Create a blog post announcing our product launch",
    type: "CONTENT",
    priority: 2,
  };

  it("decomposes engineering tasks into 4 phases", () => {
    const result = decompose(engineeringTask);
    expect(result.subtasks.length).toBe(4);
    expect(result.parentTaskId).toBe("task-1");
  });

  it("engineering phases follow research -> implement -> test/doc pattern", () => {
    const result = decompose(engineeringTask);
    const verbs = result.subtasks.map((s) => s.title.split(" — ")[0]);
    expect(verbs).toEqual(["Research", "Implement", "Test", "Document"]);
  });

  it("engineering subtasks have correct dependency chain", () => {
    const result = decompose(engineeringTask);
    expect(result.subtasks[0].dependsOn).toEqual([]); // Research: no deps
    expect(result.subtasks[1].dependsOn).toEqual([0]); // Implement depends on Research
    expect(result.subtasks[2].dependsOn).toEqual([1]); // Test depends on Implement
    expect(result.subtasks[3].dependsOn).toEqual([1]); // Doc depends on Implement
  });

  it("decomposes content tasks into 3 phases", () => {
    const result = decompose(contentTask);
    expect(result.subtasks.length).toBe(3);
  });

  it("uses generic strategy for unknown task types", () => {
    const unknownTask: TaskInput = {
      id: "task-3",
      title: "Some random task",
      description: "Does something",
      type: "UNKNOWN_TYPE",
      priority: 3,
    };
    const result = decompose(unknownTask);
    expect(result.subtasks.length).toBe(3); // Generic: research, execute, review
    expect(result.reasoning).toContain("generic");
  });

  it("calculates total estimated minutes", () => {
    const result = decompose(engineeringTask);
    const sum = result.subtasks.reduce((s, t) => s + t.estimatedMinutes, 0);
    expect(result.estimatedTotalMinutes).toBe(sum);
    expect(result.estimatedTotalMinutes).toBeGreaterThan(0);
  });

  it("preserves parent task priority in subtasks", () => {
    const result = decompose(engineeringTask);
    for (const subtask of result.subtasks) {
      expect(subtask.priority).toBe(engineeringTask.priority);
    }
  });
});
