/**
 * Intent Classifier (Tier 1: Rule-based)
 *
 * Fast, deterministic classification using keyword patterns and heuristics.
 * No LLM calls — runs in <1ms. Falls back gracefully when uncertain.
 *
 * Tier 2 (LLM-based classification) can be layered on top for ambiguous inputs.
 */

import type {
  ClassificationResult,
  ComplexityTier,
  IntentCategory,
} from "./types";

// ============================================================================
// KEYWORD PATTERNS (ordered by specificity)
// ============================================================================

interface IntentPattern {
  intent: IntentCategory;
  patterns: RegExp[];
  defaultTaskType: string;
  weight: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "BUILD",
    patterns: [
      /\b(build|create|implement|add|develop|make|ship|launch|scaffold|bootstrap)\b/i,
      /\b(new feature|new page|new component|new endpoint|new api|new service)\b/i,
      /\b(set up|setup|integrate|wire up|hook up)\b/i,
    ],
    defaultTaskType: "ENGINEERING",
    weight: 1.0,
  },
  {
    intent: "FIX",
    patterns: [
      /\b(fix|bug|broken|error|crash|issue|problem|fail|wrong|doesn'?t work)\b/i,
      /\b(debug|troubleshoot|investigate error|patch|hotfix)\b/i,
      /\b(regression|defect|exception|stack trace)\b/i,
    ],
    defaultTaskType: "ENGINEERING",
    weight: 1.0,
  },
  {
    intent: "RESEARCH",
    patterns: [
      /\b(research|investigate|analyze|explore|evaluate|compare|assess|audit)\b/i,
      /\b(find out|look into|study|benchmark|pros and cons)\b/i,
      /\b(competitive analysis|market research|user research|feasibility)\b/i,
    ],
    defaultTaskType: "CUSTOMER_RESEARCH",
    weight: 0.9,
  },
  {
    intent: "CONTENT",
    patterns: [
      /\b(write|draft|blog|article|post|copy|content|newsletter|email campaign)\b/i,
      /\b(social media|tweet|linkedin|publish|editorial)\b/i,
      /\b(documentation|docs|readme|guide|tutorial)\b/i,
    ],
    defaultTaskType: "CONTENT",
    weight: 0.9,
  },
  {
    intent: "OPS",
    patterns: [
      /\b(deploy|infrastructure|ci\/cd|pipeline|monitoring|alert|scale|migrate)\b/i,
      /\b(devops|docker|kubernetes|terraform|ansible|server|hosting)\b/i,
      /\b(backup|restore|maintenance|upgrade|rollback|environment)\b/i,
    ],
    defaultTaskType: "OPS",
    weight: 0.9,
  },
  {
    intent: "REVIEW",
    patterns: [
      /\b(review|code review|pr review|qa|quality|test|check|verify|validate)\b/i,
      /\b(pull request|merge request|approval|sign off)\b/i,
    ],
    defaultTaskType: "ENGINEERING",
    weight: 0.8,
  },
  {
    intent: "REFACTOR",
    patterns: [
      /\b(refactor|restructure|reorganize|clean up|simplify|optimize|improve)\b/i,
      /\b(tech debt|technical debt|code quality|performance|speed up)\b/i,
      /\b(modernize|migrate|upgrade|consolidate)\b/i,
    ],
    defaultTaskType: "ENGINEERING",
    weight: 0.9,
  },
];

// ============================================================================
// COMPLEXITY HEURISTICS
// ============================================================================

interface ComplexitySignal {
  tier: ComplexityTier;
  patterns: RegExp[];
  weight: number;
}

