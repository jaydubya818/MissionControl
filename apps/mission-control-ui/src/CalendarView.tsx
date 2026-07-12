import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricBlock } from "@/components/factory/MetricBlock";
import { Calendar, RefreshCw } from "lucide-react";

interface CalendarViewProps {
  projectId: Id<"projects"> | null;
}

type ViewMode = "week" | "today";

export function CalendarView({ projectId }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });

  // Get scheduled tasks (tasks with scheduledFor or recurrence)
  const scheduledTasks = tasks?.filter(
    (t) => t.scheduledFor || t.recurrence
  ) ?? [];

  // Get recurring tasks (always running)
  const recurringTasks = scheduledTasks.filter((t) => t.recurrence);

  // Get today's date
  const today = new Date();
  const startOfWeek = getStartOfWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + i);
    return date;
  });

  // Group tasks by day
  const tasksByDay = groupTasksByDay(scheduledTasks, weekDays);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Calendar"
        description={
          scheduledTasks.length > 0
            ? `${scheduledTasks.length} scheduled · ${recurringTasks.length} recurring — confirm your agents are being proactive`
            : "Cron jobs and scheduled tasks for your agents. Schedule routines to confirm your open claw is being proactive."
        }
        eyebrow="Operations"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-line p-0.5">
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150",
                  viewMode === "week" ? "bg-surface-2 text-ink" : "text-ink-secondary hover:text-ink"
                )}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("today")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150",
                  viewMode === "today" ? "bg-surface-2 text-ink" : "text-ink-secondary hover:text-ink"
                )}
              >
                Today
              </button>
            </div>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.7} />
            </Button>
          </div>
        }
      />

      <div className="px-6 py-6 flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <MetricBlock
            label="Scheduled"
            value={scheduledTasks.length}
            detail="Tasks visible on the calendar"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Recurring"
            value={recurringTasks.length}
            detail="Routines still repeating without manual re-entry"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Today"
            value={tasksByDay[today.getDay()]?.length ?? 0}
            detail="Tasks currently landing on today's schedule"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="View"
            value={<span className="capitalize">{viewMode}</span>}
            detail="Switch between a weekly scan and a focused today view"
          />
        </Card>
      </div>

      {scheduledTasks.length === 0 && (
        <EmptyState
          icon={Calendar}
          title="No scheduled tasks"
          description="Add a due date or recurrence to tasks from the task drawer to see them here. Great for standups, reviews, and recurring agent routines."
        />
      )}

      {scheduledTasks.length > 0 && recurringTasks.length > 0 && (
        <div>
          <h2 className="text-[19px] font-semibold text-ink mt-0 mb-3">Always running</h2>
          <div className="flex gap-3 flex-wrap">
            {recurringTasks.map((task) => (
              <div key={task._id} className="py-3 px-4 bg-surface-1 border border-line rounded-xl transition-colors duration-150 hover:border-line-strong">
                <div className="text-[13.5px] font-medium text-ink mb-1">{task.title}</div>
                <div className="text-[12.5px] text-ink-muted">
                  Every {formatRecurrence(task.recurrence)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scheduledTasks.length > 0 && viewMode === "week" && (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map((day, i) => {
            const dayTasks = tasksByDay[i] || [];
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "bg-surface-1 border rounded-xl overflow-hidden",
                  isToday ? "border-line-strong" : "border-line"
                )}
              >
                <div className="p-3 border-b border-line text-center">
                  <div className="text-[13.5px] font-semibold text-ink mb-0.5">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-[12.5px] text-ink-muted">
                    {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div className="p-2 flex flex-col gap-2">
                  {dayTasks.map((task) => (
                    <TaskCard key={task._id} task={task} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scheduledTasks.length > 0 && viewMode === "today" && (
        <div className="max-w-[800px] mx-auto w-full">
          <h2 className="text-[19px] font-semibold text-ink mt-0 mb-6">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <div className="flex flex-col gap-3">
            {(tasksByDay[today.getDay()] || []).map((task) => (
              <TaskCard key={task._id} task={task} large />
            ))}
          </div>
        </div>
      )}
      </div>
    </main>
  );
}

interface TaskCardProps {
  task: Doc<"tasks">;
  large?: boolean;
}

function TaskCard({ task, large }: TaskCardProps) {
  const time = task.scheduledFor
    ? new Date(task.scheduledFor).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "All day";

  return (
    <div
      className={cn(
        "py-2 px-3 bg-surface-2 border border-line rounded-lg cursor-pointer transition-colors duration-150 hover:border-line-strong",
        large && "py-3 px-4"
      )}
    >
      <div className="text-[12.5px] text-ink-muted mb-1">{time} · {task.type}</div>
      <div className="text-[13.5px] font-medium text-ink leading-snug">{task.title}</div>
      {task.description && large && (
        <div className="text-[12.5px] text-ink-muted mt-1.5 leading-snug">{task.description}</div>
      )}
    </div>
  );
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function groupTasksByDay(tasks: Doc<"tasks">[], weekDays: Date[]): Doc<"tasks">[][] {
  const grouped: Doc<"tasks">[][] = Array.from({ length: 7 }, () => []);

  for (const task of tasks) {
    if (task.scheduledFor) {
      const taskDate = new Date(task.scheduledFor);
      const dayIndex = weekDays.findIndex((d) => isSameDay(d, taskDate));
      if (dayIndex !== -1) {
        grouped[dayIndex].push(task);
      }
    } else if (task.recurrence) {
      for (let i = 0; i < 7; i++) {
        grouped[i].push(task);
      }
    }
  }

  for (const dayTasks of grouped) {
    dayTasks.sort((a, b) => {
      const timeA = a.scheduledFor ?? 0;
      const timeB = b.scheduledFor ?? 0;
      return timeA - timeB;
    });
  }

  return grouped;
}

function formatRecurrence(recurrence: Doc<"tasks">["recurrence"]): string {
  if (!recurrence) return "";
  const { frequency, interval } = recurrence;
  if (!frequency) return "";
  if (interval === 1) {
    return frequency.toLowerCase();
  }
  return `${interval} ${frequency.toLowerCase()}`;
}
