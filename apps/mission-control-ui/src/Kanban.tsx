import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useToast } from "./Toast";

const COLUMNS: { status: string; label: string; color: string }[] = [
  { status: "INBOX", label: "Inbox", color: "#6366f1" },
  { status: "ASSIGNED", label: "Assigned", color: "#f59e0b" },
  { status: "IN_PROGRESS", label: "In Progress", color: "#3b82f6" },
  { status: "REVIEW", label: "Review", color: "#8b5cf6" },
  { status: "NEEDS_APPROVAL", label: "Needs Approval", color: "#ef4444" },
  { status: "BLOCKED", label: "Blocked", color: "#f97316" },
  { status: "DONE", label: "Done", color: "#22c55e" },
  { status: "CANCELED", label: "Canceled", color: "#6b7280" },
];

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "#ef4444" },
  2: { label: "High", color: "#f97316" },
  3: { label: "Normal", color: "#3b82f6" },
  4: { label: "Low", color: "#6b7280" },
};

type Task = {
  _id: Id<"tasks">;
  title: string;
  type: string;
  status: string;
  priority: number;
  actualCost: number;
  estimatedCost?: number;
  assigneeIds: Id<"agents">[];
  labels?: string[];
  blockedReason?: string;
};

const STATUS_LABELS: Record<string, string> = {
  INBOX: "Inbox",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  NEEDS_APPROVAL: "Needs Approval",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELED: "Canceled",
};

export function Kanban({ 
  projectId,
  onSelectTask,
  filters,
}: { 
  projectId: Id<"projects"> | null;
  onSelectTask: (id: Id<"tasks">) => void;
  filters?: {
    agents: string[];
    priorities: number[];
    types: string[];
  };
}) {
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const allowedMap = useQuery(api.tasks.getAllowedTransitionsForHuman);
  const transitionTask = useMutation(api.tasks.transition);
  const { toast } = useToast();

  if (tasks === undefined || agents === undefined) {
    return <div style={{ padding: 24 }}>Loading tasks…</div>;
  }

  // Apply filters
  const filteredTasks = tasks.filter((task) => {
    if (!filters) return true;
    
    // Filter by agent
    if (filters.agents.length > 0) {
      const hasMatchingAgent = task.assigneeIds.some((id) =>
        filters.agents.includes(id)
      );
      if (!hasMatchingAgent && task.assigneeIds.length > 0) return false;
    }
    
    // Filter by priority
    if (filters.priorities.length > 0) {
      if (!filters.priorities.includes(task.priority)) return false;
    }
    
    // Filter by type
    if (filters.types.length > 0) {
      if (!filters.types.includes(task.type)) return false;
    }
    
    return true;
  });

  const agentMap = new Map(agents.map((a: Doc<"agents">) => [a._id, a]));
  const byStatus = (status: string) => filteredTasks.filter((t: Doc<"tasks">) => t.status === status);

  const handleMoveTo = async (taskId: Id<"tasks">, _fromStatus: string, toStatus: string) => {
    try {
      const result = await transitionTask({
        taskId,
        toStatus,
        actorType: "HUMAN",
        actorUserId: "operator",
        idempotencyKey: `ui-${taskId}-${toStatus}-${Date.now()}`,
      });
      if (result && typeof result === "object" && "success" in result && !result.success) {
        const err = (result as { errors?: { message: string }[] }).errors?.[0]?.message ?? "Transition failed";
        toast(err, true);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transition failed", true);
    }
  };

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", minHeight: 500, paddingBottom: 16 }}>
      {COLUMNS.map((col) => (
        <Column
          key={col.status}
          title={col.label}
          color={col.color}
          status={col.status}
          tasks={byStatus(col.status) as Task[]}
          agentMap={agentMap}
          allowedMap={allowedMap ?? {}}
          onSelectTask={onSelectTask}
          onMoveTo={handleMoveTo}
          onDrop={handleMoveTo}
        />
      ))}
    </div>
  );
}

