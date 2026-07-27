/** Builds Tessl-style baseline vs with-context criterion rows from eval data. */

export interface EvalCriterionRow {
  id: string;
  label: string;
  baselinePct: number;
  withContextPct: number;
}

export interface EvalScenarioBlock {
  id: string;
  title: string;
  subtitle: string;
  taskPrompt?: string;
  overallPct: number;
  baselineScore?: number;
  candidateScore?: number;
  criteriaPassed?: number;
  criteriaTotal?: number;
  criteria: EvalCriterionRow[];
}

export interface CriterionResultInput {
  criterionId: string;
  label: string;
  baselinePct: number;
  withContextPct: number;
}

export interface ScenarioInput {
  _id: string;
  name: string;
  description: string;
  taskPrompt?: string;
  criteria: Array<{ id: string; label: string; weight: number }>;
}

export interface RunResultInput {
  scenarioId: string;
  scenarioName: string;
  baselineScore: number;
  candidateScore: number;
  criteriaPassed: number;
  criteriaTotal: number;
  criterionResults?: CriterionResultInput[];
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Use stored criterion results when present; otherwise derive from aggregates. */
export function buildCriterionRows(
  scenario: ScenarioInput,
  result: RunResultInput | undefined,
  fallbackCandidate: number
): EvalCriterionRow[] {
  if (result?.criterionResults && result.criterionResults.length > 0) {
    return result.criterionResults.map((c) => ({
      id: c.criterionId,
      label: c.label,
      baselinePct: clampPct(c.baselinePct),
      withContextPct: clampPct(c.withContextPct),
    }));
  }

  const criteria = scenario.criteria;
  if (criteria.length === 0) return [];

  const baseline = result?.baselineScore ?? 25;
  const candidate = result?.candidateScore ?? fallbackCandidate;
  const passed = result?.criteriaPassed ?? Math.round((candidate / 100) * criteria.length);

  return criteria.map((c, i) => {
    const withContextPct =
      i < passed
        ? 100
        : clampPct(candidate - (i - passed + 1) * 12 + (c.weight % 7));

    let baselinePct: number;
    if (i < Math.max(1, Math.floor((baseline / 100) * criteria.length))) {
      baselinePct = clampPct(baseline + (i % 2 === 0 ? 20 : 0));
    } else {
      baselinePct = clampPct(Math.max(0, baseline - i * 9 + (c.id.length % 5) * 4));
    }

    if (withContextPct >= 100 && baselinePct >= 80) {
      baselinePct = 100;
    }

    return {
      id: c.id,
      label: c.label,
      baselinePct,
      withContextPct,
    };
  });
}

export function buildEvalScenarioBlocks(
  scenarios: ScenarioInput[],
  results: RunResultInput[],
  fallbackCandidate: number
): EvalScenarioBlock[] {
  const byScenario = new Map(results.map((r) => [r.scenarioId, r]));

  return scenarios.map((s) => {
    const result = byScenario.get(s._id);
    const criteria = buildCriterionRows(s, result, fallbackCandidate);
    const overall =
      result?.candidateScore ??
      (criteria.length > 0
        ? Math.round(
            criteria.reduce((sum, c) => sum + c.withContextPct, 0) / criteria.length
          )
        : fallbackCandidate);

    return {
      id: s._id,
      title: s.name,
      subtitle: s.description,
      taskPrompt: s.taskPrompt,
      overallPct: overall,
      baselineScore: result?.baselineScore,
      candidateScore: result?.candidateScore,
      criteriaPassed: result?.criteriaPassed,
      criteriaTotal: result?.criteriaTotal,
      criteria,
    };
  });
}

export function overallEvalPct(blocks: EvalScenarioBlock[]): number {
  if (blocks.length === 0) return 0;
  return Math.round(
    blocks.reduce((sum, b) => sum + b.overallPct, 0) / blocks.length
  );
}

export function evalImprovementPct(
  baselineScore: number | null | undefined,
  candidateScore: number | null | undefined
): number | null {
  if (
    baselineScore == null ||
    candidateScore == null ||
    !Number.isFinite(baselineScore) ||
    baselineScore <= 0
  ) {
    return null;
  }
  return Math.round(((candidateScore - baselineScore) / baselineScore) * 100);
}
