/**
 * Mission Control Coordinator
 * 
 * Central orchestrator that:
 *   1. Decomposes complex tasks into subtasks
 *   2. Delegates subtasks to the best specialist agent
 *   3. Monitors progress and detects stuck agents
 *   4. Resolves dependency conflicts
 *   5. Escalates to human when authority is exceeded
 */

export { decompose, type DecompositionResult, type Subtask } from "./decomposer";
export { delegate, type DelegationResult, type AgentCandidate } from "./delegator";
export { 
  buildDependencyGraph, 
  topologicalSort, 
  detectCycles, 
  type DependencyGraph 
} from "./dependency-graph";
export { 
  CoordinatorLoop, 
  type CoordinatorConfig 
} from "./loop";