function Column({
  title,
  color,
  status,
  tasks,
  agentMap,
  allowedMap,
  onSelectTask,
  onMoveTo,
  onDrop,
}: {
  title: string;
  color: string;
  status: string;
  tasks: Task[];
  agentMap: Map<Id<"agents">, { name: string; emoji?: string }>;
  allowedMap: Record<string, string[]>;
  onSelectTask: (id: Id<"tasks">) => void;
  onMoveTo: (taskId: Id<"tasks">, fromStatus: string, toStatus: string) => void;
  onDrop: (taskId: Id<"tasks">, fromStatus: string, toStatus: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const canAccept = (fromStatus: string) => (allowedMap[fromStatus] ?? []).includes(status);

  return (
    <div
      style={{
        minWidth: 260,
        maxWidth: 260,
        background: dragOver ? "#25334d" : "#1e293b",
        borderRadius: 8,
        border: dragOver ? `2px dashed ${color}` : "1px solid #334155",
        display: "flex",
        flexDirection: "column",
        transition: "background 0.15s, border 0.15s",
      }}
      onDragOver={(e) => {
        const taskId = e.dataTransfer.getData("taskId") as Id<"tasks"> | "";
        const fromStatus = e.dataTransfer.getData("fromStatus") || "";
        if (taskId && fromStatus && canAccept(fromStatus)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData("taskId") as Id<"tasks"> | "";
        const fromStatus = e.dataTransfer.getData("fromStatus") || "";
        if (taskId && fromStatus && status !== fromStatus && canAccept(fromStatus)) {
          onDrop(taskId, fromStatus, status);
        }
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{title}</span>
        <span
          style={{
            marginLeft: "auto",
            background: "#334155",
            color: "#94a3b8",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          {tasks.length}
        </span>
      </div>
      <div style={{ padding: 8, flex: 1, overflowY: "auto", maxHeight: "70vh" }}>
        {tasks.map((t) => (
          <Card
            key={t._id}
            task={t}
            agentMap={agentMap}
            allowedToStatuses={allowedMap[t.status] ?? []}
            onSelect={() => onSelectTask(t._id)}
            onMoveTo={(toStatus) => onMoveTo(t._id, t.status, toStatus)}
          />
        ))}
        {tasks.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: "0.8rem" }}>
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}


function Card({
  task,
  agentMap,
  allowedToStatuses,
  onSelect,
  onMoveTo,
}: {
  task: Task;
  agentMap: Map<Id<"agents">, { name: string; emoji?: string }>;
  allowedToStatuses: string[];
  onSelect: () => void;
  onMoveTo: (toStatus: string) => void;
}) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const assignees = task.assigneeIds
    .map((id) => agentMap.get(id))
    .filter(Boolean);

  return (
    <div
      draggable={allowedToStatuses.length > 0}
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", task._id);
        e.dataTransfer.setData("fromStatus", task.status);
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{
        width: "100%",
        padding: "12px",
        marginBottom: 8,
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 6,
        color: "#e2e8f0",
        fontSize: "0.875rem",
        transition: "border-color 0.15s",
        cursor: allowedToStatuses.length > 0 ? "grab" : "pointer",
      }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = "#475569")}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = "#334155")}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        style={{ cursor: "pointer", outline: "none" }}
      >
      {/* Title */}
      <div style={{ fontWeight: 500, marginBottom: 8, lineHeight: 1.3 }}>{task.title}</div>

      {/* Type & Priority */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "2px 6px",
            background: "#1e3a5f",
            color: "#93c5fd",
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          {task.type}
        </span>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "2px 6px",
            background: priority.color + "22",
            color: priority.color,
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          {priority.label}
        </span>
      </div>

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          {task.labels.slice(0, 3).map((label) => (
            <span
              key={label}
              style={{
                fontSize: "0.65rem",
                padding: "1px 5px",
                background: "#334155",
                color: "#94a3b8",
                borderRadius: 3,
              }}
            >
              {label}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span style={{ fontSize: "0.65rem", color: "#64748b" }}>
              +{task.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Blocked reason */}
      {task.blockedReason && (
        <div
          style={{
            fontSize: "0.75rem",
            padding: "4px 8px",
            background: "#7f1d1d",
            color: "#fca5a5",
            borderRadius: 4,
            marginBottom: 8,
          }}
        >
          ⚠️ {task.blockedReason}
        </div>
      )}

      {/* Footer: Cost & Assignees */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "#94a3b8",
        }}
      >
        <span>
          ${task.actualCost.toFixed(2)}
          {task.estimatedCost && ` / $${task.estimatedCost.toFixed(2)}`}
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {assignees.slice(0, 3).map((agent, i) => (
            <span
              key={i}
              title={agent!.name}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                marginLeft: i > 0 ? -6 : 0,
                border: "2px solid #0f172a",
              }}
            >
              {agent!.emoji || agent!.name.charAt(0)}
            </span>
          ))}
          {assignees.length > 3 && (
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.65rem",
                marginLeft: -6,
                border: "2px solid #0f172a",
              }}
            >
              +{assignees.length - 3}
            </span>
          )}
        </div>
      </div>
      {allowedToStatuses.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155" }}>
          <label style={{ fontSize: "0.7rem", color: "#94a3b8", marginRight: 6 }}>Move to</label>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                onMoveTo(v);
                e.target.value = "";
              }
            }}
            style={{
              fontSize: "0.75rem",
              padding: "4px 8px",
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            <option value="">—</option>
            {allowedToStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>
      )}
      </div>
    </div>
  );
}
