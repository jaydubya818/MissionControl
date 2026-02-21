/**
 * OpenAI Provider
 *
 * GPT-4o / GPT-4o-mini adapter for the model router.
 * Implements the same completion interface as ClaudeProvider.
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

export const OPENAI_MODELS: Record<string, ModelConfig> = {
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openai",
    tier: "flagship",
    displayName: "GPT-4o",
    maxTokens: 4096,
    inputCostPer1k: 0.005,
    outputCostPer1k: 0.015,
    contextWindow: 128000,
    supportsVision: true,
    supportsTools: true,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    tier: "fast",
    displayName: "GPT-4o Mini",
    maxTokens: 4096,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    contextWindow: 128000,
    supportsVision: true,
    supportsTools: true,
  },
};

// ============================================================================
// RESPONSE TYPES (OpenAI chat completions API)
// ============================================================================

interface OpenAIChoice {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter";
}

interface OpenAIResponse {
  id: string;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

// ============================================================================
// PROVIDER
// ============================================================================

export class OpenAIProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? "https://api.openai.com";
  }

  getProviderName(): ModelProvider {
    return "openai";
  }

  getModels(): ModelConfig[] {
    return Object.values(OPENAI_MODELS);
  }

  getModel(modelId: string): ModelConfig | undefined {
    return OPENAI_MODELS[modelId];
  }

  /**
   * Send a completion request to OpenAI.
   */
  async complete(modelId: string, request: ModelRequest): Promise<ModelResponse> {
    const model = OPENAI_MODELS[modelId];
    if (!model) {
      throw new Error(`Unknown OpenAI model: ${modelId}`);
    }

    const startTime = Date.now();

    // Build messages array — OpenAI supports system role natively
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      max_tokens: request.maxTokens ?? model.maxTokens,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    // OpenAI tool calling format
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const durationMs = Date.now() - startTime;
    const choice = data.choices[0];

    // Extract text content
    const content = choice.message.content ?? "";

    // Extract tool calls
    const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: (() => {
        try {
          return JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          return { raw: tc.function.arguments };
        }
      })(),
    }));

    const inputTokens = data.usage.prompt_tokens;
    const outputTokens = data.usage.completion_tokens;
    const costUsd =
      (inputTokens / 1000) * model.inputCostPer1k +
      (outputTokens / 1000) * model.outputCostPer1k;

    const finishReason: ModelResponse["finishReason"] =
      choice.finish_reason === "tool_calls"
        ? "tool_use"
        : choice.finish_reason === "length"
        ? "max_tokens"
        : "end_turn";

    return {
      content,
      model: modelId,
      provider: "openai",
      tier: model.tier,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }
}
