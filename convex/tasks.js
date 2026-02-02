"use strict";
/**
 * Tasks — Convex Functions
 *
 * Core task operations with state machine enforcement.
 * task.status can ONLY change through the transition function.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assign = exports.transition = exports.create = exports.getWithTimeline = exports.search = exports.getAllowedTransitionsForHuman = exports.listAll = exports.listByStatus = exports.get = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
const api_1 = require("./_generated/api");
const TRANSITION_RULES = [
    // FROM INBOX
    { from: "INBOX", to: "ASSIGNED", allowedActors: ["AGENT", "HUMAN", "SYSTEM"] },
    { from: "INBOX", to: "CANCELED", allowedActors: ["HUMAN"] },
    // FROM ASSIGNED
    { from: "ASSIGNED", to: "IN_PROGRESS", allowedActors: ["AGENT", "HUMAN"], requiresWorkPlan: true },
    { from: "ASSIGNED", to: "INBOX", allowedActors: ["HUMAN"] },
    { from: "ASSIGNED", to: "CANCELED", allowedActors: ["HUMAN"] },
    // FROM IN_PROGRESS
    { from: "IN_PROGRESS", to: "REVIEW", allowedActors: ["AGENT", "HUMAN"], requiresDeliverable: true, requiresChecklist: true },
    { from: "IN_PROGRESS", to: "BLOCKED", allowedActors: ["AGENT", "HUMAN", "SYSTEM"] },
    { from: "IN_PROGRESS", to: "NEEDS_APPROVAL", allowedActors: ["SYSTEM"] },
    { from: "IN_PROGRESS", to: "CANCELED", allowedActors: ["HUMAN"] },
    // FROM REVIEW
    { from: "REVIEW", to: "IN_PROGRESS", allowedActors: ["AGENT", "HUMAN"] }, // Revisions
    { from: "REVIEW", to: "DONE", allowedActors: ["HUMAN"], humanOnly: true },
    { from: "REVIEW", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
    { from: "REVIEW", to: "NEEDS_APPROVAL", allowedActors: ["HUMAN", "SYSTEM"] },
    { from: "REVIEW", to: "CANCELED", allowedActors: ["HUMAN"] },
    // FROM NEEDS_APPROVAL
    { from: "NEEDS_APPROVAL", to: "INBOX", allowedActors: ["HUMAN"] },
    { from: "NEEDS_APPROVAL", to: "ASSIGNED", allowedActors: ["HUMAN"] },
    { from: "NEEDS_APPROVAL", to: "IN_PROGRESS", allowedActors: ["HUMAN"] },
    { from: "NEEDS_APPROVAL", to: "REVIEW", allowedActors: ["HUMAN"] },
    { from: "NEEDS_APPROVAL", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
    { from: "NEEDS_APPROVAL", to: "DONE", allowedActors: ["HUMAN"] },
    { from: "NEEDS_APPROVAL", to: "CANCELED", allowedActors: ["HUMAN"] },
    // FROM BLOCKED
    { from: "BLOCKED", to: "ASSIGNED", allowedActors: ["HUMAN"] },
    { from: "BLOCKED", to: "IN_PROGRESS", allowedActors: ["HUMAN"] },
    { from: "BLOCKED", to: "NEEDS_APPROVAL", allowedActors: ["HUMAN", "SYSTEM"] },
    { from: "BLOCKED", to: "CANCELED", allowedActors: ["HUMAN"] },
    // DONE and CANCELED are terminal - no transitions out
];
function findTransitionRule(from, to) {
    return TRANSITION_RULES.find(r => r.from === from && r.to === to);
}
// ============================================================================
// QUERIES
// ============================================================================
exports.get = (0, server_1.query)({
    args: { taskId: values_1.v.id("tasks") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.taskId);
    },
});
exports.listByStatus = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        status: values_1.v.optional(values_1.v.string()),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;
        // If projectId is provided, use project-scoped index
        if (args.projectId) {
            if (args.status) {
                return await ctx.db
                    .query("tasks")
                    .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", args.status))
                    .order("desc")
                    .take(limit);
            }
            return await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .order("desc")
                .take(limit);
        }
        // Fallback: no project filter (for backward compatibility)
        if (args.status) {
            return await ctx.db
                .query("tasks")
                .withIndex("by_status", (q) => q.eq("status", args.status))
                .order("desc")
                .take(limit);
        }
        return await ctx.db.query("tasks").order("desc").take(limit);
    },
});
exports.listAll = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .order("desc")
                .collect();
        }
        return await ctx.db.query("tasks").order("desc").collect();
    },
});
/** Allowed toStatus values for actor HUMAN per fromStatus (for UI "Move to" menu) */
exports.getAllowedTransitionsForHuman = (0, server_1.query)({
    args: {},
    handler: async () => {
        const map = {};
        for (const r of TRANSITION_RULES) {
            if (r.allowedActors.includes("HUMAN")) {
                if (!map[r.from])
                    map[r.from] = [];
                map[r.from].push(r.to);
            }
        }
        return map;
    },
});
/** Search tasks by title and description */
exports.search = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        query: values_1.v.string(),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        let tasks;
        if (args.projectId) {
            tasks = await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .collect();
        }
        else {
            tasks = await ctx.db.query("tasks").collect();
        }
        // Simple text search (case-insensitive)
        const query = args.query.toLowerCase();
        const filtered = tasks.filter(t => t.title.toLowerCase().includes(query) ||
            (t.description && t.description.toLowerCase().includes(query)) ||
            (t.labels && t.labels.some(l => l.toLowerCase().includes(query))));
        // Sort by relevance (title match first, then description)
        filtered.sort((a, b) => {
            const aTitle = a.title.toLowerCase().includes(query);
            const bTitle = b.title.toLowerCase().includes(query);
            if (aTitle && !bTitle)
                return -1;
            if (!aTitle && bTitle)
                return 1;
            return 0;
        });
        return filtered.slice(0, limit);
    },
});
exports.getWithTimeline = (0, server_1.query)({
    args: { taskId: values_1.v.id("tasks") },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task)
            return null;
        const transitions = await ctx.db
            .query("taskTransitions")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("asc")
            .collect();
        const messages = await ctx.db
            .query("messages")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("asc")
            .collect();
        const runs = await ctx.db
            .query("runs")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("asc")
            .collect();
        const approvals = await ctx.db
            .query("approvals")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("asc")
            .collect();
        // Get tool calls for all runs
        const toolCalls = [];
        for (const run of runs) {
            const calls = await ctx.db
                .query("toolCalls")
                .withIndex("by_run", (q) => q.eq("runId", run._id))
                .collect();
            toolCalls.push(...calls);
        }
        return {
            task,
            transitions,
            messages,
            runs,
            toolCalls,
            approvals,
        };
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.create = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        title: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        type: values_1.v.string(),
        priority: values_1.v.optional(values_1.v.number()),
        assigneeIds: values_1.v.optional(values_1.v.array(values_1.v.id("agents"))),
        labels: values_1.v.optional(values_1.v.array(values_1.v.string())),
        estimatedCost: values_1.v.optional(values_1.v.number()),
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        // Check idempotency
        if (args.idempotencyKey) {
            const existing = await ctx.db
                .query("tasks")
                .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
                .first();
            if (existing) {
                return { task: existing, created: false };
            }
        }
        const taskId = await ctx.db.insert("tasks", {
            projectId: args.projectId,
            title: args.title,
            description: args.description,
            type: args.type,
            status: "INBOX",
            priority: (args.priority ?? 3),
            assigneeIds: args.assigneeIds ?? [],
            reviewCycles: 0,
            actualCost: 0,
            labels: args.labels,
            estimatedCost: args.estimatedCost,
            idempotencyKey: args.idempotencyKey,
            metadata: args.metadata,
        });
        const task = await ctx.db.get(taskId);
        // Log activity
        await ctx.db.insert("activities", {
            projectId: args.projectId,
            actorType: "SYSTEM",
            action: "TASK_CREATED",
            description: `Task "${args.title}" created`,
            targetType: "TASK",
            targetId: taskId,
            taskId,
        });
        return { task, created: true };
    },
});
exports.transition = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        toStatus: values_1.v.string(),
        actorType: values_1.v.string(),
        actorAgentId: values_1.v.optional(values_1.v.id("agents")),
        actorUserId: values_1.v.optional(values_1.v.string()),
        reason: values_1.v.optional(values_1.v.string()),
        sessionKey: values_1.v.optional(values_1.v.string()),
        idempotencyKey: values_1.v.string(),
        // Artifacts for transition requirements
        workPlan: values_1.v.optional(values_1.v.object({
            bullets: values_1.v.array(values_1.v.string()),
            estimatedCost: values_1.v.optional(values_1.v.number()),
            estimatedDuration: values_1.v.optional(values_1.v.string()),
        })),
        deliverable: values_1.v.optional(values_1.v.object({
            summary: values_1.v.optional(values_1.v.string()),
            content: values_1.v.optional(values_1.v.string()),
            artifactIds: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        reviewChecklist: values_1.v.optional(values_1.v.object({
            type: values_1.v.string(),
            items: values_1.v.array(values_1.v.object({
                label: values_1.v.string(),
                checked: values_1.v.boolean(),
                note: values_1.v.optional(values_1.v.string()),
            })),
        })),
        blockedReason: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        // 1. Check idempotency - return existing if same key
        const existingTransition = await ctx.db
            .query("taskTransitions")
            .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
            .first();
        if (existingTransition) {
            const task = await ctx.db.get(args.taskId);
            return {
                success: true,
                task,
                transition: existingTransition,
                idempotencyHit: true,
            };
        }
        // 2. Get current task
        const task = await ctx.db.get(args.taskId);
        if (!task) {
            return {
                success: false,
                errors: [{ field: "taskId", message: "Task not found" }],
            };
        }
        const fromStatus = task.status;
        const toStatus = args.toStatus;
        const actorType = args.actorType;
        // 3. Find transition rule
        const rule = findTransitionRule(fromStatus, toStatus);
        if (!rule) {
            return {
                success: false,
                errors: [{
                        field: "toStatus",
                        message: `Invalid transition: ${fromStatus} → ${toStatus} is not allowed`
                    }],
                allowedTransitions: TRANSITION_RULES
                    .filter(r => r.from === fromStatus)
                    .map(r => r.to),
            };
        }
        // 4. Check actor permission
        if (!rule.allowedActors.includes(actorType)) {
            return {
                success: false,
                errors: [{
                        field: "actorType",
                        message: `Actor type '${actorType}' cannot perform ${fromStatus} → ${toStatus}. Allowed: ${rule.allowedActors.join(", ")}`
                    }],
            };
        }
        // 5. Check human-only transitions
        if (rule.humanOnly && actorType !== "HUMAN") {
            return {
                success: false,
                errors: [{
                        field: "actorType",
                        message: `Transition ${fromStatus} → ${toStatus} requires human approval`
                    }],
            };
        }
        // 6. Validate required artifacts
        const errors = [];
        if (rule.requiresWorkPlan && !args.workPlan) {
            errors.push({ field: "workPlan", message: "Work plan required for IN_PROGRESS" });
        }
        if (rule.requiresWorkPlan && args.workPlan) {
            if (args.workPlan.bullets.length < 3 || args.workPlan.bullets.length > 6) {
                errors.push({ field: "workPlan.bullets", message: "Work plan must have 3-6 bullets" });
            }
        }
        if (rule.requiresDeliverable && !args.deliverable) {
            errors.push({ field: "deliverable", message: "Deliverable required for REVIEW" });
        }
        if (rule.requiresChecklist && !args.reviewChecklist) {
            errors.push({ field: "reviewChecklist", message: "Review checklist required for REVIEW" });
        }
        // Check assignees for IN_PROGRESS
        if (toStatus === "IN_PROGRESS" && task.assigneeIds.length === 0) {
            errors.push({ field: "assigneeIds", message: "Task must have at least one assignee" });
        }
        // Check REVIEW → DONE approval gate
        if (fromStatus === "REVIEW" && toStatus === "DONE") {
            // Get active policy to check if approval is required
            const policy = await ctx.db
                .query("policies")
                .withIndex("by_active", (q) => q.eq("active", true))
                .first();
            if (policy && policy.rules?.reviewToDoneRequiresApproval) {
                // Check for approved approval record
                const approvals = await ctx.db
                    .query("approvals")
                    .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
                    .filter((q) => q.eq(q.field("status"), "APPROVED"))
                    .collect();
                if (approvals.length === 0) {
                    errors.push({
                        field: "status",
                        message: "REVIEW → DONE requires an approved approval record. Request approval first.",
                    });
                }
            }
        }
        if (errors.length > 0) {
            return { success: false, errors };
        }
        // 7. Build task update
        const now = Date.now();
        const taskUpdate = {
            status: toStatus,
        };
        if (args.workPlan)
            taskUpdate.workPlan = args.workPlan;
        if (args.deliverable)
            taskUpdate.deliverable = args.deliverable;
        if (args.reviewChecklist)
            taskUpdate.reviewChecklist = args.reviewChecklist;
        if (args.blockedReason)
            taskUpdate.blockedReason = args.blockedReason;
        // Set timestamps
        if (toStatus === "IN_PROGRESS" && !task.startedAt) {
            taskUpdate.startedAt = now;
        }
        if (toStatus === "REVIEW") {
            taskUpdate.submittedAt = now;
        }
        if (toStatus === "DONE" || toStatus === "CANCELED") {
            taskUpdate.completedAt = now;
        }
        // Increment review cycles on revision
        if (fromStatus === "REVIEW" && toStatus === "IN_PROGRESS") {
            taskUpdate.reviewCycles = task.reviewCycles + 1;
        }
        // 8. Update task
        await ctx.db.patch(args.taskId, taskUpdate);
        // 9. Create transition record
        const transitionId = await ctx.db.insert("taskTransitions", {
            projectId: task.projectId,
            idempotencyKey: args.idempotencyKey,
            taskId: args.taskId,
            fromStatus,
            toStatus,
            actorType,
            actorAgentId: args.actorAgentId,
            actorUserId: args.actorUserId,
            reason: args.reason,
            sessionKey: args.sessionKey,
            validationResult: { valid: true },
            artifactsSnapshot: {
                workPlan: args.workPlan,
                deliverable: args.deliverable,
                reviewChecklist: args.reviewChecklist,
            },
        });
        // 10. Log activity
        await ctx.db.insert("activities", {
            projectId: task.projectId,
            actorType,
            actorId: args.actorAgentId?.toString() ?? args.actorUserId,
            action: "TASK_TRANSITION",
            description: `Task transitioned: ${fromStatus} → ${toStatus}`,
            targetType: "TASK",
            targetId: args.taskId,
            taskId: args.taskId,
            agentId: args.actorAgentId,
            beforeState: { status: fromStatus },
            afterState: { status: toStatus },
        });
        const updatedTask = await ctx.db.get(args.taskId);
        const transition = await ctx.db.get(transitionId);
        // Notifications: when transitioning to ASSIGNED, notify each assignee
        if (toStatus === "ASSIGNED" && updatedTask && updatedTask.assigneeIds.length > 0) {
            for (const agentId of updatedTask.assigneeIds) {
                await ctx.db.insert("notifications", {
                    projectId: updatedTask.projectId,
                    agentId,
                    type: "TASK_ASSIGNED",
                    title: `Task assigned: ${updatedTask.title}`,
                    body: updatedTask.description ?? undefined,
                    taskId: args.taskId,
                    fromAgentId: args.actorAgentId,
                    fromUserId: args.actorUserId,
                });
            }
        }
        return {
            success: true,
            task: updatedTask,
            transition,
            idempotencyHit: false,
        };
    },
});
exports.assign = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        agentIds: values_1.v.array(values_1.v.id("agents")),
        actorType: values_1.v.string(),
        actorUserId: values_1.v.optional(values_1.v.string()),
        idempotencyKey: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task) {
            return { success: false, error: "Task not found" };
        }
        // Update assignees
        await ctx.db.patch(args.taskId, {
            assigneeIds: args.agentIds,
        });
        // If task is in INBOX, transition to ASSIGNED
        if (task.status === "INBOX") {
            return await ctx.runMutation(api_1.api.tasks.transition, {
                taskId: args.taskId,
                toStatus: "ASSIGNED",
                actorType: args.actorType,
                actorUserId: args.actorUserId,
                idempotencyKey: args.idempotencyKey,
                reason: `Assigned to ${args.agentIds.length} agent(s)`,
            });
        }
        const updatedTask = await ctx.db.get(args.taskId);
        return { success: true, task: updatedTask };
    },
});
