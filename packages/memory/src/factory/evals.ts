import type {
  ContextEvalResult,
  ContextPackage,
  FactoryMemoryResult,
  FactoryRelationship,
} from "./types.js";
function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
export function evaluateContextPackage(input: {
  contextPackage: ContextPackage;
  candidates?: FactoryMemoryResult[];
  usedSourceIds?: string[];
  relevantSourceIds?: string[];
  relationships?: FactoryRelationship[];
  expectedRelationships?: Array<{
    sourceId: string;
    relation: string;
    targetId: string;
  }>;
  retrievalLatencyMs?: number;
  verificationInfluenceCount?: number;
}): ContextEvalResult[] {
  const selected = input.contextPackage.items;
  const selectedIds = new Set(selected.map((item) => item.sourceId));
  const relevant = new Set(
    input.relevantSourceIds ?? selected.map((item) => item.sourceId),
  );
  const used = new Set(
    input.usedSourceIds ?? selected.map((item) => item.sourceId),
  );
  const relevantSelected = selected.filter((item) =>
    relevant.has(item.sourceId),
  ).length;
  const usedSelected = selected.filter((item) =>
    used.has(item.sourceId),
  ).length;
  const precision = selected.length ? relevantSelected / selected.length : 0;
  const recallProxy = relevant.size
    ? [...relevant].filter((id) => selectedIds.has(id)).length / relevant.size
    : 1;
  const unusedRatio = selected.length ? 1 - usedSelected / selected.length : 0;
  const maxTokens = input.contextPackage.budget.maxEstimatedTokens;
  const budgetCompliance =
    maxTokens === undefined ||
    input.contextPackage.estimatedTokens <= maxTokens;
  const efficiency = selected.length
    ? precision * (1 - unusedRatio) * (budgetCompliance ? 1 : 0.5)
    : 0;
  const expected = input.expectedRelationships ?? [];
  const actual = input.relationships ?? [];
  const matches = expected.filter((candidate) =>
    actual.some(
      (relationship) =>
        relationship.sourceId === candidate.sourceId &&
        relationship.relation === candidate.relation &&
        relationship.targetId === candidate.targetId,
    ),
  ).length;
  const relationshipAccuracy = expected.length ? matches / expected.length : 1;
  const latencyMs = input.retrievalLatencyMs ?? 0;
  const retrievalSuccess = selected.length ? 1 : 0;
  const verificationQuality =
    input.verificationInfluenceCount === undefined
      ? 1
      : Math.min(1, input.verificationInfluenceCount / 3);
  const result = (
    key: ContextEvalResult["key"],
    score: number,
    passed: boolean,
    reason: string,
    sampleSize = selected.length,
  ): ContextEvalResult => ({
    key,
    score: clamp(score),
    passed,
    reason,
    sampleSize,
  });
  return [
    result(
      "context_relevance",
      precision,
      precision >= 0.7,
      `${relevantSelected}/${selected.length} selected items match the deterministic relevance set.`,
    ),
    result(
      "context_precision",
      precision,
      precision >= 0.7,
      "Precision uses the fixture relevance set; it is not a universal relevance guarantee.",
    ),
    result(
      "context_recall_proxy",
      recallProxy,
      recallProxy >= 0.7,
      "Recall is a proxy over declared fixture sources, not a claim of complete ground truth.",
      relevant.size,
    ),
    result(
      "context_efficiency",
      efficiency,
      efficiency >= 0.6,
      "Efficiency combines precision, observed use and budget compliance.",
    ),
    result(
      "unused_context_ratio",
      1 - unusedRatio,
      unusedRatio <= 0.3,
      `${usedSelected}/${selected.length} selected items were marked used.`,
    ),
    result(
      "retrieval_cost",
      maxTokens ? 1 - input.contextPackage.estimatedTokens / maxTokens : 1,
      budgetCompliance,
      `${input.contextPackage.estimatedTokens} estimated tokens selected.`,
    ),
    result(
      "retrieval_latency",
      latencyMs <= 750 ? 1 : Math.max(0, 750 / latencyMs),
      latencyMs <= 750,
      `Retrieval completed in ${latencyMs}ms.`,
      1,
    ),
    result(
      "relationship_accuracy",
      relationshipAccuracy,
      relationshipAccuracy === 1,
      `${matches}/${expected.length} expected typed relationships matched.`,
      expected.length,
    ),
    result(
      "retrieval_success",
      retrievalSuccess,
      retrievalSuccess === 1,
      selected.length
        ? "At least one authorized context item was selected."
        : "No context items were selected.",
      1,
    ),
    result(
      "verification_context_quality",
      verificationQuality,
      verificationQuality >= 0.66,
      `${input.verificationInfluenceCount ?? 0} verification checks reference historical context.`,
      1,
    ),
    result(
      "context_budget_compliance",
      budgetCompliance ? 1 : 0,
      budgetCompliance,
      budgetCompliance
        ? "Context package is within configured budgets."
        : "Context package exceeds its token budget.",
      1,
    ),
  ];
}
export interface ContextExperimentVariant {
  name: string;
  package: ContextPackage;
  relevantSourceIds: string[];
  usedSourceIds: string[];
  latencyMs: number;
}
export function compareContextVariants(variants: ContextExperimentVariant[]) {
  return variants.map((variant) => {
    const evals = evaluateContextPackage({
      contextPackage: variant.package,
      relevantSourceIds: variant.relevantSourceIds,
      usedSourceIds: variant.usedSourceIds,
      retrievalLatencyMs: variant.latencyMs,
    });
    return {
      name: variant.name,
      contextItems: variant.package.items.length,
      estimatedTokens: variant.package.estimatedTokens,
      evals,
      budgetCompliant:
        evals.find(
          (evaluation) => evaluation.key === "context_budget_compliance",
        )?.passed ?? false,
      unusedContextRatio:
        1 -
        (evals.find((evaluation) => evaluation.key === "unused_context_ratio")
          ?.score ?? 0),
    };
  });
}
