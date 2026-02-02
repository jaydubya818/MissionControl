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
export declare const transitions_append: import("convex/server").RegisteredMutation<"public", {
    actorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    actorUserId?: string | undefined;
    artifactsSnapshot?: any;
    reason?: string | undefined;
    idempotencyKey: string;
    actorType: "AGENT" | "HUMAN" | "SYSTEM";
    taskId: import("convex/values").GenericId<"tasks">;
    fromStatus: string;
    toStatus: string;
}, Promise<Id<"taskTransitions">>>;
//# sourceMappingURL=transitions.d.ts.map