import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type FeedFilter = "all" | "tasks" | "comments" | "decisions" | "docs" | "status";
const FEED_PAGE_SIZE = 10;

export function LiveFeed({ projectId }: { projectId: Id<"projects"> | null }) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const activities = useQuery(api.activities.listRecent, projectId ? { projectId, limit: 80 } : { limit: 80 });
  const messages = useQuery(api.messages.listRecent, projectId ? { projectId, limit: 50 } : { limit: 50 });
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});

  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [filter, projectId]);

  const agentMap = agents ? new Map(agents.map((a: Doc<"agents">) => [a._id, a])) : new Map();
  const taskMap = tasks ? new Map(tasks.map((t: Doc<"tasks">) => [t._id, t])) : new Map();

  if (activities === undefined || messages === undefined) {
    return (
      <aside className="live-feed">
        <div className="live-feed-header">LIVE FEED</div>
        <div style={{ padding: 24, color: "#64748b" }}>Loading…</div>
      </aside>
    );
  }

  const taskActions = new Set(["TASK_CREATED", "TASK_TRANSITION", "AGENT_REGISTERED"]);
  const statusActions = new Set(["TASK_TRANSITION", "AGENT_PAUSED", "AGENT_STATUS_CHANGED"]);
  const decisionActions = new Set(["APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_DENIED"]);

  const countAll = activities.length + messages.length;
  const countTasks = activities.filter((a) => taskActions.has(a.action)).length;
  const countComments = messages.length;
  const countDecisions = activities.filter((a) => decisionActions.has(a.action)).length;
  const countStatus = activities.filter((a) => statusActions.has(a.action)).length;

  const filters: { key: FeedFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: countAll },
    { key: "tasks", label: "Tasks", count: countTasks },
    { key: "comments", label: "Comments", count: countComments },
    { key: "decisions", label: "Decisions", count: countDecisions },
    { key: "docs", label: "Docs", count: 0 },
    { key: "status", label: "Status", count: countStatus },
  ];

  const feedItems: Array<{
    type: "activity" | "message";
    ts: number;
    author: string;
    text: string;
    taskId?: Id<"tasks">;
    taskTitle?: string;
    action?: string;
  }> = [];

  for (const a of activities) {
    const taskTitle = a.taskId ? taskMap.get(a.taskId)?.title : undefined;
    const author =
      a.actorType === "HUMAN"
        ? (a.actorId ?? "Operator")
        : a.agentId
          ? agentMap.get(a.agentId)?.name ?? "Agent"
          : "System";
    const passes =
      filter === "all" ||
      (filter === "tasks" && taskActions.has(a.action)) ||
      (filter === "status" && statusActions.has(a.action)) ||
      (filter === "decisions" && decisionActions.has(a.action));
    if (passes) {
      feedItems.push({
        type: "activity",
        ts: (a as { _creationTime: number })._creationTime,
        author,
        text: a.description,
        taskId: a.taskId,
        taskTitle,
        action: a.action,
      });
    }
  }
  for (const m of messages) {
    const taskTitle = taskMap.get(m.taskId)?.title;
    const author =
      m.authorUserId ?? (m.authorAgentId ? agentMap.get(m.authorAgentId)?.name : null) ?? "Unknown";
    const passes = filter === "all" || filter === "comments";
    if (passes) {
      feedItems.push({
        type: "message",
        ts: (m as { _creationTime: number })._creationTime,
        author,
        text: m.type === "COMMENT" ? m.content : `[${m.type}] ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`,
        taskId: m.taskId,
        taskTitle,
      });
    }
  }
  feedItems.sort((a, b) => b.ts - a.ts);
  const displayed = feedItems.slice(0, visibleCount);
  const hiddenCount = Math.max(feedItems.length - displayed.length, 0);
  const hasMore = hiddenCount > 0;

  return (
    <aside className="live-feed">
      <div className="live-feed-header">LIVE FEED</div>
      <div className="live-feed-filters">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={"live-feed-filter-btn" + (filter === f.key ? " active" : "")}
            onClick={() => setFilter(f.key)}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>
      <div className="live-feed-agents">
        <button type="button" className="live-feed-all-agents">
          All Agents
        </button>
        {agents && (agents as Doc<"agents">[]).slice(0, 8).map((a) => (
          <span key={a._id} className="live-feed-agent-chip">
            {a.name} {activities.filter((ac: Doc<"activities"> & { _creationTime: number }) => ac.agentId === a._id).length}
          </span>
        ))}
      </div>
      <div className="live-feed-list">
        {displayed.length === 0 ? (
          <div style={{ padding: 16, color: "#64748b", fontSize: "0.85rem" }}>No activity yet</div>
        ) : (
          displayed.map((item, i) => (
            <div key={i} className="live-feed-item">
              <div className="live-feed-item-meta">
                <strong>{item.author}</strong>
                {item.type === "message" ? " commented" : " · "}
                {item.taskTitle && (
                  <span className="live-feed-item-task"> on &apos;{item.taskTitle}&apos;</span>
                )}
              </div>
              <div className="live-feed-item-text">{item.text}</div>
              <div className="live-feed-item-time">{formatTime(item.ts)}</div>
            </div>
          ))
        )}
      </div>
      {feedItems.length > FEED_PAGE_SIZE && (
        <div className="live-feed-pagination">
          {hasMore ? (
            <button
              type="button"
              className="live-feed-load-more"
              onClick={() => setVisibleCount((current) => Math.min(current + FEED_PAGE_SIZE, feedItems.length))}
            >
              Load {Math.min(FEED_PAGE_SIZE, hiddenCount)} more ({hiddenCount} remaining)
            </button>
          ) : (
            <button
              type="button"
              className="live-feed-load-more secondary"
              onClick={() => setVisibleCount(FEED_PAGE_SIZE)}
            >
              Show first {FEED_PAGE_SIZE}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} hours ago`;
  if (diff < 86400_000 * 2) return "1 day ago";
  return d.toLocaleDateString();
}
