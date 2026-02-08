import { CSSProperties, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface CalendarViewProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentPurple: "#8b5cf6",
  accentRed: "#ef4444",
  accentYellow: "#eab308",
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
    <main style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Scheduled Tasks</h1>
        <p style={styles.subtitle}>Henry's automated routines</p>
        <div style={styles.controls}>
          <button
            onClick={() => setViewMode("week")}
            style={{
              ...styles.viewButton,
              ...(viewMode === "week" && styles.viewButtonActive),
            }}
            aria-pressed={viewMode === "week"}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode("today")}
            style={{
              ...styles.viewButton,
              ...(viewMode === "today" && styles.viewButtonActive),
            }}
            aria-pressed={viewMode === "today"}
          >
            Today
          </button>
          <button 
            style={styles.refreshButton} 
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            🔄
          </button>
        </div>
      </div>

      {recurringTasks.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>⚡ Always Running</h2>
          <div style={styles.recurringList}>
            {recurringTasks.map((task) => (
              <div key={task._id} style={styles.recurringTask}>
                <div style={styles.recurringTaskTitle}>{task.title}</div>
                <div style={styles.recurringTaskFreq}>
                  Every {formatRecurrence(task.recurrence)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "week" && (
        <div style={styles.weekView}>
          {weekDays.map((day, i) => {
            const dayTasks = tasksByDay[i] || [];
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                style={{
                  ...styles.dayColumn,
                  ...(isToday && styles.dayColumnToday),
                }}
              >
                <div style={styles.dayHeader}>
                  <div style={styles.dayName}>
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div style={styles.dayDate}>
                    {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div style={styles.dayTasks}>
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
        <div style={styles.todayView}>
          <h2 style={styles.todayTitle}>
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <div style={styles.todayTasks}>
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

  // Color based on task type
  let color = colors.accentBlue;
  if (task.type === "CONTENT") color = colors.accentPurple;
  else if (task.type === "SOCIAL") color = colors.accentOrange;
  else if (task.type === "EMAIL_MARKETING") color = colors.accentGreen;
  else if (task.type === "CUSTOMER_RESEARCH") color = colors.accentYellow;
  else if (task.type === "SEO_RESEARCH") color = colors.accentBlue;
  else if (task.type === "ENGINEERING") color = colors.accentRed;

  return (
    <div
      style={{
        ...styles.taskCard,
        borderLeftColor: color,
        ...(large && styles.taskCardLarge),
      }}
    >
      <div style={styles.taskTime}>{time}</div>
      <div style={styles.taskTitle}>{task.title}</div>
      {task.description && large && (
        <div style={styles.taskDesc}>{task.description}</div>
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
      // Add recurring tasks to all days
      for (let i = 0; i < 7; i++) {
        grouped[i].push(task);
      }
    }
  }

  // Sort tasks by time within each day
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

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    background: colors.bgPage,
    padding: "24px",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "1rem",
    color: colors.textSecondary,
    marginTop: 0,
    marginBottom: "16px",
  },
  controls: {
    display: "flex",
    gap: "8px",
  },
  viewButton: {
    padding: "8px 16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  viewButtonActive: {
    background: colors.accentBlue,
    borderColor: colors.accentBlue,
    color: "#fff",
  },
  refreshButton: {
    padding: "8px 12px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: "1rem",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  section: {
    marginBottom: "32px",
  },
  sectionTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "12px",
  },
  recurringList: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  recurringTask: {
    padding: "12px 16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  recurringTaskTitle: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.textPrimary,
    marginBottom: "4px",
  },
  recurringTaskFreq: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  weekView: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "12px",
  },
  dayColumn: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  dayColumnToday: {
    borderColor: colors.accentBlue,
    boxShadow: `0 0 0 2px ${colors.accentBlue}40`,
  },
  dayHeader: {
    padding: "12px",
    borderBottom: `1px solid ${colors.border}`,
    textAlign: "center",
  },
  dayName: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "2px",
  },
  dayDate: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  dayTasks: {
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  taskCard: {
    padding: "8px 12px",
    background: colors.bgHover,
    border: `1px solid ${colors.border}`,
    borderLeft: "3px solid",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  taskCardLarge: {
    padding: "12px 16px",
  },
  taskTime: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    marginBottom: "4px",
  },
  taskTitle: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.textPrimary,
    lineHeight: 1.4,
  },
  taskDesc: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    marginTop: "6px",
    lineHeight: 1.4,
  },
  todayView: {
    maxWidth: 800,
    marginLeft: "auto",
    marginRight: "auto",
  },
  todayTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "24px",
  },
  todayTasks: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
};
