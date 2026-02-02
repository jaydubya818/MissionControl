/**
 * Seed Data — V0
 *
 * Creates sample agents and tasks for testing.
 * Run with: npx convex run seed:seedV0
 */
export declare const seedV0: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    message: string;
    skipped: boolean;
    projects?: undefined;
    agents?: undefined;
    tasks?: undefined;
    policies?: undefined;
} | {
    message: string;
    projects: number;
    agents: number;
    tasks: number;
    policies: number;
    skipped?: undefined;
}>>;
export declare const clearAll: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    message: string;
    deleted: number;
}>>;
export declare const getSeededStatus: import("convex/server").RegisteredQuery<"public", {}, Promise<{
    seeded: boolean;
    projectCount: number;
    agentCount: number;
    taskCount: number;
    policyCount: number;
}>>;
//# sourceMappingURL=seed.d.ts.map