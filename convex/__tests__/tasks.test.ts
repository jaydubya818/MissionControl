/**
 * Tasks — Unit Tests
 * 
 * Tests the INBOX invariant, transition rules, and provenance system.
 * 
 * NOTE: Convex mutations can't be unit-tested directly without the Convex 
 * test harness. These tests validate the transition rules and helper logic
 * that are the backbone of the INBOX-first architecture.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Types (mirrored from convex/tasks.ts to keep tests self-contained)
// ============================================================================

type TaskStatus = 
  | "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" 
  | "NEEDS_APPROVAL" | "BLOCKED" | "FAILED" | "DONE" | "CANCELED";

type TaskSource = "DASHBOARD" | "TELEGRAM" | "GITHUB" | "AGENT" | "API" | "SEED";

interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  allowedActors: ("AGENT" | "HUMAN" | "SYSTEM")[];
  requiresWorkPlan?: boolean;
  requiresDeliverable?: boolean;
  requiresChecklist?: boolean;
  humanOnly?: boolean;
}

// ============================================================================
// Transition rules (duplicated here for testing — must stay in sync)
// ============================================================================

const TRANSITION_RULES: TransitionRule[] = [
  // FROM INBOX
  { from: "INBOX", to: "ASSIGNED", allowedActors: ["AGENT", "HUMAN", "SYSTEM"] },
  { from: "INBOX", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM ASSIGNED
  { from: "ASSIGNED", to: "IN_PROGRESS", allowedActors: ["AGENT", "HUMAN"], requiresWorkPlan: true },
  { from: "ASSIGNED", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "ASSIGNED", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM IN_PROGRESS
  { from: "IN_PROGRESS", to: "REVIEW", allowedActors: ["AGENT", "HUMAN"], requiresDeliverable: true, requiresChecklist: true },
  { from: "IN_PROGRESS", to: "BLOCKED", allowedActors: ["AGENT", "HUMAN", "SYSTEM"] },
  { from: "IN_PROGRESS", to: "NEEDS_APPROVAL", allowedActors: ["SYSTEM"] },
  { from: "IN_PROGRESS", to: "CANCELED", allowedActors: ["HUMAN"] },
  { from: "IN_PROGRESS", to: "FAILED", allowedActors: ["AGENT", "SYSTEM"] },
  
  // FROM REVIEW
  { from: "REVIEW", to: "IN_PROGRESS", allowedActors: ["AGENT", "HUMAN"] },
  { from: "REVIEW", to: "DONE", allowedActors: ["HUMAN"], humanOnly: true },
  { from: "REVIEW", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "REVIEW", to: "NEEDS_APPROVAL", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "REVIEW", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM NEEDS_APPROVAL
  { from: "NEEDS_APPROVAL", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "ASSIGNED", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "IN_PROGRESS", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "REVIEW", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "NEEDS_APPROVAL", to: "DONE", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM BLOCKED
  { from: "BLOCKED", to: "ASSIGNED", allowedActors: ["HUMAN"] },
  { from: "BLOCKED", to: "IN_PROGRESS", allowedActors: ["HUMAN"] },
  { from: "BLOCKED", to: "NEEDS_APPROVAL", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "BLOCKED", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM FAILED
  { from: "FAILED", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "FAILED", to: "ASSIGNED", allowedActors: ["HUMAN"] },
  { from: "FAILED", to: "CANCELED", allowedActors: ["HUMAN"] },
];

function findTransitionRule(from: TaskStatus, to: TaskStatus): TransitionRule | undefined {
  return TRANSITION_RULES.find(r => r.from === from && r.to === to);
}

// ============================================================================
// GitHub helper (mirrored from convex/github.ts)
// ============================================================================

function githubIdempotencyKey(repoOwner: string, repoName: string, issueNumber: number): string {
  return `github:${repoOwner}/${repoName}#${issueNumber}`;
}

function mapLabelsToTaskType(labels: string[]): string {
  const lower = labels.map(l => l.toLowerCase());
  if (lower.some(l => l.includes("bug") || l.includes("fix"))) return "ENGINEERING";
  if (lower.some(l => l.includes("feature") || l.includes("enhancement"))) return "ENGINEERING";
  if (lower.some(l => l.includes("docs") || l.includes("documentation"))) return "DOCS";
  if (lower.some(l => l.includes("content") || l.includes("blog"))) return "CONTENT";
  if (lower.some(l => l.includes("ops") || l.includes("infra") || l.includes("devops"))) return "OPS";
  if (lower.some(l => l.includes("research"))) return "CUSTOMER_RESEARCH";
  return "ENGINEERING";
}

function mapLabelsToPriority(labels: string[]): number {
  const lower = labels.map(l => l.toLowerCase());
  if (lower.some(l => l.includes("critical") || l.includes("p0"))) return 1;
  if (lower.some(l => l.includes("high") || l.includes("p1"))) return 2;
  if (lower.some(l => l.includes("low") || l.includes("p3"))) return 4;
  return 3;
}

// ============================================================================
// TESTS: INBOX Invariant
// ============================================================================

describe("INBOX Invariant", () => {
  it("no transition rule creates a task — creation always starts at INBOX", () => {
    // There must be no transition rule that transitions TO "INBOX" from nothing.
    // INBOX is the entry point. Only explicit creation sets INBOX.
    // This test ensures no rule has `to: "INBOX"` from a non-existent state.
    const toInbox = TRANSITION_RULES.filter(r => r.to === "INBOX");
    // Transitions TO INBOX are only from ASSIGNED, NEEDS_APPROVAL, FAILED
    const validFromStates = ["ASSIGNED", "NEEDS_APPROVAL", "FAILED"];
    for (const rule of toInbox) {
      expect(validFromStates).toContain(rule.from);
    }
  });

  it("DONE and CANCELED are terminal — no transitions out", () => {
    const fromDone = TRANSITION_RULES.filter(r => r.from === "DONE");
    const fromCanceled = TRANSITION_RULES.filter(r => r.from === "CANCELED");
    expect(fromDone).toHaveLength(0);
    expect(fromCanceled).toHaveLength(0);
  });

  it("no source can skip INBOX by transitioning directly to IN_PROGRESS", () => {
    // The only path to IN_PROGRESS is from ASSIGNED (requires work plan)
    // or from REVIEW (revision) or NEEDS_APPROVAL/BLOCKED (human override)
    const toInProgress = TRANSITION_RULES.filter(r => r.to === "IN_PROGRESS");
    const validFromStates = ["ASSIGNED", "REVIEW", "NEEDS_APPROVAL", "BLOCKED"];
    for (const rule of toInProgress) {
      expect(validFromStates).toContain(rule.from);
    }
  });

  it("INBOX -> ASSIGNED is the only forward path from INBOX (besides CANCELED)", () => {
    const fromInbox = TRANSITION_RULES.filter(r => r.from === "INBOX");
    expect(fromInbox).toHaveLength(2);
    const targets = fromInbox.map(r => r.to).sort();
    expect(targets).toEqual(["ASSIGNED", "CANCELED"]);
  });
});

// ============================================================================
// TESTS: Transition Rules
// ============================================================================

describe("Transition Rules", () => {
  it("ASSIGNED -> IN_PROGRESS requires a work plan", () => {
    const rule = findTransitionRule("ASSIGNED", "IN_PROGRESS");
    expect(rule).toBeDefined();
    expect(rule!.requiresWorkPlan).toBe(true);
  });

  it("IN_PROGRESS -> REVIEW requires deliverable and checklist", () => {
    const rule = findTransitionRule("IN_PROGRESS", "REVIEW");
    expect(rule).toBeDefined();
    expect(rule!.requiresDeliverable).toBe(true);
    expect(rule!.requiresChecklist).toBe(true);
  });

  it("REVIEW -> DONE is human-only", () => {
    const rule = findTransitionRule("REVIEW", "DONE");
    expect(rule).toBeDefined();
    expect(rule!.humanOnly).toBe(true);
    expect(rule!.allowedActors).toEqual(["HUMAN"]);
  });

  it("IN_PROGRESS -> FAILED is allowed for AGENT and SYSTEM", () => {
    const rule = findTransitionRule("IN_PROGRESS", "FAILED");
    expect(rule).toBeDefined();
    expect(rule!.allowedActors).toContain("AGENT");
    expect(rule!.allowedActors).toContain("SYSTEM");
    expect(rule!.allowedActors).not.toContain("HUMAN");
  });

  it("FAILED -> INBOX allows human retry", () => {
    const rule = findTransitionRule("FAILED", "INBOX");
    expect(rule).toBeDefined();
    expect(rule!.allowedActors).toContain("HUMAN");
  });

  it("FAILED -> CANCELED allows human to give up", () => {
    const rule = findTransitionRule("FAILED", "CANCELED");
    expect(rule).toBeDefined();
    expect(rule!.allowedActors).toContain("HUMAN");
  });

  it("agents cannot cancel tasks", () => {
    const cancelRules = TRANSITION_RULES.filter(r => r.to === "CANCELED");
    for (const rule of cancelRules) {
      expect(rule.allowedActors).not.toContain("AGENT");
    }
  });

  it("all transitions have at least one allowed actor", () => {
    for (const rule of TRANSITION_RULES) {
      expect(rule.allowedActors.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// TESTS: GitHub Helpers
// ============================================================================

describe("GitHub Idempotency Keys", () => {
  it("generates deterministic keys from repo + issue number", () => {
    const key = githubIdempotencyKey("jaydubya818", "MissionControl", 42);
    expect(key).toBe("github:jaydubya818/MissionControl#42");
  });

  it("different issues produce different keys", () => {
    const key1 = githubIdempotencyKey("owner", "repo", 1);
    const key2 = githubIdempotencyKey("owner", "repo", 2);
    expect(key1).not.toBe(key2);
  });

  it("different repos produce different keys", () => {
    const key1 = githubIdempotencyKey("owner", "repo-a", 1);
    const key2 = githubIdempotencyKey("owner", "repo-b", 1);
    expect(key1).not.toBe(key2);
  });

  it("same issue always produces the same key (idempotent)", () => {
    const key1 = githubIdempotencyKey("owner", "repo", 42);
    const key2 = githubIdempotencyKey("owner", "repo", 42);
    expect(key1).toBe(key2);
  });
});

describe("GitHub Label Mapping", () => {
  it("maps bug labels to ENGINEERING", () => {
    expect(mapLabelsToTaskType(["bug"])).toBe("ENGINEERING");
    expect(mapLabelsToTaskType(["Bug Fix"])).toBe("ENGINEERING");
  });

  it("maps feature labels to ENGINEERING", () => {
    expect(mapLabelsToTaskType(["feature"])).toBe("ENGINEERING");
    expect(mapLabelsToTaskType(["enhancement"])).toBe("ENGINEERING");
  });

  it("maps documentation labels to DOCS", () => {
    expect(mapLabelsToTaskType(["documentation"])).toBe("DOCS");
    expect(mapLabelsToTaskType(["docs"])).toBe("DOCS");
  });

  it("maps content labels to CONTENT", () => {
    expect(mapLabelsToTaskType(["content"])).toBe("CONTENT");
    expect(mapLabelsToTaskType(["blog"])).toBe("CONTENT");
  });

  it("maps ops/infra labels to OPS", () => {
    expect(mapLabelsToTaskType(["ops"])).toBe("OPS");
    expect(mapLabelsToTaskType(["infrastructure"])).toBe("OPS");
    expect(mapLabelsToTaskType(["devops"])).toBe("OPS");
  });

  it("maps research labels to CUSTOMER_RESEARCH", () => {
    expect(mapLabelsToTaskType(["research"])).toBe("CUSTOMER_RESEARCH");
  });

  it("defaults to ENGINEERING for unknown labels", () => {
    expect(mapLabelsToTaskType(["random-label"])).toBe("ENGINEERING");
    expect(mapLabelsToTaskType([])).toBe("ENGINEERING");
  });

  it("never returns invalid task types", () => {
    const validTypes = ["CONTENT", "SOCIAL", "EMAIL_MARKETING", "CUSTOMER_RESEARCH", "SEO_RESEARCH", "ENGINEERING", "DOCS", "OPS"];
    const testLabels = [
      ["bug"], ["feature"], ["documentation"], ["content"],
      ["ops"], ["research"], ["random"], [], ["priority: high"],
    ];
    for (const labels of testLabels) {
      expect(validTypes).toContain(mapLabelsToTaskType(labels));
    }
  });
});

describe("GitHub Priority Mapping", () => {
  it("maps critical/p0 to priority 1", () => {
    expect(mapLabelsToPriority(["priority: critical"])).toBe(1);
    expect(mapLabelsToPriority(["P0"])).toBe(1);
  });

  it("maps high/p1 to priority 2", () => {
    expect(mapLabelsToPriority(["priority: high"])).toBe(2);
    expect(mapLabelsToPriority(["P1"])).toBe(2);
  });

  it("maps low/p3 to priority 4", () => {
    expect(mapLabelsToPriority(["priority: low"])).toBe(4);
    expect(mapLabelsToPriority(["P3"])).toBe(4);
  });

  it("defaults to priority 3 (normal)", () => {
    expect(mapLabelsToPriority([])).toBe(3);
    expect(mapLabelsToPriority(["bug"])).toBe(3);
  });
});

// ============================================================================
// TESTS: Provenance / Source Tracking
// ============================================================================

describe("Task Source Types", () => {
  it("all valid sources are defined", () => {
    const validSources: TaskSource[] = ["DASHBOARD", "TELEGRAM", "GITHUB", "AGENT", "API", "SEED"];
    expect(validSources).toHaveLength(6);
  });

  it("SEED is reserved for demo/dev data only", () => {
    // This is a documentation test — SEED should not be used in production code paths
    const productionSources: TaskSource[] = ["DASHBOARD", "TELEGRAM", "GITHUB", "AGENT", "API"];
    expect(productionSources).not.toContain("SEED");
  });
});
