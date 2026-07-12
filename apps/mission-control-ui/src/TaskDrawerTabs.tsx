/**
 * TaskDrawer with Tabs
 *
 * Enhanced task detail view with Overview, Timeline, Artifacts, Approvals, Cost tabs.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PeerReviewPanel } from "./PeerReviewPanel";
import { ExportReportButton } from "./ExportReportButton";
import { TaskEditMode } from "./TaskEditMode";
import { RiskBadge, StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { VerificationTracePanel } from "./components/tasks/VerificationTracePanel";
import { buildVerificationTrace } from "@/lib/verificationTrace";

type Tab = "overview" | "timeline" | "artifacts" | "approvals" | "cost" | "reviews" | "why";
type TaskStatus = Doc<"tasks">["status"];

/** UI_STYLE_GUIDE task-state → badge tone mapping. */
function taskStatusTone(status: string): StatusBadgeProps["tone"] {
  switch (status) {
    case "DONE":
      return "success";
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

function approvalStatusTone(status: string): StatusBadgeProps["tone"] {
  switch (status) {
    case "APPROVED":
      return "success";
    case "DENIED":
    case "EXPIRED":
      return "error";
    case "PENDING":
    case "ESCALATED":
      return "warning";
    default:
      return "neutral";
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

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
  const updateTask = useMutation(api.tasks.update);
  const toggleWatch = useMutation(api.watchSubscriptions.toggle);

  if (!taskId) return null;

  const isLoading = data === undefined || agents === undefined;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[600px] max-w-[90vw] p-0 flex flex-col bg-surface-1 border-l border-line">
        {isLoading ? (
          <div className="p-6 text-sm text-ink-muted">Loading...</div>
        ) : !data ? (
          <div className="p-6 text-sm text-ink-muted">Task not found</div>
        ) : (() => {
          const { task, transitions, messages, runs, toolCalls, approvals, activities, taskEvents } = data;
          const agentMap = new Map<Id<"agents">, Doc<"agents">>(
            (agents as Doc<"agents">[]).map((a: Doc<"agents">) => [a._id, a])
          );
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
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-line">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <SheetHeader className="space-y-0">
                      {task.identifier && (
                        <span className="text-[11px] font-mono text-ink-muted mb-0.5 block">{task.identifier}</span>
                      )}
                      <SheetTitle className="text-base font-semibold leading-snug">
                        {task.title}
                      </SheetTitle>
                    </SheetHeader>
                    <div className="flex gap-2 mt-2 flex-wrap items-center">
                      <StatusBadge tone={taskStatusTone(task.status)}>
                        {formatStatusLabel(task.status)}
                      </StatusBadge>
                      <StatusBadge tone="neutral">P{task.priority}</StatusBadge>
                      <StatusBadge tone="neutral">{task.type}</StatusBadge>
                      {task.source && (() => {
                        const src = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.UNKNOWN;
                        return (
                          <span
                            className="text-[11.5px] text-ink-muted"
                            title={task.sourceRef ? `${src.label}: ${task.sourceRef}` : src.label}
                          >
                            {src.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Button
                      variant={isWatchingTask ? "default" : "outline"}
                      size="sm"
                      onClick={async () => {
                        await toggleWatch({
                          userId: "operator",
                          projectId: task.projectId ?? undefined,
                          entityType: "TASK",
                          entityId: taskId,
                        });
                      }}
                    >
                      {isWatchingTask ? "Watching" : "Watch"}
                    </Button>
                    {!isEditMode && (
                      <>
                        <Button size="sm" onClick={() => setIsEditMode(true)}>
                          Edit
                        </Button>
                        <ExportReportButton taskId={taskId} />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {isEditMode ? (
                <TaskEditMode
                  task={task}
                  onSave={() => setIsEditMode(false)}
                  onCancel={() => setIsEditMode(false)}
                />
              ) : (
                <>
                  {/* Tabs */}
                  <div className="flex border-b border-line px-5" role="tablist">
                    {(["overview", "timeline", "artifacts", "approvals", "cost", "reviews", "why"] as Tab[]).map((tab) => (
                      <TabButton
                        key={tab}
                        active={activeTab === tab}
                        onClick={() => setActiveTab(tab)}
                      >
                        {tab === "approvals" && approvals.length > 0
                          ? `Approvals (${approvals.length})`
                          : tab === "why"
                            ? "Why?"
                            : tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </TabButton>
                    ))}
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-auto p-5">
                    {activeTab === "overview" && (
                      <OverviewTab
                        taskId={taskId}
                        task={task}
                        runs={runs}
                        approvals={approvals}
                        agents={agents as Doc<"agents">[]}
                        agentMap={agentMap}
                        onTransition={handleTransition}
                        loading={loading}
                        postMessage={postMessage}
                        updateTask={updateTask}
                        setLoading={setLoading}
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
                  <div className="p-5 border-t border-line">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full p-3 bg-surface-1 border border-line rounded-md text-sm text-ink placeholder:text-ink-muted resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={handlePostComment}
                      disabled={loading || !comment.trim()}
                      className="mt-2"
                    >
                      {loading ? "Posting..." : "Post comment"}
                    </Button>
                  </div>
                </>
              )}
            </>
          );
        })()}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({
  taskId,
  task,
  runs,
  approvals,
  agents,
  agentMap,
  onTransition,
  loading,
  postMessage,
  updateTask,
  setLoading,
}: {
  taskId: Id<"tasks">;
  task: Doc<"tasks">;
  runs: Doc<"runs">[];
  approvals: Doc<"approvals">[];
  agents: Doc<"agents">[];
  agentMap: Map<Id<"agents">, Doc<"agents">>;
  onTransition: (status: TaskStatus) => void;
  loading: boolean;
  postMessage: (args: {
    taskId: Id<"tasks">;
    authorType: "HUMAN";
    authorUserId: string;
    type: "COMMENT";
    content: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  updateTask: (args: { taskId: Id<"tasks">; assigneeIds: Id<"agents">[] }) => Promise<unknown>;
  setLoading: (value: boolean) => void;
}) {
  const verificationTrace = buildVerificationTrace(task, runs, approvals);

  return (
    <div className="space-y-6">
      <VerificationTracePanel trace={verificationTrace} />

      {task.description && (
        <Section title="Description">
          <p className="text-sm text-ink-secondary leading-relaxed">{task.description}</p>
        </Section>
      )}

      <Section title="Assignees">
        <div className="flex gap-2 flex-wrap items-center">
          {task.assigneeIds.length > 0 ? (
            task.assigneeIds.map((id: Id<"agents">) => {
              const agent = agentMap.get(id);
              return agent ? (
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

      {task.dueAt != null && (
        <Section title="Due Date">
          <div className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="text-ink">
              {new Date(task.dueAt).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span
              className={cn(
                "text-xs",
                task.dueAt < Date.now()
                  ? "text-err"
                  : task.dueAt < Date.now() + 86400000 * 2
                    ? "text-warn"
                    : "text-ink-muted"
              )}
            >
              {task.dueAt < Date.now()
                ? "Overdue"
                : task.dueAt < Date.now() + 86400000 * 2
                  ? "Due soon"
                  : "Scheduled"}
            </span>
          </div>
        </Section>
      )}

      <Section title="Source">
        <SourceBadge source={task.source} sourceRef={task.sourceRef} createdBy={task.createdBy} />
      </Section>

      {task.planningQa && task.planningQa.length > 0 && (
        <Section title="Planning Q&A">
          <dl className="space-y-2 text-sm">
            {task.planningQa.map((qa: { question: string; answer: string }, i: number) => (
              <div key={i}>
                <dt className="font-medium text-ink">{qa.question}</dt>
                <dd className="text-ink-secondary pl-2 mt-0.5">{qa.answer}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {task.workPlan && (
        <Section title="Work Plan">
          <ul className="list-disc pl-5 text-sm text-ink-secondary space-y-1.5">
            {task.workPlan.bullets.map((bullet: string, i: number) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
          {task.workPlan.estimatedCost && (
            <p className="mt-3 text-xs text-ink-muted">
              Estimated: ${task.workPlan.estimatedCost.toFixed(2)}
            </p>
          )}
        </Section>
      )}

      {task.deliverable && (
        <Section title="Deliverable">
          {task.deliverable.summary && (
            <p className="text-sm text-ink-secondary mb-2">{task.deliverable.summary}</p>
          )}
          {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {task.deliverable.artifactIds.map((id: string) => (
                <StatusBadge key={id} tone="neutral" className="font-mono">{id}</StatusBadge>
              ))}
            </div>
          )}
        </Section>
      )}

      {task.blockedReason && (
        <Section title="Blocked Reason">
          <p className="text-sm text-err">{task.blockedReason}</p>
        </Section>
      )}

      <Section title="Redirect">
        <RedirectForm
          taskId={taskId}
          postMessage={postMessage}
          loading={loading}
          setLoading={setLoading}
        />
      </Section>

      <Section title="Quick Actions">
        <div className="flex gap-2 flex-wrap">
          {task.status === "INBOX" && (
            <Button size="sm" onClick={() => onTransition("ASSIGNED")} disabled={loading}>
              Assign
            </Button>
          )}
          {task.status === "REVIEW" && (
            <Button size="sm" onClick={() => onTransition("DONE")} disabled={loading}>
              Mark Done
            </Button>
          )}
          {task.status === "BLOCKED" && (
            <Button size="sm" onClick={() => onTransition("IN_PROGRESS")} disabled={loading}>
              Unblock
            </Button>
          )}
        </div>
      </Section>
    </div>
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
  agents: Doc<"agents">[];
  updateTask: (args: { taskId: Id<"tasks">; assigneeIds: Id<"agents">[] }) => Promise<unknown>;
  setLoading: (value: boolean) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Id<"agents">[]>(currentAssigneeIds);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSelectedIds(currentAssigneeIds);
  }, [currentAssigneeIds]);

  const toggleAgent = (id: Id<"agents">) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((candidate) => candidate !== id) : [...prev, id]
    );
  };

  const handleReassign = async () => {
    setLoading(true);
    try {
      await updateTask({ taskId, assigneeIds: selectedIds });
      setOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Reassign...
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-[280px] overflow-y-auto">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.map((agent) => (
          <DropdownMenuCheckboxItem
            key={agent._id}
            checked={selectedIds.includes(agent._id)}
            onCheckedChange={() => toggleAgent(agent._id)}
            onSelect={(event) => event.preventDefault()}
          >
            <span>{agent.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setSelectedIds([]);
          }}
        >
          Clear assignees
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleReassign();
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
  postMessage: (args: {
    taskId: Id<"tasks">;
    authorType: "HUMAN";
    authorUserId: string;
    type: "COMMENT";
    content: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  loading: boolean;
  setLoading: (value: boolean) => void;
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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={redirectText}
        onChange={(event) => setRedirectText(event.target.value)}
        placeholder="Instruction for the agent..."
        className="flex-1 min-w-0 px-3 py-2 rounded-md border border-line bg-surface-1 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button size="sm" onClick={handleRedirect} disabled={loading || !redirectText.trim()}>
        Send redirect
      </Button>
    </div>
  );
}

function AgentChip({ agent }: { agent: Doc<"agents"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 rounded-md text-xs text-ink">
      <span>{agent.name}</span>
      <span className="text-ink-muted">{agent.role}</span>
    </span>
  );
}

// ============================================================================
// TIMELINE TAB
// ============================================================================

/** Flat timeline entry: hairline separator + flat dot marker (no boxed cards). */
const TIMELINE_ENTRY_CLASS =
  "relative border-b border-line pb-3 pl-4 last:border-b-0 before:absolute before:left-0 before:top-[7px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-ink-muted";

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
  const items: Array<{
    type: "taskEvent" | "transition" | "message" | "run" | "toolCall" | "approval" | "activity";
    ts: number;
    data: any;
  }> = [];

  if (taskEvents.length > 0) {
    for (const event of taskEvents) {
      items.push({ type: "taskEvent", ts: event.timestamp, data: event });
    }
  } else {
    for (const t of transitions) items.push({ type: "transition", ts: (t as any)._creationTime, data: t });
    for (const m of messages) items.push({ type: "message", ts: (m as any)._creationTime, data: m });
    for (const r of runs) items.push({ type: "run", ts: r.startedAt, data: r });
    for (const tc of toolCalls) items.push({ type: "toolCall", ts: tc.startedAt, data: tc });
    for (const a of approvals) items.push({ type: "approval", ts: (a as any)._creationTime, data: a });
    for (const activity of activities) items.push({ type: "activity", ts: (activity as any)._creationTime, data: activity });
  }

  items.sort((a, b) => a.ts - b.ts);

  return (
    <div className="space-y-3">
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
      return (
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="font-medium text-sm text-ink">
            {formatStatusLabel(event.eventType)}
          </div>
          <div className="text-xs text-ink-muted mt-0.5">Actor: {actor}</div>
          {event.beforeState && event.afterState && (
            <div className="text-xs text-ink-secondary mt-1">
              {JSON.stringify(event.beforeState)} → {JSON.stringify(event.afterState)}
            </div>
          )}
          {event.metadata && (
            <div className="text-xs text-ink-muted mt-1">
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
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="text-sm font-medium text-ink">
            {t.fromStatus} → {t.toStatus} · {actor}
          </div>
          {t.reason && <div className="text-xs text-ink-muted mt-0.5">{t.reason}</div>}
        </div>
      );
    }

    case "message": {
      const m = item.data as Doc<"messages">;
      const author = m.authorUserId || (m.authorAgentId ? agentMap.get(m.authorAgentId)?.name : null) || "Unknown";
      return (
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="text-sm font-medium text-ink">{author} · {m.type}</div>
          <div className="text-xs text-ink-secondary whitespace-pre-wrap mt-0.5">
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
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="text-sm font-medium text-ink">
            Run by {agent?.name || "Agent"} · {r.status}
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            {r.model} · {duration} · Δ ${r.costUsd.toFixed(3)}
          </div>
        </div>
      );
    }

    case "toolCall": {
      const tc = item.data as Doc<"toolCalls">;
      const agent = agentMap.get(tc.agentId);
      return (
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="text-sm font-medium text-ink">
            {agent?.name || "Agent"} · {tc.toolName}
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            <RiskBadge level={tc.riskLevel} /> · {tc.status}
            {tc.inputPreview && ` · ${tc.inputPreview.slice(0, 50)}...`}
          </div>
        </div>
      );
    }

    case "approval": {
      const a = item.data as Doc<"approvals">;
      const agent = agentMap.get(a.requestorAgentId);
      return (
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="text-sm font-medium text-ink">
            Approval · <StatusBadge tone={approvalStatusTone(a.status)}>{formatStatusLabel(a.status)}</StatusBadge>
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            {a.actionSummary} · {agent?.name || "Agent"}
          </div>
        </div>
      );
    }

    case "activity": {
      const activity = item.data as Doc<"activities">;
      const actor = formatActorName(activity.actorType, activity.actorId);
      return (
        <div className={TIMELINE_ENTRY_CLASS}>
          <div className="text-xs text-ink-muted">{time}</div>
          <div className="text-sm font-medium text-ink">
            Audit · {activity.action} · {actor}
          </div>
          <div className="text-xs text-ink-muted whitespace-pre-wrap mt-0.5">
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
    <div className="space-y-6">
      {task.deliverable && (
        <Section title="Deliverable">
          {task.deliverable.summary && (
            <p className="text-sm text-ink-secondary mb-3">{task.deliverable.summary}</p>
          )}
          {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {task.deliverable.artifactIds.map((id: string) => (
                <StatusBadge key={id} tone="neutral" className="font-mono">{id}</StatusBadge>
              ))}
            </div>
          )}
        </Section>
      )}

      {artifactMessages.length > 0 && (
        <Section title="Artifact Messages">
          {artifactMessages.map((m) => (
            <div key={m._id} className="mb-4 p-3 bg-surface-2 border border-line rounded-md">
              <div className="text-xs text-ink-muted mb-1.5">
                {new Date((m as any)._creationTime).toLocaleString()}
              </div>
              {m.artifacts && m.artifacts.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {m.artifacts.map((a: any, i: number) => (
                    <StatusBadge key={i} tone="neutral">{a.name}</StatusBadge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {!task.deliverable && artifactMessages.length === 0 && (
        <p className="text-sm text-ink-muted">No artifacts yet</p>
      )}
    </div>
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
    return <p className="text-sm text-ink-muted">No approvals for this task</p>;
  }

  return (
    <div className="space-y-3">
      {approvals.map((a) => {
        const agent = agentMap.get(a.requestorAgentId);
        return (
          <div key={a._id} className="p-3 bg-surface-2 border border-line rounded-md">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-ink-muted">
                {agent?.name || "Agent"} · {a.actionType} · <RiskBadge level={a.riskLevel} />
              </span>
              <StatusBadge tone={approvalStatusTone(a.status)}>{formatStatusLabel(a.status)}</StatusBadge>
            </div>
            <div className="text-sm font-medium text-ink mb-1.5">{a.actionSummary}</div>
            {a.justification && (
              <div className="text-xs text-ink-muted mb-2">{a.justification}</div>
            )}
            {a.decisionReason && (
              <div className="text-xs text-ink-secondary pt-2 border-t border-line">
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
    <div className="space-y-6">
      <Section title="Budget">
        <div className="flex gap-4 flex-wrap">
          {task.budgetAllocated && (
            <Stat label="Allocated" value={`$${task.budgetAllocated.toFixed(2)}`} />
          )}
          <Stat label="Actual Cost" value={`$${task.actualCost.toFixed(2)}`} />
          {task.budgetRemaining !== undefined && (
            <Stat
              label="Remaining"
              value={`$${task.budgetRemaining.toFixed(2)}`}
              negative={task.budgetRemaining < 0}
            />
          )}
        </div>
      </Section>

      <Section title="Runs">
        <div className="flex gap-4 flex-wrap mb-4">
          <Stat label="Total Runs" value={runs.length.toString()} />
          <Stat label="Completed" value={completedRuns.length.toString()} />
          <Stat label="Failed" value={failedRuns.length.toString()} />
          <Stat label="Run Cost" value={`$${totalRunCost.toFixed(3)}`} />
        </div>

        {runs.length > 0 && (
          <div className="space-y-2">
            {runs.slice(-10).reverse().map((r) => (
              <div key={r._id} className="p-3 bg-surface-2 border border-line rounded-md text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-ink-muted">{r.model}</span>
                  <span className="text-ink font-medium">${r.costUsd.toFixed(3)}</span>
                </div>
                <div className="text-xs text-ink-muted">
                  {r.inputTokens.toLocaleString()} in · {r.outputTokens.toLocaleString()} out
                  {r.durationMs && ` · ${(r.durationMs / 1000).toFixed(1)}s`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
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

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Policy Decision Viewer</h3>
        <div className="p-4 bg-surface-2 border border-line rounded-md">
          <div className="flex items-center gap-2 flex-wrap">
            <RiskBadge level={riskLevel} />
            <StatusBadge
              tone={policyDecision?.decision === "ALLOW" ? "success" : policyDecision?.decision === "DENY" ? "error" : "neutral"}
            >
              {policyDecision?.decision ?? "Analyzing..."}
            </StatusBadge>
          </div>
          <p className="mt-2 text-sm text-ink-secondary">
            {policyDecision?.reason ?? "Calculating policy outcome..."}
          </p>
          {policyDecision?.triggeredRules && policyDecision.triggeredRules.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-ink-muted mb-1.5">Triggered rules</div>
              <div className="flex gap-1.5 flex-wrap">
                {policyDecision.triggeredRules.map((rule: string) => (
                  <StatusBadge key={rule} tone="neutral" className="font-mono">{rule}</StatusBadge>
                ))}
              </div>
            </div>
          )}
          {policyDecision?.requiredApprovals?.length ? (
            <div className="mt-3">
              <div className="text-xs text-ink-muted mb-1.5">Required approvals</div>
              {policyDecision.requiredApprovals.map((approval: { type: string; reason: string }, index: number) => (
                <div key={`${approval.type}-${index}`} className="text-xs text-ink-secondary mb-1">
                  • {approval.type}: {approval.reason}
                </div>
              ))}
            </div>
          ) : null}
          {policyDecision?.remediationHints?.length ? (
            <div className="mt-3">
              <div className="text-xs text-ink-muted mb-1.5">Remediation hints</div>
              {policyDecision.remediationHints.map((hint: string, index: number) => (
                <div key={`${hint}-${index}`} className="text-xs text-ink-secondary mb-1">
                  • {hint}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Dry Run Simulation</h3>
        <div className="p-4 bg-surface-2 border border-line rounded-md">
          {transitionChoices.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-ink-muted">Simulate transition</span>
                <select
                  value={simulateToStatus}
                  onChange={(event) => setSimulateToStatus(event.target.value as TaskStatus)}
                  className="px-2 py-1 bg-surface-1 border border-line rounded-md text-sm text-ink"
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
                    <div className="mt-2">
                      {transitionSimulation.errors.map((error: { field: string; message: string }) => (
                        <div key={`${error.field}-${error.message}`} className="text-xs text-err mb-1">
                          • {error.field}: {error.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-xs text-ink-muted">Running simulation...</div>
              )}
            </>
          ) : (
            <div className="text-xs text-ink-muted">
              No human transitions available from {task.status}.
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Assignment Context</h3>
        <div className="p-4 bg-surface-2 border border-line rounded-md">
          {assignees.length ? (
            assignees.map((agent: Doc<"agents">) => (
              <div key={agent._id} className="mb-2.5">
                <ExplainRow label="Agent" value={agent.name} />
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
            <p className="text-xs text-ink-muted">
              No assignee yet. Assigning an active agent improves policy confidence and simulation accuracy.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Task Properties</h3>
        <div className="p-4 bg-surface-2 border border-line rounded-md space-y-1.5">
          <ExplainRow label="Type" value={task.type} detail="Determines decomposition strategy and agent matching" />
          <ExplainRow label="Priority" value={`P${task.priority}`} detail="Higher priority = higher score for agent selection" />
          <ExplainRow
            label="Source"
            value={(SOURCE_CONFIG[task.source ?? ""] || SOURCE_CONFIG.UNKNOWN).label}
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

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-colors duration-150",
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink-secondary"
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
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
    <div className="flex gap-2 items-baseline">
      <span className="text-xs text-ink-muted w-[100px] shrink-0">{label}</span>
      <span className="text-sm text-ink font-medium">{value}</span>
      {detail && (
        <span className="text-xs text-ink-muted italic">— {detail}</span>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="p-3 bg-surface-2 border border-line rounded-md">
      <span className="text-xs text-ink-muted block">{label}</span>
      <span className={cn("text-lg font-semibold", negative ? "text-err" : "text-ink")}>
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// SOURCE BADGE
// ============================================================================

const SOURCE_CONFIG: Record<string, { label: string }> = {
  DASHBOARD: { label: "Dashboard" },
  TELEGRAM: { label: "Telegram" },
  GITHUB: { label: "GitHub" },
  AGENT: { label: "Agent" },
  API: { label: "API" },
  TRELLO: { label: "Trello" },
  SEED: { label: "Seed Data" },
  MISSION_PROMPT: { label: "Mission" },
  UNKNOWN: { label: "Unknown" },
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <StatusBadge tone="neutral">{src.label}</StatusBadge>
        {creatorLabel && (
          <span className="text-xs text-ink-muted">by {creatorLabel}</span>
        )}
      </div>
      {sourceRef && (
        <div className="text-xs text-ink-muted">
          Ref: <span className="font-mono text-ink-secondary">{sourceRef}</span>
        </div>
      )}
    </div>
  );
}
