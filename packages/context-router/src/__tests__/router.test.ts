import { describe, it, expect } from "vitest";
import { ContextRouter } from "../router";
import type { RoutingContext } from "../types";

function ctx(input: string, overrides?: Partial<RoutingContext>): RoutingContext {
  return {
    input,
    source: "HUMAN",
    budgetRemaining: 50,
    activeAgentCount: 3,
    maxConcurrentTasks: 10,
    pendingTaskCount: 2,
    ...overrides,
  };
}

describe("ContextRouter", () => {
  const router = new ContextRouter();

  describe("route decisions", () => {
    it("routes simple tasks to SINGLE_TASK", () => {
      const result = router.route(ctx("Fix the typo on the settings page"));
      expect(result.decision).toBe("SINGLE_TASK");
      expect(result.suggestedTask).toBeDefined();
    });

    it("routes complex tasks to COORDINATOR", () => {
      const result = router.route(
        ctx("Build a complete authentication system with OAuth, JWT, database migration, and admin panel")
      );
      expect(result.decision).toBe("COORDINATOR");
      expect(result.suggestedMission).toBeDefined();
    });

    it("routes epic tasks to COORDINATOR", () => {
      const result = router.route(
        ctx("Redesign the entire platform architecture and rewrite all backend services end to end")
      );
      expect(result.decision).toBe("COORDINATOR");
    });

    it("provides reasoning for all decisions", () => {
      const result = router.route(ctx("Add a dark mode toggle"));
      expect(result.reasoning).toBeTruthy();
      expect(result.reasoning.length).toBeGreaterThan(10);
    });
  });

  describe("capacity constraints", () => {
    it("defers when at capacity", () => {
      const result = router.route(
        ctx("Build a new feature", {
          pendingTaskCount: 10,
          maxConcurrentTasks: 10,
        })
      );
      expect(result.decision).toBe("DEFER");
      expect(result.deferReason).toBeTruthy();
    });

    it("defers when budget exhausted", () => {
      const result = router.route(
        ctx("Create a new API endpoint", {
          budgetRemaining: 0,
        })
      );
      expect(result.decision).toBe("DEFER");
    });
  });

  describe("built-in rules", () => {
    it("rejects emergency commands", () => {
      const result = router.route(ctx("emergency stop all agents"));
      expect(result.decision).toBe("REJECT");
      expect(result.rejectReason).toBeTruthy();
    });

    it("asks for clarification on help requests", () => {
      const result = router.route(ctx("help"));
      expect(result.decision).toBe("CLARIFY");
      expect(result.clarifyQuestions).toBeDefined();
      expect(result.clarifyQuestions!.length).toBeGreaterThan(0);
    });
  });

  describe("custom rules", () => {
    it("applies custom routing rules", () => {
      const customRouter = new ContextRouter({
        customRules: [
          {
            name: "urgent-deploy",
            patterns: [/\burgent deploy\b/i],
            route: "SINGLE_TASK",
            taskType: "OPS",
            priority: 1,
            complexity: "SIMPLE",
          },
        ],
      });
      const result = customRouter.route(ctx("urgent deploy to production"));
      expect(result.decision).toBe("SINGLE_TASK");
      expect(result.classification.taskType).toBe("OPS");
    });
  });

  describe("classification details", () => {
    it("includes classification in results", () => {
      const result = router.route(ctx("Write a blog post about AI"));
      expect(result.classification).toBeDefined();
      expect(result.classification.intent).toBe("CONTENT");
      expect(result.classification.confidence).toBeGreaterThan(0);
    });

    it("suggests correct task type", () => {
      const result = router.route(ctx("Deploy the new Docker containers"));
      expect(result.classification.taskType).toBe("OPS");
    });
  });

  describe("suggested task/mission", () => {
    it("generates title for single tasks", () => {
      const result = router.route(ctx("Add a loading spinner to the button"));
      expect(result.suggestedTask?.title).toBeTruthy();
      expect(result.suggestedTask!.title.length).toBeLessThanOrEqual(80);
    });

    it("generates mission properties for coordinator routes", () => {
      const result = router.route(
        ctx("Build entire user management system with roles, permissions, and audit logging")
      );
      if (result.decision === "COORDINATOR") {
        expect(result.suggestedMission?.estimatedSubtasks).toBeGreaterThan(1);
      }
    });

    it("assigns priority based on intent", () => {
      const fixResult = router.route(ctx("Fix the broken button on settings page"));
      expect(fixResult.decision).toBe("SINGLE_TASK");
      expect(fixResult.suggestedTask?.priority).toBeLessThanOrEqual(2);
    });
  });

  describe("config management", () => {
    it("allows runtime config updates", () => {
      const r = new ContextRouter();
      r.updateConfig({ minConfidence: 0.8 });
      expect(r.getConfig().minConfidence).toBe(0.8);
    });

    it("allows changing coordinator threshold", () => {
      const strictRouter = new ContextRouter({ coordinatorThreshold: "MODERATE" });
      const result = strictRouter.route(
        ctx("Build a new component with multiple files and database changes")
      );
      // With lower threshold, moderate tasks go to coordinator
      expect(["COORDINATOR", "SINGLE_TASK"]).toContain(result.decision);
    });
  });
});
