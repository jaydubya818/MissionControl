import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
  const updateTask = useMutation(api.tasks.update);

  if (!taskId) return null;

  const isLoading = data === undefined || agents === undefined;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-[480px] max-w-[90vw] flex-col border-l border-line bg-surface-1 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{data?.task.title ?? "Task details"}</SheetTitle>
          <SheetDescription>
            Review task status, activity, comments, assignments, and available actions.
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="p-6 text-sm text-ink-muted">Loading...</div>
        ) : !data ? (
          <div className="p-6 text-sm text-ink-muted">Task not found</div>
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
            updateTask={updateTask}
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
  updateTask,
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
  postMessage: (args: {
    taskId: Id<"tasks">;
    authorType: "HUMAN";
    authorUserId: string;
    type: string;
    content: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  transitionTask: (args: {
    taskId: Id<"tasks">;
    toStatus: TaskStatus;
    actorType: "HUMAN";
    actorUserId: string;
    idempotencyKey: string;
    reason?: string;
  }) => Promise<{ success: boolean; errors?: Array<{ message: string }> }>;
  updateTask: (args: { taskId: Id<"tasks">; assigneeIds: Id<"agents">[] }) => Promise<unknown>;
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

  const timeline = buildTimeline(transitions, messages, agentMap);

  return (
    <>
      {/* Header */}
      <div className="border-b border-line px-5 py-4">
        <h2
          aria-hidden="true"
          className="text-base font-semibold leading-snug text-ink"
        >
          {task.title}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge tone={taskStatusTone(task.status)}>
            {task.status.replace(/_/g, " ")}
          </StatusBadge>
          <StatusBadge tone="neutral">{task.type}</StatusBadge>
          <StatusBadge tone="neutral">P{task.priority}</StatusBadge>
          {task.dueAt != null && (
            <StatusBadge
              tone={
                task.dueAt < Date.now()
                  ? "error"
                  : task.dueAt < Date.now() + 86400000 * 2
                    ? "warning"
                    : "neutral"
              }
            >
              Due {new Date(task.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {task.dueAt < Date.now() ? " (overdue)" : ""}
            </StatusBadge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-6">
        {task.description && (
          <Section title="Description">
            <p className="text-sm leading-relaxed text-ink-secondary">{task.description}</p>
          </Section>
        )}

        <Section title="Assignees">
          <div className="flex gap-2 flex-wrap items-center">
            {task.assigneeIds.length > 0 ? (
              task.assigneeIds.map((id: Id<"agents">) => {
                const agent = agentMap.get(id) || ({} as Agent);
                return agent._id ? (
                  <AgentChip key={id} agent={agent} />
                ) : null;
              })
            ) : (
              <span className="text-sm text-ink-muted">Unassigned</span>
            )}
            <ReassignDropdown
              taskId={taskId}
              currentAssigneeIds={task.assigneeIds}
              agents={agents}
              updateTask={updateTask}
              setLoading={setLoading}
            />
          </div>
        </Section>

        <Section title="Redirect">
          <RedirectForm
            taskId={taskId}
            postMessage={postMessage}
            loading={loading}
            setLoading={setLoading}
          />
        </Section>

        {task.workPlan && (
          <Section title="Work Plan">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-secondary">
              {task.workPlan.bullets.map((b: string, i: number) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {task.workPlan.estimatedCost && (
              <p className="mt-2 text-xs text-ink-muted">
                Est. cost: ${task.workPlan.estimatedCost.toFixed(2)}
              </p>
            )}
          </Section>
        )}

        {task.deliverable && (
          <Section title="Deliverable">
            {task.deliverable.summary && (
              <p className="text-sm text-ink-secondary">{task.deliverable.summary}</p>
            )}
            {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {task.deliverable.artifactIds.map((id: string) => (
                  <StatusBadge key={id} tone="neutral" className="font-mono">
                    <Paperclip className="mr-1 inline h-3 w-3" strokeWidth={1.75} />
                    {id}
                  </StatusBadge>
                ))}
              </div>
            )}
          </Section>
        )}

        {task.blockedReason && (
          <Section title="Blocked">
            <div className="rounded-md border border-line bg-err-soft p-3 text-sm text-err">
              {task.blockedReason}
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
              <p className="text-xs text-ink-muted">No activity yet</p>
            )}
          </div>
        </Section>

        <Section title="Add Comment">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a comment..."
            className="w-full min-h-[80px] resize-y rounded-md border border-line bg-surface-1 p-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
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
      <div className="border-t border-line px-5 py-3 text-xs text-ink-muted">
        Cost: ${task.actualCost.toFixed(2)}
        {task.estimatedCost && ` / $${task.estimatedCost.toFixed(2)}`}
        {" · "}
        Review cycles: {task.reviewCycles}
        {task.completedAt && ` · Completed: ${new Date(task.completedAt).toLocaleDateString()}`}
      </div>
    </>
  );
}

function ReassignDropdown({
  taskId,
  currentAssigneeIds,
  agents,
  updateTask,
  setLoading,
}: {
  taskId: Id<"tasks">;
  currentAssigneeIds: Id<"agents">[];
  agents: Agent[];
  updateTask: (args: { taskId: Id<"tasks">; assigneeIds: Id<"agents">[] }) => Promise<unknown>;
  setLoading: (v: boolean) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Id<"agents">[]>(currentAssigneeIds);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSelectedIds(currentAssigneeIds);
  }, [currentAssigneeIds]);

  const handleReassign = async () => {
    setLoading(true);
    try {
      await updateTask({ taskId, assigneeIds: selectedIds });
      setOpen(false);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleAgent = (id: Id<"agents">) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Reassign…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-[280px] overflow-y-auto">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.map((a) => (
          <DropdownMenuCheckboxItem
            key={a._id}
            checked={selectedIds.includes(a._id)}
            onCheckedChange={() => toggleAgent(a._id)}
            onSelect={(e) => e.preventDefault()}
          >
            <span>{a.emoji ? `${a.emoji} ` : ""}{a.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setSelectedIds([]);
          }}
        >
          Clear assignees
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleReassign();
          }}
        >
          Apply
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RedirectForm({
  taskId,
  postMessage,
  loading,
  setLoading,
}: {
  taskId: Id<"tasks">;
  postMessage: (args: { taskId: Id<"tasks">; authorType: string; authorUserId: string; type: string; content: string; idempotencyKey: string }) => Promise<unknown>;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const [redirectText, setRedirectText] = useState("");

  const handleRedirect = async () => {
    if (!redirectText.trim()) return;
    setLoading(true);
    try {
      await postMessage({
        taskId,
        authorType: "HUMAN",
        authorUserId: "operator",
        type: "COMMENT",
        content: `Redirect: ${redirectText.trim()}`,
        idempotencyKey: `redirect:${taskId}:${Date.now()}`,
      });
      setRedirectText("");
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={redirectText}
        onChange={(e) => setRedirectText(e.target.value)}
        placeholder="Instruction for the agent..."
        className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button size="sm" onClick={handleRedirect} disabled={loading || !redirectText.trim()}>
        Send redirect
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function taskStatusTone(status: TaskStatus): StatusBadgeProps["tone"] {
  switch (status) {
    case "DONE":
      return "success";
    case "READY":
    case "IN_PROGRESS":
    case "REVIEW":
      return "info";
    case "NEEDS_APPROVAL":
    case "BLOCKED":
      return "warning";
    case "FAILED":
      return "error";
    default:
      return "neutral";
  }
}

function AgentChip({ agent }: { agent: Agent }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink">
      {agent.emoji ? <span aria-hidden>{agent.emoji}</span> : null}
      <span>{agent.name}</span>
      <span className="text-ink-muted">{agent.role}</span>
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
            "h-2.5 w-2.5 shrink-0 rounded-full",
            isTransition ? "bg-info-accent" : "bg-ink-muted",
          )}
        />
        {!isLast && <div className="mt-1 w-0.5 flex-1 bg-surface-2" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-xs text-ink-muted">
          <strong className="text-ink">{item.actor}</strong>
          {" · "}
          {new Date(item.timestamp).toLocaleString()}
          {item.details && <span className="ml-2 text-ink-muted/80">{item.details}</span>}
        </div>
        <div className="whitespace-pre-wrap text-sm text-ink-secondary">
          {isTransition ? `Status changed: ${item.content}` : item.content}
        </div>
      </div>
    </div>
  );
}

function getAvailableTransitions(currentStatus: TaskStatus): TaskStatus[] {
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    INBOX: ["READY", "CANCELED"],
    READY: ["IN_PROGRESS", "INBOX", "BLOCKED", "CANCELED"],
    ASSIGNED: ["READY", "IN_PROGRESS", "INBOX", "CANCELED"],
    IN_PROGRESS: ["REVIEW", "BLOCKED", "FAILED", "CANCELED"],
    REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED", "CANCELED"],
    NEEDS_APPROVAL: ["INBOX", "READY", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE", "CANCELED"],
    BLOCKED: ["READY", "IN_PROGRESS", "NEEDS_APPROVAL", "CANCELED"],
    FAILED: ["INBOX", "READY", "CANCELED"],
    DONE: [],
    CANCELED: [],
  };
  return transitions[currentStatus];
}
