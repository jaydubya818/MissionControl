import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";

type FeedFilter = "all" | "tasks" | "comments" | "decisions" | "docs" | "status";
const FEED_PAGE_SIZE = 10;

interface LiveFeedProps {
  projectId: Id<"projects"> | null;
  expanded: boolean;
  onToggle: () => void;
}

export function LiveFeed({ projectId, expanded, onToggle }: LiveFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const activities = useQuery(api.activities.listRecent, projectId ? { projectId, limit: 80 } : { limit: 80 });
  const messages = useQuery(api.messages.listRecent, projectId ? { projectId, limit: 50 } : { limit: 50 });
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const totalCount = (activities?.length ?? 0) + (messages?.length ?? 0);

  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [filter, projectId]);

  if (!expanded) {
    return (
      <aside className="flex flex-col items-center py-3 border-l border-border bg-card w-12 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          className="[writing-mode:vertical-lr] text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-0 flex items-center gap-2"
          aria-label="Expand live activity feed"
          title="Open live feed"
        >
          <span>Feed</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">{totalCount}</Badge>
        </button>
      </aside>
    );
  }

  const agentMap = agents ? new Map(agents.map((a: Doc<"agents">) => [a._id, a])) : new Map();
  const taskMap = tasks ? new Map(tasks.map((t: Doc<"tasks">) => [t._id, t])) : new Map();

  if (activities === undefined || messages === undefined) {
    return (
      <aside className="w-72 border-l border-border bg-card flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold uppercase tracking-wider text-foreground">
          Live Feed
        </div>
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
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
        text: m.type === "COMMENT" ? m.content : `[${m.type}] ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}`,
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
    <aside className="w-72 border-l border-border bg-card flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Live Feed</span>
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Collapse live activity feed"
          title="Collapse live feed"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-2 py-1 rounded-md text-xs transition-colors cursor-pointer border-0",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>

      {/* Agent chips */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border">
        <Badge variant="default" className="text-xs cursor-pointer">All Agents</Badge>
        {agents && (agents as Doc<"agents">[]).slice(0, 8).map((a) => (
          <Badge key={a._id} variant="outline" className="text-xs">
            {a.name} {activities.filter((ac: Doc<"activities"> & { _creationTime: number }) => ac.agentId === a._id).length}
          </Badge>
        ))}
      </div>

      {/* Feed items */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-2">
          {displayed.length === 0 ? (
            <div className="py-4 text-muted-foreground text-sm text-center">No activity yet</div>
          ) : (
            displayed.map((item, i) => (
              <div key={i} className="py-2 border-b border-border last:border-0">
                <div className="text-xs text-foreground">
                  <strong>{item.author}</strong>
                  {item.type === "message" ? " commented" : " · "}
                  {item.taskTitle && (
                    <span className="text-muted-foreground"> on &apos;{item.taskTitle}&apos;</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.text}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">{formatTime(item.ts)}</div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Pagination */}
      {feedItems.length > FEED_PAGE_SIZE && (
        <div className="px-3 py-2 border-t border-border shrink-0">
          {hasMore ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setVisibleCount((current) => Math.min(current + FEED_PAGE_SIZE, feedItems.length))}
            >
              Load {Math.min(FEED_PAGE_SIZE, hiddenCount)} more ({hiddenCount} remaining)
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setVisibleCount(FEED_PAGE_SIZE)}
            >
              Show first {FEED_PAGE_SIZE}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} hours ago`;
  if (diff < 86400_000 * 2) return "1 day ago";
  return new Date(ts).toLocaleDateString();
}
