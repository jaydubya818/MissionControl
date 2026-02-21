import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Transition = Doc<"taskTransitions">;
type Message = Doc<"messages">;
type Agent = Doc<"agents">;
type TaskStatus = Doc<"tasks">["status"];

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

  const isLoading = data === undefined || agents === undefined;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[480px] max-w-[90vw] p-0 flex flex-col">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : !data ? (
          <div className="p-6 text-sm text-muted-foreground">Task not found</div>
        ) : (
          <TaskDrawerContent
            task={data.task}
            transitions={data.transitions}
            messages={data.messages}
            agents={agents as Agent[]}
            comment={comment}
            setComment={setComment}
            loading={loading}
            setLoading={setLoading}
            postMessage={postMessage}
            transitionTask={transitionTask}
            taskId={taskId}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDrawerContent({
  task,
  transitions,
  messages,
  agents,
  comment,
  setComment,
  loading,
  setLoading,
  postMessage,
  transitionTask,
  taskId,
  onClose,
}: {
  task: Doc<"tasks">;
  transitions: Transition[];
  messages: Message[];
  agents: Agent[];
  comment: string;
  setComment: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  postMessage: any;
  transitionTask: any;
  taskId: Id<"tasks">;
  onClose: () => void;
}) {
  const agentMap = new Map<Id<"agents">, Agent>(
    agents.map((a) => [a._id, a])
  );

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

  const handleTransition = async (toStatus: TaskStatus) => {
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

  const timeline = buildTimeline(transitions, messages, agentMap);

  return (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <SheetHeader className="space-y-0">
          <SheetTitle className="text-base font-semibold leading-snug">
            {task.title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex gap-2 mt-2 flex-wrap">
          <StatusBadge status={task.status} />
          <Badge variant="outline" className="text-xs">{task.type}</Badge>
          <Badge variant="outline" className="text-xs">P{task.priority}</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-6">
        {task.description && (
          <Section title="Description">
            <p className="text-sm text-foreground/80 leading-relaxed">{task.description}</p>
          </Section>
        )}

        {task.assigneeIds.length > 0 && (
          <Section title="Assignees">
            <div className="flex gap-2 flex-wrap">
              {task.assigneeIds.map((id: Id<"agents">) => {
                const agent = agentMap.get(id) || ({} as Agent);
                return agent._id ? (
                  <AgentChip key={id} agent={agent} />
                ) : null;
              })}
            </div>
          </Section>
        )}

        {task.workPlan && (
          <Section title="Work Plan">
            <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1">
              {task.workPlan.bullets.map((b: string, i: number) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {task.workPlan.estimatedCost && (
              <p className="mt-2 text-xs text-muted-foreground">
                Est. cost: ${task.workPlan.estimatedCost.toFixed(2)}
              </p>
            )}
          </Section>
        )}

        {task.deliverable && (
          <Section title="Deliverable">
            {task.deliverable.summary && (
              <p className="text-sm text-foreground/80">{task.deliverable.summary}</p>
            )}
            {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {task.deliverable.artifactIds.map((id: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs gap-1">
                    📎 {id}
                  </Badge>
                ))}
              </div>
            )}
          </Section>
        )}

        {task.blockedReason && (
          <Section title="Blocked">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              ⚠️ {task.blockedReason}
            </div>
          </Section>
        )}

        <Section title="Actions">
          <div className="flex gap-2 flex-wrap">
            {getAvailableTransitions(task.status).map((toStatus: TaskStatus) => (
              <Button
                key={toStatus}
                variant="outline"
                size="sm"
                onClick={() => handleTransition(toStatus)}
                disabled={loading}
              >
                → {toStatus.replace("_", " ")}
              </Button>
            ))}
          </div>
        </Section>

        <Section title="Timeline">
          <div className="relative">
            {timeline.map((item, i) => (
              <TimelineItem key={i} item={item} isLast={i === timeline.length - 1} />
            ))}
            {timeline.length === 0 && (
              <p className="text-xs text-muted-foreground">No activity yet</p>
            )}
          </div>
        </Section>

        <Section title="Add Comment">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a comment..."
            className="w-full min-h-[80px] p-3 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="sm"
            onClick={handlePostComment}
            disabled={loading || !comment.trim()}
            className="mt-2"
          >
            {loading ? "Posting..." : "Post Comment"}
          </Button>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
        Cost: ${task.actualCost.toFixed(2)}
        {task.estimatedCost && ` / $${task.estimatedCost.toFixed(2)}`}
        {" · "}
        Review cycles: {task.reviewCycles}
        {task.completedAt && ` · Completed: ${new Date(task.completedAt).toLocaleDateString()}`}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INBOX: "secondary",
  ASSIGNED: "outline",
  IN_PROGRESS: "default",
  REVIEW: "outline",
  NEEDS_APPROVAL: "destructive",
  BLOCKED: "destructive",
  DONE: "default",
  CANCELED: "secondary",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] || "secondary"} className="text-xs">
      {status.replace("_", " ")}
    </Badge>
  );
}

function AgentChip({ agent }: { agent: Agent }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-full text-xs text-foreground">
      <span>{agent.emoji || "🤖"}</span>
      <span>{agent.name}</span>
      <span className="text-muted-foreground">{agent.role}</span>
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
    <div className={cn("flex gap-3", !isLast && "mb-4")}>
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0",
            isTransition ? "bg-primary" : "bg-emerald-500"
          )}
        />
        {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">
          <strong className="text-foreground">{item.actor}</strong>
          {" · "}
          {new Date(item.timestamp).toLocaleString()}
          {item.details && <span className="ml-2 text-muted-foreground/60">{item.details}</span>}
        </div>
        <div className="text-sm text-foreground/80 whitespace-pre-wrap">
          {isTransition ? `Status changed: ${item.content}` : item.content}
        </div>
      </div>
    </div>
  );
}

function getAvailableTransitions(currentStatus: TaskStatus): TaskStatus[] {
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    INBOX: ["ASSIGNED", "CANCELED"],
    ASSIGNED: ["IN_PROGRESS", "INBOX", "CANCELED"],
    IN_PROGRESS: ["REVIEW", "BLOCKED", "FAILED", "CANCELED"],
    REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED", "CANCELED"],
    NEEDS_APPROVAL: ["INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE", "CANCELED"],
    BLOCKED: ["ASSIGNED", "IN_PROGRESS", "NEEDS_APPROVAL", "CANCELED"],
    FAILED: ["INBOX", "ASSIGNED", "CANCELED"],
    DONE: [],
    CANCELED: [],
  };
  return transitions[currentStatus];
}
