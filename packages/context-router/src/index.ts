/**
 * Mission Control Context Router
 *
 * Intent classification + routing for incoming requests.
 * Two-tier system:
 *   Tier 1: Rule-based (keyword patterns, heuristics) — <1ms, sync
 *   Tier 2: LLM-based classifier — invoked on low-confidence inputs, async
 *
 * Usage (Tier 1 only):
 *   import { ContextRouter, classify } from "@mission-control/context-router";
 *   const router = new ContextRouter();
 *   const result = router.route({ input: "Build a user dashboard", source: "HUMAN" });
 *
 * Usage (Tier 1 + Tier 2 LLM):
 *   const router = new ContextRouter({}, myLLMClient);
 *   const result = await router.routeAsync({ input: "...", source: "HUMAN" });
 */

export { ContextRouter, DEFAULT_ROUTER_CONFIG } from "./router";
export { classify } from "./classifier";
export { classifyWithLLM } from "./llm-classifier";
export type { LLMClient } from "./llm-classifier";
export type {
  ContextRouterConfig,
  ClassificationResult,
  RouteResult,
  RouteDecision,
  RoutingContext,
  RoutingRule,
  IntentCategory,
  ComplexityTier,
} from "./types";
