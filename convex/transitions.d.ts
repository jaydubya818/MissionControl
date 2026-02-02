/**
 * Task transition event append-only.
 * Task status MUST be updated only via tasks.transitionTaskStatus.
 */
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
export declare function appendTransition(ctx: MutationCtx, args: {
    taskId: Id<"tasks">;
    fromStatus: string;
    toStatus: string;
    actorType: "AGENT" | "HUMAN" | "SYSTEM";
    actorAgentId?: Id<"agents">;
    actorUserId?: string;
    reason?: string;
    artifactsSnapshot?: any;
    idempotencyKey: string;
}): Promise<Id<"taskTransitions">>;
export declare const transitions_append: any;
//# sourceMappingURL=transitions.d.ts.map