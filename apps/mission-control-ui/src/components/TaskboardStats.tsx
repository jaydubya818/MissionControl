import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  buildTaskboardStats,
  CANONICAL_TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "./taskboardStatsModel";

interface TaskboardStatsProps {
  projectId: Id<"projects"> | null;
  workOrderId?: Id<"workOrders"> | null;
  className?: string;
}

export function TaskboardStats({ projectId, workOrderId, className }: TaskboardStatsProps) {
  const allTasks = useQuery(
    api.tasks.listAll,
    workOrderId ? "skip" : projectId ? { projectId } : {},
  );
  const scopedTasks = useQuery(
    api.tasks.listByWorkOrder,
    workOrderId && projectId ? { projectId, workOrderId } : "skip",
  );
  const tasks = workOrderId ? scopedTasks : allTasks;

  if (tasks === undefined) return null;

  const stats = buildTaskboardStats(tasks);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 overflow-x-auto flex-nowrap px-4 py-2 border-b border-line bg-surface-1 text-[12.5px]",
        className
      )}
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Canonical status
      </span>
      {CANONICAL_TASK_STATUSES.map((status) => (
        <span key={status} className="shrink-0 text-ink-secondary">
          <span className="font-medium text-ink">{stats.canonicalCounts[status]}</span>{" "}
          {TASK_STATUS_LABELS[status]}
        </span>
      ))}
      {stats.unknownStatusCount > 0 ? (
        <span className="shrink-0 text-amber-300">
          <span className="font-medium">{stats.unknownStatusCount}</span> Unknown
        </span>
      ) : null}
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line" />
      <span
        className="shrink-0 text-ink-secondary"
        title="Presentation grouping: Ready, Assigned, In progress, Review, and Needs approval"
      >
        <span className="font-medium text-ink">{stats.presentationActiveCount}</span>{" "}
        Presentation active
      </span>
      <span className="shrink-0 text-ink-secondary">
        <span className="font-medium text-ink">{stats.thisWeek}</span> Created this week
      </span>
      <span className="shrink-0 text-ink-secondary">
        <span className="font-medium text-ink">{stats.total}</span> Total
      </span>
      <span className="shrink-0 text-ink-secondary">
        <span className="font-medium text-ink">{stats.completionPct}%</span> Completion
      </span>
    </div>
  );
}
