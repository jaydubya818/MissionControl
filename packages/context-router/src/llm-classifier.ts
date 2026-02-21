/**
 * Tier 2 LLM Classifier
 *
 * Invoked when the Tier 1 rule-based classifier returns low confidence.
 * Uses an LLM to produce a structured ClassificationResult from the raw input.
 *
 * Design notes:
 *  - Accepts a generic LLMClient interface to avoid coupling to any specific
 *    model provider (no circular dependency with model-router).
 *  - Returns the same ClassificationResult type as the Tier 1 classifier so
 *    the router can treat both tiers uniformly.
 *  - Falls back to the Tier 1 result on any parse/API error.
 */

import type {
  ClassificationResult,
  ComplexityTier,
  IntentCategory,
} from "./types";

// ============================================================================
// LLM CLIENT INTERFACE
// ============================================================================

/**
 * Minimal interface for an LLM completion client.
 * Wire in any provider (Claude, OpenAI, etc.) — just implement `complete`.
 */
export interface LLMClient {
  /**
   * Send a prompt, receive a text response.
   * The classifier expects the response to be valid JSON.
   */
  complete(prompt: string): Promise<string>;
}

// ============================================================================
// CLASSIFICATION PROMPT
// ============================================================================

const VALID_INTENTS: IntentCategory[] = [
  "BUILD", "FIX", "RESEARCH", "CONTENT", "OPS", "REVIEW", "REFACTOR", "UNKNOWN",
];

const VALID_COMPLEXITIES: ComplexityTier[] = [
  "TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "EPIC",
];

const VALID_TASK_TYPES = [
  "ENGINEERING", "CONTENT", "SOCIAL", "EMAIL_MARKETING",
  "CUSTOMER_RESEARCH", "SEO_RESEARCH", "DOCS", "OPS",
];

function buildClassificationPrompt(input: string, tier1Hint: ClassificationResult): string {
  return `You are a task classification system for an AI agent orchestration platform.

Classify the following user request into structured metadata.

User request:
"""
${input}
"""

Tier 1 rule-based hint (may be wrong):
- intent: ${tier1Hint.intent}
- complexity: ${tier1Hint.complexity}  
- confidence: ${(tier1Hint.confidence * 100).toFixed(0)}%

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "intent": one of ${JSON.stringify(VALID_INTENTS)},
  "complexity": one of ${JSON.stringify(VALID_COMPLEXITIES)},
  "taskType": one of ${JSON.stringify(VALID_TASK_TYPES)},
  "confidence": number between 0 and 1,
  "keywords": array of up to 10 relevant keywords (strings),
  "detectedSubtasks": array of subtask strings if the request contains multiple steps, else []
}

Guidelines:
- BUILD: creating new features, pages, components, APIs, services
- FIX: fixing bugs, errors, broken functionality
- RESEARCH: investigating, analyzing, evaluating options
- CONTENT: writing, editing, publishing text content
- OPS: deployment, infrastructure, CI/CD, monitoring
- REVIEW: code review, QA, testing, validation
- REFACTOR: improving existing code without changing behaviour
- TRIVIAL: < 15 min, single file or line change
- SIMPLE: 15–60 min, small self-contained change
- MODERATE: 1–4 hours, touches multiple files
- COMPLEX: 4+ hours, cross-cutting concerns or integrations
- EPIC: multi-day, requires decomposition into sub-tasks`;
}

// ============================================================================
// PARSER
// ============================================================================

interface LLMClassificationResponse {
  intent: IntentCategory;
  complexity: ComplexityTier;
  taskType: string;
  confidence: number;
  keywords: string[];
  detectedSubtasks?: string[];
}

function parseResponse(raw: string, fallback: ClassificationResult): ClassificationResult {
  // Strip markdown fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: Partial<LLMClassificationResponse>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[llm-classifier] Failed to parse LLM response as JSON:", cleaned.slice(0, 200));
    return fallback;
  }

  // Validate and coerce each field
  const intent: IntentCategory =
    VALID_INTENTS.includes(parsed.intent as IntentCategory)
      ? (parsed.intent as IntentCategory)
      : fallback.intent;

  const complexity: ComplexityTier =
    VALID_COMPLEXITIES.includes(parsed.complexity as ComplexityTier)
      ? (parsed.complexity as ComplexityTier)
      : fallback.complexity;

  const taskType: string =
    typeof parsed.taskType === "string" && VALID_TASK_TYPES.includes(parsed.taskType)
      ? parsed.taskType
      : fallback.taskType;

  const confidence: number =
    typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : Math.min(fallback.confidence + 0.3, 1.0); // LLM pass boosts confidence

  const keywords: string[] = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((k): k is string => typeof k === "string").slice(0, 10)
    : fallback.keywords;

  const detectedSubtasks: string[] | undefined =
    Array.isArray(parsed.detectedSubtasks) && parsed.detectedSubtasks.length > 0
      ? parsed.detectedSubtasks.filter((s): s is string => typeof s === "string")
      : fallback.detectedSubtasks;

  return {
    intent,
    confidence,
    complexity,
    taskType,
    keywords,
    detectedSubtasks,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Classify input using an LLM when Tier 1 confidence is insufficient.
 *
 * @param input       Raw user input text
 * @param client      LLM completion client
 * @param tier1Result Tier 1 classification to use as hint + fallback
 * @returns           Enhanced ClassificationResult (falls back to tier1Result on error)
 */
export async function classifyWithLLM(
  input: string,
  client: LLMClient,
  tier1Result: ClassificationResult
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(input, tier1Result);

  try {
    const raw = await client.complete(prompt);
    const result = parseResponse(raw, tier1Result);
    return result;
  } catch (err) {
    console.warn(
      "[llm-classifier] LLM classification failed, falling back to Tier 1:",
      err instanceof Error ? err.message : String(err)
    );
    return tier1Result;
  }
}
