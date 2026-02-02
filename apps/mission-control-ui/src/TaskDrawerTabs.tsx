/**
 * TaskDrawer with Tabs
 * 
 * Enhanced task detail view with Overview, Timeline, Artifacts, Approvals, Cost tabs.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { PeerReviewPanel } from "./PeerReviewPanel";
import { ExportReportButton } from "./ExportReportButton";
import { TaskEditMode } from "./TaskEditMode";

type Tab = "overview" | "timeline" | "artifacts" | "approvals" | "cost" | "reviews";

export function TaskDrawerTabs({
  taskId,
  onClose,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isEditMode, setIsEditMode] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  
  const data = useQuery(api.tasks.getWithTimeline, taskId ? { taskId } : "skip");
  const agents = useQuery(api.agents.listAll, {});
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

  const { task, transitions, messages, runs, toolCalls, approvals } = data;
  const agentMap = new Map(agents.map((a: Doc<"agents">) => [a._id, a]));

  const handlePostComment = async () => {
    if (!comment.trim()) return;
    setLoading(true);
    try {
      await postMessage({
        taskId,
        authorType: "HUMAN",
        authorUserId: "operator",
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
        actorUserId: "operator",
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

  return (
    <Drawer onClose={onClose}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>{task.title}</h2>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <StatusBadge status={task.status} />
              <span style={tagStyle}>{task.type}</span>
              <span style={tagStyle}>P{task.priority}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {!isEditMode && (
              <>
                <button
                  onClick={() => setIsEditMode(true)}
                  style={{
                    padding: "8px 16px",
                    background: "#3b82f6",
                    border: "none",
                    borderRadius: "6px",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  ✏️ Edit
                </button>
                <ExportReportButton taskId={taskId} />
              </>
            )}
            <button onClick={onClose} style={closeButtonStyle}>×</button>
          </div>
        </div>
      </div>

      {/* Edit Mode or Tabs */}
      {isEditMode ? (
        <TaskEditMode
          task={task}
          onSave={() => setIsEditMode(false)}
          onCancel={() => setIsEditMode(false)}
        />
      ) : (
        <>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #334155", padding: "0 20px" }}>
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={activeTab === "timeline"} onClick={() => setActiveTab("timeline")}>
          Timeline
        </TabButton>
        <TabButton active={activeTab === "artifacts"} onClick={() => setActiveTab("artifacts")}>
          Artifacts
        </TabButton>
        <TabButton active={activeTab === "approvals"} onClick={() => setActiveTab("approvals")}>
          Approvals {approvals.length > 0 && `(${approvals.length})`}
        </TabButton>
        <TabButton active={activeTab === "cost"} onClick={() => setActiveTab("cost")}>
          Cost
        </TabButton>
        <TabButton active={activeTab === "reviews"} onClick={() => setActiveTab("reviews")}>
          Reviews
        </TabButton>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {activeTab === "overview" && (
          <OverviewTab 
            task={task} 
            agentMap={agentMap}
            onTransition={handleTransition}
            loading={loading}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineTab
            transitions={transitions}
            messages={messages}
            runs={runs}
            toolCalls={toolCalls}
            approvals={approvals}
            agentMap={agentMap}
          />
        )}
        {activeTab === "artifacts" && (
          <ArtifactsTab task={task} messages={messages} />
        )}
        {activeTab === "reviews" && (
          <PeerReviewPanel taskId={taskId} projectId={task.projectId} />
        )}
        {activeTab === "approvals" && (
          <ApprovalsTab approvals={approvals} agentMap={agentMap} />
        )}
        {activeTab === "cost" && (
          <CostTab task={task} runs={runs} />
        )}
      </div>

      {/* Comment Box */}
      <div style={{ padding: 20, borderTop: "1px solid #334155" }}>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          style={{
            width: "100%",
            padding: 10,
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
          style={{
            marginTop: 8,
            padding: "8px 16px",
            background: "#3b82f6",
            border: "1px solid #2563eb",
            borderRadius: 6,
            color: "#fff",
            fontSize: "0.875rem",
            cursor: loading || !comment.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Posting..." : "Post comment"}
        </button>
      </div>
      </>
      )}
    </Drawer>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({ 
  task, 
  agentMap,
  onTransition,
  loading,
}: { 
  task: Doc<"tasks">; 
  agentMap: Map<Id<"agents">, Doc<"agents">>;
  onTransition: (status: string) => void;
  loading: boolean;
}) {
  return (
    <>
      {task.description && (
        <Section title="Description">
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.5 }}>{task.description}</p>
        </Section>
      )}

      {task.assigneeIds.length > 0 && (
        <Section title="Assignees">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {task.assigneeIds.map((id: Id<"agents">) => {
              const agent = agentMap.get(id);
              return agent ? (
                <span key={id} style={agentChipStyle}>
                  {agent.emoji || "🤖"} {agent.name}
                </span>
              ) : null;
            })}
          </div>
        </Section>
      )}

      {task.workPlan && (
        <Section title="Work Plan">
          <ul style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1" }}>
            {task.workPlan.bullets.map((bullet: string, i: number) => (
              <li key={i} style={{ marginBottom: 6 }}>{bullet}</li>
            ))}
          </ul>
          {task.workPlan.estimatedCost && (
            <p style={{ marginTop: 12, color: "#94a3b8", fontSize: "0.85rem" }}>
              Estimated: ${task.workPlan.estimatedCost.toFixed(2)}
            </p>
          )}
        </Section>
      )}

      {task.deliverable && (
        <Section title="Deliverable">
          {task.deliverable.summary && (
            <p style={{ margin: "0 0 8px", color: "#cbd5e1" }}>{task.deliverable.summary}</p>
          )}
          {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {task.deliverable.artifactIds.map((id: string) => (
                <span key={id} style={artifactChipStyle}>📎 {id}</span>
              ))}
            </div>
          )}
        </Section>
      )}

      {task.blockedReason && (
        <Section title="Blocked Reason">
          <p style={{ margin: 0, color: "#fca5a5" }}>{task.blockedReason}</p>
        </Section>
      )}

      <Section title="Quick Actions">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {task.status === "INBOX" && (
            <ActionButton onClick={() => onTransition("ASSIGNED")} disabled={loading}>
              Assign
            </ActionButton>
          )}
          {task.status === "REVIEW" && (
            <ActionButton onClick={() => onTransition("DONE")} disabled={loading}>
              Mark Done
            </ActionButton>
          )}
          {task.status === "BLOCKED" && (
            <ActionButton onClick={() => onTransition("IN_PROGRESS")} disabled={loading}>
              Unblock
            </ActionButton>
          )}
        </div>
      </Section>
    </>
  );
}

// ============================================================================
// TIMELINE TAB
// ============================================================================

function TimelineTab({
  transitions,
  messages,
  runs,
  toolCalls,
  approvals,
  agentMap,
}: {
  transitions: Doc<"taskTransitions">[];
  messages: Doc<"messages">[];
  runs: Doc<"runs">[];
  toolCalls: Doc<"toolCalls">[];
  approvals: Doc<"approvals">[];
  agentMap: Map<Id<"agents">, Doc<"agents">>;
}) {
  // Build unified timeline
  const items: Array<{
    type: "transition" | "message" | "run" | "toolCall" | "approval";
    ts: number;
    data: any;
  }> = [];

  for (const t of transitions) {
    items.push({
      type: "transition",
      ts: (t as any)._creationTime,
      data: t,
    });
  }

  for (const m of messages) {
    items.push({
      type: "message",
      ts: (m as any)._creationTime,
      data: m,
    });
  }

  for (const r of runs) {
    items.push({
      type: "run",
      ts: r.startedAt,
      data: r,
    });
  }

  for (const tc of toolCalls) {
    items.push({
      type: "toolCall",
      ts: tc.startedAt,
      data: tc,
    });
  }

  for (const a of approvals) {
    items.push({
      type: "approval",
      ts: (a as any)._creationTime,
      data: a,
    });
  }

  // Sort by timestamp
  items.sort((a, b) => a.ts - b.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item, i) => (
        <TimelineItem key={i} item={item} agentMap={agentMap} />
      ))}
    </div>
  );
}

