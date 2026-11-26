import { getFunctionName } from "convex/server";

const repositories = [{ repository: "fixture/qualification", displayName: "Isolated fixture", defaultBranch: "main", isDefault: true }];
const replayReview = {
  manifest: { _id: "fixture-manifest", definition: { variants: [{ id: "fixture-variant", name: "Baseline" }],
    cases: [{ key: "fixture-case", workload: { title: "Persist a task" } }] } },
  cases: [{ caseKey: "fixture-case", variantId: "fixture-variant", state: "UNBOUND", implementationAttempts: 0,
    failedAttemptIds: [], costUsd: null, ownerInterventions: null, assistantOutsideFactoryInterventions: null,
    unattributedEvaluatorCostIds: [], reasons: ["WORK_ORDER_MISSING"] }],
  comparison: { matchedPairs: 0, denominator: 1, minimumPairs: 1, sampleSufficient: false,
    recommendation: { recommendation: "HOLD_RECOMMENDED", comparisonWarnings: ["The frozen workload set has incomplete matched evidence."] } },
};

export function useQuery(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  if (name === "factory/replay:getReview") return replayReview;
  if (name === "factory/intake:listDeliveries") return [{ _id: "fixture-delivery", status: "FAILED", attempts: 1,
    source: { kind: "PRODUCT_ERROR", title: "Save failed" }, reason: "INTAKE_RELEASE_SCOPE_INVALID" }];
  return repositories;
}

export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  return async (payload: unknown) => {
    if (getFunctionName(reference).startsWith("factory/")) {
      window.dispatchEvent(new CustomEvent("fixture-operation", { detail: { operation: getFunctionName(reference), payload } }));
      return { scheduled: true };
    }
    window.dispatchEvent(new CustomEvent("fixture-draft", { detail: payload }));
    return { mission: { _id: "fixture-mission" } };
  };
}

export function useAction(reference: Parameters<typeof getFunctionName>[0]) {
  return async (payload: unknown) => {
    window.dispatchEvent(new CustomEvent("fixture-operation", { detail: { operation: getFunctionName(reference), payload } }));
    return { nextCursor: null, results: [{ caseKey: "fixture-case", status: "BLOCKED", reason: "CURRENT_APPROVAL_REQUIRED" }] };
  };
}
