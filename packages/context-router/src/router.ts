/**
 * Context Router
 *
 * Two-tier routing engine:
 *   Tier 1: Rule-based classifier (fast, deterministic, <1ms)
 *   Tier 2: LLM-based classifier (future — for ambiguous inputs)
 *
 * The router receives raw user input, classifies intent + complexity,
 * and decides whether to route to:
 *   - Coordinator (complex missions)
 *   - Single task creation
 *   - Clarification request
 *   - Rejection/deferral
 */

import { classify } from "./classifier";
import { classifyWithLLM, type LLMClient } from "./llm-classifier";
import type {
  ContextRouterConfig,
  ComplexityTier,
  RouteDecision,
  RouteResult,
  RoutingContext,
  RoutingRule,
} from "./types";

// ============================================================================
// COMPLEXITY ORDERING (for threshold comparison)
// ============================================================================

const COMPLEXITY_ORDER: Record<ComplexityTier, number> = {
  TRIVIAL: 0,
  SIMPLE: 1,
  MODERATE: 2,
  COMPLEX: 3,
  EPIC: 4,
};

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_ROUTER_CONFIG: ContextRouterConfig = {
  coordinatorThreshold: "COMPLEX",
  minConfidence: 0.3,
  singleTaskBudgetCap: 10, // USD
  customRules: [],
};

// ============================================================================
// BUILT-IN ROUTING RULES (Tier 1)
// ============================================================================

const BUILT_IN_RULES: RoutingRule[] = [
  {
    name: "emergency-stop",
    patterns: [
      /\b(emergency|stop|halt|abort|kill|shutdown|pause all|drain all)\b/i,
    ],
    route: "REJECT",
    complexity: "TRIVIAL",
  },
  {
    name: "help-request",
    patterns: [
      /^(help|what can you do|commands|how do i|status|show me)\b/i,
    ],
    route: "CLARIFY",
    complexity: "TRIVIAL",
  },
  {
    name: "simple-query",
    patterns: [
      /^(what|who|where|when|how many|list|show|get|count|status of)\b/i,
    ],
    route: "SINGLE_TASK",
    taskType: "CUSTOMER_RESEARCH",
    complexity: "TRIVIAL",
    priority: 3,
  },
];

// ============================================================================
// CONTEXT ROUTER
// ============================================================================

export class ContextRouter {
  private config: ContextRouterConfig;
  private allRules: RoutingRule[];
  private llmClient: LLMClient | null = null;

