import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";

type Transition = Doc<"taskTransitions">;
type Message = Doc<"messages">;
type Agent = Doc<"agents">;

export function TaskDrawer({
  taskId,
  onClose,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
}) {
  const data = useQuery(api.tasks.getWithTimeline, taskId ? { taskId } : "skip");
  const agents = useQuery(api.agents.listAll, {});
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  
  const postMessage = useMutation(api.messages.post);
  const transitionTask = useMutation(api.tasks.transition);

  if (!taskId) return null;

  if (data === undefined || agents === undefined) {
    return (
      <Drawer onClose={onClose}>
        <div style={{ padding: 24 }}>Loading...</div>
      </Drawer>
    );
  }

  if (!data) {
    return (
      <Drawer onClose={onClose}>
        <div style={{ padding: 24 }}>Task not found</div>
      </Drawer>
    );
  }

  const { task, transitions, messages } = data;
  const agentMap = new Map(agents.map((a: Agent) => [a._id, a]));

  const handlePostComment = async () => {
    if (!comment.trim()) return;
    setLoading(true);
    try {
      await postMessage({
        taskId,
        authorType: "HUMAN",
        authorUserId: "jay",
        type: "COMMENT",
        content: comment,
        idempotencyKey: `comment:${taskId}:${Date.now()}`,
      });
      setComment("");
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleTransition = async (toStatus: string) => {
    setLoading(true);
    try {
      const result = await transitionTask({
        taskId,
        toStatus,
        actorType: "HUMAN",
        actorUserId: "jay",
        idempotencyKey: `transition:${taskId}:${toStatus}:${Date.now()}`,
        reason: "Manual transition from UI",
      });
      if (!result.success && result.errors) {
        alert(result.errors.map((e: any) => e.message).join("\n"));
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Build timeline from transitions and messages
  const timeline = buildTimeline(transitions, messages, agentMap);

  return (
    <Drawer onClose={onClose}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>{task.title}</h2>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <StatusBadge status={task.status} />
              <span style={tagStyle}>{task.type}</span>
              <span style={tagStyle}>P{task.priority}</span>
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {/* Description */}
        {task.description && (
          <Section title="Description">
            <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.5 }}>{task.description}</p>
          </Section>
        )}

        {/* Assignees */}
        {task.assigneeIds.length > 0 && (
          <Section title="Assignees">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {task.assigneeIds.map((id: Id<"agents">) => {
                const agent = agentMap.get(id) || ({} as Agent);
                return agent._id ? (
                  <AgentChip key={id} agent={agent} />
                ) : null;
              })}
            </div>
          </Section>
        )}

        {/* Work Plan */}
        {task.workPlan && (
          <Section title="Work Plan">
            <ul style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1" }}>
              {task.workPlan.bullets.map((b: string, i: number) => (
                <li key={i} style={{ marginBottom: 4 }}>{b}</li>
              ))}
            </ul>
            {task.workPlan.estimatedCost && (
              <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#94a3b8" }}>
                Est. cost: ${task.workPlan.estimatedCost.toFixed(2)}
              </div>
            )}
          </Section>
        )}

        {/* Deliverable */}
        {task.deliverable && (
          <Section title="Deliverable">
            {task.deliverable.summary && (
              <p style={{ margin: 0, color: "#cbd5e1" }}>{task.deliverable.summary}</p>
            )}
            {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {task.deliverable.artifactIds.map((id: string, i: number) => (
                  <span key={i} style={{ ...tagStyle, background: "#1e3a5f", color: "#93c5fd" }}>
                    📎 {id}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Blocked reason */}
        {task.blockedReason && (
          <Section title="Blocked">
            <div style={{ padding: 12, background: "#7f1d1d", borderRadius: 6, color: "#fca5a5" }}>
              ⚠️ {task.blockedReason}
            </div>
          </Section>
        )}

        {/* Quick Actions */}
        <Section title="Actions">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {getAvailableTransitions(task.status).map((toStatus) => (
              <button
                key={toStatus}
                onClick={() => handleTransition(toStatus)}
                disabled={loading}
                style={actionButtonStyle}
              >
                → {toStatus.replace("_", " ")}
              </button>
            ))}
          </div>
        </Section>

        {/* Timeline */}
        <Section title="Timeline">
          <div style={{ position: "relative" }}>
            {timeline.map((item, i) => (
              <TimelineItem key={i} item={item} isLast={i === timeline.length - 1} />
            ))}
            {timeline.length === 0 && (
              <div style={{ color: "#64748b", fontSize: "0.85rem" }}>No activity yet</div>
            )}
          </div>
        </Section>

        {/* Add Comment */}
        <Section title="Add Comment">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a comment..."
            style={{
              width: "100%",
              minHeight: 80,
              padding: 12,
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#e2e8f0",
              fontSize: "0.875rem",
              resize: "vertical",
            }}
          />
          <button
            onClick={handlePostComment}
            disabled={loading || !comment.trim()}
            style={{ ...actionButtonStyle, marginTop: 8, opacity: loading || !comment.trim() ? 0.5 : 1 }}
          >
            {loading ? "Posting..." : "Post Comment"}
          </button>
        </Section>
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid #334155", fontSize: "0.75rem", color: "#64748b" }}>
        Cost: ${task.actualCost.toFixed(2)}
        {task.estimatedCost && ` / $${task.estimatedCost.toFixed(2)}`}
        {" · "}
        Review cycles: {task.reviewCycles}
        {task.completedAt && ` · Completed: ${new Date(task.completedAt).toLocaleDateString()}`}
      </div>
    </Drawer>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: "90vw",
          background: "#1e293b",
          borderLeft: "1px solid #334155",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
        }}
      >
        {children}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: "0.85rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    INBOX: { bg: "#312e81", color: "#a5b4fc" },
    ASSIGNED: { bg: "#78350f", color: "#fcd34d" },
    IN_PROGRESS: { bg: "#1e3a8a", color: "#93c5fd" },
    REVIEW: { bg: "#4c1d95", color: "#c4b5fd" },
    NEEDS_APPROVAL: { bg: "#7f1d1d", color: "#fca5a5" },
    BLOCKED: { bg: "#7c2d12", color: "#fed7aa" },
    DONE: { bg: "#14532d", color: "#86efac" },
    CANCELED: { bg: "#27272a", color: "#a1a1aa" },
  };
  const style = colors[status] || colors.INBOX;
  return (
    <span style={{ ...tagStyle, background: style.bg, color: style.color, fontWeight: 600 }}>
      {status.replace("_", " ")}
    </span>
  );
}

function AgentChip({ agent }: { agent: Agent }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#334155", borderRadius: 16, fontSize: "0.8rem" }}>
      <span>{agent.emoji || "🤖"}</span>
      <span>{agent.name}</span>
      <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{agent.role}</span>
    </span>
  );
}

interface TimelineEntry {
  type: "transition" | "message";
  timestamp: number;
  actor: string;
  content: string;
  details?: string;
}

function buildTimeline(
  transitions: Transition[],
  messages: Message[],
  agentMap: Map<Id<"agents">, Agent>
): TimelineEntry[] {
  const items: TimelineEntry[] = [];

  for (const t of transitions) {
    const actor = t.actorUserId || (t.actorAgentId ? agentMap.get(t.actorAgentId)?.name : null) || "System";
    items.push({
      type: "transition",
      timestamp: t._creationTime,
      actor,
      content: `${t.fromStatus} → ${t.toStatus}`,
      details: t.reason || undefined,
    });
  }

  for (const m of messages) {
    const actor = m.authorUserId || (m.authorAgentId ? agentMap.get(m.authorAgentId)?.name : null) || "Unknown";
    items.push({
      type: "message",
      timestamp: m._creationTime,
      actor,
      content: m.content.length > 100 ? m.content.slice(0, 100) + "..." : m.content,
      details: m.type,
    });
  }

  return items.sort((a, b) => a.timestamp - b.timestamp);
}

function TimelineItem({ item, isLast }: { item: TimelineEntry; isLast: boolean }) {
  const isTransition = item.type === "transition";
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: isLast ? 0 : 16 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isTransition ? "#3b82f6" : "#22c55e",
            flexShrink: 0,
          }}
        />
        {!isLast && <div style={{ width: 2, flex: 1, background: "#334155", marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 2 }}>
          <strong>{item.actor}</strong>
          {" · "}
          {new Date(item.timestamp).toLocaleString()}
          {item.details && <span style={{ marginLeft: 8, color: "#64748b" }}>{item.details}</span>}
        </div>
        <div style={{ fontSize: "0.85rem", color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
          {isTransition ? `Status changed: ${item.content}` : item.content}
        </div>
      </div>
    </div>
  );
}

function getAvailableTransitions(currentStatus: string): string[] {
  const transitions: Record<string, string[]> = {
    INBOX: ["ASSIGNED", "CANCELED"],
    ASSIGNED: ["IN_PROGRESS", "INBOX", "CANCELED"],
    IN_PROGRESS: ["REVIEW", "BLOCKED", "CANCELED"],
    REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED", "CANCELED"],
    NEEDS_APPROVAL: ["INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE", "CANCELED"],
    BLOCKED: ["ASSIGNED", "IN_PROGRESS", "CANCELED"],
    DONE: [],
    CANCELED: [],
  };
  return transitions[currentStatus] || [];
}

const tagStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  padding: "2px 8px",
  background: "#334155",
  color: "#94a3b8",
  borderRadius: 4,
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#94a3b8",
  fontSize: "1.5rem",
  cursor: "pointer",
  padding: 4,
  lineHeight: 1,
};

const actionButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#334155",
  border: "1px solid #475569",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: "0.8rem",
  cursor: "pointer",
};
