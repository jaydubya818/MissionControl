/**
 * Mission Control Context Router
 *
 * Intent classification + routing for incoming requests.
 * Two-tier system:
 *   Tier 1: Rule-based (keyword patterns, heuristics) — <1ms
 *   Tier 2: LLM-based (future) — for ambiguous inputs
 *
 * Usage:
 *   import { ContextRouter, classify } from "@mission-control/context-router";
 *   const router = new ContextRouter();
 *   const result = router.route({ input: "Build a user dashboard", source: "HUMAN" });
 */

export { ContextRouter, DEFAULT_ROUTER_CONFIG } from "./router";
export { classify } from "./classifier";
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
