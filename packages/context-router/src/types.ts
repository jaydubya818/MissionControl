/**
 * Context Router Types
 *
 * Defines the interface for intent classification and routing.
 * The context router determines whether incoming requests should be:
 *   - Routed to the Coordinator (complex multi-step missions)
 *   - Handled as a single task (simple, direct)
 *   - Rejected/deferred (out of scope, budget exceeded)
 */

export type RouteDecision =
  | "COORDINATOR"     // Multi-step mission, decompose via Coordinator
  | "SINGLE_TASK"     // Simple task, create and assign directly
  | "CLARIFY"         // Ambiguous, needs human clarification
  | "REJECT"          // Out of scope or disallowed
  | "DEFER";          // Valid but should wait (budget, capacity)

export type IntentCategory =
  | "BUILD"           // Create something new (feature, page, API)
  | "FIX"             // Bug fix or error resolution
  | "RESEARCH"        // Investigation, analysis
  | "CONTENT"         // Writing, editing, publishing
  | "OPS"             // Infrastructure, deployment, monitoring
  | "REVIEW"          // Code review, QA
  | "REFACTOR"        // Improve existing code
  | "UNKNOWN";        // Cannot classify

export type ComplexityTier =
  | "TRIVIAL"         // < 15 min, single file, no deps
  | "SIMPLE"          // 15-60 min, few files, no external deps
  | "MODERATE"        // 1-4 hours, multiple files/packages
  | "COMPLEX"         // 4+ hours, cross-cutting concerns
  | "EPIC";           // Multi-day, requires decomposition

export interface RoutingContext {
  /** Raw user request text */
  input: string;
  /** Source of the request */
  source: "HUMAN" | "AGENT" | "SYSTEM" | "TELEGRAM" | "API";
  /** ID of the project (for scoping) */
  projectId?: string;
  /** Available budget (USD remaining) */
  budgetRemaining?: number;
  /** Number of active agents */
  activeAgentCount?: number;
  /** Maximum concurrent tasks allowed */
  maxConcurrentTasks?: number;
  /** Current pending task count */
  pendingTaskCount?: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  /** Primary intent */
  intent: IntentCategory;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected complexity */
  complexity: ComplexityTier;
  /** Detected task type (maps to TaskType) */
  taskType: string;
  /** Extracted keywords */
  keywords: string[];
  /** Optional detected subtasks */
  detectedSubtasks?: string[];
}

export interface RouteResult {
  /** Where to send this request */
  decision: RouteDecision;
  /** Why this route was chosen */
  reasoning: string;
  /** Classification details */
  classification: ClassificationResult;
  /** If SINGLE_TASK: suggested task properties */
  suggestedTask?: {
    title: string;
    description: string;
    type: string;
    priority: 1 | 2 | 3 | 4;
  };
  /** If COORDINATOR: suggested mission properties */
  suggestedMission?: {
    title: string;
    description: string;
    type: string;
    priority: 1 | 2 | 3 | 4;
    estimatedSubtasks: number;
  };
  /** If CLARIFY: questions to ask */
  clarifyQuestions?: string[];
  /** If REJECT: reason */
  rejectReason?: string;
  /** If DEFER: reason and estimated availability */
  deferReason?: string;
}

export interface ContextRouterConfig {
  /** Complexity threshold above which we route to Coordinator */
  coordinatorThreshold: ComplexityTier;
  /** Minimum confidence to proceed without clarification */
  minConfidence: number;
  /** Maximum budget allowed per single task */
  singleTaskBudgetCap: number;
  /** Custom rules (tier 1) evaluated before LLM */
  customRules: RoutingRule[];
}

export interface RoutingRule {
  /** Rule name for logging */
  name: string;
  /** Regex or keyword patterns to match */
  patterns: RegExp[];
  /** Forced route if patterns match */
  route: RouteDecision;
  /** Task type to assign */
  taskType?: string;
  /** Complexity override */
  complexity?: ComplexityTier;
  /** Priority override */
  priority?: 1 | 2 | 3 | 4;
}
