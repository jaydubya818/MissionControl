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
  if (deltaUsd > 0) {
    await ctx.db.patch(run._id, { spentUsd });
    if (run.missionId) {
      const mission = await ctx.db.get(run.missionId);
      if (!mission || mission.projectId !== run.projectId || mission.tenantId !== run.tenantId) {
        throw new Error("Attempt cost cannot cross Mission scope.");
      }
      await ctx.db.patch(mission._id, { spentUsd: mission.spentUsd + deltaUsd });
    }
  }
  return { ...evidence, spentUsd, deltaUsd, reservationRetainedUsd: run.reservedCostUsd ?? null };
}
