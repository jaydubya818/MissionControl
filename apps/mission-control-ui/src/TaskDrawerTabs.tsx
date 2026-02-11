/**
 * TaskDrawer with Tabs
 * 
 * Enhanced task detail view with Overview, Timeline, Artifacts, Approvals, Cost tabs.
 */

import { useMutation, useQuery } from "convex/react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { PeerReviewPanel } from "./PeerReviewPanel";
import { ExportReportButton } from "./ExportReportButton";
import { TaskEditMode } from "./TaskEditMode";
import { StatusChip } from "./components/StatusChip";
import { PriorityChip } from "./components/PriorityChip";
import { RiskChip } from "./components/RiskChip";

type Tab = "overview" | "timeline" | "artifacts" | "approvals" | "cost" | "reviews" | "why";
type TaskStatus = Doc<"tasks">["status"];

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
  const watchSubscriptions = useQuery(
    api.watchSubscriptions.listByUser,
    taskId ? { userId: "operator", entityType: "TASK" } : "skip"
  );
  const postMessage = useMutation(api.messages.post);
  const transitionTask = useMutation(api.tasks.transition);
  const toggleWatch = useMutation(api.watchSubscriptions.toggle);

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

  const { task, transitions, messages, runs, toolCalls, approvals, activities, taskEvents } = data;
  const agentMap = new Map(agents.map((a: Doc<"agents">) => [a._id, a]));
  const isWatchingTask = !!watchSubscriptions?.some((subscription) => subscription.entityId === taskId);

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

  const handleTransition = async (toStatus: TaskStatus) => {
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
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <StatusChip status={task.status} size="md" />
              <PriorityChip priority={task.priority} size="md" />
              <span style={tagStyle}>{task.type}</span>
              {task.source && (() => {
                const src = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.UNKNOWN;
                return (
                  <span
                    title={task.sourceRef ? `${src.label}: ${task.sourceRef}` : src.label}
                    style={{
                      padding: "4px 8px",
                      background: src.bg,
                      borderRadius: 4,
                      fontSize: "0.75rem",
                      color: src.color,
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: "0.7rem" }}>{src.icon}</span>
                    {src.label}
                  </span>
                );
              })()}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={async () => {
                await toggleWatch({
                  userId: "operator",
                  projectId: task.projectId ?? undefined,
                  entityType: "TASK",
                  entityId: taskId,
                });
              }}
              style={{
                padding: "8px 12px",
                background: isWatchingTask ? "#14532d" : "#334155",
                border: isWatchingTask ? "1px solid #16a34a" : "1px solid #475569",
                borderRadius: "6px",
                color: isWatchingTask ? "#dcfce7" : "#cbd5e1",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {isWatchingTask ? "👁 Watching" : "👁 Watch"}
            </button>
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
        <TabButton active={activeTab === "why"} onClick={() => setActiveTab("why")}>
          Why?
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
            taskEvents={taskEvents}
            transitions={transitions}
            messages={messages}
            runs={runs}
            toolCalls={toolCalls}
            approvals={approvals}
            activities={activities}
            agentMap={agentMap}
          />
        )}
        {activeTab === "artifacts" && (
          <ArtifactsTab task={task} messages={messages} />
        )}
        {activeTab === "reviews" && (
          <PeerReviewPanel taskId={taskId} projectId={task.projectId!} />
        )}
        {activeTab === "approvals" && (
          <ApprovalsTab approvals={approvals} agentMap={agentMap} />
        )}
        {activeTab === "cost" && (
          <CostTab task={task} runs={runs} />
        )}
        {activeTab === "why" && (
          <WhyTab task={task} agentMap={agentMap} transitions={transitions} />
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
  onTransition: (status: TaskStatus) => void;
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

      <Section title="Source">
        <SourceBadge source={task.source} sourceRef={task.sourceRef} createdBy={task.createdBy} />
      </Section>

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
  taskEvents,
  transitions,
  messages,
  runs,
  toolCalls,
  approvals,
  activities,
  agentMap,
}: {
  taskEvents: Doc<"taskEvents">[];
  transitions: Doc<"taskTransitions">[];
  messages: Doc<"messages">[];
  runs: Doc<"runs">[];
  toolCalls: Doc<"toolCalls">[];
  approvals: Doc<"approvals">[];
  activities: Doc<"activities">[];
  agentMap: Map<Id<"agents">, Doc<"agents">>;
}) {
  // Build unified timeline
  const items: Array<{
    type: "taskEvent" | "transition" | "message" | "run" | "toolCall" | "approval" | "activity";
    ts: number;
    data: any;
  }> = [];

  if (taskEvents.length > 0) {
    for (const event of taskEvents) {
      items.push({
        type: "taskEvent",
        ts: event.timestamp,
        data: event,
      });
    }
  } else {
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

    for (const activity of activities) {
      items.push({
        type: "activity",
        ts: (activity as any)._creationTime,
        data: activity,
      });
    }
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

  const formatActorName = (actorType?: string, actorId?: string) => {
    if (actorType === "AGENT" && actorId) {
      const maybeAgent = agentMap.get(actorId as Id<"agents">);
      if (maybeAgent) return maybeAgent.name;
    }
    if (actorType === "HUMAN") return actorId || "Human";
    if (actorType === "SYSTEM") return "System";
    return actorId || "Unknown";
  };

  switch (item.type) {
    case "taskEvent": {
      const event = item.data as Doc<"taskEvents">;
      const actor = formatActorName(event.actorType, event.actorId);
      const eventConfig: Record<string, { icon: string; color: string }> = {
        TASK_CREATED: { icon: "📝", color: "#93c5fd" },
        TASK_TRANSITION: { icon: "🔁", color: "#60a5fa" },
        APPROVAL_REQUESTED: { icon: "🛡️", color: "#f59e0b" },
        APPROVAL_ESCALATED: { icon: "⏫", color: "#f97316" },
        APPROVAL_APPROVED: { icon: "✅", color: "#22c55e" },
        APPROVAL_DENIED: { icon: "⛔", color: "#ef4444" },
        APPROVAL_EXPIRED: { icon: "⌛", color: "#f59e0b" },
        RUN_STARTED: { icon: "▶", color: "#38bdf8" },
        RUN_COMPLETED: { icon: "✔", color: "#22c55e" },
        RUN_FAILED: { icon: "✖", color: "#ef4444" },
        OPERATOR_CONTROL: { icon: "🚨", color: "#f97316" },
        POLICY_DECISION: { icon: "⚖", color: "#a78bfa" },
        TOOL_CALL: { icon: "🧰", color: "#38bdf8" },
      };
      const config = eventConfig[event.eventType] ?? { icon: "•", color: "#94a3b8" };
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 600, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: config.color }}>{config.icon}</span>
            <span>{event.eventType}</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 2 }}>
            Actor: {actor}
          </div>
          {event.beforeState && event.afterState && (
            <div style={{ fontSize: "0.78rem", color: "#cbd5e1", marginTop: 4 }}>
              {JSON.stringify(event.beforeState)} → {JSON.stringify(event.afterState)}
            </div>
          )}
          {event.metadata && (
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>
              {JSON.stringify(event.metadata)}
            </div>
          )}
        </div>
      );
    }

    case "transition": {
      const t = item.data as Doc<"taskTransitions">;
      const actor = formatActorName(t.actorType, t.actorUserId || (t.actorAgentId as unknown as string));
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            {t.fromStatus} → {t.toStatus} · {actor}
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
            {r.model} · {duration} · Δ ${r.costUsd.toFixed(3)}
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

    case "activity": {
      const activity = item.data as Doc<"activities">;
      const actor = formatActorName(activity.actorType, activity.actorId);
      return (
        <div style={timelineItemStyle}>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{time}</div>
          <div style={{ fontWeight: 500 }}>
            Audit · {activity.action} · {actor}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8", whiteSpace: "pre-wrap" }}>
            {activity.description}
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
  return createPortal(
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9990,
        }}
        onClick={onClose}
        aria-hidden="true"
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
          zIndex: 9991,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </>,
    document.body
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
  return <StatusChip status={status} size="sm" />;
}

// ============================================================================
// SOURCE BADGE
// ============================================================================

const SOURCE_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  DASHBOARD: { icon: "🖥️", label: "Dashboard",  color: "#93c5fd", bg: "#1e3a5f", border: "#2563eb" },
  TELEGRAM:  { icon: "✈️", label: "Telegram",   color: "#38bdf8", bg: "#0c4a6e", border: "#0284c7" },
  GITHUB:    { icon: "🐙", label: "GitHub",      color: "#c4b5fd", bg: "#3b1f7e", border: "#7c3aed" },
  AGENT:     { icon: "🤖", label: "Agent",       color: "#86efac", bg: "#14532d", border: "#16a34a" },
  API:       { icon: "🔌", label: "API",         color: "#fcd34d", bg: "#713f12", border: "#ca8a04" },
  TRELLO:    { icon: "📋", label: "Trello",      color: "#93c5fd", bg: "#1e3a5f", border: "#2563eb" },
  SEED:      { icon: "🌱", label: "Seed Data",   color: "#94a3b8", bg: "#334155", border: "#475569" },
  UNKNOWN:   { icon: "❓", label: "Unknown",     color: "#94a3b8", bg: "#334155", border: "#475569" },
};

