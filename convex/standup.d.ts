/**
 * Daily Standup Report — aggregates tasks, agents, approvals for human review.
 */
/** Generate standup report (query — no side effects). */
export declare const generate: import("convex/server").RegisteredQuery<"public", {
    at?: number | undefined;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
}, Promise<{
    projectId: import("convex/values").GenericId<"projects"> | undefined;
    generatedAt: number;
    date: string;
    agents: {
        total: number;
        active: number;
        paused: number;
        list: {
            id: import("convex/values").GenericId<"agents">;
            name: string;
            role: "INTERN" | "SPECIALIST" | "LEAD";
            status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
            spendToday: number;
            budgetDaily: number;
        }[];
    };
    tasks: {
        inbox: number;
        assigned: number;
        inProgress: number;
        review: number;
        needsApproval: number;
        blocked: number;
        done: number;
        canceled: number;
        total: number;
    };
    approvals: {
        pending: number;
        items: {
            id: import("convex/values").GenericId<"approvals">;
            actionSummary: string;
            riskLevel: "YELLOW" | "RED";
            requestorAgentId: import("convex/values").GenericId<"agents">;
            expiresAt: number;
        }[];
    };
    burnRate: {
        today: number;
    };
}>>;
/** Store standup report (mutation — for cron to save daily). */
export declare const save: import("convex/server").RegisteredMutation<"public", {
    report: any;
    savedAt: number;
}, Promise<{
    success: boolean;
}>>;
/** Run daily standup (mutation — for cron). Builds report and saves to activities. */
export declare const runDaily: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    success: boolean;
    report: {
        generatedAt: number;
        date: string;
        agents: {
            total: number;
            active: number;
        };
        tasks: {
            inbox: number;
            assigned: number;
            inProgress: number;
            review: number;
            needsApproval: number;
            blocked: number;
            done: number;
            total: number;
        };
        approvals: {
            pending: number;
        };
    };
}>>;
//# sourceMappingURL=standup.d.ts.map