/**
 * Policy — Convex Functions
 *
 * Policy evaluation for tool calls and transitions.
 */
export declare const getActive: import("convex/server").RegisteredQuery<"public", {}, Promise<{
    _id: import("convex/values").GenericId<"policies">;
    _creationTime: number;
    budgetDefaults?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    scopeId?: string | undefined;
    toolRiskMap?: any;
    shellAllowlist?: string[] | undefined;
    shellBlocklist?: string[] | undefined;
    fileReadPaths?: string[] | undefined;
    fileWritePaths?: string[] | undefined;
    networkAllowlist?: string[] | undefined;
    spawnLimits?: any;
    loopThresholds?: any;
    createdBy?: string | undefined;
    notes?: string | undefined;
    name: string;
    version: number;
    scopeType: "AGENT" | "GLOBAL" | "TASK_TYPE";
    rules: any;
    active: boolean;
} | null>>;
export declare const listAll: import("convex/server").RegisteredQuery<"public", {}, Promise<{
    _id: import("convex/values").GenericId<"policies">;
    _creationTime: number;
    budgetDefaults?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    scopeId?: string | undefined;
    toolRiskMap?: any;
    shellAllowlist?: string[] | undefined;
    shellBlocklist?: string[] | undefined;
    fileReadPaths?: string[] | undefined;
    fileWritePaths?: string[] | undefined;
    networkAllowlist?: string[] | undefined;
    spawnLimits?: any;
    loopThresholds?: any;
    createdBy?: string | undefined;
    notes?: string | undefined;
    name: string;
    version: number;
    scopeType: "AGENT" | "GLOBAL" | "TASK_TYPE";
    rules: any;
    active: boolean;
}[]>>;
export declare const evaluate: import("convex/server").RegisteredQuery<"public", {
    metadata?: any;
    estimatedCost?: number | undefined;
    toolName?: string | undefined;
    toolArgs?: any;
    transitionTo?: string | undefined;
    agentId: import("convex/values").GenericId<"agents">;
    actionType: string;
}, Promise<{
    decision: string;
    reason: string;
    approval?: undefined;
    riskLevel?: undefined;
} | {
    decision: string;
    reason: string;
    approval: {
        type: string;
        estimatedCost: number;
        budgetRemaining: number;
        toolName?: undefined;
    };
    riskLevel?: undefined;
} | {
    decision: string;
    reason: string;
    riskLevel: string;
    approval?: undefined;
} | {
    decision: string;
    reason: string;
    riskLevel: string;
    approval: {
        type: string;
        toolName: string;
        estimatedCost?: undefined;
        budgetRemaining?: undefined;
    };
} | {
    decision: string;
    reason: string;
    approval: {
        type: string;
        estimatedCost?: undefined;
        budgetRemaining?: undefined;
        toolName?: undefined;
    };
    riskLevel?: undefined;
}>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    budgetDefaults?: any;
    scopeId?: string | undefined;
    toolRiskMap?: any;
    spawnLimits?: any;
    loopThresholds?: any;
    notes?: string | undefined;
    name: string;
    scopeType: string;
    rules: any;
}, Promise<{
    policy: {
        _id: import("convex/values").GenericId<"policies">;
        _creationTime: number;
        budgetDefaults?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        scopeId?: string | undefined;
        toolRiskMap?: any;
        shellAllowlist?: string[] | undefined;
        shellBlocklist?: string[] | undefined;
        fileReadPaths?: string[] | undefined;
        fileWritePaths?: string[] | undefined;
        networkAllowlist?: string[] | undefined;
        spawnLimits?: any;
        loopThresholds?: any;
        createdBy?: string | undefined;
        notes?: string | undefined;
        name: string;
        version: number;
        scopeType: "AGENT" | "GLOBAL" | "TASK_TYPE";
        rules: any;
        active: boolean;
    } | null;
}>>;
export declare const deactivate: import("convex/server").RegisteredMutation<"public", {
    policyId: import("convex/values").GenericId<"policies">;
}, Promise<{
    success: boolean;
}>>;
//# sourceMappingURL=policy.d.ts.map