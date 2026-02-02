/**
 * Policy Types
 *
 * Policies define risk classification, approval rules, budgets, and limits.
 */
import { AutonomyLevel } from "./agent";
import { TaskType } from "./task";
import { ToolRisk } from "./toolCall";
export interface AutonomyRules {
    [key: string]: {
        canSpawn: boolean;
        yellowAllowed: boolean;
        redAllowed: boolean;
        requiresApprovalForYellow: boolean;
        requiresApprovalForRed: boolean;
    };
}
export interface ToolRiskMap {
    [tool: string]: ToolRisk;
}
export interface Allowlists {
    shell: string[];
    shellBlocked: string[];
    network: string[];
    filesystem: {
        read: string[];
        write: string[];
        writeBlocked: string[];
    };
}
export interface BudgetDefaults {
    perAgentDaily: Record<AutonomyLevel, number>;
    perTask: Record<TaskType, number>;
    perRun: Record<AutonomyLevel, number>;
}
export interface SpawnLimits {
    maxActive: number;
    maxPerParent: number;
    maxDepth: number;
    ttl: number;
}
export interface LoopDetection {
    commentRateThreshold: number;
    commentRateWindow: number;
    reviewCycleLimit: number;
    backAndForthLimit: number;
    backAndForthWindow: number;
    retryLimit: number;
}
export interface Policy {
    _id: string;
    _creationTime: number;
    version: string;
    active: boolean;
    autonomyRules: AutonomyRules;
    riskMap: ToolRiskMap;
    allowlists: Allowlists;
    budgets: BudgetDefaults;
    spawnLimits: SpawnLimits;
    loopDetection: LoopDetection;
}
export interface CreatePolicyInput {
    version: string;
    autonomyRules: AutonomyRules;
    riskMap: ToolRiskMap;
    allowlists: Allowlists;
    budgets: BudgetDefaults;
    spawnLimits: SpawnLimits;
    loopDetection: LoopDetection;
}
//# sourceMappingURL=policy.d.ts.map