import { describe, expect, it } from "vitest";
import {
  countByQuickFilter,
  DEFAULT_WORK_ORDER_FILTERS,
  deriveAcceptanceReadinessPresentation,
  deriveNextAction,
  humanizeOperatorCopy,
  filterWorkOrders,
  parseVerificationArguments,
  summarizeRequiredAttention,
  type WorkOrderQueueItem,
} from "./workOrdersModel";

const ITEMS: WorkOrderQueueItem[] = [
  {
    _id: "wo-1",
    title: "One",
    desiredOutcome: "Outcome one",
    repository: "repo-a",
    state: "IN_PROGRESS",
    riskLevel: "HIGH",
    assignedAgent: "Pi",
    requestedBy: "Hermes",
    verificationStatus: "PENDING",
    approvalStatus: "PENDING",
    requiredHumanAction: "Review evidence",
    latestExecutionRun: null,
  },
  {
    _id: "wo-2",
    title: "Two",
    desiredOutcome: "Outcome two",
    repository: "repo-b",
    state: "DONE",
    riskLevel: "LOW",
    assignedAgent: "QA",
    requestedBy: "Jay",
    verificationStatus: "PASS",
    approvalStatus: "APPROVED",
    blockingIssue: "None",
    latestExecutionRun: null,
  },
];

describe("work order queue model", () => {
  it("filters by repository and verification status", () => {
    const filtered = filterWorkOrders(ITEMS, {
      ...DEFAULT_WORK_ORDER_FILTERS,
      repository: "repo-b",
      verificationStatus: "PASS",
    });

    expect(filtered.map((item) => item._id)).toEqual(["wo-2"]);
  });

  it("filters by assigned agent", () => {
    const filtered = filterWorkOrders(ITEMS, {
      ...DEFAULT_WORK_ORDER_FILTERS,
      assignedAgent: "Pi",
    });

    expect(filtered.map((item) => item._id)).toEqual(["wo-1"]);
  });

  it("filters by quick attention presets", () => {
    const filtered = filterWorkOrders(ITEMS, {
      ...DEFAULT_WORK_ORDER_FILTERS,
      quickFilter: "needs_attention",
    });

    expect(filtered.map((item) => item._id)).toEqual(["wo-1"]);
    expect(countByQuickFilter(ITEMS, "awaiting_approval")).toBe(1);
  });

  it("prefers explicit required human action in attention summary", () => {
    expect(summarizeRequiredAttention(ITEMS[0])).toBe("Review evidence");
  });

  it("falls back to blocking issue when human action is absent", () => {
    expect(summarizeRequiredAttention(ITEMS[1])).toBe("None");
  });

  it("derives the next operator action", () => {
    expect(deriveNextAction(ITEMS[0])).toBe("Review approval");
    expect(deriveNextAction(ITEMS[1])).toBe("Review outcome");
  });

  it("plain-languages dense factory jargon", () => {
    expect(humanizeOperatorCopy("No current source Attempt published a candidate-ready Verification Subject.")).toBe(
      "Nothing verified yet. Wait for this run to finish and leave evidence.",
    );
  });

  it("never claims acceptance is allowed while the composite acceptance gate is blocked", () => {
    expect(deriveAcceptanceReadinessPresentation(false, [])).toEqual({
      heading: "Why this WorkOrder is blocked from acceptance",
      reasons: [],
      summary: "Acceptance remains blocked until all required approvals, independent evidence, GitHub App PR lineage, and exact-head CI requirements are complete.",
    });
  });

  it("preserves authoritative verification reasons for a blocked WorkOrder", () => {
    expect(deriveAcceptanceReadinessPresentation(false, ["Exact PR head is stale."])).toEqual({
      heading: "Why this WorkOrder is blocked from acceptance",
      reasons: ["Exact PR head is stale."],
      summary: null,
    });
  });

  it("shows ready copy only when the composite acceptance gate is eligible", () => {
    expect(deriveAcceptanceReadinessPresentation(true, [])).toMatchObject({
      heading: "Ready for explicit human acceptance",
      summary: expect.stringContaining("Explicit acceptance is now allowed"),
    });
  });

  it("preserves exact verification argv including spaces inside one argument", () => {
    expect(parseVerificationArguments('["-e", "console.log(\'hello world\')"]')).toEqual({
      ok: true,
      args: ["-e", "console.log('hello world')"],
    });
  });

  it("accepts an empty argv for executables that take no arguments", () => {
    expect(parseVerificationArguments("[]")).toEqual({ ok: true, args: [] });
  });

  it("rejects non-array and non-string verification argv", () => {
    expect(parseVerificationArguments('"--version"')).toMatchObject({ ok: false });
    expect(parseVerificationArguments('["--filter", 3]')).toMatchObject({ ok: false });
    expect(parseVerificationArguments("not-json")).toMatchObject({ ok: false });
  });
});
