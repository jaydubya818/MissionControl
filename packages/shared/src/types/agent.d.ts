/**
 * Agent Types
 *
 * Agents are autonomous OpenClaw sessions that execute tasks.
 */
export type AutonomyLevel = "intern" | "specialist" | "lead";
export type AgentStatus = "active" | "paused" | "drained" | "quarantined" | "stopped";
export interface ModelConfig {
    primary: string;
    fallback?: string;
}
export interface AgentBudgets {
    dailyCap: number;
    perRunCap: number;
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
//# sourceMappingURL=agent.d.ts.map