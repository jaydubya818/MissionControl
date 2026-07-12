import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface TaskboardStatsProps {
  projectId: Id<"projects"> | null;
  className?: string;
}

function startOfWeek(date: Date): number {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function TaskboardStats({ projectId, className }: TaskboardStatsProps) {
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});

  if (tasks === undefined) return null;

  const weekStart = startOfWeek(new Date());
  const thisWeek = tasks.filter(
    (t) => (t as { _creationTime?: number })._creationTime >= weekStart
  ).length;
  const inProgress = tasks.filter(
    (t) =>
      t.status === "IN_PROGRESS" ||
      t.status === "ASSIGNED" ||
      t.status === "REVIEW" ||
      t.status === "NEEDS_APPROVAL"
  ).length;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-4 overflow-x-auto flex-nowrap px-4 py-2 border-b border-line bg-surface-1 text-[12.5px]",
        className
      )}
    >
      <span className="text-ink-secondary">
        <span className="font-medium text-ink">{thisWeek}</span> This week
      </span>
      <span className="text-ink-secondary">
        <span className="font-medium text-ink">{inProgress}</span> In progress
      </span>
      <span className="text-ink-secondary">
        <span className="font-medium text-ink">{total}</span> Total
      </span>
      <span className="text-ink-secondary">
        <span className="font-medium text-ink">{completionPct}%</span> Completion
      </span>
    </div>
  );
}
