/**
 * Model Router
 *
 * Routes tasks to the appropriate model based on:
 *   - Task type (ENGINEERING → flagship, CONTENT → standard)
 *   - Risk level (RED → flagship for safety)
 *   - Budget constraints
 *   - Fallback chain on failure
 */

import type {
  ModelConfig,
  ModelRequest,
  ModelResponse,
  ModelTier,
  RouterConfig,
  FallbackConfig,
} from "./types";
import { ClaudeProvider, CLAUDE_MODELS } from "./providers/claude";
import { OpenAIProvider, OPENAI_MODELS } from "./providers/openai";
import { CostEstimator } from "./cost-estimator";

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_FALLBACK: FallbackConfig = {
  maxRetries: 2,
  retryDelayMs: 1000,
  fallbackChain: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
  ],
};

const DEFAULT_CONFIG: RouterConfig = {
  defaultTier: "standard",
  fallback: DEFAULT_FALLBACK,
  taskTypeOverrides: {
    // Complex tasks get flagship models
    ENGINEERING: "claude-sonnet-4-20250514",
    // Simple tasks get fast models
    DOCS: "claude-3-haiku-20240307",
    SOCIAL: "claude-3-haiku-20240307",
  },
  budgetWarningThreshold: 1.0,
};

// ============================================================================
// TASK TYPE → MODEL TIER MAPPING
// ============================================================================

const TASK_TYPE_TIERS: Record<string, ModelTier> = {
  ENGINEERING: "standard",
  CUSTOMER_RESEARCH: "standard",
  SEO_RESEARCH: "fast",
  CONTENT: "standard",
  SOCIAL: "fast",
  EMAIL_MARKETING: "fast",
  DOCS: "fast",
  OPS: "standard",
};

// ============================================================================
// ROUTER
// ============================================================================

export class ModelRouter {
  private claude: ClaudeProvider | null = null;
  private openai: OpenAIProvider | null = null;
  private config: RouterConfig;
  private costEstimator: CostEstimator;
  private totalCostUsd = 0;
  private requestCount = 0;

  constructor(config?: Partial<RouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.costEstimator = new CostEstimator();
  }

  /**
   * Initialize providers with API keys.
   * Both anthropicApiKey and openaiApiKey are optional — only initialise
   * providers whose keys are supplied.
   */
  initialize(keys: { anthropicApiKey?: string; openaiApiKey?: string }): void {
    if (keys.anthropicApiKey) {
      this.claude = new ClaudeProvider(keys.anthropicApiKey);
    }
    if (keys.openaiApiKey) {
      this.openai = new OpenAIProvider(keys.openaiApiKey);
    }
  }

  /**
   * Route a request to the best model.
   *
   * Selection logic:
   *   1. If taskType has an override, use that model
   *   2. If risk is RED, use flagship
   *   3. Otherwise, use the tier for the task type
   *   4. If budget limit provided, downgrade if needed
   */
  async route(request: ModelRequest): Promise<ModelResponse> {
    const modelId = this.selectModel(request);
    return this.executeWithFallback(modelId, request);
  }

  /**
   * Select the best model for a request.
   */
  selectModel(request: ModelRequest): string {
    // 1. Check task-type overrides
    if (request.taskType && this.config.taskTypeOverrides?.[request.taskType]) {
      return this.config.taskTypeOverrides[request.taskType];
    }

    // 2. RED risk → flagship
    if (request.riskLevel === "RED") {
      return this.getBestModelForTier("flagship") ?? this.config.fallback.fallbackChain[0];
    }

    // 3. Determine tier from task type or preference
    const tier =
      request.preferredTier ??
      (request.taskType ? TASK_TYPE_TIERS[request.taskType] : null) ??
      this.config.defaultTier;

    // 4. Budget check — downgrade if estimated cost exceeds limit
    if (request.budgetLimit !== undefined) {
      const estimatedTokens = this.costEstimator.estimateTokens(
        request.messages.map((m) => m.content).join(" ")
      );
      const modelForTier = this.getBestModelForTier(tier);
      if (modelForTier) {
        const model = this.getModelConfig(modelForTier);
        if (model) {
          const estimatedCost = this.costEstimator.estimateCost(
            model,
            estimatedTokens,
            request.maxTokens ?? model.maxTokens
          );
          if (estimatedCost > request.budgetLimit) {
            // Downgrade to cheaper model
            const cheaperModel = this.getBestModelForTier("fast");
            if (cheaperModel) return cheaperModel;
          }
        }
      }
    }

    return this.getBestModelForTier(tier) ?? this.config.fallback.fallbackChain[0];
  }

  /**
   * Execute with fallback chain.
   */
  private async executeWithFallback(
    primaryModelId: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const chain = [
      primaryModelId,
      ...this.config.fallback.fallbackChain.filter((id) => id !== primaryModelId),
    ];

    let lastError: Error | null = null;

    for (let i = 0; i < Math.min(chain.length, this.config.fallback.maxRetries + 1); i++) {
      const modelId = chain[i];
      try {
        const response = await this.callProvider(modelId, request);
        this.totalCostUsd += response.costUsd;
        this.requestCount++;
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[model-router] ${modelId} failed (attempt ${i + 1}): ${lastError.message}`
        );

        // Wait before retry
        if (i < chain.length - 1) {
          await this.delay(this.config.fallback.retryDelayMs * (i + 1));
        }
      }
    }

    throw lastError ?? new Error("All models in fallback chain failed");
  }

  /**
   * Call the appropriate provider for a model.
   * Routes Claude model IDs to ClaudeProvider, OpenAI IDs to OpenAIProvider.
   */
  private async callProvider(
    modelId: string,
    request: ModelRequest
  ): Promise<ModelResponse> {
    if (modelId in CLAUDE_MODELS) {
      if (!this.claude) {
        throw new Error("Anthropic API key not configured");
      }
      return this.claude.complete(modelId, request);
    }

    if (modelId in OPENAI_MODELS) {
      if (!this.openai) {
        throw new Error("OpenAI API key not configured");
      }
      return this.openai.complete(modelId, request);
    }

    throw new Error(`No provider available for model: ${modelId}`);
  }

  /**
   * Get the best available model for a tier.
   * Searches Claude models first, then OpenAI if a key is configured.
   */
  private getBestModelForTier(tier: ModelTier): string | null {
    // Prefer Claude
    const claudeModels = Object.values(CLAUDE_MODELS).filter((m) => m.tier === tier);
    if (claudeModels.length > 0) return claudeModels[0].id;

    // Fall back to OpenAI if initialized
    if (this.openai) {
      const openaiModels = Object.values(OPENAI_MODELS).filter((m) => m.tier === tier);
      if (openaiModels.length > 0) return openaiModels[0].id;
    }

    return null;
  }

  /**
   * Get model config by ID (searches all providers).
   */
  getModelConfig(modelId: string): ModelConfig | null {
    return CLAUDE_MODELS[modelId] ?? OPENAI_MODELS[modelId] ?? null;
  }

  /**
   * Get all available models across initialized providers.
   */
  getAvailableModels(): ModelConfig[] {
    const models: ModelConfig[] = [...Object.values(CLAUDE_MODELS)];
    if (this.openai) {
      models.push(...Object.values(OPENAI_MODELS));
    }
    return models;
  }

  /**
   * Get cost statistics.
   */
  getStats(): { totalCostUsd: number; requestCount: number } {
    return {
      totalCostUsd: this.totalCostUsd,
      requestCount: this.requestCount,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
