import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";

type Tab = "overview" | "timeline";

export function TaskDrawer({
  taskId,
  onClose,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const task = useQuery(api.tasks.getTask as any, taskId ? { id: taskId } : "skip");
  const transitions = useQuery(
    api.tasks.getTaskTransitions as any,
    taskId ? { taskId } : "skip"
  );

  if (!taskId) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 420,
        maxWidth: "100%",
        height: "100%",
        background: "#1e293b",
        borderLeft: "1px solid #334155",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>Task details</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "1.25rem",
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #334155" }}>
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
          Timeline
        </TabButton>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {task === undefined ? (
          <div style={{ color: "#94a3b8" }}>Loading…</div>
        ) : task === null ? (
          <div style={{ color: "#94a3b8" }}>Task not found</div>
        ) : tab === "overview" ? (
          <Overview task={task} />
        ) : (
          <Timeline transitions={transitions ?? []} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        background: active ? "#0f172a" : "transparent",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        color: active ? "#e2e8f0" : "#94a3b8",
        cursor: "pointer",
        fontWeight: 500,
        fontSize: "0.875rem",
      }}
    >
      {children}
    </button>
  );
}

function Overview({ task }: { task: Record<string, unknown> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>Title</div>
        <div style={{ fontWeight: 600 }}>{String(task.title)}</div>
      </div>
      <div>
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>Description</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{String(task.description)}</div>
      </div>
      <div>
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>Status</div>
        <span
          style={{
            display: "inline-block",
            padding: "4px 8px",
            borderRadius: 6,
            background: "#334155",
            fontSize: "0.875rem",
          }}
        >
          {String(task.status)}
        </span>
      </div>
      <div>
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>Type</div>
        <div>{String(task.type)}</div>
      </div>
      <div>
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>Budget / Spend</div>
        <div>${Number(task.spend).toFixed(2)} / ${Number(task.budget).toFixed(2)}</div>
      </div>
      {task.blockedReason ? (
        <div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>Blocked reason</div>
          <div style={{ color: "#f87171" }}>{String(task.blockedReason)}</div>
        </div>
      ) : null}
    </div>
  );
}

function Timeline({
  transitions,
}: {
  transitions: { _creationTime: number; fromStatus: string; toStatus: string; actor: string; actorId?: string; reason?: string }[];
}) {
  if (transitions.length === 0) {
    return <div style={{ color: "#94a3b8" }}>No transitions yet</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {transitions.map((t, i) => (
        <div
          key={t._creationTime + i}
          style={{
            padding: "10px 12px",
            background: "#0f172a",
            borderRadius: 6,
            borderLeft: "3px solid #3b82f6",
          }}
        >
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            {t.fromStatus} → {t.toStatus}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 4 }}>
            {new Date(t._creationTime).toLocaleString()} · {t.actor}
            {t.actorId ? ` (${t.actorId})` : ""}
          </div>
          {t.reason ? (
            <div style={{ fontSize: "0.75rem", marginTop: 4 }}>{t.reason}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
