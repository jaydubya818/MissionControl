/**
 * Run Types
 *
 * Runs track individual execution attempts of tasks by agents.
 */
export type RunStatus = "running" | "success" | "failed" | "blocked";
export interface Run {
    _id: string;
    _creationTime: number;
    taskId: string;
    agentId: string;
    sessionKey: string;
    startTime: number;
    endTime?: number;
    status: RunStatus;
    cost: number;
    toolCallCount: number;
    errorMessage?: string;
    idempotencyKey: string;
}
export interface CreateRunInput {
    taskId: string;
    agentId: string;
    sessionKey: string;
    idempotencyKey: string;
}
export interface UpdateRunInput {
    status?: RunStatus;
    cost?: number;
    toolCallCount?: number;
    errorMessage?: string;
}
export interface EndRunInput {
    endTime: number;
    status: RunStatus;
    cost: number;
    toolCallCount: number;
    errorMessage?: string;
}
//# sourceMappingURL=run.d.ts.map