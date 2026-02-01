import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const COLUMNS: { status: string; label: string }[] = [
  { status: "inbox", label: "Inbox" },
  { status: "assigned", label: "Assigned" },
  { status: "in_progress", label: "In Progress" },
  { status: "review", label: "Review" },
  { status: "needs_approval", label: "Needs Approval" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export function Kanban({ onSelectTask }: { onSelectTask: (id: Id<"tasks">) => void }) {
  const tasks = useQuery(api.tasks.listTasksByStatus as any, {});

  if (tasks === undefined) {
    return <div style={{ padding: 24 }}>Loading tasks…</div>;
  }

  const byStatus = (status: string) =>
    tasks.filter((t: { status: string }) => t.status === status);

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", minHeight: 400 }}>
      {COLUMNS.map((col) => (
        <Column
          key={col.status}
          title={col.label}
          tasks={byStatus(col.status)}
          onSelectTask={onSelectTask}
        />
      ))}
    </div>
  );
}

function Column({
  title,
  tasks,
  onSelectTask,
}: {
  title: string;
  tasks: { _id: Id<"tasks">; title: string; type: string; status: string; budget: number; spend: number }[];
  onSelectTask: (id: Id<"tasks">) => void;
}) {
  return (
    <div
      style={{
        minWidth: 220,
        maxWidth: 220,
        background: "#1e293b",
        borderRadius: 8,
        border: "1px solid #334155",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155", fontWeight: 600, fontSize: "0.875rem" }}>
        {title}
        <span style={{ marginLeft: 8, color: "#94a3b8", fontWeight: 400 }}>{tasks.length}</span>
      </div>
      <div style={{ padding: 8, flex: 1, overflowY: "auto" }}>
        {tasks.map((t) => (
          <Card key={t._id} task={t} onClick={() => onSelectTask(t._id)} />
        ))}
      </div>
    </div>
  );
}

function Card({
  task,
  onClick,
}: {
  task: { _id: Id<"tasks">; title: string; type: string; budget: number; spend: number };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        marginBottom: 6,
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 6,
        color: "#e2e8f0",
        cursor: "pointer",
        fontSize: "0.875rem",
      }}
    >
      <div style={{ fontWeight: 500 }}>{task.title}</div>
      <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 4 }}>
        {task.type} · ${task.spend.toFixed(2)} / ${task.budget.toFixed(2)}
      </div>
    </button>
  );
}

