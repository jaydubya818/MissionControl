import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { NavGroup } from "./navConfig";
import { navCountForView } from "./navCounts";

/** Attach live counts to nav items (waku-agent sidebar pattern). */
export function useNavGroupsWithCounts(
  groups: NavGroup[],
  projectId?: Id<"projects"> | null
): NavGroup[] {
  const visibleViews = new Set(groups.flatMap((group) => group.items.map((item) => item.view)));
  const stats = useQuery(
    api.analytics.schematicOverview,
    projectId && (visibleViews.has("command-center") || visibleViews.has("factory"))
      ? { projectId }
      : "skip"
  );
  const tasks = useQuery(
    api.tasks.listAll,
    projectId && visibleViews.has("tasks") ? { projectId } : "skip"
  );
  const approvals = useQuery(
    api.approvals.listPending,
    projectId && (visibleViews.has("control-approvals") || visibleViews.has("audit"))
      ? { projectId, limit: 100 }
      : "skip"
  );

  if (!stats && !tasks && !approvals) return groups;

  const taskCount = tasks?.length ?? stats?.taskCount ?? 0;
  const approvalCount = approvals?.length ?? 0;

  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      count: stats ? navCountForView(item.view as string, stats, taskCount, approvalCount) : undefined,
    })),
  }));
}