const COMPLEXITY_SIGNALS: ComplexitySignal[] = [
  {
    tier: "EPIC",
    patterns: [
      /\b(entire|whole|complete|all|every|full|end.to.end|e2e)\b/i,
      /\b(system|platform|architecture|redesign|rewrite|overhaul)\b/i,
      /\bmulti.?(step|phase|stage|day|week)\b/i,
      /\band\b.*\band\b.*\band\b/i, // Multiple "and"s suggest compound task
    ],
    weight: 1.0,
  },
  {
    tier: "COMPLEX",
    patterns: [
      /\b(integration|cross.?cutting|multiple.*files|several.*components)\b/i,
      /\b(database.*schema|migration|api.*change|breaking.*change)\b/i,
      /\b(authentication|authorization|security|payment|billing)\b/i,
    ],
    weight: 0.8,
  },
  {
    tier: "MODERATE",
    patterns: [
      /\b(component|module|function|endpoint|page|view|modal)\b/i,
      /\b(update|modify|change|adjust|tweak|configure)\b/i,
    ],
    weight: 0.6,
  },
  {
    tier: "SIMPLE",
    patterns: [
      /\b(rename|typo|label|text|color|font|spacing|margin|padding)\b/i,
      /\b(toggle|flag|constant|config|env|variable|setting)\b/i,
    ],
    weight: 0.7,
  },
  {
    tier: "TRIVIAL",
    patterns: [
      /\b(bump|version|comment|log|console|print|whitespace)\b/i,
      /\bone.?line|single.?line|quick\b/i,
    ],
    weight: 0.8,
  },
];

// ============================================================================
// TASK TYPE DETECTION
// ============================================================================

const TASK_TYPE_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  {
    type: "ENGINEERING",
    patterns: [
      /\b(code|function|class|component|api|endpoint|database|schema|type|interface)\b/i,
      /\b(react|typescript|javascript|python|css|html|sql)\b/i,
    ],
  },
  {
    type: "CONTENT",
    patterns: [
      /\b(blog|article|post|copy|writing|editorial|newsletter)\b/i,
    ],
  },
  {
    type: "SOCIAL",
    patterns: [
      /\b(social|tweet|linkedin|instagram|facebook|tiktok|thread)\b/i,
    ],
  },
  {
    type: "EMAIL_MARKETING",
    patterns: [
      /\b(email|campaign|drip|sequence|subscriber|mailchimp|sendgrid)\b/i,
    ],
  },
  {
    type: "CUSTOMER_RESEARCH",
    patterns: [
      /\b(research|survey|interview|persona|customer|user|feedback|analytics)\b/i,
    ],
  },
  {
    type: "SEO_RESEARCH",
    patterns: [
      /\b(seo|keyword|ranking|serp|backlink|search.*engine|organic)\b/i,
    ],
  },
  {
    type: "DOCS",
    patterns: [
      /\b(documentation|readme|guide|tutorial|api.*doc|jsdoc|changelog)\b/i,
    ],
  },
  {
    type: "OPS",
    patterns: [
      /\b(deploy|devops|ci|cd|pipeline|docker|infra|monitor|terraform)\b/i,
    ],
  },
];

// ============================================================================
// CLASSIFIER
// ============================================================================

/**
 * Classify user input into intent, complexity, and task type.
 * Pure rule-based (Tier 1) — no LLM calls.
 */
