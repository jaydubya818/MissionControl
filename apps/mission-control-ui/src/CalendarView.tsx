import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  projectId: Id<"projects"> | null;
}

const taskTypeBorderClass: Record<string, string> = {
  CONTENT: "border-l-blue-500",
  SOCIAL: "border-l-amber-500",
  EMAIL_MARKETING: "border-l-emerald-500",
  CUSTOMER_RESEARCH: "border-l-yellow-500",
  SEO_RESEARCH: "border-l-blue-500",
  ENGINEERING: "border-l-red-500",
};

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
    <main className="flex-1 overflow-auto bg-background p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mt-0 mb-1">Scheduled Tasks</h1>
        <p className="text-base text-muted-foreground mt-0 mb-4">Henry&apos;s automated routines</p>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("week")}
            className={cn(
              "px-4 py-2 border rounded-md text-sm font-medium cursor-pointer transition-all duration-200",
              viewMode === "week"
                ? "bg-primary border-primary text-white"
                : "bg-card border-border text-muted-foreground"
            )}
            aria-pressed={viewMode === "week"}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode("today")}
            className={cn(
              "px-4 py-2 border rounded-md text-sm font-medium cursor-pointer transition-all duration-200",
              viewMode === "today"
                ? "bg-primary border-primary text-white"
                : "bg-card border-border text-muted-foreground"
            )}
            aria-pressed={viewMode === "today"}
          >
            Today
          </button>
          <button
            className="px-3 py-2 bg-card border border-border rounded-md text-base cursor-pointer transition-all duration-200"
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            🔄
          </button>
        </div>
      </div>

      {recurringTasks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-foreground mt-0 mb-3">⚡ Always Running</h2>
          <div className="flex gap-3 flex-wrap">
            {recurringTasks.map((task) => (
              <div key={task._id} className="py-3 px-4 bg-card border border-border rounded-lg">
                <div className="text-sm font-medium text-foreground mb-1">{task.title}</div>
                <div className="text-xs text-muted-foreground">
                  Every {formatRecurrence(task.recurrence)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "week" && (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map((day, i) => {
            const dayTasks = tasksByDay[i] || [];
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "bg-card border border-border rounded-lg overflow-hidden",
                  isToday && "border-primary ring-2 ring-primary/25"
                )}
              >
                <div className="p-3 border-b border-border text-center">
                  <div className="text-sm font-semibold text-foreground mb-0.5">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
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

      {viewMode === "today" && (
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-2xl font-semibold text-foreground mt-0 mb-6">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <div className="flex flex-col gap-3">
            {(tasksByDay[today.getDay()] || []).map((task) => (
              <TaskCard key={task._id} task={task} large />
            ))}
          </div>
        </div>
      )}
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
        "py-2 px-3 bg-muted border border-border border-l-[3px] rounded-md cursor-pointer transition-all duration-200",
        large && "py-3 px-4",
        taskTypeBorderClass[task.type] ?? "border-l-blue-500"
      )}
    >
      <div className="text-xs text-muted-foreground mb-1">{time}</div>
      <div className="text-sm font-medium text-foreground leading-snug">{task.title}</div>
      {task.description && large && (
        <div className="text-xs text-muted-foreground mt-1.5 leading-snug">{task.description}</div>
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
