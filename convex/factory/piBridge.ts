/**
 * Pi runtime receipt packet ingestion (executor.pi-bridge).
 */

import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { resolveFlag } from "../lib/flags";
import { validateReceiptPacket } from "../lib/piBridgeEnvelope";

const receiptArg = v.object({
  acceptanceCriterionId: v.string(),
  idempotencyKey: v.optional(v.string()),
  verificationMethod: v.optional(
    v.union(v.literal("MANUAL"), v.literal("COMMAND"), v.literal("TEST"), v.literal("CHECKLIST"))
  ),
  commandOrCheck: v.optional(v.string()),
  result: v.optional(v.string()),
  evidenceLocation: v.optional(v.string()),
  artifactReference: v.optional(v.string()),
  status: v.union(
    v.literal("PENDING"),
    v.literal("PASSED"),
    v.literal("FAILED"),
    v.literal("WAIVED"),
    v.literal("STALE")
  ),
  verifier: v.optional(v.string()),
});

export const ingestReceiptPacket = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    piSessionId: v.optional(v.string()),
    piExecutionId: v.optional(v.string()),
    markRunCompleted: v.optional(v.boolean()),
    receipts: v.array(receiptArg),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found");

    const flagRows = await ctx.db.query("featureFlags").collect();
    const resolved = resolveFlag(
      flagRows.map((r) => ({ key: r.key, enabled: r.enabled, projectId: r.projectId })),
      "executor.pi-bridge",
      workOrder.projectId
    );
    if (!resolved.enabled) {
      throw new Error("executor.pi-bridge feature flag is disabled");
    }

    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.workOrderId !== workOrder._id) {
      throw new Error("Workflow run does not belong to this WorkOrder");
    }

    validateReceiptPacket({
      workOrder,
      run,
      receipts: args.receipts,
      piSessionId: args.piSessionId,
      piExecutionId: args.piExecutionId,
    });

    if (args.idempotencyKey) {
      const prior = await ctx.db
        .query("verificationReceipts")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey!))
        .first();
      if (prior) {
        return { ingested: false, skipped: true, receiptCount: args.receipts.length };
      }
    }

    if (args.markRunCompleted && run.status !== "COMPLETED") {
      await ctx.db.patch(run._id, {
        status: "COMPLETED",
        completedAt: Date.now(),
        metadata: {
          ...(run.metadata ?? {}),
          piSessionId: args.piSessionId,
          piExecutionId: args.piExecutionId,
          receiptPacketKey: args.idempotencyKey,
        },
      });
    }

    let created = 0;
    for (const [index, receipt] of args.receipts.entries()) {
      await ctx.runMutation(api.workOrders.recordVerificationReceipt, {
        workOrderId: args.workOrderId,
        workflowRunId: args.workflowRunId,
        acceptanceCriterionId: receipt.acceptanceCriterionId,
        idempotencyKey: receipt.idempotencyKey ?? `${args.idempotencyKey ?? "pi-packet"}:${index}`,
        verificationMethod: receipt.verificationMethod,
        commandOrCheck: receipt.commandOrCheck,
        result: receipt.result,
        evidenceLocation: receipt.evidenceLocation,
        artifactReference: receipt.artifactReference,
        verifier: receipt.verifier ?? "pi-runtime",
        status: receipt.status,
        metadata: { source: "piBridge.ingestReceiptPacket", piSessionId: args.piSessionId },
      });
      created += 1;
    }

    await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
      workflowRunId: args.workflowRunId,
      eventType: "RUN_COMPLETED",
      summary: `Pi receipt packet ingested (${created} criteria)`,
    });

    return { ingested: true, skipped: false, receiptCount: created };
  },
});