  constructor(config?: Partial<ContextRouterConfig>, llmClient?: LLMClient) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    // Built-in rules first, then custom rules (custom take priority via order)
    this.allRules = [...BUILT_IN_RULES, ...this.config.customRules];
    this.llmClient = llmClient ?? null;
  }

  /**
   * Attach (or replace) the Tier 2 LLM client at runtime.
   */
  setLLMClient(client: LLMClient): void {
    this.llmClient = client;
  }

  /**
   * Route an incoming request to the appropriate handler.
   */
  route(context: RoutingContext): RouteResult {
    const { input } = context;

    // 1. Check custom + built-in rules first (Tier 1 deterministic)
    const ruleMatch = this.matchRules(input);
    if (ruleMatch) {
      return ruleMatch;
    }

    // 2. Run classifier
    const classification = classify(input);

    // 3. Check confidence threshold
    if (classification.confidence < this.config.minConfidence) {
      return {
        decision: "CLARIFY",
        reasoning: `Low confidence classification (${(classification.confidence * 100).toFixed(0)}%). Intent detected as "${classification.intent}" but need more context.`,
        classification,
        clarifyQuestions: generateClarifyQuestions(classification),
      };
    }

    // 4. Check capacity constraints
    if (context.pendingTaskCount !== undefined && context.maxConcurrentTasks !== undefined) {
      if (context.pendingTaskCount >= context.maxConcurrentTasks) {
        return {
          decision: "DEFER",
          reasoning: `System at capacity: ${context.pendingTaskCount}/${context.maxConcurrentTasks} concurrent tasks. Request will be queued.`,
          classification,
          deferReason: `Task queue full (${context.pendingTaskCount} pending). Will be processed when capacity opens.`,
        };
      }
    }

    // 5. Check budget constraints
    if (context.budgetRemaining !== undefined && context.budgetRemaining <= 0) {
      return {
        decision: "DEFER",
        reasoning: "Budget exhausted. Request deferred until budget is replenished.",
        classification,
        deferReason: "Daily budget has been reached. Task will be queued for tomorrow.",
      };
    }

    // 6. Determine route based on complexity
    const decision = this.decideRoute(classification.complexity, context);

    // 7. Build the result
    return this.buildResult(decision, classification, context);
  }

  /**
   * Async version of route() that invokes the Tier 2 LLM classifier when:
   *   1. An LLMClient has been provided, AND
   *   2. Tier 1 confidence < config.llmFallbackThreshold (default 0.5)
   *
   * Falls back gracefully to the Tier 1 result if the LLM call fails.
   */
  async routeAsync(context: RoutingContext): Promise<RouteResult> {
    // First run the fast synchronous Tier 1 path
    const tier1Result = this.route(context);

    const threshold = this.config.llmFallbackThreshold ?? 0.5;

    // Only invoke Tier 2 if we have a client AND confidence is below threshold
    if (!this.llmClient || tier1Result.classification.confidence >= threshold) {
      return tier1Result;
    }

    // Tier 2: LLM-enhanced classification
    const enhanced = await classifyWithLLM(
      context.input,
      this.llmClient,
      tier1Result.classification
    );

    // If LLM didn't improve confidence enough, stick with Tier 1 result
    if (enhanced.confidence <= tier1Result.classification.confidence) {
      return tier1Result;
    }

    // Rebuild the route decision with the improved classification
    const decision = this.decideRoute(enhanced.complexity, context);
    return this.buildResult(decision, enhanced, context);
  }

  /**
   * Match input against routing rules.
   */
  private matchRules(input: string): RouteResult | null {
    for (const rule of this.allRules) {
      const matched = rule.patterns.some((p) => p.test(input));
      if (!matched) continue;

      const classification = classify(input);

      // Override classification with rule values
      if (rule.taskType) classification.taskType = rule.taskType;
      if (rule.complexity) classification.complexity = rule.complexity;

      if (rule.route === "REJECT") {
        return {
          decision: "REJECT",
          reasoning: `Matched rule "${rule.name}": this appears to be an emergency/system command, not a task.`,
          classification,
          rejectReason: "This looks like a system command. Use the emergency controls panel or Telegram bot for operational commands.",
        };
      }

      if (rule.route === "CLARIFY") {
        return {
          decision: "CLARIFY",
          reasoning: `Matched rule "${rule.name}": need more information to create a task.`,
          classification,
          clarifyQuestions: [
            "What specific outcome do you want?",
            "Which project is this for?",
            "What priority would you assign (1=critical, 4=nice-to-have)?",
          ],
        };
      }

      return this.buildResult(rule.route, classification, { input, source: "HUMAN" });
    }

    return null;
  }

  /**
   * Decide route based on complexity tier.
   */
  private decideRoute(
    complexity: ComplexityTier,
    context: RoutingContext
  ): RouteDecision {
    const threshold = COMPLEXITY_ORDER[this.config.coordinatorThreshold];
    const actual = COMPLEXITY_ORDER[complexity];

    if (actual >= threshold) {
      return "COORDINATOR";
    }

    return "SINGLE_TASK";
  }

  /**
   * Build a complete RouteResult.
   */
  private buildResult(
    decision: RouteDecision,
    classification: ReturnType<typeof classify>,
    context: RoutingContext
  ): RouteResult {
    const priority = inferPriority(classification);

    if (decision === "COORDINATOR") {
      return {
        decision,
        reasoning: `Classified as ${classification.complexity} ${classification.intent} task (confidence: ${(classification.confidence * 100).toFixed(0)}%). Routing to Coordinator for decomposition.`,
        classification,
        suggestedMission: {
          title: generateTitle(context.input, classification),
          description: context.input,
          type: classification.taskType,
          priority,
          estimatedSubtasks: classification.detectedSubtasks?.length ?? estimateSubtaskCount(classification.complexity),
        },
      };
    }

    return {
      decision,
      reasoning: `Classified as ${classification.complexity} ${classification.intent} task (confidence: ${(classification.confidence * 100).toFixed(0)}%). Creating as single task.`,
      classification,
      suggestedTask: {
        title: generateTitle(context.input, classification),
        description: context.input,
        type: classification.taskType,
        priority,
      },
    };
  }

  /**
   * Update config at runtime.
   */
  updateConfig(updates: Partial<ContextRouterConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.customRules) {
      this.allRules = [...BUILT_IN_RULES, ...this.config.customRules];
    }
  }

  getConfig(): ContextRouterConfig {
    return { ...this.config };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function inferPriority(
  classification: ReturnType<typeof classify>
): 1 | 2 | 3 | 4 {
  if (classification.intent === "FIX") return 2;
  if (classification.complexity === "EPIC") return 1;
  if (classification.complexity === "COMPLEX") return 2;
  if (classification.complexity === "TRIVIAL") return 4;
  return 3;
}

function generateTitle(
  input: string,
  classification: ReturnType<typeof classify>
): string {
  // Take first sentence or first 80 chars
  const firstSentence = input.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 80) return firstSentence;
  return firstSentence.slice(0, 77) + "...";
}

function estimateSubtaskCount(complexity: ComplexityTier): number {
  switch (complexity) {
    case "TRIVIAL":
      return 1;
    case "SIMPLE":
      return 2;
    case "MODERATE":
      return 3;
    case "COMPLEX":
      return 5;
    case "EPIC":
      return 7;
  }
}

function generateClarifyQuestions(
  classification: ReturnType<typeof classify>
): string[] {
  const questions: string[] = [];

  if (classification.intent === "UNKNOWN") {
    questions.push("Could you describe what you'd like to accomplish?");
    questions.push("Is this a new feature, a bug fix, or something else?");
  }

  if (classification.confidence < 0.2) {
    questions.push("Could you provide more detail about the expected outcome?");
  }

  questions.push("What priority would you assign? (1=critical, 4=nice-to-have)");

  return questions;
}