function TimelineItem({
  item,
  agentMap,
}: {
  item: { type: string; ts: number; data: any };
  agentMap: Map<Id<"agents">, Doc<"agents">>;
}) {
  const time = new Date(item.ts).toLocaleTimeString();

  switch (item.type) {
    case "transition": {
      const t = item.data as Doc<"taskTransitions">;
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            {t.fromStatus} → {t.toStatus}
          </div>
          {t.reason && <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{t.reason}</div>}
        </div>
      );
    }

    case "message": {
      const m = item.data as Doc<"messages">;
      const author = m.authorUserId || (m.authorAgentId ? agentMap.get(m.authorAgentId)?.name : null) || "Unknown";
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            {author} · {m.type}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#cbd5e1", whiteSpace: "pre-wrap" }}>
            {m.content.slice(0, 200)}{m.content.length > 200 ? "..." : ""}
          </div>
        </div>
      );
    }

    case "run": {
      const r = item.data as Doc<"runs">;
      const agent = agentMap.get(r.agentId);
      const duration = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "running";
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            Run by {agent?.name || "Agent"} · {r.status}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            {r.model} · {duration} · ${r.costUsd.toFixed(3)}
          </div>
        </div>
      );
    }

    case "toolCall": {
      const tc = item.data as Doc<"toolCalls">;
      const agent = agentMap.get(tc.agentId);
      const riskColor = tc.riskLevel === "RED" ? "#ef4444" : tc.riskLevel === "YELLOW" ? "#f59e0b" : "#22c55e";
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            {agent?.name || "Agent"} · {tc.toolName}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            <span style={{ color: riskColor }}>●</span> {tc.riskLevel} · {tc.status}
            {tc.inputPreview && ` · ${tc.inputPreview.slice(0, 50)}...`}
          </div>
        </div>
      );
    }

    case "approval": {
      const a = item.data as Doc<"approvals">;
      const agent = agentMap.get(a.requestorAgentId);
      const statusColor = a.status === "APPROVED" ? "#22c55e" : a.status === "DENIED" ? "#ef4444" : "#f59e0b";
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            Approval · <span style={{ color: statusColor }}>{a.status}</span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            {a.actionSummary} · {agent?.name || "Agent"}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

// ============================================================================
// ARTIFACTS TAB
// ============================================================================

function ArtifactsTab({
  task,
  messages,
}: {
  task: Doc<"tasks">;
  messages: Doc<"messages">[];
}) {
  const artifactMessages = messages.filter(m => m.type === "ARTIFACT" || m.artifacts);

  return (
    <>
      {task.deliverable && (
        <Section title="Deliverable">
          {task.deliverable.summary && (
            <p style={{ margin: "0 0 12px", color: "#cbd5e1" }}>{task.deliverable.summary}</p>
          )}
          {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {task.deliverable.artifactIds.map((id: string) => (
                <span key={id} style={artifactChipStyle}>📎 {id}</span>
              ))}
            </div>
          )}
        </Section>
      )}

      {artifactMessages.length > 0 && (
        <Section title="Artifact Messages">
          {artifactMessages.map((m) => (
            <div key={m._id} style={{ marginBottom: 16, padding: 12, background: "#0f172a", borderRadius: 6 }}>
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: 6 }}>
                {new Date((m as any)._creationTime).toLocaleString()}
              </div>
              {m.artifacts && m.artifacts.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {m.artifacts.map((a: any, i: number) => (
                    <span key={i} style={artifactChipStyle}>📎 {a.name}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {!task.deliverable && artifactMessages.length === 0 && (
        <p style={{ color: "#64748b" }}>No artifacts yet</p>
      )}
    </>
  );
}

// ============================================================================
// APPROVALS TAB
// ============================================================================

function ApprovalsTab({
  approvals,
  agentMap,
}: {
  approvals: Doc<"approvals">[];
  agentMap: Map<Id<"agents">, Doc<"agents">>;
}) {
  if (approvals.length === 0) {
    return <p style={{ color: "#64748b" }}>No approvals for this task</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {approvals.map((a) => {
        const agent = agentMap.get(a.requestorAgentId);
        const statusColor = a.status === "APPROVED" ? "#22c55e" : a.status === "DENIED" ? "#ef4444" : "#f59e0b";
        const riskColor = a.riskLevel === "RED" ? "#ef4444" : "#f59e0b";

        return (
          <div key={a._id} style={{ padding: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                {agent?.name || "Agent"} · {a.actionType} · <span style={{ color: riskColor }}>{a.riskLevel}</span>
              </span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: statusColor }}>
                {a.status}
              </span>
            </div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{a.actionSummary}</div>
            {a.justification && (
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: 8 }}>
                {a.justification}
              </div>
            )}
            {a.decisionReason && (
              <div style={{ fontSize: "0.85rem", color: "#cbd5e1", marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155" }}>
                <strong>Decision:</strong> {a.decisionReason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// COST TAB
// ============================================================================

function CostTab({
  task,
  runs,
}: {
  task: Doc<"tasks">;
  runs: Doc<"runs">[];
}) {
  const totalRunCost = runs.reduce((sum, r) => sum + r.costUsd, 0);
  const completedRuns = runs.filter(r => r.status === "COMPLETED");
  const failedRuns = runs.filter(r => r.status === "FAILED");

  return (
    <>
      <Section title="Budget">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {task.budgetAllocated && (
            <Stat label="Allocated" value={`$${task.budgetAllocated.toFixed(2)}`} />
          )}
          <Stat label="Actual Cost" value={`$${task.actualCost.toFixed(2)}`} />
          {task.budgetRemaining !== undefined && (
            <Stat 
              label="Remaining" 
              value={`$${task.budgetRemaining.toFixed(2)}`}
              color={task.budgetRemaining < 0 ? "#ef4444" : undefined}
            />
          )}
        </div>
      </Section>

      <Section title="Runs">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <Stat label="Total Runs" value={runs.length.toString()} />
          <Stat label="Completed" value={completedRuns.length.toString()} />
          <Stat label="Failed" value={failedRuns.length.toString()} />
          <Stat label="Run Cost" value={`$${totalRunCost.toFixed(3)}`} />
        </div>

        {runs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.slice(-10).reverse().map((r) => (
              <div key={r._id} style={{ padding: 10, background: "#0f172a", borderRadius: 6, fontSize: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#94a3b8" }}>{r.model}</span>
                  <span style={{ color: "#cbd5e1", fontWeight: 500 }}>${r.costUsd.toFixed(3)}</span>
                </div>
                <div style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  {r.inputTokens.toLocaleString()} in · {r.outputTokens.toLocaleString()} out
                  {r.durationMs && ` · ${(r.durationMs / 1000).toFixed(1)}s`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 40,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(600px, 90vw)",
          background: "#1e293b",
          borderLeft: "1px solid #334155",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </>
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
      onClick={onClick}
      style={{
        padding: "12px 16px",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        color: active ? "#3b82f6" : "#94a3b8",
        fontSize: "0.875rem",
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: "0.9rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    INBOX: "#6366f1",
    ASSIGNED: "#f59e0b",
    IN_PROGRESS: "#3b82f6",
    REVIEW: "#8b5cf6",
    NEEDS_APPROVAL: "#ef4444",
    BLOCKED: "#f97316",
    DONE: "#22c55e",
    CANCELED: "#6b7280",
  };

  return (
    <span
      style={{
        padding: "4px 10px",
        background: colors[status] || "#6b7280",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 16px",
        background: "#3b82f6",
        border: "1px solid #2563eb",
        borderRadius: 6,
        color: "#fff",
        fontSize: "0.875rem",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Stat({ 
  label, 
  value,
  color,
}: { 
  label: string; 
  value: string;
  color?: string;
}) {
  return (
    <div style={{ padding: "8px 12px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155" }}>
      <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: "1.1rem", color: color || "#e2e8f0" }}>{value}</span>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const tagStyle: React.CSSProperties = {
  padding: "4px 8px",
  background: "#334155",
  borderRadius: 4,
  fontSize: "0.75rem",
  color: "#94a3b8",
};

const agentChipStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 6,
  fontSize: "0.85rem",
  color: "#cbd5e1",
};

const artifactChipStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 4,
  fontSize: "0.8rem",
  color: "#94a3b8",
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#94a3b8",
  fontSize: "2rem",
  cursor: "pointer",
  padding: 0,
  lineHeight: 1,
};

const timelineItemStyle: React.CSSProperties = {
  padding: 12,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 6,
};
