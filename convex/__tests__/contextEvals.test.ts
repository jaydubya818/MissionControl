import { describe, expect, it } from "vitest";
import {
  aggregateEvalRun,
  averageScenarioScores,
  clampScore,
  computeImpactDelta,
  computeImpactScore,
  defaultSkillScenarios,
  validateCriteriaWeights,
} from "../lib/contextEvals";

describe("clampScore", () => {
  it("clamps to 0–100 and rounds", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(72.6)).toBe(73);
  });
});

describe("averageScenarioScores", () => {
  it("returns the mean of scenario scores", () => {
    expect(averageScenarioScores([80, 60, 100])).toBe(80);
  });

  it("returns 0 for empty input", () => {
    expect(averageScenarioScores([])).toBe(0);
  });
});

describe("computeImpactScore", () => {
  it("returns 0 when candidate does not beat baseline", () => {
    expect(computeImpactScore(70, 70)).toBe(0);
    expect(computeImpactScore(80, 60)).toBe(0);
  });

  it("returns 100 when candidate maxes out from zero baseline", () => {
    expect(computeImpactScore(0, 100)).toBe(100);
  });

  it("returns partial lift for intermediate improvement", () => {
    expect(computeImpactScore(50, 75)).toBe(50);
  });
});

describe("computeImpactDelta", () => {
  it("is candidate minus baseline", () => {
    expect(computeImpactDelta(40, 85)).toBe(45);
  });
});

describe("aggregateEvalRun", () => {
  it("aggregates multiple scenario results", () => {
    const aggregate = aggregateEvalRun([
      {
        scenarioId: "s1",
        scenarioName: "A",
        baselineScore: 40,
        candidateScore: 80,
        criteriaPassed: 2,
        criteriaTotal: 3,
      },
      {
        scenarioId: "s2",
        scenarioName: "B",
        baselineScore: 50,
        candidateScore: 90,
        criteriaPassed: 3,
        criteriaTotal: 3,
      },
    ]);
    expect(aggregate.baselineScore).toBe(45);
    expect(aggregate.candidateScore).toBe(85);
    expect(aggregate.impactDelta).toBe(40);
    expect(aggregate.completedScenarios).toBe(2);
    expect(aggregate.impactScore).toBeGreaterThan(0);
  });
});

describe("defaultSkillScenarios", () => {
  it("returns three weighted scenarios", () => {
    const scenarios = defaultSkillScenarios("heartbeat", "software-factory/heartbeat");
    expect(scenarios).toHaveLength(3);
    for (const scenario of scenarios) {
      expect(() => validateCriteriaWeights(scenario.criteria)).not.toThrow();
    }
  });
});

describe("validateCriteriaWeights", () => {
  it("rejects weights that do not sum to 100", () => {
    expect(() =>
      validateCriteriaWeights([{ id: "a", label: "A", weight: 50 }])
    ).toThrow(/sum to 100/);
  });
});
