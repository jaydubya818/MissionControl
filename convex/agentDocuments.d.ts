/**
 * Agent Documents — WORKING.md, daily notes, session memory.
 * Per-agent memory system for OpenClaw agents.
 */
export declare const set: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
    content: string;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    documentId: import("convex/values").GenericId<"agentDocuments">;
    created: boolean;
}>>;
export declare const get: import("convex/server").RegisteredQuery<"public", {
    type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"agentDocuments">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
    content: string;
    agentId: import("convex/values").GenericId<"agents">;
    updatedAt: number;
} | null>>;
export declare const listByAgent: import("convex/server").RegisteredQuery<"public", {
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"agentDocuments">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
    content: string;
    agentId: import("convex/values").GenericId<"agents">;
    updatedAt: number;
}[]>>;
/** Get WORKING.md content for an agent (convenience). */
export declare const getWorkingMd: import("convex/server").RegisteredQuery<"public", {
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<string | null>>;
/** Get daily note for an agent (convenience). */
export declare const getDailyNote: import("convex/server").RegisteredQuery<"public", {
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<string | null>>;
//# sourceMappingURL=agentDocuments.d.ts.map