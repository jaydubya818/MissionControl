import { describe, it, expect } from "vitest";
import { classify } from "../classifier";

describe("classify", () => {
  describe("intent detection", () => {
    it("classifies BUILD intent", () => {
      const result = classify("Build a new user dashboard with charts");
      expect(result.intent).toBe("BUILD");
    });

    it("classifies FIX intent", () => {
      const result = classify("Fix the broken login page, users can't sign in");
      expect(result.intent).toBe("FIX");
    });

    it("classifies RESEARCH intent", () => {
      const result = classify("Research the best caching strategies for our API");
      expect(result.intent).toBe("RESEARCH");
    });

    it("classifies CONTENT intent", () => {
      const result = classify("Write a blog post about AI trends in 2026");
      expect(result.intent).toBe("CONTENT");
    });

    it("classifies OPS intent", () => {
      const result = classify("Deploy the staging environment and configure monitoring");
      expect(result.intent).toBe("OPS");
    });

    it("classifies REVIEW intent", () => {
      const result = classify("Review the pull request for the auth module");
      expect(result.intent).toBe("REVIEW");
    });

    it("classifies REFACTOR intent", () => {
      const result = classify("Refactor the database layer to reduce tech debt");
      expect(result.intent).toBe("REFACTOR");
    });

    it("returns UNKNOWN for ambiguous input", () => {
      const result = classify("hmm");
      expect(result.intent).toBe("UNKNOWN");
    });
  });

  describe("complexity detection", () => {
    it("detects TRIVIAL complexity", () => {
      const result = classify("Bump the version number");
      expect(result.complexity).toBe("TRIVIAL");
    });

    it("detects SIMPLE complexity", () => {
      const result = classify("Rename the submit button label");
      expect(result.complexity).toBe("SIMPLE");
    });

    it("detects COMPLEX complexity", () => {
      const result = classify("Implement authentication with OAuth and database schema migration");
      expect(result.complexity).toBe("COMPLEX");
    });

    it("detects EPIC complexity for multi-step descriptions", () => {
      const result = classify("Redesign the entire platform architecture and rewrite all services");
      expect(result.complexity).toBe("EPIC");
    });
  });

  describe("task type detection", () => {
    it("detects ENGINEERING type", () => {
      const result = classify("Build a React component for the sidebar");
      expect(result.taskType).toBe("ENGINEERING");
    });

    it("detects CONTENT type", () => {
      const result = classify("Write a blog post about AI agents");
      expect(result.taskType).toBe("CONTENT");
    });

    it("detects OPS type", () => {
      const result = classify("Set up Docker deployment pipeline");
      expect(result.taskType).toBe("OPS");
    });

    it("detects DOCS type", () => {
      const result = classify("Write documentation for the API endpoints");
      expect(result.taskType).toBe("DOCS");
    });
  });

  describe("keyword extraction", () => {
    it("extracts meaningful keywords", () => {
      const result = classify("Build a user authentication system with JWT tokens");
      expect(result.keywords).toContain("authentication");
      expect(result.keywords).toContain("system");
      expect(result.keywords).not.toContain("a");
      expect(result.keywords).not.toContain("the");
    });
  });

  describe("subtask detection", () => {
    it("detects numbered subtasks", () => {
      const result = classify(
        "Update the system:\n1. Add new database table\n2. Create API endpoint\n3. Build UI component"
      );
      expect(result.detectedSubtasks).toBeDefined();
      expect(result.detectedSubtasks!.length).toBe(3);
    });

    it("detects bullet subtasks", () => {
      const result = classify(
        "Tasks:\n- Research competitors\n- Draft proposal\n- Review with team"
      );
      expect(result.detectedSubtasks).toBeDefined();
      expect(result.detectedSubtasks!.length).toBe(3);
    });

    it("detects 'then' chains", () => {
      const result = classify(
        "First implement the API, then build the frontend, then write tests"
      );
      expect(result.detectedSubtasks).toBeDefined();
      expect(result.detectedSubtasks!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("confidence scoring", () => {
    it("returns higher confidence for clear intents", () => {
      const clear = classify("Build a new React component for the user profile page");
      const vague = classify("stuff");
      expect(clear.confidence).toBeGreaterThan(vague.confidence);
    });

    it("returns confidence between 0 and 1", () => {
      const result = classify("Implement OAuth authentication");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
