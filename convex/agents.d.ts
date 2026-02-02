/**
 * Agents — Convex Functions
 */
export declare const get: import("convex/server").RegisteredQuery<"public", {
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"agents">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    emoji?: string | undefined;
    soulVersionHash?: string | undefined;
    allowedTools?: string[] | undefined;
    spendResetAt?: number | undefined;
    parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
    lastHeartbeatAt?: number | undefined;
    lastError?: string | undefined;
    name: string;
    role: "INTERN" | "SPECIALIST" | "LEAD";
    status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
    workspacePath: string;
    allowedTaskTypes: string[];
    budgetDaily: number;
    budgetPerRun: number;
    spendToday: number;
    canSpawn: boolean;
    maxSubAgents: number;
    errorStreak: number;
} | null>>;
export declare const getByName: import("convex/server").RegisteredQuery<"public", {
    name: string;
}, Promise<{
    _id: import("convex/values").GenericId<"agents">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    emoji?: string | undefined;
    soulVersionHash?: string | undefined;
    allowedTools?: string[] | undefined;
    spendResetAt?: number | undefined;
    parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
    lastHeartbeatAt?: number | undefined;
    lastError?: string | undefined;
    name: string;
    role: "INTERN" | "SPECIALIST" | "LEAD";
    status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
    workspacePath: string;
    allowedTaskTypes: string[];
    budgetDaily: number;
    budgetPerRun: number;
    spendToday: number;
    canSpawn: boolean;
    maxSubAgents: number;
    errorStreak: number;
} | null>>;
export declare const listAll: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"agents">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    emoji?: string | undefined;
    soulVersionHash?: string | undefined;
    allowedTools?: string[] | undefined;
    spendResetAt?: number | undefined;
    parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
    lastHeartbeatAt?: number | undefined;
    lastError?: string | undefined;
    name: string;
    role: "INTERN" | "SPECIALIST" | "LEAD";
    status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
    workspacePath: string;
    allowedTaskTypes: string[];
    budgetDaily: number;
    budgetPerRun: number;
    spendToday: number;
    canSpawn: boolean;
    maxSubAgents: number;
    errorStreak: number;
}[]>>;
export declare const listByStatus: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    status: string;
}, Promise<{
    _id: import("convex/values").GenericId<"agents">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    emoji?: string | undefined;
    soulVersionHash?: string | undefined;
    allowedTools?: string[] | undefined;
    spendResetAt?: number | undefined;
    parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
    lastHeartbeatAt?: number | undefined;
    lastError?: string | undefined;
    name: string;
    role: "INTERN" | "SPECIALIST" | "LEAD";
    status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
    workspacePath: string;
    allowedTaskTypes: string[];
    budgetDaily: number;
    budgetPerRun: number;
    spendToday: number;
    canSpawn: boolean;
    maxSubAgents: number;
    errorStreak: number;
}[]>>;
export declare const listActive: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"agents">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    emoji?: string | undefined;
    soulVersionHash?: string | undefined;
    allowedTools?: string[] | undefined;
    spendResetAt?: number | undefined;
    parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
    lastHeartbeatAt?: number | undefined;
    lastError?: string | undefined;
    name: string;
    role: "INTERN" | "SPECIALIST" | "LEAD";
    status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
    workspacePath: string;
    allowedTaskTypes: string[];
    budgetDaily: number;
    budgetPerRun: number;
    spendToday: number;
    canSpawn: boolean;
    maxSubAgents: number;
    errorStreak: number;
}[]>>;
export declare const register: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    emoji?: string | undefined;
    soulVersionHash?: string | undefined;
    allowedTaskTypes?: string[] | undefined;
    allowedTools?: string[] | undefined;
    budgetDaily?: number | undefined;
    budgetPerRun?: number | undefined;
    canSpawn?: boolean | undefined;
    maxSubAgents?: number | undefined;
    parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    name: string;
    role: string;
    workspacePath: string;
}, Promise<{
    agent: {
        _id: import("convex/values").GenericId<"agents">;
        _creationTime: number;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        emoji?: string | undefined;
        soulVersionHash?: string | undefined;
        allowedTools?: string[] | undefined;
        spendResetAt?: number | undefined;
        parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        lastHeartbeatAt?: number | undefined;
        lastError?: string | undefined;
        name: string;
        role: "INTERN" | "SPECIALIST" | "LEAD";
        status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
        workspacePath: string;
        allowedTaskTypes: string[];
        budgetDaily: number;
        budgetPerRun: number;
        spendToday: number;
        canSpawn: boolean;
        maxSubAgents: number;
        errorStreak: number;
    } | null;
    created: boolean;
}>>;
export declare const heartbeat: import("convex/server").RegisteredMutation<"public", {
    status?: string | undefined;
    soulVersionHash?: string | undefined;
    currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
    sessionKey?: string | undefined;
    spendSinceLastHeartbeat?: number | undefined;
    errorMessage?: string | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    success: boolean;
    error: string;
    agent?: undefined;
    budgetRemaining?: undefined;
    budgetExceeded?: undefined;
    pendingTasks?: undefined;
    claimableTasks?: undefined;
    pendingApprovals?: undefined;
    pendingNotifications?: undefined;
    errorQuarantineWarning?: undefined;
} | {
    success: boolean;
    agent: {
        _id: import("convex/values").GenericId<"agents">;
        _creationTime: number;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        emoji?: string | undefined;
        soulVersionHash?: string | undefined;
        allowedTools?: string[] | undefined;
        spendResetAt?: number | undefined;
        parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        lastHeartbeatAt?: number | undefined;
        lastError?: string | undefined;
        name: string;
        role: "INTERN" | "SPECIALIST" | "LEAD";
        status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
        workspacePath: string;
        allowedTaskTypes: string[];
        budgetDaily: number;
        budgetPerRun: number;
        spendToday: number;
        canSpawn: boolean;
        maxSubAgents: number;
        errorStreak: number;
    } | null;
    budgetRemaining: number;
    budgetExceeded: boolean;
    pendingTasks: {
        _id: import("convex/values").GenericId<"tasks">;
        _creationTime: number;
        description?: string | undefined;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        creatorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        reviewerId?: import("convex/values").GenericId<"agents"> | undefined;
        parentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        workPlan?: {
            estimatedCost?: number | undefined;
            estimatedDuration?: string | undefined;
            bullets: string[];
        } | undefined;
        estimatedCost?: number | undefined;
        deliverable?: {
            summary?: string | undefined;
            content?: string | undefined;
            artifactIds?: string[] | undefined;
        } | undefined;
        reviewChecklist?: {
            type: string;
            items: {
                note?: string | undefined;
                label: string;
                checked: boolean;
            }[];
        } | undefined;
        budgetAllocated?: number | undefined;
        budgetRemaining?: number | undefined;
        dueAt?: number | undefined;
        startedAt?: number | undefined;
        submittedAt?: number | undefined;
        completedAt?: number | undefined;
        labels?: string[] | undefined;
        blockedReason?: string | undefined;
        threadRef?: string | undefined;
        redactedFields?: string[] | undefined;
        type: "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";
        status: "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED";
        priority: 1 | 2 | 3 | 4;
        title: string;
        assigneeIds: import("convex/values").GenericId<"agents">[];
        reviewCycles: number;
        actualCost: number;
    }[];
    claimableTasks: {
        _id: import("convex/values").GenericId<"tasks">;
        _creationTime: number;
        description?: string | undefined;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        creatorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        reviewerId?: import("convex/values").GenericId<"agents"> | undefined;
        parentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        workPlan?: {
            estimatedCost?: number | undefined;
            estimatedDuration?: string | undefined;
            bullets: string[];
        } | undefined;
        estimatedCost?: number | undefined;
        deliverable?: {
            summary?: string | undefined;
            content?: string | undefined;
            artifactIds?: string[] | undefined;
        } | undefined;
        reviewChecklist?: {
            type: string;
            items: {
                note?: string | undefined;
                label: string;
                checked: boolean;
            }[];
        } | undefined;
        budgetAllocated?: number | undefined;
        budgetRemaining?: number | undefined;
        dueAt?: number | undefined;
        startedAt?: number | undefined;
        submittedAt?: number | undefined;
        completedAt?: number | undefined;
        labels?: string[] | undefined;
        blockedReason?: string | undefined;
        threadRef?: string | undefined;
        redactedFields?: string[] | undefined;
        type: "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";
        status: "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED";
        priority: 1 | 2 | 3 | 4;
        title: string;
        assigneeIds: import("convex/values").GenericId<"agents">[];
        reviewCycles: number;
        actualCost: number;
    }[];
    pendingApprovals: {
        _id: import("convex/values").GenericId<"approvals">;
        _creationTime: number;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        estimatedCost?: number | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        toolCallId?: import("convex/values").GenericId<"toolCalls"> | undefined;
        actionPayload?: any;
        rollbackPlan?: string | undefined;
        decidedByAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        decidedByUserId?: string | undefined;
        decidedAt?: number | undefined;
        decisionReason?: string | undefined;
        status: "CANCELED" | "PENDING" | "DENIED" | "APPROVED" | "EXPIRED";
        riskLevel: "YELLOW" | "RED";
        requestorAgentId: import("convex/values").GenericId<"agents">;
        actionType: string;
        actionSummary: string;
        justification: string;
        expiresAt: number;
    }[];
    pendingNotifications: {
        _id: import("convex/values").GenericId<"notifications">;
        _creationTime: number;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
        body?: string | undefined;
        messageId?: import("convex/values").GenericId<"messages"> | undefined;
        fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        fromUserId?: string | undefined;
        readAt?: number | undefined;
        type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
        title: string;
        agentId: import("convex/values").GenericId<"agents">;
    }[];
    errorQuarantineWarning: boolean;
    error?: undefined;
}>>;
export declare const updateStatus: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    status: string;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    success: boolean;
    error: string;
    agent?: undefined;
} | {
    success: boolean;
    agent: {
        _id: import("convex/values").GenericId<"agents">;
        _creationTime: number;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        emoji?: string | undefined;
        soulVersionHash?: string | undefined;
        allowedTools?: string[] | undefined;
        spendResetAt?: number | undefined;
        parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        lastHeartbeatAt?: number | undefined;
        lastError?: string | undefined;
        name: string;
        role: "INTERN" | "SPECIALIST" | "LEAD";
        status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
        workspacePath: string;
        allowedTaskTypes: string[];
        budgetDaily: number;
        budgetPerRun: number;
        spendToday: number;
        canSpawn: boolean;
        maxSubAgents: number;
        errorStreak: number;
    } | null;
    error?: undefined;
}>>;
/** Pause all ACTIVE agents (emergency "Pause squad") */
export declare const pauseAll: import("convex/server").RegisteredMutation<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    reason?: string | undefined;
    userId?: string | undefined;
}, Promise<{
    paused: number;
    agentIds: import("convex/values").GenericId<"agents">[];
}>>;
/** Resume all PAUSED agents */
export declare const resumeAll: import("convex/server").RegisteredMutation<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    reason?: string | undefined;
    userId?: string | undefined;
}, Promise<{
    resumed: number;
    agentIds: import("convex/values").GenericId<"agents">[];
}>>;
export declare const recordSpend: import("convex/server").RegisteredMutation<"public", {
    description?: string | undefined;
    runId?: import("convex/values").GenericId<"runs"> | undefined;
    agentId: import("convex/values").GenericId<"agents">;
    amount: number;
}, Promise<{
    success: boolean;
    error: string;
    spendToday?: undefined;
    budgetRemaining?: undefined;
    budgetExceeded?: undefined;
} | {
    success: boolean;
    spendToday: number;
    budgetRemaining: number;
    budgetExceeded: boolean;
    error?: undefined;
}>>;
//# sourceMappingURL=agents.d.ts.map