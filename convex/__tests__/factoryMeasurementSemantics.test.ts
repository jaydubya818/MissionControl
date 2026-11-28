import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExperimentReview } from "../factory/learning";
import { recordMeasurement } from "../factory/metaLoop";
import { requireWorkspacePermission } from "../lib/companyAccess";
import { buildMetaMeasurement } from "../lib/metaLoopSignals";
import schema from "../schema";

vi.mock("../lib/companyAccess", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/companyAccess")>();
  return {
    ...original,
    requireWorkspacePermission: vi.fn(async (_ctx, projectId) => ({
      actorId: "operator-1",
      project: { _id: projectId, tenantId: "tenant-1" },
    })),
  };
});

function handler(registered: unknown) {
  return (registered as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
}

function measurementContext(overrides: Record<string, unknown> = {}) {
  const row = {
    _id: "suggestion-1", projectId: "project-1", workOrderId: "work-order-1",
    title: "Reduce cost", dedupeKey: "cost-improvement", impact: "MEDIUM",
    affectedSurface: "MODEL_ROUTING", ...overrides,
  };
  const followups: unknown[] = [];
  const db = {
    get: vi.fn(async () => row),
    patch: vi.fn(async () => undefined),
    query: vi.fn(() => ({ withIndex: () => ({ first: async () => followups[0] ?? null }) })),
    insert: vi.fn(async (table: string, value: unknown) => {
      if (table === "metaLoopSuggestions") followups.push(value);
      return `${table}-1`;
    }),
  };
  return { db };
}

const costMeasurement = {
  suggestionId: "suggestion-1", baseline: 10, result: 4, target: 5,
  unit: "USD", targetDirection: "LOWER_IS_BETTER" as const, evidenceRefs: ["experiment:1"],
};

function experimentContext(scores: [unknown, unknown]) {
  const candidate = { _id: "candidate-1", projectId: "project-1", experimentId: "experiment-1" };
  const experiment = {
    _id: "experiment-1", projectId: "project-1", status: "COMPLETED",
    datasetId: "dataset-1", datasetVersion: 3, evalDefinitionIds: ["eval-1"],
  };
  const variants = scores.map((averageScore, index) => ({
    _id: `variant-${index}`, projectId: "project-1", experimentId: experiment._id,
    sampleSize: 40,
    metrics: { successRate: 1, averageDurationMs: 100, averageCostUsd: index ? 0.5 : 1, averageScore },
  }));
  return {
    db: {
      get: vi.fn(async (id: string) => id === candidate._id ? candidate : id === experiment._id ? experiment : null),
      query: vi.fn(() => ({ withIndex: () => ({ collect: async () => variants }) })),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("meta-loop target direction", () => {
  it("records a lower-is-better target as met and preserves its direction", async () => {
    const ctx = measurementContext();
    expect(await handler(recordMeasurement)(ctx, costMeasurement)).toEqual({ verdict: "MET" });
    expect(ctx.db.patch).toHaveBeenCalledWith("suggestion-1", {
      status: "EFFECTIVE",
      measurement: expect.objectContaining({ result: 4, target: 5, targetDirection: "LOWER_IS_BETTER", verdict: "MET" }),
    });
    expect(ctx.db.insert.mock.calls.some(([table]) => table === "metaLoopSuggestions")).toBe(false);
  });

  it("records a missed lower target and deduplicates its follow-up", async () => {
    const ctx = measurementContext();
    for (let run = 0; run < 2; run++) {
      expect(await handler(recordMeasurement)(ctx, { ...costMeasurement, result: 8 })).toEqual({ verdict: "MISSED" });
    }
    expect(ctx.db.patch).toHaveBeenCalledWith("suggestion-1", expect.objectContaining({ status: "VERIFIED" }));
    expect(ctx.db.insert.mock.calls.filter(([table]) => table === "metaLoopSuggestions")).toHaveLength(1);
  });

  it.each(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"] as const)("accepts equality for %s", (targetDirection) => {
    expect(buildMetaMeasurement({ ...costMeasurement, result: 5, targetDirection }).verdict).toBe("MET");
  });

  it("retains higher-is-better meaning when direction is omitted", () => {
    const { targetDirection: _direction, ...legacy } = costMeasurement;
    expect(buildMetaMeasurement(legacy)).toMatchObject({ targetDirection: "HIGHER_IS_BETTER", verdict: "MISSED" });
  });

  it.each([
    ["baseline", Number.NaN], ["result", Number.POSITIVE_INFINITY], ["target", Number.NEGATIVE_INFINITY],
  ])("rejects non-finite %s before writing a result", async (field, value) => {
    const ctx = measurementContext();
    await expect(handler(recordMeasurement)(ctx, { ...costMeasurement, [field]: value })).rejects.toThrow(/finite/i);
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("keeps permission and linked-work requirements", async () => {
    const denied = measurementContext();
    vi.mocked(requireWorkspacePermission).mockRejectedValueOnce(new Error("Permission denied"));
    await expect(handler(recordMeasurement)(denied, costMeasurement)).rejects.toThrow("Permission denied");
    expect(denied.db.patch).not.toHaveBeenCalled();
    const unlinked = measurementContext({ workOrderId: undefined });
    await expect(handler(recordMeasurement)(unlinked, costMeasurement)).rejects.toThrow(/linked governed work/);
    expect(unlinked.db.patch).not.toHaveBeenCalled();
  });

  it("keeps the evidence requirement", async () => {
    const ctx = measurementContext();
    await expect(handler(recordMeasurement)(ctx, { ...costMeasurement, evidenceRefs: [] })).rejects.toThrow(/evidence/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("allows the same optional direction in the API and persisted schema", () => {
    const api = JSON.parse((recordMeasurement as any).exportArgs()).value.targetDirection;
    const persisted = (schema.tables.metaLoopSuggestions.validator.json as any).value.measurement.fieldType.value.targetDirection;
    const expected = { optional: true, fieldType: { type: "union", value: [
      { type: "literal", value: "HIGHER_IS_BETTER" }, { type: "literal", value: "LOWER_IS_BETTER" },
    ] } };
    expect(api).toEqual(expected);
    expect(persisted).toEqual(expected);
  });
});

describe("Factory Learning recorded quality", () => {
  it("rejects a cheaper candidate whose recorded quality regressed", async () => {
    const result = await handler(getExperimentReview)(experimentContext([0.95, 0.2]), { candidateId: "candidate-1" });
    expect(result.recommendation).toMatchObject({
      recommendation: "REJECT_RECOMMENDED", autoPromote: false, statisticallySignificant: false,
      improvements: ["cost"], regressions: ["quality score"],
    });
  });

  it.each([[0.95, 0.95], [0.8, 0.9]])("allows advisory cost improvement when score is preserved or improved", async (baseline, candidate) => {
    const result = await handler(getExperimentReview)(experimentContext([baseline, candidate]), { candidateId: "candidate-1" });
    expect(result.recommendation).toMatchObject({ recommendation: "PROMOTION_RECOMMENDED", autoPromote: false, regressions: [] });
  });

  it.each([[undefined, 0.9], [0.9, undefined]])("holds an otherwise positive comparison with one missing score", async (baseline, candidate) => {
    const result = await handler(getExperimentReview)(experimentContext([baseline, candidate]), { candidateId: "candidate-1" });
    expect(result.recommendation).toMatchObject({ recommendation: "HOLD_RECOMMENDED", autoPromote: false });
    expect(result.recommendation.comparisonWarnings).toContain("Quality score is missing for one variant.");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1, "bad", null])("holds a comparison with an invalid recorded score: %s", async (candidate) => {
    const result = await handler(getExperimentReview)(experimentContext([0.9, candidate]), { candidateId: "candidate-1" });
    expect(result.recommendation).toMatchObject({ recommendation: "HOLD_RECOMMENDED", autoPromote: false });
    expect(result.recommendation.comparisonWarnings).toContain("Quality scores must be finite numbers between 0 and 1.");
  });

  it("preserves the existing metric comparison when both scores are absent", async () => {
    const result = await handler(getExperimentReview)(experimentContext([undefined, undefined]), { candidateId: "candidate-1" });
    expect(result.recommendation).toMatchObject({ recommendation: "PROMOTION_RECOMMENDED", autoPromote: false });
  });
});
