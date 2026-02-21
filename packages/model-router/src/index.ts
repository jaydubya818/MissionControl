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
export { ClaudeProvider, CLAUDE_MODELS } from "./providers/claude";
export { OpenAIProvider, OPENAI_MODELS } from "./providers/openai";
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
