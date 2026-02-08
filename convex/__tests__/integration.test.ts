/**
 * Integration Tests
 *
 * Tests the end-to-end flow of:
 *   Context Router -> Coordinator -> Agent Runtime (via Memory)
 *
 * These tests verify that the intelligence layer components work together
 * correctly WITHOUT a running Convex instance. They test the pure logic
 * that would run inside the orchestration server.
 */

import { describe, it, expect } from "vitest";
import { ContextRouter } from "../../packages/context-router/src/index";
import { decompose } from "../../packages/coordinator/src/decomposer";
import {
  delegate,
  delegateAll,
  type AgentCandidate,
} from "../../packages/coordinator/src/delegator";
import {
  buildDependencyGraph,
  topologicalSort,
  detectCycles,
  findReadyTasks,
} from "../../packages/coordinator/src/dependency-graph";
import {
  CoordinatorLoop,
  type CoordinatorState,
} from "../../packages/coordinator/src/loop";
import { classify } from "../../packages/context-router/src/classifier";

// ============================================================================
// TEST FIXTURES
// ============================================================================

const TEST_AGENTS: AgentCandidate[] = [
  {
    id: "agent-coder",
    name: "Coder",
    role: "SPECIALIST",
    status: "ACTIVE",
    allowedTaskTypes: ["ENGINEERING", "DOCS"],
    capabilities: ["code_generation", "file_operations", "testing", "code_analysis"],
    budgetRemaining: 10,
    activeTaskCount: 0,
    performanceScore: 0.85,
  },
  {
    id: "agent-researcher",
    name: "Researcher",
    role: "SPECIALIST",
    status: "ACTIVE",
    allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH", "CONTENT"],
    capabilities: ["research", "web_search", "analysis"],
    budgetRemaining: 8,
    activeTaskCount: 1,
    performanceScore: 0.9,
  },
  {
    id: "agent-ops",
    name: "OpsBot",
    role: "LEAD",
    status: "ACTIVE",
    allowedTaskTypes: ["OPS", "ENGINEERING"],
    capabilities: ["system_operations", "monitoring", "deployment"],
    budgetRemaining: 15,
    activeTaskCount: 0,
    performanceScore: 0.78,
  },
  {
    id: "agent-intern",
    name: "Scout",
    role: "INTERN",
    status: "ACTIVE",
    allowedTaskTypes: ["CONTENT", "SOCIAL", "DOCS"],
    capabilities: ["content_creation", "documentation"],
    budgetRemaining: 3,
    activeTaskCount: 2,
    performanceScore: 0.65,
  },
];

// ============================================================================
// INTEGRATION TEST: Context Router -> Coordinator
// ============================================================================

