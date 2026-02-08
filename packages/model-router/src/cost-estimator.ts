/**
 * Cost Estimator
 *
 * Estimates token usage and cost for model requests.
 */

import type { ModelConfig } from "./types";

export class CostEstimator {
  /**
   * Estimate token count for a text string.
   * Uses a rough approximation of ~4 characters per token.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate the cost of a request.
   */
  estimateCost(
    model: ModelConfig,
    inputTokens: number,
    outputTokens: number
  ): number {
    const inputCost = (inputTokens / 1000) * model.inputCostPer1k;
    const outputCost = (outputTokens / 1000) * model.outputCostPer1k;
    return inputCost + outputCost;
  }

  /**
   * Calculate actual cost from a completed request.
   */
  calculateCost(
    model: ModelConfig,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens?: number,
    cacheWriteTokens?: number
  ): {
    inputCost: number;
    outputCost: number;
    cacheSavings: number;
    totalCost: number;
  } {
    const inputCost = (inputTokens / 1000) * model.inputCostPer1k;
    const outputCost = (outputTokens / 1000) * model.outputCostPer1k;

    // Cache read tokens are typically 90% cheaper
    const cacheReadCost = cacheReadTokens
      ? (cacheReadTokens / 1000) * model.inputCostPer1k * 0.1
      : 0;
    const cacheSavings = cacheReadTokens
      ? (cacheReadTokens / 1000) * model.inputCostPer1k * 0.9
      : 0;

    // Cache write tokens cost 25% more
    const cacheWriteCost = cacheWriteTokens
      ? (cacheWriteTokens / 1000) * model.inputCostPer1k * 1.25
      : 0;

    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    return {
      inputCost,
      outputCost,
      cacheSavings,
      totalCost,
    };
  }

  /**
   * Check if a request is within budget.
   */
  isWithinBudget(
    model: ModelConfig,
    estimatedInputTokens: number,
    maxOutputTokens: number,
    budgetLimit: number
  ): { withinBudget: boolean; estimatedCost: number; budgetLimit: number } {
    const estimatedCost = this.estimateCost(
      model,
      estimatedInputTokens,
      maxOutputTokens
    );

    return {
      withinBudget: estimatedCost <= budgetLimit,
      estimatedCost,
      budgetLimit,
    };
  }
}
