/**
 * TaskDrawer with Tabs
 *
 * Enhanced task detail view with Overview, Timeline, Artifacts, Approvals, Cost tabs.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useEffect, useState } from "react";
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

  const isLoading = data === undefined || agents === undefined;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[600px] max-w-[90vw] p-0 flex flex-col">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : !data ? (
          <div className="p-6 text-sm text-muted-foreground">Task not found</div>
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
              <div className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <SheetHeader className="space-y-0">
                      <SheetTitle className="text-base font-semibold leading-snug">
                        {task.title}
                      </SheetTitle>
                    </SheetHeader>
                    <div className="flex gap-2 mt-2 flex-wrap items-center">
                      <StatusChip status={task.status} size="md" />
                      <PriorityChip priority={task.priority} size="md" />
                      <Badge variant="outline" className="text-xs">{task.type}</Badge>
                      {task.source && (() => {
                        const src = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.UNKNOWN;
                        return (
                          <Badge
                            variant="secondary"
                            className="text-xs gap-1"
                            title={task.sourceRef ? `${src.label}: ${task.sourceRef}` : src.label}
                          >
                            <span className="text-[10px]">{src.icon}</span>
                            {src.label}
                          </Badge>
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
                      👁 {isWatchingTask ? "Watching" : "Watch"}
                    </Button>
                    {!isEditMode && (
                      <>
                        <Button size="sm" onClick={() => setIsEditMode(true)}>
                          ✏️ Edit
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
                  <div className="flex border-b border-border px-5" role="tablist">
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
                  <div className="p-5 border-t border-border">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full p-3 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring"
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
    <div className="space-y-6">
      {task.description && (
        <Section title="Description">
          <p className="text-sm text-foreground/80 leading-relaxed">{task.description}</p>
        </Section>
      )}

      {task.assigneeIds.length > 0 && (
        <Section title="Assignees">
          <div className="flex gap-2 flex-wrap">
            {task.assigneeIds.map((id: Id<"agents">) => {
              const agent = agentMap.get(id);
              return agent ? (
                <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-md text-xs text-foreground">
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
          <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1.5">
            {task.workPlan.bullets.map((bullet: string, i: number) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
          {task.workPlan.estimatedCost && (
            <p className="mt-3 text-xs text-muted-foreground">
              Estimated: ${task.workPlan.estimatedCost.toFixed(2)}
            </p>
          )}
        </Section>
      )}

      {task.deliverable && (
        <Section title="Deliverable">
          {task.deliverable.summary && (
            <p className="text-sm text-foreground/80 mb-2">{task.deliverable.summary}</p>
          )}
          {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {task.deliverable.artifactIds.map((id: string) => (
                <Badge key={id} variant="secondary" className="text-xs">📎 {id}</Badge>
              ))}
            </div>
          )}
        </Section>
      )}

      {task.blockedReason && (
        <Section title="Blocked Reason">
          <p className="text-sm text-destructive">{task.blockedReason}</p>
        </Section>
      )}

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
      const eventConfig: Record<string, { icon: string }> = {
        TASK_CREATED: { icon: "📝" },
        TASK_TRANSITION: { icon: "🔁" },
        APPROVAL_REQUESTED: { icon: "🛡️" },
        APPROVAL_ESCALATED: { icon: "⏫" },
        APPROVAL_APPROVED: { icon: "✅" },
        APPROVAL_DENIED: { icon: "⛔" },
        APPROVAL_EXPIRED: { icon: "⌛" },
        RUN_STARTED: { icon: "▶" },
        RUN_COMPLETED: { icon: "✔" },
        RUN_FAILED: { icon: "✖" },
        OPERATOR_CONTROL: { icon: "🚨" },
        POLICY_DECISION: { icon: "⚖" },
        TOOL_CALL: { icon: "🧰" },
      };
      const config = eventConfig[event.eventType] ?? { icon: "•" };
      return (
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="font-medium text-sm text-foreground flex items-center gap-1.5">
            <span>{config.icon}</span>
            <span>{event.eventType}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Actor: {actor}</div>
          {event.beforeState && event.afterState && (
            <div className="text-xs text-foreground/70 mt-1">
              {JSON.stringify(event.beforeState)} → {JSON.stringify(event.afterState)}
            </div>
          )}
          {event.metadata && (
            <div className="text-xs text-muted-foreground mt-1">
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
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="text-sm font-medium text-foreground">
            {t.fromStatus} → {t.toStatus} · {actor}
          </div>
          {t.reason && <div className="text-xs text-muted-foreground mt-0.5">{t.reason}</div>}
        </div>
      );
    }

    case "message": {
      const m = item.data as Doc<"messages">;
      const author = m.authorUserId || (m.authorAgentId ? agentMap.get(m.authorAgentId)?.name : null) || "Unknown";
      return (
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="text-sm font-medium text-foreground">{author} · {m.type}</div>
          <div className="text-xs text-foreground/70 whitespace-pre-wrap mt-0.5">
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
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="text-sm font-medium text-foreground">
            Run by {agent?.name || "Agent"} · {r.status}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {r.model} · {duration} · Δ ${r.costUsd.toFixed(3)}
          </div>
        </div>
      );
    }

    case "toolCall": {
      const tc = item.data as Doc<"toolCalls">;
      const agent = agentMap.get(tc.agentId);
      return (
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="text-sm font-medium text-foreground">
            {agent?.name || "Agent"} · {tc.toolName}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <RiskChip level={tc.riskLevel} /> · {tc.status}
            {tc.inputPreview && ` · ${tc.inputPreview.slice(0, 50)}...`}
          </div>
        </div>
      );
    }

    case "approval": {
      const a = item.data as Doc<"approvals">;
      const agent = agentMap.get(a.requestorAgentId);
      return (
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="text-sm font-medium text-foreground">
            Approval · <StatusChip status={a.status} size="sm" />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {a.actionSummary} · {agent?.name || "Agent"}
          </div>
        </div>
      );
    }

    case "activity": {
      const activity = item.data as Doc<"activities">;
      const actor = formatActorName(activity.actorType, activity.actorId);
      return (
        <div className="p-3 bg-muted/50 border border-border rounded-md">
          <div className="text-xs text-muted-foreground">{time}</div>
          <div className="text-sm font-medium text-foreground">
            Audit · {activity.action} · {actor}
          </div>
          <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">
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
            <p className="text-sm text-foreground/80 mb-3">{task.deliverable.summary}</p>
          )}
          {task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {task.deliverable.artifactIds.map((id: string) => (
                <Badge key={id} variant="secondary" className="text-xs">📎 {id}</Badge>
              ))}
            </div>
          )}
        </Section>
      )}

      {artifactMessages.length > 0 && (
        <Section title="Artifact Messages">
          {artifactMessages.map((m) => (
            <div key={m._id} className="mb-4 p-3 bg-muted/50 border border-border rounded-md">
              <div className="text-xs text-muted-foreground mb-1.5">
                {new Date((m as any)._creationTime).toLocaleString()}
              </div>
              {m.artifacts && m.artifacts.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {m.artifacts.map((a: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">📎 {a.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {!task.deliverable && artifactMessages.length === 0 && (
        <p className="text-sm text-muted-foreground">No artifacts yet</p>
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
    return <p className="text-sm text-muted-foreground">No approvals for this task</p>;
  }

  return (
    <div className="space-y-3">
      {approvals.map((a) => {
        const agent = agentMap.get(a.requestorAgentId);
        return (
          <div key={a._id} className="p-3 bg-muted/50 border border-border rounded-md">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                {agent?.name || "Agent"} · {a.actionType} · <RiskChip level={a.riskLevel} />
              </span>
              <StatusChip status={a.status} size="sm" />
            </div>
            <div className="text-sm font-medium text-foreground mb-1.5">{a.actionSummary}</div>
            {a.justification && (
              <div className="text-xs text-muted-foreground mb-2">{a.justification}</div>
            )}
            {a.decisionReason && (
              <div className="text-xs text-foreground/70 pt-2 border-t border-border">
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
              <div key={r._id} className="p-3 bg-muted/50 border border-border rounded-md text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">{r.model}</span>
                  <span className="text-foreground font-medium">${r.costUsd.toFixed(3)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
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
        <h3 className="text-sm font-semibold text-foreground mb-3">Policy Decision Viewer</h3>
        <div className="p-4 bg-muted/50 border border-border rounded-md">
          <div className="flex items-center gap-2 flex-wrap">
            <RiskChip level={riskLevel} />
            <Badge
              variant={policyDecision?.decision === "ALLOW" ? "default" : policyDecision?.decision === "DENY" ? "destructive" : "secondary"}
              className="text-xs"
            >
              {policyDecision?.decision ?? "Analyzing..."}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-foreground/80">
            {policyDecision?.reason ?? "Calculating policy outcome..."}
          </p>
          {policyDecision?.triggeredRules && policyDecision.triggeredRules.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1.5">Triggered rules</div>
              <div className="flex gap-1.5 flex-wrap">
                {policyDecision.triggeredRules.map((rule: string) => (
                  <Badge key={rule} variant="outline" className="text-xs">{rule}</Badge>
                ))}
              </div>
            </div>
          )}
          {policyDecision?.requiredApprovals?.length ? (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1.5">Required approvals</div>
              {policyDecision.requiredApprovals.map((approval: { type: string; reason: string }, index: number) => (
                <div key={`${approval.type}-${index}`} className="text-xs text-foreground/70 mb-1">
                  • {approval.type}: {approval.reason}
                </div>
              ))}
            </div>
          ) : null}
          {policyDecision?.remediationHints?.length ? (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1.5">Remediation hints</div>
              {policyDecision.remediationHints.map((hint: string, index: number) => (
                <div key={`${hint}-${index}`} className="text-xs text-foreground/70 mb-1">
                  • {hint}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">Dry Run Simulation</h3>
        <div className="p-4 bg-muted/50 border border-border rounded-md">
          {transitionChoices.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Simulate transition</span>
                <select
                  value={simulateToStatus}
                  onChange={(event) => setSimulateToStatus(event.target.value as TaskStatus)}
                  className="px-2 py-1 bg-background border border-border rounded-md text-sm text-foreground"
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
                        <div key={`${error.field}-${error.message}`} className="text-xs text-destructive mb-1">
                          • {error.field}: {error.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Running simulation...</div>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              No human transitions available from {task.status}.
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">Assignment Context</h3>
        <div className="p-4 bg-muted/50 border border-border rounded-md">
          {assignees.length ? (
            assignees.map((agent: Doc<"agents">) => (
              <div key={agent._id} className="mb-2.5">
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
            <p className="text-xs text-muted-foreground">
              No assignee yet. Assigning an active agent improves policy confidence and simulation accuracy.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">Task Properties</h3>
        <div className="p-4 bg-muted/50 border border-border rounded-md space-y-1.5">
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
        "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
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
      <span className="text-xs text-muted-foreground w-[100px] shrink-0">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
      {detail && (
        <span className="text-xs text-muted-foreground/60 italic">— {detail}</span>
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
    <div className="p-3 bg-muted/50 border border-border rounded-md">
      <span className="text-xs text-muted-foreground block">{label}</span>
      <span className={cn("text-lg font-semibold", negative ? "text-destructive" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// SOURCE BADGE
// ============================================================================

const SOURCE_CONFIG: Record<string, { icon: string; label: string }> = {
  DASHBOARD: { icon: "🖥️", label: "Dashboard" },
  TELEGRAM:  { icon: "✈️", label: "Telegram" },
  GITHUB:    { icon: "🐙", label: "GitHub" },
  AGENT:     { icon: "🤖", label: "Agent" },
  API:       { icon: "🔌", label: "API" },
  TRELLO:    { icon: "📋", label: "Trello" },
  SEED:      { icon: "🌱", label: "Seed Data" },
  MISSION_PROMPT: { icon: "🎯", label: "Mission" },
  UNKNOWN:   { icon: "❓", label: "Unknown" },
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
        <Badge variant="secondary" className="text-xs gap-1.5">
          <span>{src.icon}</span>
          {src.label}
        </Badge>
        {creatorLabel && (
          <span className="text-xs text-muted-foreground">by {creatorLabel}</span>
        )}
      </div>
      {sourceRef && (
        <div className="text-xs text-muted-foreground">
          Ref: <span className="font-mono text-foreground/70">{sourceRef}</span>
        </div>
      )}
    </div>
  );
}