export function classify(input: string): ClassificationResult {
  const normalized = input.trim();

  // 1. Match intent
  const intentScores = new Map<IntentCategory, number>();
  for (const pattern of INTENT_PATTERNS) {
    let matchCount = 0;
    for (const regex of pattern.patterns) {
      if (regex.test(normalized)) matchCount++;
    }
    if (matchCount > 0) {
      const score = (matchCount / pattern.patterns.length) * pattern.weight;
      intentScores.set(
        pattern.intent,
        Math.max(intentScores.get(pattern.intent) ?? 0, score)
      );
    }
  }

  let bestIntent: IntentCategory = "UNKNOWN";
  let bestIntentScore = 0;
  for (const [intent, score] of intentScores) {
    if (score > bestIntentScore) {
      bestIntent = intent;
      bestIntentScore = score;
    }
  }

  // 2. Determine complexity
  let bestComplexity: ComplexityTier = "MODERATE"; // default
  let bestComplexityScore = 0;
  for (const signal of COMPLEXITY_SIGNALS) {
    let matchCount = 0;
    for (const regex of signal.patterns) {
      if (regex.test(normalized)) matchCount++;
    }
    if (matchCount > 0) {
      const score = (matchCount / signal.patterns.length) * signal.weight;
      if (score > bestComplexityScore) {
        bestComplexity = signal.tier;
        bestComplexityScore = score;
      }
    }
  }

  // Word count heuristic: longer inputs tend to be more complex
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount > 80 && bestComplexity === "MODERATE") {
    bestComplexity = "COMPLEX";
  } else if (wordCount > 150) {
    bestComplexity = "EPIC";
  } else if (wordCount < 8 && bestComplexity === "MODERATE") {
    bestComplexity = "SIMPLE";
  }

  // 3. Detect task type
  let taskType =
    INTENT_PATTERNS.find((p) => p.intent === bestIntent)?.defaultTaskType ??
    "ENGINEERING";
  for (const tp of TASK_TYPE_PATTERNS) {
    for (const regex of tp.patterns) {
      if (regex.test(normalized)) {
        taskType = tp.type;
        break;
      }
    }
  }

  // 4. Extract keywords (simple: take capitalized words and nouns)
  const keywords = extractKeywords(normalized);

  // 5. Detect potential subtasks (sentences or bullet points)
  const detectedSubtasks = detectSubtasks(normalized);

  // 6. Compute confidence
  const confidence = computeConfidence(
    bestIntentScore,
    bestComplexityScore,
    wordCount,
    keywords.length
  );

  return {
    intent: bestIntent,
    confidence,
    complexity: bestComplexity,
    taskType,
    keywords,
    detectedSubtasks: detectedSubtasks.length > 0 ? detectedSubtasks : undefined,
  };
}

/**
 * Extract meaningful keywords from input.
 */
function extractKeywords(input: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "up", "about", "into", "through", "during", "before", "after",
    "above", "below", "between", "out", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "when", "where", "why",
    "how", "all", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "don", "now", "and", "but", "or", "if", "while",
    "as", "it", "its", "this", "that", "these", "those", "i", "me", "my",
    "we", "our", "you", "your", "he", "she", "they", "them", "what",
    "which", "who", "whom", "please", "make", "get", "let",
  ]);

  const words = input
    .replace(/[^a-zA-Z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .map((w) => w.toLowerCase());

  // Deduplicate while preserving order
  return [...new Set(words)].slice(0, 15);
}

/**
 * Detect potential subtasks from numbered lists, bullets, or "and"-separated clauses.
 */
function detectSubtasks(input: string): string[] {
  const subtasks: string[] = [];

  // Match numbered lists: "1. Do X", "2. Do Y"
  const numberedPattern = /(?:^|\n)\s*\d+[\.\)]\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = numberedPattern.exec(input)) !== null) {
    subtasks.push(match[1].trim());
  }
  if (subtasks.length > 0) return subtasks;

  // Match bullet points: "- Do X", "* Do Y"
  const bulletPattern = /(?:^|\n)\s*[-*•]\s*(.+)/g;
  while ((match = bulletPattern.exec(input)) !== null) {
    subtasks.push(match[1].trim());
  }
  if (subtasks.length > 0) return subtasks;

  // Match "then" chains: "Do X, then Y, then Z"
  const thenParts = input.split(/\bthen\b/i).map((s) => s.trim()).filter(Boolean);
  if (thenParts.length >= 2) return thenParts;

  return [];
}

/**
 * Compute overall classification confidence.
 */
function computeConfidence(
  intentScore: number,
  complexityScore: number,
  wordCount: number,
  keywordCount: number
): number {
  // Base confidence from intent match
  let confidence = intentScore * 0.6;

  // Complexity match adds confidence
  confidence += complexityScore * 0.2;

  // Having enough context (words) adds confidence
  if (wordCount >= 5 && wordCount <= 200) {
    confidence += 0.1;
  }

  // Keywords boost confidence
  if (keywordCount >= 3) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}
