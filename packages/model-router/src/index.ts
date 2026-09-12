/**
 * @mission-control/model-router
 *
 * Multi-model routing, fallback chains, and cost estimation.
 * Supports Claude (Anthropic) and GPT-4o (OpenAI).
 *
 * Usage:
 *   const router = new ModelRouter();
 *   router.initialize({ anthropicApiKey: "sk-...", openaiApiKey: "sk-..." });
 *   const response = await router.route({ messages: [...], taskType: "ENGINEERING" });
 */

export { ModelRouter } from "./router";
export { CostEstimator } from "./cost-estimator";
export { resolveModelRoute } from "./policy";
export {
  EXECUTION_ROUTING_ALGORITHM_VERSION,
  resolveExecutionRoute,
  workOrderRiskToExecutionTier,
} from "./execution-routing";
export { ClaudeProvider, CLAUDE_MODELS } from "./providers/claude";
export { OpenAIProvider, OPENAI_MODELS } from "./providers/openai";
export {
  INFERENCE_INTENT_SCHEMA,
  INFERENCE_PRICE_BOOK_SCHEMA,
  INFERENCE_RECEIPT_SCHEMA,
  INFERENCE_RESERVATION_SCHEMA,
  OUTCOME_EVENT_SCHEMA,
  OUTCOME_FORMULA_VERSION,
  OUTCOME_PROJECTION_SCHEMA,
  calculateInferenceCost,
  canonicalOutcomeSourceDigest,
  claimPhysicalInferenceIntent,
  compareRouteEconomics,
  factoryOutcomeEvent,
  inferencePriceBook,
  inferenceReservation,
  logicalInferenceRequestKey,
  markPhysicalIntentAmbiguous,
  physicalInferenceIntent,
  physicalInferenceReceipt,
  projectFactoryOutcome,
  summarizeRouteEconomics,
  usageCompleteness,
} from "./governed-inference";
export type {
  ModelConfig,
  ModelProvider,
  ModelTier,
  ModelRequest,
  ModelResponse,
  ModelMessage,
  ModelTool,
  ModelToolCall,
  FallbackConfig,
  RouterConfig,
} from "./types";
export type {
  CatalogModel,
  ModelRoutingResult,
  RouteModelInput,
  RoutingPolicyInput,
  RoutingRisk,
  RoutingRule,
  RoutingSource,
  RoutingTier,
} from "./policy";
export type {
  ExecutionBackend,
  ExecutionEligibilityFacts,
  ExecutionEligibilityReasonCode,
  ExecutionEvidence,
  ExecutionRiskTier,
  ExecutionRoutingCandidate,
  ExecutionRoutingCandidateResult,
  ExecutionRoutingInput,
  ExecutionRoutingMetricScore,
  ExecutionRoutingMode,
  ExecutionRoutingPolicy,
  ExecutionRoutingResult,
  ExecutionTuple,
} from "./execution-routing";
export type {
  DeliveryState,
  ExactInferenceRoute,
  FactoryOutcomeEvent,
  FactoryOutcomeProjection,
  InferencePriceBook,
  InferenceReconciliation,
  InferenceReservation,
  ObservationCompleteness,
  OutcomeStage,
  PhysicalInferenceIntent,
  PhysicalInferenceReceipt,
  PhysicalIntentState,
  PriceBookRate,
  ProviderUsageObservation,
  RouteEconomicsSummary,
} from "./governed-inference";
