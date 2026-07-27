import { describe, expect, it } from "vitest";
import {
  buildCriterionRows,
  buildEvalScenarioBlocks,
  overallEvalPct,
} from "./registryEvalComparison";

const scenario = {
  _id: "sc1",
  name: "Fieldwork Analytics: PlanetScale Connection Architecture",
  description: "PgBouncer connection pooling setup",
  criteria: [
    { id: "c1", label: "OLTP port 6432", weight: 10 },
    { id: "c2", label: "SSL parameters complete", weight: 10 },
    { id: "c3", label: "Dedicated PgBouncer username", weight: 10 },
  ],
};

describe("registryEvalComparison", () => {
  it("uses stored criterionResults when provided", () => {
    const rows = buildCriterionRows(scenario, {
      scenarioId: "sc1",
      scenarioName: scenario.name,
      baselineScore: 20,
      candidateScore: 93,
      criteriaPassed: 2,
      criteriaTotal: 3,
      criterionResults: [
        { criterionId: "c1", label: "OLTP port 6432", baselinePct: 0, withContextPct: 100 },
        { criterionId: "c2", label: "SSL parameters complete", baselinePct: 0, withContextPct: 100 },
        { criterionId: "c3", label: "Dedicated PgBouncer username", baselinePct: 0, withContextPct: 75 },
      ],
    }, 90);

    expect(rows[0].baselinePct).toBe(0);
    expect(rows[0].withContextPct).toBe(100);
    expect(rows[2].withContextPct).toBe(75);
  });

  it("builds scenario blocks with overall average", () => {
    const blocks = buildEvalScenarioBlocks([scenario], [
      {
        scenarioId: "sc1",
        scenarioName: scenario.name,
        baselineScore: 10,
        candidateScore: 90,
        criteriaPassed: 3,
        criteriaTotal: 3,
      },
    ], 85);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe(scenario.name);
    expect(blocks[0].criteria).toHaveLength(3);
    expect(overallEvalPct(blocks)).toBe(90);
  });
});