const CREATED_BY_LABELS: Record<string, string> = {
  HUMAN: "Human",
  AGENT: "AI Agent",
  SYSTEM: "System",
};

function SourceBadge({ 
  source, 
  sourceRef,
  createdBy,
}: { 
  source?: string; 
  sourceRef?: string;
  createdBy?: string;
}) {
  const src = SOURCE_CONFIG[source ?? ""] || SOURCE_CONFIG.UNKNOWN;
  const creatorLabel = CREATED_BY_LABELS[createdBy ?? ""] || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: src.bg,
            border: `1px solid ${src.border}`,
            borderRadius: 6,
            color: src.color,
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          <span>{src.icon}</span>
          {src.label}
        </span>
        {creatorLabel && (
          <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
            by {creatorLabel}
          </span>
        )}
      </div>
      {sourceRef && (
        <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
          Ref: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{sourceRef}</span>
        </div>
      )}
    </div>
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
// WHY TAB (Explainability Panel)
// ============================================================================

function WhyTab({
  task,
  agentMap,
  transitions,
}: {
  task: Doc<"tasks">;
  agentMap: Map<Id<"agents">, Doc<"agents">>;
  transitions: any[];
}) {
  const assignees = task.assigneeIds
    .map((id: Id<"agents">) => agentMap.get(id))
    .filter((agent): agent is Doc<"agents"> => !!agent);
  const allowedTransitions = useQuery(api.tasks.getAllowedTransitionsForHuman);
  const [simulateToStatus, setSimulateToStatus] = useState<TaskStatus | "">("");

  const transitionChoices = (allowedTransitions?.[task.status] as TaskStatus[] | undefined) ?? [];
  useEffect(() => {
    if (!simulateToStatus && transitionChoices.length > 0) {
      setSimulateToStatus(transitionChoices[0]);
    }
  }, [simulateToStatus, transitionChoices]);

  const transitionSimulation = useQuery(
    api.tasks.simulateTransition,
    simulateToStatus
      ? {
          taskId: task._id,
          toStatus: simulateToStatus,
          actorType: "HUMAN",
          hasWorkPlan: !!task.workPlan,
          hasDeliverable: !!task.deliverable,
          hasChecklist: !!task.reviewChecklist,
        }
      : "skip"
  );

  const policyDecision = useQuery(api.policy.explainTaskPolicy, {
    taskId: task._id,
    plannedTransitionTo: simulateToStatus || undefined,
    estimatedCost: task.estimatedCost,
  });

  const riskLevel = policyDecision?.riskLevel ?? "GREEN";
  const riskColors: Record<string, string> = {
    GREEN: "#10b981",
    YELLOW: "#f59e0b",
    RED: "#ef4444",
  };

  const decisionColor: Record<string, string> = {
    ALLOW: "#22c55e",
    NEEDS_APPROVAL: "#f59e0b",
    DENY: "#ef4444",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: 12 }}>
          Policy Decision Viewer
        </h3>
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 6,
                background: riskColors[riskLevel] ?? "#64748b",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.8rem",
              }}
            >
              {riskLevel}
            </span>
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 6,
                background: decisionColor[policyDecision?.decision ?? "ALLOW"] ?? "#334155",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.8rem",
              }}
            >
              {policyDecision?.decision ?? "Analyzing..."}
            </span>
          </div>
          <div style={{ marginTop: 10, color: "#cbd5e1", fontSize: "0.88rem" }}>
            {policyDecision?.reason ?? "Calculating policy outcome..."}
          </div>
          {policyDecision?.triggeredRules && policyDecision.triggeredRules.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: 6 }}>Triggered rules</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {policyDecision.triggeredRules.map((rule: string) => (
                  <span key={rule} style={tagStyle}>
                    {rule}
                  </span>
                ))}
              </div>
            </div>
          )}
          {policyDecision?.requiredApprovals?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: 6 }}>Required approvals</div>
              {policyDecision.requiredApprovals.map((approval: { type: string; reason: string }, index: number) => (
                <div key={`${approval.type}-${index}`} style={{ color: "#cbd5e1", fontSize: "0.83rem", marginBottom: 4 }}>
                  • {approval.type}: {approval.reason}
                </div>
              ))}
            </div>
          ) : null}
          {policyDecision?.remediationHints?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: 6 }}>Remediation hints</div>
              {policyDecision.remediationHints.map((hint: string, index: number) => (
                <div key={`${hint}-${index}`} style={{ color: "#cbd5e1", fontSize: "0.83rem", marginBottom: 4 }}>
                  • {hint}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: 12 }}>
          Dry Run Simulation
        </h3>
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 16,
          }}
        >
          {transitionChoices.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Simulate transition</span>
                <select
                  value={simulateToStatus}
                  onChange={(event) => setSimulateToStatus(event.target.value as TaskStatus)}
                  style={{
                    padding: "6px 10px",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    color: "#e2e8f0",
                    fontSize: "0.82rem",
                  }}
                >
                  {transitionChoices.map((choice: TaskStatus) => (
                    <option key={choice} value={choice}>
                      {task.status} → {choice}
                    </option>
                  ))}
                </select>
              </div>

              {transitionSimulation ? (
                <>
                  <ExplainRow
                    label="Result"
                    value={transitionSimulation.valid ? "VALID" : "INVALID"}
                    detail={transitionSimulation.valid ? "No blocking transition rule" : "One or more checks failed"}
                  />
                  <ExplainRow
                    label="Actor"
                    value={transitionSimulation.actorType}
                    detail="Dry-run evaluates HUMAN actions by default"
                  />
                  {transitionSimulation.requirements && (
                    <ExplainRow
                      label="Requirements"
                      value={[
                        transitionSimulation.requirements.requiresWorkPlan ? "work plan" : null,
                        transitionSimulation.requirements.requiresDeliverable ? "deliverable" : null,
                        transitionSimulation.requirements.requiresChecklist ? "checklist" : null,
                        transitionSimulation.requirements.humanOnly ? "human-only" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "none"}
                    />
                  )}
                  {transitionSimulation.errors?.length ? (
                    <div style={{ marginTop: 8 }}>
                      {transitionSimulation.errors.map((error: { field: string; message: string }) => (
                        <div key={`${error.field}-${error.message}`} style={{ color: "#fca5a5", fontSize: "0.82rem", marginBottom: 4 }}>
                          • {error.field}: {error.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: "#64748b", fontSize: "0.82rem" }}>Running simulation...</div>
              )}
            </>
          ) : (
            <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
              No human transitions available from {task.status}.
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: 12 }}>
          Assignment Context
        </h3>
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 16,
          }}
        >
          {assignees.length ? (
            assignees.map((agent: Doc<"agents">) => (
              <div key={agent._id} style={{ marginBottom: 10 }}>
                <ExplainRow label="Agent" value={`${agent.emoji || "🤖"} ${agent.name}`} />
                <ExplainRow label="Role" value={agent.role} />
                <ExplainRow label="Status" value={agent.status} />
                <ExplainRow
                  label="Capabilities"
                  value={agent.allowedTaskTypes.length ? agent.allowedTaskTypes.join(", ") : "All types"}
                  detail={agent.allowedTaskTypes.includes(task.type) ? "Matches task type" : "No direct type match"}
                />
              </div>
            ))
          ) : (
            <p style={{ color: "#64748b", margin: 0 }}>
              No assignee yet. Assigning an active agent improves policy confidence and simulation accuracy.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: 12 }}>
          Task Properties
        </h3>
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <ExplainRow label="Type" value={task.type} detail="Determines decomposition strategy and agent matching" />
          <ExplainRow label="Priority" value={`P${task.priority}`} detail="Higher priority = higher score for agent selection" />
          <ExplainRow 
            label="Source" 
            value={`${(SOURCE_CONFIG[task.source ?? ""] || SOURCE_CONFIG.UNKNOWN).icon} ${(SOURCE_CONFIG[task.source ?? ""] || SOURCE_CONFIG.UNKNOWN).label}`} 
            detail={task.sourceRef ? `Ref: ${task.sourceRef}` : (task.createdBy ? `Created by: ${CREATED_BY_LABELS[task.createdBy] || task.createdBy}` : "How the task entered the system")}
          />
          <ExplainRow
            label="Created"
            value={new Date(task._creationTime).toLocaleDateString()}
            detail={new Date(task._creationTime).toLocaleString()}
          />
          {task.parentTaskId && (
            <ExplainRow label="Parent Task" value={String(task.parentTaskId)} detail="This is a subtask of a decomposed mission" />
          )}
          {task.labels && task.labels.length > 0 && (
            <ExplainRow label="Labels" value={task.labels.join(", ")} />
          )}
          <ExplainRow
            label="Recent transitions"
            value={String(transitions.length)}
            detail={transitions.length ? "Included in task audit trail" : "No transitions yet"}
          />
        </div>
      </section>
    </div>
  );
}

function ExplainRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ color: "#64748b", fontSize: "0.8rem", width: 100, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: "#e2e8f0", fontSize: "0.85rem", fontWeight: 500 }}>{value}</span>
      {detail && (
        <span style={{ color: "#475569", fontSize: "0.75rem", fontStyle: "italic" }}>
          — {detail}
        </span>
      )}
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
