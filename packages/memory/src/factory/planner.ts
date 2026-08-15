import { stableId } from "./ingestion.js";
import type {
  ContextBudget,
  ContextSufficiency,
  FactoryMemoryResult,
  FactoryMemorySourceType,
  FactoryPurpose,
  RetrievalObservation,
  RetrievalPlan,
  RetrievalPlanStep,
  RetrievalStrategy,
  WorkOrderContextInput,
} from "./types.js";
const DEFAULT_BUDGETS: Record<FactoryPurpose, Required<ContextBudget>> = {
  software: { maxItems: 14, maxEstimatedTokens: 18_000 },
  verification: { maxItems: 16, maxEstimatedTokens: 20_000 },
  automation: { maxItems: 12, maxEstimatedTokens: 14_000 },
};
function step(
  strategy: RetrievalStrategy,
  query: string,
  reason: string,
  sourceTypes?: FactoryMemorySourceType[],
): RetrievalPlanStep {
  return { strategy, query, reason, sourceTypes };
}
export function planContextRetrieval(
  input: WorkOrderContextInput,
  budget: ContextBudget = {},
  createdAt = Date.now(),
): RetrievalPlan {
  const combined = [
    input.objective,
    input.context,
    ...input.acceptanceCriteria.map((criterion) => criterion.description),
    ...(input.changedPaths ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const normalized = combined.toLowerCase();
  const steps: RetrievalPlanStep[] = [];
  const required = new Set<FactoryMemorySourceType>();
  const closed =
    /\b(format|rename label|copy edit|punctuation only|no code change)\b/.test(
      normalized,
    ) &&
    !/\b(code|file|test|architecture|incident|dependency|verification)\b/.test(
      normalized,
    );
  if (closed)
    steps.push({
      strategy: "none",
      reason:
        "The WorkOrder supplies all information required for this bounded non-code change.",
    });
  else {
    if (
      /\b(modify|implement|change|fix|refactor|code|file|symbol|api|endpoint|middleware|service|component)\b/.test(
        normalized,
      ) ||
      input.changedPaths?.length
    ) {
      steps.push(
        step(
          "code",
          combined,
          "Resolve relevant repository files, symbols, imports and tests.",
          ["source-code", "test"],
        ),
      );
      required.add("source-code");
    }
    steps.push(
      step(
        "hybrid",
        combined,
        "Find authoritative semantic and lexical matches across Factory history.",
      ),
    );
    if (
      /\b(architecture|adr|govern|decision|policy|constraint|security boundary)\b/.test(
        normalized,
      )
    ) {
      steps.push(
        step(
          "architecture",
          combined,
          "Identify architecture decisions and constraints governing the change.",
          ["adr", "repository-document"],
        ),
      );
      required.add("adr");
    }
    if (
      /\b(depend|downstream|upstream|used by|affect|component|service|middleware|api)\b/.test(
        normalized,
      )
    )
      steps.push(
        step(
          "graph",
          combined,
          "Traverse typed dependencies, coverage and governing relationships.",
        ),
      );
    if (
      /\b(history|historical|previous|prior|before|similar change|commit|git)\b/.test(
        normalized,
      )
    )
      steps.push(
        step(
          "git-history",
          combined,
          "Review prior changes and WorkOrders affecting the same area.",
          ["git-history", "pull-request", "work-order"],
        ),
      );
    if (
      /\b(fail|failure|retry|trace|timeout|error|broke|break)\b/.test(
        normalized,
      )
    )
      steps.push(
        step(
          "trace-history",
          combined,
          "Find prior failed Attempts, traces and eval outcomes.",
          ["trace", "eval", "attempt", "verification-evidence"],
        ),
      );
    if (
      input.purpose === "verification" ||
      /\b(test|verify|verification|acceptance|evidence|regression)\b/.test(
        normalized,
      )
    ) {
      steps.push(
        step(
          "verification-history",
          combined,
          "Find applicable tests, evidence patterns and prior verification failures.",
          [
            "test",
            "verification-plan",
            "verification-evidence",
            "regression-case",
          ],
        ),
      );
      if (input.purpose === "verification") required.add("test");
    }
    if (
      /\b(incident|outage|historically breaks|risk|regression)\b/.test(
        normalized,
      ) ||
      input.purpose === "verification"
    )
      steps.push(
        step(
          "incident-history",
          combined,
          "Identify historical incidents and regressions connected to changed components.",
          ["incident", "regression-case"],
        ),
      );
  }
  const unique = [
    ...new Map(
      steps.map((candidate) => [candidate.strategy, candidate]),
    ).values(),
  ];
  const defaults = DEFAULT_BUDGETS[input.purpose];
  return {
    id: stableId(
      input.projectId,
      input.workOrderId,
      input.attemptId,
      input.factoryVersionId,
      input.purpose,
      createdAt,
    ),
    objective: input.objective,
    purpose: input.purpose,
    steps: unique,
    budget: {
      maxItems: Math.max(1, Math.min(50, budget.maxItems ?? defaults.maxItems)),
      maxEstimatedTokens: Math.max(
        256,
        Math.min(
          100_000,
          budget.maxEstimatedTokens ?? defaults.maxEstimatedTokens,
        ),
      ),
    },
    requiredSourceTypes: [...required],
    maxIterations: 3,
    createdAt,
  };
}
export function assessContextSufficiency(input: {
  results: FactoryMemoryResult[];
  requiredSourceTypes?: FactoryMemorySourceType[];
  budget: ContextBudget;
  minimumAuthoritativeResults?: number;
}): ContextSufficiency {
  const present = new Set(input.results.map((result) => result.sourceType));
  const missingSourceTypes = (input.requiredSourceTypes ?? []).filter(
    (sourceType) => !present.has(sourceType),
  );
  const authoritativeResultCount = input.results.filter(
    (result) => result.authority !== "inferred",
  ).length;
  const estimatedTokens = input.results.reduce(
    (sum, result) => sum + result.estimatedTokens,
    0,
  );
  const minimum = input.minimumAuthoritativeResults ?? 1;
  const reasons: string[] = [];
  if (missingSourceTypes.length)
    reasons.push(
      `Missing required source types: ${missingSourceTypes.join(", ")}.`,
    );
  if (authoritativeResultCount < minimum)
    reasons.push(
      `Only ${authoritativeResultCount} authoritative results; ${minimum} required.`,
    );
  if (
    input.budget.maxItems !== undefined &&
    input.results.length > input.budget.maxItems
  )
    reasons.push("Context item budget exceeded.");
  if (
    input.budget.maxEstimatedTokens !== undefined &&
    estimatedTokens > input.budget.maxEstimatedTokens
  )
    reasons.push("Context token budget exceeded.");
  if (!reasons.length)
    reasons.push(
      "Required source classes and authoritative-result minimum are present within budget.",
    );
  return {
    sufficient:
      missingSourceTypes.length === 0 &&
      authoritativeResultCount >= minimum &&
      (input.budget.maxItems === undefined ||
        input.results.length <= input.budget.maxItems) &&
      (input.budget.maxEstimatedTokens === undefined ||
        estimatedTokens <= input.budget.maxEstimatedTokens),
    reasons,
    missingSourceTypes,
    authoritativeResultCount,
    estimatedTokens,
  };
}
export async function runBoundedRetrievalLoop(input: {
  plan: RetrievalPlan;
  execute: (
    step: RetrievalPlanStep,
    iteration: number,
  ) => Promise<FactoryMemoryResult[]>;
  refine?: (
    step: RetrievalPlanStep,
    sufficiency: ContextSufficiency,
    iteration: number,
  ) => RetrievalPlanStep;
  minimumAuthoritativeResults?: number;
}): Promise<{
  results: FactoryMemoryResult[];
  sufficiency: ContextSufficiency;
  iterations: number;
  observations: RetrievalObservation[];
}> {
  const results = new Map<string, FactoryMemoryResult>();
  const observations: RetrievalObservation[] = [
    {
      type: "context.plan",
      resultCount: input.plan.steps.length,
      estimatedTokens: input.plan.budget.maxEstimatedTokens,
      latencyMs: 0,
      metadata: {
        strategies: input.plan.steps.map((candidate) => candidate.strategy),
      },
    },
  ];
  let sufficiency = assessContextSufficiency({
    results: [],
    requiredSourceTypes: input.plan.requiredSourceTypes,
    budget: input.plan.budget,
    minimumAuthoritativeResults: input.minimumAuthoritativeResults,
  });
  let iterations = 0;
  for (
    let iteration = 1;
    iteration <= input.plan.maxIterations;
    iteration += 1
  ) {
    iterations = iteration;
    for (const originalStep of input.plan.steps) {
      if (originalStep.strategy === "none") continue;
      const activeStep =
        iteration === 1 || !input.refine
          ? originalStep
          : input.refine(originalStep, sufficiency, iteration);
      const startedAt = Date.now();
      const stepResults = await input.execute(activeStep, iteration);
      for (const result of stepResults) {
        const existing = results.get(result.chunkId);
        if (!existing || result.score > existing.score)
          results.set(result.chunkId, result);
      }
      observations.push({
        type:
          activeStep.strategy === "code"
            ? "code.search"
            : activeStep.strategy === "graph" ||
                activeStep.strategy === "relationship"
              ? "graph.traversal"
              : "memory.search",
        strategy: activeStep.strategy,
        query: activeStep.query,
        resultCount: stepResults.length,
        latencyMs: Date.now() - startedAt,
      });
    }
    sufficiency = assessContextSufficiency({
      results: [...results.values()],
      requiredSourceTypes: input.plan.requiredSourceTypes,
      budget: input.plan.budget,
      minimumAuthoritativeResults: input.minimumAuthoritativeResults,
    });
    observations.push({
      type: "context.sufficiency",
      resultCount: results.size,
      estimatedTokens: sufficiency.estimatedTokens,
      latencyMs: 0,
      metadata: {
        sufficient: sufficiency.sufficient,
        reasons: sufficiency.reasons,
      },
    });
    if (sufficiency.sufficient) break;
  }
  return {
    results: [...results.values()].sort(
      (left, right) => right.score - left.score,
    ),
    sufficiency,
    iterations,
    observations,
  };
}
