import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_ORDER_FILTERS,
  filterWorkOrders,
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

  it("prefers explicit required human action in attention summary", () => {
    expect(summarizeRequiredAttention(ITEMS[0])).toBe("Review evidence");
  });

  it("falls back to blocking issue when human action is absent", () => {
    expect(summarizeRequiredAttention(ITEMS[1])).toBe("None");
  });
});
