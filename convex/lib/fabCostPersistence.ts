import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { fabObservedCost } from "./fabObservedCost";

export async function reconcileFabObservedCost(ctx: MutationCtx, run: Doc<"workflowRuns">) {
  if (run.executorAdapter !== "fab" || run.executorVersion !== "v1") {
    throw new Error("Observed Fab cost requires a Fab v1 Attempt.");
  }
  const events = await ctx.db.query("runEvents")
    .withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).collect();
  const evidence = fabObservedCost(run, events);
  const spentUsd = Math.max(run.spentUsd ?? 0, evidence.observedUsd);
  const deltaUsd = spentUsd - (run.spentUsd ?? 0);
  const authorization = run.executionCostAuthorization;
  const reason = "Observed provider telemetry retained; completeness and billing settlement are unconfirmed. The full reservation remains.";
  const clarifyUnknownCost = evidence.eventIds.length > 0 && authorization?.actualCost.status === "UNAVAILABLE"
    && authorization.actualCost.reason !== reason;
  if (deltaUsd > 0 || clarifyUnknownCost) {
    await ctx.db.patch(run._id, {
      spentUsd,
      ...(clarifyUnknownCost ? { executionCostAuthorization: { ...authorization!, actualCost: { status: "UNAVAILABLE" as const, reason } } } : {}),
    });
    if (deltaUsd > 0 && run.missionId) {
      const mission = await ctx.db.get(run.missionId);
      if (!mission || mission.projectId !== run.projectId || mission.tenantId !== run.tenantId) {
        throw new Error("Attempt cost cannot cross Mission scope.");
      }
      await ctx.db.patch(mission._id, { spentUsd: mission.spentUsd + deltaUsd });
    }
  }
  return { ...evidence, spentUsd, deltaUsd, reservationRetainedUsd: run.reservedCostUsd ?? null };
}
