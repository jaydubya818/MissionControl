/**
 * Task Delegator
 * 
 * Selects the best agent for a given subtask based on:
 *   - Agent capabilities matching required capabilities
 *   - Agent autonomy level (higher = more trusted)
 *   - Historical performance (success rate, avg cost)
 *   - Current workload (how many active tasks)
 *   - Budget remaining
 */

import { Subtask } from "./decomposer";

export interface AgentCandidate {
  id: string;
  name: string;
  role: "INTERN" | "SPECIALIST" | "LEAD";
  status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
  allowedTaskTypes: string[];
  capabilities: string[];
  budgetRemaining: number;
  activeTaskCount: number;
  performanceScore: number; // 0-1, derived from success rate
}

export interface DelegationResult {
  subtaskIndex: number;
  subtask: Subtask;
  assignedAgentId: string;
  assignedAgentName: string;
  score: number;
  reasoning: string;
}

/**
 * Delegate a subtask to the best available agent.
 * Returns null if no suitable agent is available.
 */
export function delegate(
  subtask: Subtask,
  subtaskIndex: number,
  candidates: AgentCandidate[]
): DelegationResult | null {
  // Filter to only eligible candidates
  const eligible = candidates.filter((agent) => {
    // Must be ACTIVE
    if (agent.status !== "ACTIVE") return false;
    
    // Must have budget remaining
    if (agent.budgetRemaining <= 0) return false;
    
    // Must support the task type
    if (
      agent.allowedTaskTypes.length > 0 &&
      !agent.allowedTaskTypes.includes(subtask.type)
    ) {
      return false;
    }
    
    return true;
  });
  
  if (eligible.length === 0) return null;
  
  // Score each candidate
  const scored = eligible.map((agent) => ({
    agent,
    score: scoreCandidate(agent, subtask),
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  
  return {
    subtaskIndex,
    subtask,
    assignedAgentId: best.agent.id,
    assignedAgentName: best.agent.name,
    score: best.score,
    reasoning: buildReasoning(best.agent, subtask, best.score),
  };
}

/**
 * Delegate all subtasks in a decomposition result.
 */
export function delegateAll(
  subtasks: Subtask[],
  candidates: AgentCandidate[]
): DelegationResult[] {
  const results: DelegationResult[] = [];
  
  // Track how many tasks we've assigned to each agent (to balance load)
  const assignmentCounts = new Map<string, number>();
  
  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    
    // Adjust candidate scores based on current assignment count
    const adjustedCandidates = candidates.map((c) => ({
      ...c,
      activeTaskCount: c.activeTaskCount + (assignmentCounts.get(c.id) ?? 0),
    }));
    
    const result = delegate(subtask, i, adjustedCandidates);
    if (result) {
      results.push(result);
      assignmentCounts.set(
        result.assignedAgentId,
        (assignmentCounts.get(result.assignedAgentId) ?? 0) + 1
      );
    }
  }
  
  return results;
}

// ============================================================================
// Scoring
// ============================================================================

function scoreCandidate(agent: AgentCandidate, subtask: Subtask): number {
  let score = 0;
  
  // Capability match (0-40 points)
  if (subtask.requiredCapabilities.length > 0) {
    const matchCount = subtask.requiredCapabilities.filter((cap) =>
      agent.capabilities.includes(cap)
    ).length;
    const matchRatio = matchCount / subtask.requiredCapabilities.length;
    score += matchRatio * 40;
  } else {
    // No specific capabilities required — all agents score equally here
    score += 20;
  }
  
  // Performance score (0-25 points)
  score += agent.performanceScore * 25;
  
  // Role bonus (0-15 points)
  const roleScores: Record<string, number> = {
    LEAD: 15,
    SPECIALIST: 10,
    INTERN: 5,
  };
  score += roleScores[agent.role] ?? 5;
  
  // Workload penalty (0 to -10 points)
  // Prefer agents with fewer active tasks
  const workloadPenalty = Math.min(agent.activeTaskCount * 2.5, 10);
  score -= workloadPenalty;
  
  // Budget headroom bonus (0-10 points)
  // Prefer agents with more budget remaining
  const budgetScore = Math.min(agent.budgetRemaining / 5, 1) * 10;
  score += budgetScore;
  
  return Math.max(0, score);
}

function buildReasoning(
  agent: AgentCandidate,
  subtask: Subtask,
  score: number
): string {
  const parts: string[] = [];
  
  // Capability match
  if (subtask.requiredCapabilities.length > 0) {
    const matched = subtask.requiredCapabilities.filter((cap) =>
      agent.capabilities.includes(cap)
    );
    parts.push(
      `Capabilities: ${matched.length}/${subtask.requiredCapabilities.length} match`
    );
  }
  
  parts.push(`Role: ${agent.role}`);
  parts.push(`Performance: ${(agent.performanceScore * 100).toFixed(0)}%`);
  parts.push(`Active tasks: ${agent.activeTaskCount}`);
  parts.push(`Budget remaining: $${agent.budgetRemaining.toFixed(2)}`);
  parts.push(`Score: ${score.toFixed(1)}`);
  
  return parts.join(" | ");
}
