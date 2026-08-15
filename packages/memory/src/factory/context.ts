import { contentHash, stableId } from "./ingestion.js";
import type {
  ContextBudget,
  ContextDiff,
  ContextPackage,
  ContextPackageItem,
  FactoryMemoryResult,
  FactoryPurpose,
  FactoryVerificationPlan,
  RetrievalPlan,
  VerificationCheckRecommendation,
  WorkOrderContextInput,
} from "./types.js";
const SOURCE_PRIORITY: Record<
  FactoryPurpose,
  Partial<Record<FactoryMemoryResult["sourceType"], number>>
> = {
  software: {
    "source-code": 1,
    adr: 0.95,
    test: 0.9,
    incident: 0.85,
    "work-order": 0.8,
    "git-history": 0.75,
    trace: 0.7,
  },
  verification: {
    "verification-plan": 1,
    "verification-evidence": 1,
    test: 0.98,
    "regression-case": 0.98,
    incident: 0.95,
    adr: 0.9,
    "source-code": 0.88,
    trace: 0.85,
    "work-order": 0.8,
  },
  automation: {
    "repository-document": 1,
    adr: 0.95,
    "source-code": 0.9,
    artifact: 0.85,
    "work-order": 0.8,
    incident: 0.75,
  },
};
function rankForPurpose(
  result: FactoryMemoryResult,
  purpose: FactoryPurpose,
): number {
  const authority =
    result.authority === "authoritative"
      ? 1
      : result.authority === "deterministic"
        ? 0.9
        : 0.55;
  const profile = SOURCE_PRIORITY[purpose][result.sourceType] ?? 0.6;
  const path = result.relationshipPath?.length
    ? Math.max(0.5, 1 - result.relationshipPath.length * 0.12)
    : 0.75;
  const cost = Math.max(0.55, 1 - result.estimatedTokens / 20_000);
  return (
    result.score * 0.38 +
    authority * 0.22 +
    profile * 0.2 +
    path * 0.12 +
    cost * 0.08
  );
}
function priorityFor(
  result: FactoryMemoryResult,
  plan: RetrievalPlan,
): ContextPackageItem["priority"] {
  if (plan.requiredSourceTypes.includes(result.sourceType)) return "required";
  if (result.authority === "authoritative" && result.score >= 0.6)
    return "high";
  if (result.score >= 0.4) return "normal";
  return "optional";
}
function itemKey(
  item: Pick<ContextPackageItem, "sourceType" | "sourceId" | "provenance">,
): string {
  return `${item.sourceType}:${item.sourceId}:${item.provenance.revision ?? ""}`;
}
export function assembleContextPackage(input: {
  workOrder: WorkOrderContextInput;
  plan: RetrievalPlan;
  results: FactoryMemoryResult[];
  budget?: ContextBudget;
  generatedAt?: number;
  metadata?: Record<string, unknown>;
}): ContextPackage {
  const budget = { ...input.plan.budget, ...input.budget };
  const maxItems = Math.max(1, Math.min(50, budget.maxItems ?? 14));
  const maxTokens = Math.max(
    256,
    Math.min(100_000, budget.maxEstimatedTokens ?? 18_000),
  );
  const ranked = [...input.results]
    .map((result) => ({
      result,
      rank: rankForPurpose(result, input.workOrder.purpose),
    }))
    .sort(
      (left, right) =>
        right.rank - left.rank || right.result.score - left.result.score,
    );
  const selected: ContextPackageItem[] = [];
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();
  let tokens = 0;
  for (const { result } of ranked) {
    if (selected.length >= maxItems) break;
    const key = itemKey(result);
    if (seen.has(key)) continue;
    const sourceCount = sourceCounts.get(result.sourceType) ?? 0;
    const required = input.plan.requiredSourceTypes.includes(result.sourceType);
    if (!required && sourceCount >= Math.max(2, Math.ceil(maxItems / 3)))
      continue;
    if (tokens + result.estimatedTokens > maxTokens) continue;
    seen.add(key);
    sourceCounts.set(result.sourceType, sourceCount + 1);
    tokens += result.estimatedTokens;
    selected.push({
      sourceType: result.sourceType,
      sourceId: result.sourceId,
      documentId: result.documentId,
      chunkId: result.chunkId,
      content: result.content,
      reason: result.reason,
      priority: priorityFor(result, input.plan),
      estimatedTokens: result.estimatedTokens,
      retrievalMethod: result.retrievalMethod,
      provenance: result.provenance,
      relationshipPath: result.relationshipPath,
    });
  }
  const generatedAt = input.generatedAt ?? Date.now();
  const digest = contentHash(
    JSON.stringify({
      workOrderId: input.workOrder.workOrderId,
      attemptId: input.workOrder.attemptId,
      factoryVersionId: input.workOrder.factoryVersionId,
      purpose: input.workOrder.purpose,
      budget,
      items: selected.map((item) => ({
        key: itemKey(item),
        content: contentHash(item.content),
        path: item.relationshipPath,
      })),
    }),
  );
  return {
    id: stableId(
      input.workOrder.projectId,
      input.workOrder.workOrderId,
      input.workOrder.attemptId,
      digest,
    ),
    projectId: input.workOrder.projectId,
    repositoryId: input.workOrder.repositoryId,
    workOrderId: input.workOrder.workOrderId,
    attemptId: input.workOrder.attemptId,
    factoryVersionId: input.workOrder.factoryVersionId,
    purpose: input.workOrder.purpose,
    generatedAt,
    objective: input.workOrder.objective,
    items: selected,
    estimatedTokens: tokens,
    budget,
    retrievalPlanId: input.plan.id,
    retrievalStrategies: input.plan.steps.map(
      (candidate) => candidate.strategy,
    ),
    contentHash: digest,
    frozen: true,
    metadata: input.metadata,
  };
}
export function diffContextPackages(
  before: ContextPackage,
  after: ContextPackage,
): ContextDiff {
  const beforeBySource = new Map(
    before.items.map((item) => [`${item.sourceType}:${item.sourceId}`, item]),
  );
  const afterBySource = new Map(
    after.items.map((item) => [`${item.sourceType}:${item.sourceId}`, item]),
  );
  const added = after.items.filter(
    (item) => !beforeBySource.has(`${item.sourceType}:${item.sourceId}`),
  );
  const removed = before.items.filter(
    (item) => !afterBySource.has(`${item.sourceType}:${item.sourceId}`),
  );
  const changedRevisions: ContextDiff["changedRevisions"] = [];
  const changedRelationshipPaths: ContextDiff["changedRelationshipPaths"] = [];
  for (const [key, beforeItem] of beforeBySource) {
    const afterItem = afterBySource.get(key);
    if (!afterItem) continue;
    if (beforeItem.provenance.revision !== afterItem.provenance.revision)
      changedRevisions.push({
        sourceId: beforeItem.sourceId,
        before: beforeItem.provenance.revision,
        after: afterItem.provenance.revision,
      });
    const beforePath = beforeItem.relationshipPath ?? [];
    const afterPath = afterItem.relationshipPath ?? [];
    if (JSON.stringify(beforePath) !== JSON.stringify(afterPath))
      changedRelationshipPaths.push({
        sourceId: beforeItem.sourceId,
        before: beforePath,
        after: afterPath,
      });
  }
  return { added, removed, changedRevisions, changedRelationshipPaths };
}
function influences(
  contextPackage: ContextPackage,
  sourceTypes: ContextPackageItem["sourceType"][],
): VerificationCheckRecommendation["influencedBy"] {
  return contextPackage.items
    .filter((item) => sourceTypes.includes(item.sourceType))
    .map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      revision: item.provenance.revision,
    }));
}
export function buildVerificationPlan(input: {
  contextPackage: ContextPackage;
  acceptanceCriteria: Array<{ id: string; description: string }>;
  createdAt?: number;
}): FactoryVerificationPlan {
  const context = input.contextPackage.items
    .map((item) => `${item.sourceId} ${item.content}`)
    .join(" ")
    .toLowerCase();
  const criterionIds = input.acceptanceCriteria.map(
    (criterion) => criterion.id,
  );
  const checks: VerificationCheckRecommendation[] = [];
  const add = (
    id: string,
    name: string,
    rationale: string,
    sourceTypes: ContextPackageItem["sourceType"][],
  ) =>
    checks.push({
      id,
      name,
      rationale,
      acceptanceCriterionIds: criterionIds,
      influencedBy: influences(input.contextPackage, sourceTypes),
      evidenceRequired: true,
    });
  if (/token refresh|refresh token/.test(context)) {
    add(
      "token-refresh-success",
      "Token refresh success",
      "Exercise the newly requested refresh path with an independently verifiable token exchange.",
      ["source-code", "adr", "test"],
    );
    add(
      "expired-token",
      "Expired-token regression",
      "Historical authentication context makes expiry handling a material boundary.",
      ["incident", "regression-case", "test"],
    );
  }
  if (
    /unauthenticated|unauthorized|auth middleware|authorization/.test(context)
  )
    add(
      "unauthenticated-401",
      "Unauthenticated endpoint returns 401",
      "Authorization ADR and incident context require explicit boundary validation.",
      ["adr", "incident", "regression-case"],
    );
  if (/orders-api|endpoint|downstream|used_by|depends_on/.test(context))
    add(
      "downstream-smoke",
      "Dependent endpoint smoke tests",
      "Graph relationships identify downstream API behavior that can regress after middleware changes.",
      ["source-code", "test", "adr"],
    );
  if (input.contextPackage.items.some((item) => item.sourceType === "incident"))
    add(
      "historical-incident-reproduction",
      "Historical incident reproduction",
      "Reproduce the prior incident before accepting the change.",
      ["incident", "regression-case", "verification-evidence"],
    );
  if (!checks.length)
    add(
      "acceptance-criteria",
      "Acceptance-criteria verification",
      "No specialized historical risk was found; verify each frozen criterion with objective evidence.",
      ["verification-plan", "test", "source-code"],
    );
  const createdAt = input.createdAt ?? Date.now();
  return {
    id: stableId(input.contextPackage.id, "verification-plan", createdAt),
    workOrderId: input.contextPackage.workOrderId,
    contextPackageId: input.contextPackage.id,
    createdAt,
    checks,
    advisoryOnly: true,
  };
}
