/**
 * Policy Evaluator
 * 
 * Core policy evaluation logic for risk classification and approval decisions.
 */

import {
  ToolRisk,
  AutonomyLevel,
  Agent,
  Task,
} from "@mission-control/shared";
import { TOOL_RISK_MAP, AUTONOMY_RULES } from "./rules";
import { validateToolAction, containsSecrets, affectsProduction } from "./allowlists";

/**
 * Classify tool risk level
 */
export function classifyRisk(
  tool: string,
  params?: Record<string, any>
): ToolRisk {
  // Get base risk from map
  let risk: ToolRisk = TOOL_RISK_MAP[tool] || "yellow";
  
  // Upgrade risk if params contain secrets or affect production
  if (params) {
    const paramsStr = JSON.stringify(params);
    if (containsSecrets(paramsStr) || affectsProduction(paramsStr)) {
      risk = "red";
    }
  }
  
  return risk;
}

/**
 * Approval requirement result
 */
export interface ApprovalRequirement {
  required: boolean;
  reason: string;
}

/**
 * Check if an action requires approval
 */
export function requiresApproval(
  tool: string,
  risk: ToolRisk,
  agent: Agent,
  task: Task,
  params?: Record<string, any>
): ApprovalRequirement {
  const autonomyRules = AUTONOMY_RULES[agent.autonomyLevel];
  
  // RED always requires approval
  if (risk === "red") {
    return {
      required: true,
      reason: "RED risk actions always require approval",
    };
  }
  
  // YELLOW requires approval for Interns
  if (risk === "yellow" && autonomyRules.requiresApprovalForYellow) {
    return {
      required: true,
      reason: `${agent.autonomyLevel} agents require approval for YELLOW actions`,
    };
  }
  
  // Check budget caps
  if (params?.estimatedCost) {
    const cost = params.estimatedCost;
    
    // Check per-run cap
    if (cost > agent.budgets.perRunCap) {
      return {
        required: true,
        reason: `Estimated cost ($${cost}) exceeds per-run cap ($${agent.budgets.perRunCap})`,
      };
    }
    
    // Check task budget
    if (task.spend + cost > task.budget) {
      return {
        required: true,
        reason: `Action would exceed task budget ($${task.budget})`,
      };
    }
    
    // Check agent daily budget
    if (agent.todaySpend + cost > agent.budgets.dailyCap) {
      return {
        required: true,
        reason: `Action would exceed agent daily budget ($${agent.budgets.dailyCap})`,
      };
    }
  }
  
  // Check tool-specific validation
  if (params) {
    const validation = validateToolAction(tool, params);
    if (!validation.allowed) {
      return {
        required: true,
        reason: `Action blocked: ${validation.reasons.join(", ")}`,
      };
    }
    if (validation.requiresApproval) {
      return {
        required: true,
        reason: validation.approvalReasons.join(", "),
      };
    }
  }
  
  // No approval required
  return {
    required: false,
    reason: "Action is within agent's autonomy level and budget",
  };
}

/**
 * Check if agent can spawn sub-agents
 */
export function canSpawn(agent: Agent): { allowed: boolean; reason?: string } {
  const autonomyRules = AUTONOMY_RULES[agent.autonomyLevel];
  
  if (!autonomyRules.canSpawn) {
    return {
      allowed: false,
      reason: `${agent.autonomyLevel} agents cannot spawn sub-agents`,
    };
  }
  
  return { allowed: true };
}

/**
 * Evaluate complete policy for an action
 */
export interface PolicyEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  risk: ToolRisk;
  reasons: string[];
}

export function evaluatePolicy(
  tool: string,
  params: Record<string, any>,
  agent: Agent,
  task: Task
): PolicyEvaluation {
  // Classify risk
  const risk = classifyRisk(tool, params);
  
  // Check approval requirement
  const approval = requiresApproval(tool, risk, agent, task, params);
  
  // Validate tool action
  const validation = validateToolAction(tool, params);
  
  return {
    allowed: validation.allowed,
    requiresApproval: approval.required,
    risk,
    reasons: [
      ...validation.reasons,
      ...(approval.required ? [approval.reason] : []),
    ],
  };
}
