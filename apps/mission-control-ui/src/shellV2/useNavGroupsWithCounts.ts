import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { NavGroup } from "./navConfig";
import { navCountForView } from "./navCounts";

/** Attach live counts to nav items (waku-agent sidebar pattern). */
export function useNavGroupsWithCounts(groups: NavGroup[]): NavGroup[] {
  const stats = useQuery(api.analytics.schematicOverview, {});
  const tasks = useQuery(api.tasks.listAll, {});
  const approvals = useQuery(api.approvals.listPending, { limit: 100 });

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
