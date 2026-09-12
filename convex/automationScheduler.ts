import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  AUTOMATION_POLICY_VERSION,
  AUTOMATION_SYSTEM_ACTOR_IDENTITY_SOURCE,
  automationOperatorIdentitySource,
  buildReviewGate,
  isReviewGateDue,
  nextScheduledAt,
  suspensionReason,
  reviewGateIdempotencyKey,
} from "./lib/automationGovernance";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";

type EvaluationResult = {
  considered: number;
  created: number;
  skipped: number;
  suspended: number;
  workOrderIds: string[];
};

async function evaluate(
  ctx: any,
  args: {
    projectId?: Id<"projects">;
    automationDefinitionId?: Id<"automationDefinitions">;
    manual?: boolean;
    initiator?: {
      actorId: string;
      actorIdentitySource: ReturnType<typeof automationOperatorIdentitySource>;
    };
  }
): Promise<EvaluationResult> {
  const now = Date.now();
  const actorId = args.initiator?.actorId ?? "automation-policy";
  const actorIdentitySource = args.initiator?.actorIdentitySource
    ?? AUTOMATION_SYSTEM_ACTOR_IDENTITY_SOURCE;
  let definitions = args.projectId
    ? await ctx.db.query("automationDefinitions").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect()
    : await ctx.db.query("automationDefinitions").collect();
  if (args.automationDefinitionId) {
    definitions = definitions.filter((definition: any) => definition._id === args.automationDefinitionId);
  }

  let created = 0;
  let skipped = 0;
  let suspended = 0;
  const workOrderIds: string[] = [];

  for (const definition of definitions) {
    const scheduledAt = args.manual ? now : definition.nextRunAt ?? now;
    const evaluationKey = args.manual
      ? `automation:${definition._id}:manual-evaluation:${Math.floor(now / (5 * 60_000))}`
      : reviewGateIdempotencyKey(String(definition._id), scheduledAt);
    const existingEvaluation = await ctx.db
      .query("automationEvaluations")
      .withIndex("by_evaluation_key", (q: any) => q.eq("evaluationKey", evaluationKey))
      .first();
    if (existingEvaluation) {
      skipped += 1;
      continue;
    }
    if (!args.manual && !isReviewGateDue(definition, now)) {
      skipped += 1;
      continue;
    }
    const priorGates = (await ctx.db
      .query("workOrders")
      .withIndex("by_project", (q: any) => q.eq("projectId", definition.projectId))
      .collect())
      .filter((workOrder: any) => String(workOrder.metadata?.automationDefinitionId) === String(definition._id));
    const priorReceipts = await ctx.db
      .query("verificationReceipts")
      .withIndex("by_project", (q: any) => q.eq("projectId", definition.projectId))
      .collect();
    const relevantReceipts = priorReceipts.filter((receipt: any) =>
      priorGates.some((gate: any) => gate._id === receipt.workOrderId)
    );
    const activeGate = priorGates.find((gate: any) =>
      ["DISPATCHED", "IN_PROGRESS", "AWAITING_VERIFICATION"].includes(gate.state)
    );
    if (activeGate) {
      await ctx.db.insert("automationEvaluations", {
        projectId: definition.projectId,
        automationDefinitionId: definition._id,
        workOrderId: activeGate._id,
        evaluationKey,
        triggerType: definition.triggerType,
        status: "SKIPPED",
        reason: "Concurrency limit reached; an earlier review gate is still active",
        checks: { idempotency: "PASS", concurrency: "BLOCKED", safety: "PASS" },
        correlationId: definition.correlationId ?? evaluationKey,
        causationId: String(activeGate._id),
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("automationDecisions", {
        projectId: definition.projectId,
        automationDefinitionId: definition._id,
        decisionType: "EVALUATION_SKIPPED",
        actorId,
        actorIdentitySource,
        reason: "Concurrency limit reached",
        policyVersion: AUTOMATION_POLICY_VERSION,
        definitionVersion: definition.definitionVersion,
        decidedAt: now,
        entityType: "AUTOMATION_EVALUATION",
        entityId: evaluationKey,
        previousState: "CREATED",
        newState: "SKIPPED",
        correlationId: definition.correlationId ?? evaluationKey,
        causationId: String(activeGate._id),
      });
      skipped += 1;
      continue;
    }
    const reason = suspensionReason({
      verificationFailed: relevantReceipts.some((receipt: any) => receipt.status === "FAILED"),
      requiredReceiptMissing: priorGates.some((gate: any) =>
        gate.state === "AWAITING_VERIFICATION"
        && now - gate.updatedAt > definition.maxDurationSeconds * 1000
        && !relevantReceipts.some((receipt: any) => receipt.workOrderId === gate._id && receipt.status === "PASSED")
      ),
    });
    if (reason) {
      await ctx.db.patch(definition._id, {
        status: "SUSPENDED",
        reliabilityState: "SUSPENDED",
        health: "DEGRADED",
        pauseReason: reason,
        pausedBy: actorId,
        pausedAt: now,
        nextRunAt: undefined,
        updatedAt: now,
      });
      await ctx.db.insert("automationDecisions", {
        projectId: definition.projectId,
        automationDefinitionId: definition._id,
        decisionType: "SUSPENDED",
        actorId,
        actorIdentitySource,
        reason,
        policyVersion: AUTOMATION_POLICY_VERSION,
        definitionVersion: definition.definitionVersion,
        decidedAt: now,
      });
      await ctx.db.insert("automationEvaluations", {
        projectId: definition.projectId,
        automationDefinitionId: definition._id,
        evaluationKey,
        triggerType: definition.triggerType,
        status: "FAILED",
        reason,
        checks: { idempotency: "PASS", concurrency: "PASS", suspension: "BLOCKED" },
        correlationId: definition.correlationId ?? evaluationKey,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
      suspended += 1;
      continue;
    }

    const draft = buildReviewGate({
      id: String(definition._id),
      name: definition.name,
      workflowId: definition.workflowId,
      workflowVersion: definition.workflowVersion,
      scope: definition.scope,
      riskLevel: definition.riskLevel,
      requiredApprovalTypes: definition.requiredApprovalTypes,
      verificationContract: definition.verificationContract,
      triggerConfig: definition.triggerConfig,
    }, scheduledAt);
    const result: { workOrder: { _id: Id<"workOrders"> }; created: boolean } = await ctx.runMutation(
      api.workOrders.create,
      {
        ...draft,
        projectId: definition.projectId,
        repository: definition.repositoryIds[0],
      }
    );
    await ctx.db.patch(definition._id, {
      lastRunAt: now,
      nextRunAt: args.manual ? definition.nextRunAt : nextScheduledAt(now),
      lastResult: result.created ? "REVIEW_GATE_CREATED" : "IDEMPOTENT_SKIP",
      lastReviewGateWorkOrderId: result.workOrder._id,
      updatedAt: now,
    });
    await ctx.db.insert("automationEvaluations", {
      projectId: definition.projectId,
      automationDefinitionId: definition._id,
      workOrderId: result.workOrder._id,
      evaluationKey,
      triggerType: definition.triggerType,
      status: "AWAITING_APPROVAL",
      reason: result.created ? "Governed review-gate WorkOrder created" : "Idempotent WorkOrder replay",
      checks: {
        active: true,
        level: definition.autonomyLevel,
        readOnly: !definition.isMutating,
        approvalRequired: definition.requiredApprovalTypes.length > 0,
        receiptRequired: true,
        idempotency: result.created ? "NEW" : "REPLAY",
        concurrency: "PASS",
        artifactValidation: definition.validationStatus ?? "LEGACY",
      },
      correlationId: definition.correlationId ?? evaluationKey,
      causationId: String(definition._id),
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("automationDecisions", {
      projectId: definition.projectId,
      automationDefinitionId: definition._id,
      decisionType: result.created ? "EVALUATED" : "EVALUATION_SKIPPED",
      actorId,
      actorIdentitySource,
      reason: result.created ? "Evaluation passed; review gate created" : "Idempotent evaluation replay",
      policyVersion: AUTOMATION_POLICY_VERSION,
      definitionVersion: definition.definitionVersion,
      decidedAt: now,
      entityType: "AUTOMATION_EVALUATION",
      entityId: evaluationKey,
      previousState: "CREATED",
      newState: result.created ? "AWAITING_APPROVAL" : "SKIPPED",
      correlationId: definition.correlationId ?? evaluationKey,
      causationId: String(result.workOrder._id),
    });
    if (result.created) created += 1;
    else skipped += 1;
    workOrderIds.push(String(result.workOrder._id));
  }
  return { considered: definitions.length, created, skipped, suspended, workOrderIds };
}

export const evaluateDue = internalMutation({
  args: {},
  handler: async (ctx): Promise<EvaluationResult> =>
    evaluate(ctx, {}),
});

/** Explicit deterministic operator control used for bounded validation and recovery. */
export const evaluateNow = mutation({
  args: {
    projectId: v.id("projects"),
    automationDefinitionId: v.id("automationDefinitions"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<EvaluationResult> => {
    if (args.reason.trim().length < 5) {
      throw new Error("A reason is required for manual evaluation");
    }
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const definition = await ctx.db.get(args.automationDefinitionId);
    if (!definition || definition.projectId !== args.projectId) {
      throw new Error("Automation is outside the selected workspace");
    }
    return evaluate(ctx, {
      projectId: args.projectId,
      automationDefinitionId: args.automationDefinitionId,
      manual: true,
      initiator: {
        actorId: access.actorId,
        actorIdentitySource: automationOperatorIdentitySource(access.membership.mode),
      },
    });
  },
});
