import { PENDING_APPROVALS_LIMIT } from "../lib/approvalCount";
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
  const stats = useQuery(
    api.analytics.schematicOverview,
    projectId ? { projectId } : "skip"
  );
  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : "skip"
  );
  const approvals = useQuery(
    api.approvals.listPending,
    projectId ? { projectId, limit: PENDING_APPROVALS_LIMIT } : "skip"
  );

  if (!stats) return groups;

  const taskCount = tasks?.length ?? stats.taskCount ?? 0;
  const approvalCount = approvals?.length ?? 0;

  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      count: navCountForView(item.view as string, stats, taskCount, approvalCount),
    })),
  }));
}
