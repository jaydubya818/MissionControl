import { v } from 'convex/values';
import { capabilityPermitsValidator } from './capabilityAdmission';

export const dispatchArgs = {
    capabilityPermits: v.optional(capabilityPermitsValidator),
    workOrderId: v.id("workOrders"),
    taskId: v.optional(v.id("tasks")),
    workflowId: v.optional(v.string()),
    actorType: v.union(v.literal("HUMAN"), v.literal("SYSTEM"), v.literal("AGENT")),
    actorId: v.optional(v.string()),
    idempotencyKey: v.string(),
    runtime: v.optional(v.string()),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    codeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
    owningTeamId: v.optional(v.id("scrumTeams")),
    ownerMemberId: v.optional(v.id("orgMembers")),
    executionEnvironment: v.optional(v.union(v.literal("LOCAL"), v.literal("CLOUD"), v.literal("REMOTE"), v.literal("POLICY_SELECTED"))),
    executorHostId: v.optional(v.string()),
    /** Explicit operator-approved exception; normal runtime model metadata must not bypass policy. */
    authorizedModelOverride: v.optional(v.string()),
    model: v.optional(v.string()),
    worktree: v.optional(v.string()),
    retryOfWorkflowRunId: v.optional(v.id("workflowRuns")),
    retryReason: v.optional(v.string()),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    branch: v.optional(v.string()),
};