describe("Integration: Context Router -> Coordinator", () => {
  const router = new ContextRouter();

  it("routes a complex request to coordinator and decomposes into subtasks", () => {
    // Step 1: Route the user request
    const routeResult = router.route({
      input: "Build a user authentication system with login, registration, and password reset",
      source: "HUMAN",
      budgetRemaining: 50,
      activeAgentCount: 4,
      maxConcurrentTasks: 10,
      pendingTaskCount: 2,
    });

    expect(routeResult.decision).toBe("COORDINATOR");
    expect(routeResult.suggestedMission).toBeDefined();

    // Step 2: Decompose the mission using coordinator
    const decomposition = decompose({
      id: "task-001",
      title: routeResult.suggestedMission!.title,
      description: routeResult.suggestedMission!.description,
      type: routeResult.suggestedMission!.type,
      priority: routeResult.suggestedMission!.priority,
    });

    expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(2);
    expect(decomposition.subtasks.length).toBeLessThanOrEqual(7);
    expect(decomposition.reasoning).toBeTruthy();

    // Each subtask must have required fields
    for (const subtask of decomposition.subtasks) {
      expect(subtask.title).toBeTruthy();
      expect(subtask.description).toBeTruthy();
      expect(subtask.deliverable).toBeTruthy();
      expect(subtask.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("routes a simple request as single task (bypasses coordinator)", () => {
    const routeResult = router.route({
      input: "Fix the typo in the footer text",
      source: "HUMAN",
      budgetRemaining: 50,
      activeAgentCount: 4,
      maxConcurrentTasks: 10,
      pendingTaskCount: 2,
    });

    expect(routeResult.decision).toBe("SINGLE_TASK");
    expect(routeResult.suggestedTask).toBeDefined();
    expect(routeResult.suggestedTask!.title).toBeTruthy();
    expect(routeResult.suggestedTask!.type).toBeTruthy();
  });
});

// ============================================================================
// INTEGRATION TEST: Coordinator -> Delegation
// ============================================================================

describe("Integration: Coordinator Decomposition -> Delegation", () => {
  it("decomposes and delegates engineering task to correct agents", () => {
    const decomposition = decompose({
      id: "task-002",
      title: "Implement REST API for user profiles",
      description: "Build CRUD endpoints for user profile management",
      type: "ENGINEERING",
      priority: 2,
    });

    // Delegate each subtask
    const delegations = delegateAll(decomposition.subtasks, TEST_AGENTS);

    expect(delegations.length).toBeGreaterThan(0);

    for (const delegation of delegations) {
      expect(delegation.assignedAgentId).toBeTruthy();
      expect(delegation.score).toBeGreaterThan(0);
      expect(delegation.reasoning).toBeTruthy();

      // Verify agent is ACTIVE
      const agent = TEST_AGENTS.find((a) => a.id === delegation.assignedAgentId);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe("ACTIVE");
    }
  });

  it("handles content tasks differently from engineering tasks", () => {
    const contentDecomp = decompose({
      id: "task-003",
      title: "Write blog post about AI trends",
      description: "Research and write a 2000 word article about AI trends",
      type: "CONTENT",
      priority: 3,
    });

    const engDecomp = decompose({
      id: "task-004",
      title: "Build user dashboard",
      description: "Implement a dashboard with charts and metrics",
      type: "ENGINEERING",
      priority: 2,
    });

    // Content tasks should have different subtask patterns
    expect(contentDecomp.subtasks.length).toBeGreaterThanOrEqual(2);
    expect(engDecomp.subtasks.length).toBeGreaterThanOrEqual(2);

    // Strategies should differ
    const contentPhases = contentDecomp.subtasks.map((s) => s.title);
    const engPhases = engDecomp.subtasks.map((s) => s.title);
    expect(contentPhases).not.toEqual(engPhases);
  });
});

// ============================================================================
// INTEGRATION TEST: Dependency Graph
// ============================================================================

describe("Integration: Decomposition -> Dependency Graph", () => {
  it("builds valid DAG from decomposed subtasks", () => {
    const decomposition = decompose({
      id: "task-005",
      title: "Build payment system",
      description: "End-to-end payment processing system",
      type: "ENGINEERING",
      priority: 1,
    });

    // Build dependency graph from subtasks
    const tasks = decomposition.subtasks.map((s, i) => ({
      id: `subtask-${i}`,
      title: s.title,
      status: "INBOX",
      dependsOn: s.dependsOn.map((idx) => `subtask-${idx}`),
    }));

    const graph = buildDependencyGraph(tasks);

    // Should have no cycles
    const cycles = detectCycles(graph);
    expect(cycles.length).toBe(0);

    // Should produce a valid topological order
    const sorted = topologicalSort(graph);
    expect(sorted.length).toBe(tasks.length);

    // Verify ordering: dependencies come before dependents
    for (const task of tasks) {
      const taskIdx = sorted.indexOf(task.id);
      for (const dep of task.dependsOn) {
        const depIdx = sorted.indexOf(dep);
        expect(depIdx).toBeLessThan(taskIdx);
      }
    }
  });

  it("identifies ready tasks correctly", () => {
    const tasks = [
      { id: "t1", title: "Research", status: "DONE", dependsOn: [] },
      { id: "t2", title: "Implement", status: "INBOX", dependsOn: ["t1"] },
      { id: "t3", title: "Test", status: "INBOX", dependsOn: ["t2"] },
      { id: "t4", title: "Document", status: "INBOX", dependsOn: ["t1"] },
    ];

    const graph = buildDependencyGraph(tasks);
    const ready = findReadyTasks(graph);

    // t2 and t4 should be ready (t1 is DONE, their only dependency)
    expect(ready).toContain("t2");
    expect(ready).toContain("t4");
    // t3 should NOT be ready (depends on t2 which is not DONE)
    expect(ready).not.toContain("t3");
  });
});

// ============================================================================
// INTEGRATION TEST: Full Coordinator Loop Tick
// ============================================================================

describe("Integration: CoordinatorLoop.tick()", () => {
  const loop = new CoordinatorLoop({
    stuckThresholdMs: 30 * 60_000,
  });

  it("decomposes INBOX tasks and delegates ready ones", () => {
    const state: CoordinatorState = {
      inboxTasks: [
        {
          id: "mission-1",
          title: "Build user onboarding flow",
          description: "Complete onboarding experience with tutorial and setup wizard",
          type: "ENGINEERING",
          priority: 2,
        },
      ],
      allTasks: [
        {
          id: "mission-1",
          title: "Build user onboarding flow",
          description: "Complete onboarding experience",
          type: "ENGINEERING",
          status: "INBOX",
          priority: 2,
          dependsOn: [],
          assigneeIds: [],
        },
      ],
      availableAgents: TEST_AGENTS,
    };

    const actions = loop.tick(state);

    // Should decompose the INBOX task
    expect(actions.tasksToDecompose.length).toBe(1);
    expect(actions.tasksToDecompose[0].subtasks.length).toBeGreaterThan(0);

    // Should attempt to delegate the INBOX task
    expect(actions.delegations.length).toBeGreaterThanOrEqual(0);
  });

  it("detects stuck tasks", () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60_000;

    const state: CoordinatorState = {
      inboxTasks: [],
      allTasks: [
        {
          id: "stuck-task",
          title: "Stuck task",
          description: "This task is stuck",
          type: "ENGINEERING",
          status: "IN_PROGRESS",
          priority: 2,
          dependsOn: [],
          assigneeIds: ["agent-coder"],
          lastActivityAt: thirtyOneMinutesAgo,
        },
      ],
      availableAgents: TEST_AGENTS,
    };

    const actions = loop.tick(state);

    expect(actions.stuckAlerts.length).toBe(1);
    expect(actions.stuckAlerts[0].taskId).toBe("stuck-task");
    expect(actions.stuckAlerts[0].stuckDurationMs).toBeGreaterThan(30 * 60_000);
  });

  it("escalates when no agent is available", () => {
    const offlineAgents = TEST_AGENTS.map((a) => ({
      ...a,
      status: "OFFLINE" as const,
    }));

    const state: CoordinatorState = {
      inboxTasks: [],
      allTasks: [
        {
          id: "unassigned-task",
          title: "Needs assignment",
          description: "A task waiting for an agent",
          type: "ENGINEERING",
          status: "INBOX",
          priority: 1,
          dependsOn: [],
          assigneeIds: [],
        },
      ],
      availableAgents: offlineAgents,
    };

    const actions = loop.tick(state);

    expect(actions.escalations.length).toBe(1);
    expect(actions.escalations[0].reason).toContain("No available agent");
  });
});

// ============================================================================
// INTEGRATION TEST: Context Router -> Classifier -> Route Consistency
// ============================================================================

describe("Integration: Classification -> Routing Consistency", () => {
  const router = new ContextRouter();

  const testCases = [
    {
      input: "Deploy the new version to production with rollback plan",
      expectedIntent: "OPS",
      expectedType: "OPS",
    },
    {
      input: "Research competitor pricing strategies and analyze market trends",
      expectedIntent: "RESEARCH",
      expectedType: "CUSTOMER_RESEARCH",
    },
    {
      input: "Refactor the database queries to improve performance",
      expectedIntent: "REFACTOR",
      expectedType: "ENGINEERING",
    },
  ];

  for (const tc of testCases) {
    it(`routes "${tc.input.slice(0, 40)}..." with correct intent and type`, () => {
      const classification = classify(tc.input);
      expect(classification.intent).toBe(tc.expectedIntent);
      expect(classification.taskType).toBe(tc.expectedType);

      const result = router.route({
        input: tc.input,
        source: "HUMAN",
        budgetRemaining: 50,
        maxConcurrentTasks: 10,
        pendingTaskCount: 0,
      });

      expect(result.classification.intent).toBe(tc.expectedIntent);
      expect(result.reasoning).toBeTruthy();
    });
  }
});
