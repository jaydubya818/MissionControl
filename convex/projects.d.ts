/**
 * Projects — Convex Functions
 *
 * Multi-project workspaces for Mission Control.
 * Every entity (tasks, agents, approvals, etc.) is scoped to a project.
 */
/**
 * List all projects.
 */
export declare const list: import("convex/server").RegisteredQuery<"public", {}, Promise<{
    _id: import("convex/values").GenericId<"projects">;
    _creationTime: number;
    description?: string | undefined;
    policyDefaults?: {
        budgetDefaults?: any;
        riskThresholds?: any;
    } | undefined;
    metadata?: any;
    name: string;
    slug: string;
}[]>>;
/**
 * Get a project by ID.
 */
export declare const get: import("convex/server").RegisteredQuery<"public", {
    projectId: import("convex/values").GenericId<"projects">;
}, Promise<{
    _id: import("convex/values").GenericId<"projects">;
    _creationTime: number;
    description?: string | undefined;
    policyDefaults?: {
        budgetDefaults?: any;
        riskThresholds?: any;
    } | undefined;
    metadata?: any;
    name: string;
    slug: string;
} | null>>;
/**
 * Get a project by slug (unique identifier).
 */
export declare const getBySlug: import("convex/server").RegisteredQuery<"public", {
    slug: string;
}, Promise<{
    _id: import("convex/values").GenericId<"projects">;
    _creationTime: number;
    description?: string | undefined;
    policyDefaults?: {
        budgetDefaults?: any;
        riskThresholds?: any;
    } | undefined;
    metadata?: any;
    name: string;
    slug: string;
} | null>>;
/**
 * Get project stats (task counts, agent counts, pending approvals).
 */
export declare const getStats: import("convex/server").RegisteredQuery<"public", {
    projectId: import("convex/values").GenericId<"projects">;
}, Promise<{
    projectId: import("convex/values").GenericId<"projects">;
    tasks: {
        total: number;
        inbox: number;
        assigned: number;
        inProgress: number;
        review: number;
        needsApproval: number;
        blocked: number;
        done: number;
        canceled: number;
    };
    agents: {
        total: number;
        active: number;
        paused: number;
    };
    approvals: {
        pending: number;
    };
}>>;
/**
 * Create a new project.
 */
export declare const create: import("convex/server").RegisteredMutation<"public", {
    description?: string | undefined;
    policyDefaults?: {
        budgetDefaults?: any;
        riskThresholds?: any;
    } | undefined;
    metadata?: any;
    name: string;
    slug: string;
}, Promise<{
    success: boolean;
    error: string;
    project?: undefined;
} | {
    success: boolean;
    project: {
        _id: import("convex/values").GenericId<"projects">;
        _creationTime: number;
        description?: string | undefined;
        policyDefaults?: {
            budgetDefaults?: any;
            riskThresholds?: any;
        } | undefined;
        metadata?: any;
        name: string;
        slug: string;
    } | null;
    error?: undefined;
}>>;
/**
 * Update a project.
 */
export declare const update: import("convex/server").RegisteredMutation<"public", {
    name?: string | undefined;
    description?: string | undefined;
    policyDefaults?: {
        budgetDefaults?: any;
        riskThresholds?: any;
    } | undefined;
    metadata?: any;
    projectId: import("convex/values").GenericId<"projects">;
}, Promise<{
    success: boolean;
    error: string;
    project?: undefined;
} | {
    success: boolean;
    project: {
        _id: import("convex/values").GenericId<"projects">;
        _creationTime: number;
        description?: string | undefined;
        policyDefaults?: {
            budgetDefaults?: any;
            riskThresholds?: any;
        } | undefined;
        metadata?: any;
        name: string;
        slug: string;
    } | null;
    error?: undefined;
}>>;
/**
 * Delete a project (only if empty).
 */
export declare const remove: import("convex/server").RegisteredMutation<"public", {
    force?: boolean | undefined;
    projectId: import("convex/values").GenericId<"projects">;
}, Promise<{
    success: boolean;
    error: string;
} | {
    success: boolean;
    error?: undefined;
}>>;
//# sourceMappingURL=projects.d.ts.map