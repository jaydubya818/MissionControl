import { describe, expect, it } from "vitest";
import {
  analyzeForWorkflow,
  getWorkflowRecommendation,
  shouldAutoTrigger,
} from "../workflowTrigger.js";

/**
 * Characterization tests for the workflow suggestion heuristic.
 *
 * `analyzeForWorkflow` is an ordered chain of substring checks, so both the
 * *order* of the branches and the *substring* (not word) matching are load
 * bearing. Adding a keyword to an earlier branch silently re-routes tasks that
 * previously matched a later one. These tests make that visible.
 */

const task = (title: string, description = "") => ({
  id: "task_1",
  title,
  description,
  type: "TASK",
});

describe("analyzeForWorkflow", () => {
  it("suggests feature-dev at 0.85 confidence", () => {
    const result = analyzeForWorkflow(task("Add feature for CSV export"));
    expect(result.suggestedWorkflow).toBe("feature-dev");
    expect(result.confidence).toBe(0.85);
  });

  it("suggests bug-fix at 0.9 confidence", () => {
    expect(analyzeForWorkflow(task("Fix bug in the parser")).suggestedWorkflow).toBe("bug-fix");
    expect(analyzeForWorkflow(task("Fix bug in the parser")).confidence).toBe(0.9);
  });

  it("suggests security-audit at 0.8 confidence", () => {
    const result = analyzeForWorkflow(task("Review authorization on the admin routes"));
    expect(result.suggestedWorkflow).toBe("security-audit");
    expect(result.confidence).toBe(0.8);
  });

  it("matches against the title and the description combined", () => {
    const result = analyzeForWorkflow(task("Parser work", "The importer is not working"));
    expect(result.suggestedWorkflow).toBe("bug-fix");
  });

  it("returns no workflow and zero confidence when nothing matches", () => {
    const result = analyzeForWorkflow(task("Update the quarterly roadmap deck"));
    expect(result.suggestedWorkflow).toBeUndefined();
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe("No workflow pattern matched");
  });

  it("echoes the task identity back on every branch", () => {
    const result = analyzeForWorkflow(task("Add feature X", "details"));
    expect(result).toMatchObject({
      taskId: "task_1",
      title: "Add feature X",
      description: "details",
      type: "TASK",
    });
  });

  describe("branch precedence", () => {
    it("prefers bug-fix over security-audit when both match", () => {
      // "broken" (bug-fix) is checked before "authentication" (security-audit),
      // so a security task phrased as a defect is routed to the bug-fix flow.
      const result = analyzeForWorkflow(task("Authentication is broken for SSO users"));
      expect(result.suggestedWorkflow).toBe("bug-fix");
    });

    it("prefers feature-dev over bug-fix when both match", () => {
      const result = analyzeForWorkflow(task("Add feature to fix bug reporting"));
      expect(result.suggestedWorkflow).toBe("feature-dev");
    });
  });

  describe("substring matching", () => {
    it("matches keywords inside larger words", () => {
      // Matching is `String.includes`, not word boundaries, so unrelated tasks
      // can be routed by an incidental substring.
      expect(analyzeForWorkflow(task("Book the auditorium")).suggestedWorkflow).toBe(
        "security-audit",
      );
      expect(analyzeForWorkflow(task("Add a failsafe to the queue")).suggestedWorkflow).toBe(
        "bug-fix",
      );
    });

    it("is case insensitive", () => {
      expect(analyzeForWorkflow(task("FIX BUG IN PARSER")).suggestedWorkflow).toBe("bug-fix");
    });
  });
});

describe("shouldAutoTrigger", () => {
  it("auto-triggers all three suggested workflows at the default 0.8 threshold", () => {
    for (const title of ["Add feature X", "Fix bug X", "Review authorization"]) {
      expect(shouldAutoTrigger(analyzeForWorkflow(task(title)))).toBe(true);
    }
  });

  it("never auto-triggers when no workflow was suggested", () => {
    expect(shouldAutoTrigger(analyzeForWorkflow(task("Update the deck")))).toBe(false);
  });

  it("honours a caller-supplied threshold", () => {
    const security = analyzeForWorkflow(task("Review authorization"));
    expect(shouldAutoTrigger(security, 0.85)).toBe(false);
    expect(shouldAutoTrigger(security, 0.8)).toBe(true);
  });
});

describe("getWorkflowRecommendation", () => {
  it("returns null when no workflow was suggested", () => {
    expect(getWorkflowRecommendation(analyzeForWorkflow(task("Update the deck")))).toBeNull();
  });

  it("renders the friendly workflow name and rounded confidence", () => {
    const message = getWorkflowRecommendation(analyzeForWorkflow(task("Fix bug X")));
    expect(message).toBe(
      "This task is a good candidate for the Bug Fix workflow (90% confidence). Would you like to use it?",
    );
  });

  it("falls back to the raw workflow id for an unknown workflow", () => {
    const message = getWorkflowRecommendation({
      taskId: "t",
      title: "t",
      description: "",
      type: "TASK",
      suggestedWorkflow: "custom-flow",
      confidence: 0.9,
      reasoning: "",
    });
    expect(message).toContain("custom-flow");
  });

  it("uses the softer wording between 0.6 and 0.8 confidence", () => {
    // No branch of analyzeForWorkflow currently produces a confidence in this
    // band, so this path is only reachable by a hand-built analysis today.
    const message = getWorkflowRecommendation({
      taskId: "t",
      title: "t",
      description: "",
      type: "TASK",
      suggestedWorkflow: "bug-fix",
      confidence: 0.7,
      reasoning: "",
    });
    expect(message).toBe("This task might benefit from the Bug Fix workflow (70% confidence).");
  });

  it("returns null below 0.6 confidence even with a suggested workflow", () => {
    const message = getWorkflowRecommendation({
      taskId: "t",
      title: "t",
      description: "",
      type: "TASK",
      suggestedWorkflow: "bug-fix",
      confidence: 0.5,
      reasoning: "",
    });
    expect(message).toBeNull();
  });
});
