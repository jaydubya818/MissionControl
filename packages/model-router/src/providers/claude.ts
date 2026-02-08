/**
 * Claude Provider
 *
 * Anthropic Claude adapter for the model router.
 * Supports Claude 3.5 Sonnet and Claude 3 Opus.
 */

import type {
  ModelConfig,
  ModelRequest,
  ModelResponse,
  ModelProvider,
} from "../types";

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const CLAUDE_MODELS: Record<string, ModelConfig> = {
  "claude-sonnet-4-20250514": {
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    tier: "standard",
    displayName: "Claude Sonnet 4",
    maxTokens: 8192,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    contextWindow: 200000,
    supportsVision: true,
    supportsTools: true,
  },
  "claude-3-5-sonnet-20241022": {
    id: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    tier: "standard",
    displayName: "Claude 3.5 Sonnet",
    maxTokens: 8192,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    contextWindow: 200000,
    supportsVision: true,
    supportsTools: true,
  },
  "claude-3-haiku-20240307": {
    id: "claude-3-haiku-20240307",
    provider: "anthropic",
    tier: "fast",
    displayName: "Claude 3 Haiku",
    maxTokens: 4096,
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
    contextWindow: 200000,
    supportsVision: true,
    supportsTools: true,
  },
};

// ============================================================================
// PROVIDER
// ============================================================================

export class ClaudeProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? "https://api.anthropic.com";
  }

  getProviderName(): ModelProvider {
    return "anthropic";
  }

  getModels(): ModelConfig[] {
    return Object.values(CLAUDE_MODELS);
  }

  getModel(modelId: string): ModelConfig | undefined {
    return CLAUDE_MODELS[modelId];
  }

  /**
   * Send a completion request to Claude.
   */
  async complete(
    modelId: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const model = CLAUDE_MODELS[modelId];
    if (!model) {
      throw new Error(`Unknown Claude model: ${modelId}`);
    }

    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: request.maxTokens ?? model.maxTokens,
      messages: request.messages.map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      })),
    };

    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Claude API error ${response.status}: ${errorBody}`
      );
    }

    const data = (await response.json()) as any;
    const durationMs = Date.now() - startTime;

    // Extract text content
    const textBlocks = (data.content ?? []).filter(
      (b: any) => b.type === "text"
    );
    const content = textBlocks.map((b: any) => b.text).join("");

    // Extract tool calls
    const toolUseBlocks = (data.content ?? []).filter(
      (b: any) => b.type === "tool_use"
    );
    const toolCalls = toolUseBlocks.map((b: any) => ({
      id: b.id,
      name: b.name,
      arguments: b.input,
    }));

    // Calculate cost
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costUsd =
      (inputTokens / 1000) * model.inputCostPer1k +
      (outputTokens / 1000) * model.outputCostPer1k;

    return {
      content,
      model: modelId,
      provider: "anthropic",
      tier: model.tier,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: data.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      cacheHit:
        (data.usage?.cache_read_input_tokens ?? 0) > 0,
    };
  }
}
