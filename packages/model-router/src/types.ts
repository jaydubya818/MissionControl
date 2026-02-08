/**
 * Model Router Types
 *
 * Shared types for the model routing system.
 */

/** Supported model providers */
export type ModelProvider = "anthropic" | "openai" | "google" | "xai";

/** Model tier for routing decisions */
export type ModelTier = "flagship" | "standard" | "fast";

/** Model configuration */
export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  tier: ModelTier;
  displayName: string;
  maxTokens: number;
  inputCostPer1k: number;   // USD per 1K input tokens
  outputCostPer1k: number;  // USD per 1K output tokens
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
}

/** Request to the model router */
export interface ModelRequest {
  messages: ModelMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ModelTool[];
  taskType?: string;
  riskLevel?: "GREEN" | "YELLOW" | "RED";
  preferredTier?: ModelTier;
  budgetLimit?: number; // Max USD for this request
}

/** A single message in a conversation */
export interface ModelMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Tool definition for function calling */
export interface ModelTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Response from the model router */
export interface ModelResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  toolCalls?: ModelToolCall[];
  finishReason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  cacheHit?: boolean;
}

/** A tool call returned by the model */
export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Fallback chain configuration */
export interface FallbackConfig {
  maxRetries: number;
  retryDelayMs: number;
  fallbackChain: string[]; // Model IDs in order of preference
}

/** Router configuration */
export interface RouterConfig {
  defaultTier: ModelTier;
  fallback: FallbackConfig;
  taskTypeOverrides?: Record<string, string>; // taskType -> modelId
  budgetWarningThreshold?: number; // USD threshold to warn
}
