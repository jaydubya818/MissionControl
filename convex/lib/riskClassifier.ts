/**
 * Risk Classifier — mirrors @mission-control/policy-engine logic
 *
 * Centralized risk classification for tool calls.
 * This file consolidates the risk logic that was duplicated between
 * convex/policy.ts and packages/policy-engine/src/rules.ts.
 *
 * Risk levels:
 *   GREEN  — safe, auto-approve for all autonomy levels
 *   YELLOW — moderate risk, requires approval for INTERN
 *   RED    — high risk, always requires approval
 */

export type ToolRisk = "GREEN" | "YELLOW" | "RED";

// ============================================================================
// TOOL RISK MAP (source of truth, synced with packages/policy-engine/src/rules.ts)
// ============================================================================

export const TOOL_RISK_MAP: Record<string, ToolRisk> = {
  // GREEN — read-only, safe
  read: "GREEN",
  read_file: "GREEN",
  search: "GREEN",
  grep: "GREEN",
  glob: "GREEN",
  list_dir: "GREEN",
  list_files: "GREEN",
  web_search: "GREEN",
  think: "GREEN",

  // YELLOW — writes, moderate risk
  write: "YELLOW",
  write_file: "YELLOW",
  edit: "YELLOW",
  edit_file: "YELLOW",
  create_file: "YELLOW",
  delete_file: "YELLOW",
  rename_file: "YELLOW",
  shell: "YELLOW",
  exec: "YELLOW",
  bash: "YELLOW",
  web_fetch: "YELLOW",
  http: "YELLOW",
  fetch: "YELLOW",
  git_commit: "YELLOW",
  git_push: "YELLOW",

  // RED — destructive, external, production
  deploy: "RED",
  publish: "RED",
  git_force_push: "RED",
  rm_rf: "RED",
  database_write: "RED",
  send_email: "RED",
  send_message: "RED",
  payment: "RED",
  spawn_agent: "RED",
};

// ============================================================================
// RISK CLASSIFICATION
// ============================================================================

/**
 * Classify a tool's risk level, optionally upgrading based on params.
 */
export function classifyRisk(
  toolName: string,
  params?: Record<string, unknown>
): ToolRisk {
  let risk: ToolRisk = TOOL_RISK_MAP[toolName] ?? "YELLOW";

  // Upgrade risk if params contain secrets or affect production
  if (params) {
    const paramsStr = JSON.stringify(params).toLowerCase();
    if (containsSecrets(paramsStr) || affectsProduction(paramsStr)) {
      risk = "RED";
    }
  }

  return risk;
}

/**
 * Check if action parameters reference secrets.
 */
export function containsSecrets(paramsStr: string): boolean {
  const secretPatterns = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /private[_-]?key/i,
    /\.env/i,
    /credentials/i,
    /auth[_-]?header/i,
  ];

  return secretPatterns.some((p) => p.test(paramsStr));
}

/**
 * Check if action parameters affect production.
 */
export function affectsProduction(paramsStr: string): boolean {
  const prodPatterns = [
    /production/i,
    /prod\b/i,
    /--force/i,
    /--hard/i,
    /main\s+branch/i,
    /master\s+branch/i,
    /deploy/i,
  ];

  return prodPatterns.some((p) => p.test(paramsStr));
}

// ============================================================================
// AUTONOMY RULES
// ============================================================================

export interface AutonomyRule {
  requiresApprovalForYellow: boolean;
  requiresApprovalForRed: boolean;
  canSpawn: boolean;
  maxBudgetMultiplier: number;
}

export const AUTONOMY_RULES: Record<string, AutonomyRule> = {
  INTERN: {
    requiresApprovalForYellow: true,
    requiresApprovalForRed: true,
    canSpawn: false,
    maxBudgetMultiplier: 1.0,
  },
  SPECIALIST: {
    requiresApprovalForYellow: false,
    requiresApprovalForRed: true,
    canSpawn: false,
    maxBudgetMultiplier: 1.5,
  },
  LEAD: {
    requiresApprovalForYellow: false,
    requiresApprovalForRed: true,
    canSpawn: true,
    maxBudgetMultiplier: 2.0,
  },
};

/**
 * Determine if an action requires human approval.
 */
export function requiresApproval(
  risk: ToolRisk,
  agentRole: string,
  estimatedCost?: number,
  budgetRemaining?: number
): { required: boolean; reason: string } {
  const rules = AUTONOMY_RULES[agentRole] ?? AUTONOMY_RULES.INTERN;

  if (risk === "RED") {
    return { required: true, reason: "RED risk actions always require approval" };
  }

  if (risk === "YELLOW" && rules.requiresApprovalForYellow) {
    return {
      required: true,
      reason: `${agentRole} agents require approval for YELLOW actions`,
    };
  }

  if (
    estimatedCost !== undefined &&
    budgetRemaining !== undefined &&
    estimatedCost > budgetRemaining
  ) {
    return {
      required: true,
      reason: `Estimated cost ($${estimatedCost.toFixed(2)}) exceeds remaining budget ($${budgetRemaining.toFixed(2)})`,
    };
  }

  return { required: false, reason: "Action within autonomy level" };
}
