/**
 * Agent Types
 * 
 * Agents are autonomous OpenClaw sessions that execute tasks.
 * Values are UPPERCASE to match Convex schema (source of truth).
 */

export type AutonomyLevel = "INTERN" | "SPECIALIST" | "LEAD";

export type AgentStatus = 
  | "ACTIVE"       // Running normally
  | "PAUSED"       // Temporarily stopped
  | "DRAINED"      // Finishing current task, then pausing
  | "QUARANTINED"  // Immediately stopped, tasks blocked
  | "OFFLINE";     // Not running

export interface ModelConfig {
  primary: string;
  fallback?: string;
}

export interface AgentBudgets {
  dailyCap: number;    // USD per day
  perRunCap: number;   // USD per run
}

export interface Agent {
  _id: string;
  _creationTime: number;
  name: string;
  sessionKey: string;
  autonomyLevel: AutonomyLevel;
  status: AgentStatus;
  modelConfig: ModelConfig;
  toolPermissions: string[];
  budgets: AgentBudgets;
  currentTaskId?: string;
  lastHeartbeat?: number;
  errorStreak: number;
  totalSpend: number;
  todaySpend: number;
  soulHash?: string;
  metadata: Record<string, any>;
}

export interface CreateAgentInput {
  name: string;
  sessionKey: string;
  autonomyLevel: AutonomyLevel;
  modelConfig: ModelConfig;
  toolPermissions?: string[];
  budgets?: Partial<AgentBudgets>;
  soulHash?: string;
  metadata?: Record<string, any>;
}

export interface UpdateAgentInput {
  name?: string;
  autonomyLevel?: AutonomyLevel;
  status?: AgentStatus;
  modelConfig?: ModelConfig;
  toolPermissions?: string[];
  budgets?: Partial<AgentBudgets>;
  currentTaskId?: string;
  lastHeartbeat?: number;
  errorStreak?: number;
  totalSpend?: number;
  todaySpend?: number;
  soulHash?: string;
  metadata?: Record<string, any>;
}
