/**
 * Loop Detection — Convex Functions
 *
 * Detects and blocks tasks with loops:
 * - Comment storms (too many messages in short time)
 * - Review ping-pong (too many review cycles)
 * - Repeated tool failures (same tool failing repeatedly)
 */
export declare const detectLoops: import("convex/server").RegisteredMutation<"internal", {}, Promise<{
    checked: number;
    blocked: number;
}>>;
//# sourceMappingURL=loops.d.ts.map