import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./companyAccess";

type Context = QueryCtx | MutationCtx;
type Run = Pick<Doc<"workflowRuns">, "missionId" | "workOrderId" | "projectId">;

async function hasMissionAuthority(ctx: Context, run: Run): Promise<boolean> {
  // Mission-scoped database access already enforces the exact grant. Do not
  // replace an explicit Mission grant with a broader workspace role.
  if (run.missionId) return true;
  if (!run.workOrderId) return false;
  return Boolean((await ctx.db.get(run.workOrderId))?.missionId);
}

export async function visibleWorkflowRuns<T extends Run>(ctx: Context, runs: T[]): Promise<T[]> {
  const projects = new Map<string, Promise<boolean>>();
  const visible = await Promise.all(runs.map(async run => {
    if (await hasMissionAuthority(ctx, run)) return true;
    if (!run.projectId) return false;
    const projectId = run.projectId;
    if (!projects.has(projectId)) projects.set(projectId,
      requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW).then(() => true, () => false));
    return await projects.get(projectId)!;
  }));
  return runs.filter((_, index) => visible[index]);
}

export async function requireLegacyWorkflowRunWrite(ctx: MutationCtx, run: Run): Promise<void> {
  if (await hasMissionAuthority(ctx, run)) return;
  if (!run.projectId) throw new Error("An authorized workspace is required for legacy workflow execution.");
  await requireWorkspacePermission(ctx, run.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
}
