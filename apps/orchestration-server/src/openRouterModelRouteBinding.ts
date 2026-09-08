import { exactModelRouteDigest, exactModelRouteSnapshot } from "../../../convex/lib/modelRouteAdmission.js";
import type { FabOpenRouterRouteBinding } from "./fabOpenRouterBroker.js";

export function openRouterModelRouteBinding(input: {
  modelId: string;
  maxCostUsd: number;
  maximumOutputTokens: number;
}): FabOpenRouterRouteBinding {
  if (input.modelId !== "openai/gpt-4.1-mini"
    || !Number.isFinite(input.maxCostUsd) || input.maxCostUsd <= 0 || input.maxCostUsd > 5
    || !Number.isSafeInteger(input.maximumOutputTokens) || input.maximumOutputTokens < 1 || input.maximumOutputTokens > 4096) {
    throw new Error("FAB_OPENROUTER_CONFIGURATION_INVALID");
  }
  const snapshot = exactModelRouteSnapshot({
    provider: "openrouter",
    providerRoute: "openrouter",
    modelId: input.modelId,
  });
  return {
    providerRoute: "openrouter",
    routeDigest: exactModelRouteDigest(snapshot),
    modelId: input.modelId,
    maxCostUsd: input.maxCostUsd,
    maximumOutputTokens: input.maximumOutputTokens,
  };
}
