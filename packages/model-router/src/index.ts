/**
 * @mission-control/model-router
 *
 * Multi-model routing, fallback chains, and cost estimation.
 * Ship Claude-only first; add other providers incrementally.
 */

export { ModelRouter } from "./router";
export { CostEstimator } from "./cost-estimator";
export { ClaudeProvider, CLAUDE_MODELS } from "./providers/claude";
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
