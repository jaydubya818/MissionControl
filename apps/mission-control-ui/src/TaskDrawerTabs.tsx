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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PeerReviewPanel } from "./PeerReviewPanel";
import { ExportReportButton } from "./ExportReportButton";
import { TaskEditMode } from "./TaskEditMode";
import { RiskBadge, StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { VerificationTracePanel } from "./components/tasks/VerificationTracePanel";
import { buildVerificationTrace } from "@/lib/verificationTrace";
import { useToast } from "./Toast";

type Tab = "overview" | "timeline" | "artifacts" | "approvals" | "cost" | "reviews" | "why";
type TaskStatus = Doc<"tasks">["status"];
type TransitionOptions = {
  reason?: string;
  reviewFindings?: string[];
  blocker?: {
    type: "TASK" | "EXTERNAL" | "POLICY" | "APPROVAL" | "CAPACITY" | "UNKNOWN";
    reason: string;
    ownerRef?: string;
    requiredAction?: string;
  };
  blockerResolution?: {
    resolution: "RESOLVED" | "WAIVED" | "REPLACED";
    reason: string;
  };
};
type ParentDelivery = {
  governanceStatus: "UNGOVERNED" | "GOVERNED" | "LEGACY";
  workOrderId: Id<"workOrders"> | null;
  workOrderTitle: string | null;
  workOrderState: string | null;
  workflowId: string | null;
  repository: string | null;
  repositoryId: Id<"workspaceRepositories"> | null;
  codeScopeIds: Id<"repositoryCodeScopes">[];
  executionEnvironment: "LOCAL" | "CLOUD" | "REMOTE" | "POLICY_SELECTED" | null;
  riskLevel: string | null;
  missionId: Id<"missions"> | null;
  missionTitle: string | null;
  relationshipValid: boolean;
};

/** UI_STYLE_GUIDE task-state → badge tone mapping. */
function taskStatusTone(status: string): StatusBadgeProps["tone"] {
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
  onNavigateToWorkOrder,
  onNavigateToMission,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
  onNavigateToWorkOrder?: (workOrderId: Id<"workOrders">) => void;
  onNavigateToMission?: (missionId: Id<"missions">) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isEditMode, setIsEditMode] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const data = useQuery(api.tasks.getWithTimeline, taskId ? { taskId } : "skip");
  const agents = useQuery(
    api.agents.listAll,
    data?.task.projectId ? { projectId: data.task.projectId } : {}
  );
  const watchSubscriptions = useQuery(
    api.watchSubscriptions.listByUser,
    taskId ? { userId: "operator", entityType: "TASK" } : "skip"
  );
  const postMessage = useMutation(api.messages.post);
  const transitionTask = useMutation(api.tasks.transition);
  const updateTask = useMutation(api.tasks.update);
  const assignTask = useMutation(api.tasks.assign);
  const toggleWatch = useMutation(api.watchSubscriptions.toggle);
  const requestApproval = useMutation(api.approvals.request);
  const { toast } = useToast();

  if (!taskId) return null;

  const isLoading = data === undefined || agents === undefined;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[600px] max-w-[90vw] p-0 flex flex-col bg-surface-1 border-l border-line">
        <SheetHeader className="sr-only">
          <SheetTitle>{data?.task.title ?? "Task details"}</SheetTitle>
          <SheetDescription>
            Review task status, evidence, approvals, activity, and available actions.
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="p-6 text-sm text-ink-muted">Loading...</div>
        ) : !data ? (
          <div className="p-6 text-sm text-ink-muted">Task not found</div>
        ) : (() => {
          const {
            task,
            transitions,
            messages,
            runs,
            toolCalls,
            approvals,
            activities,
            taskEvents,
            workflowAttempts,
          } = data;
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

          const handleTransition = async (
            toStatus: TaskStatus,
            options: TransitionOptions = {}
          ): Promise<boolean> => {
            setLoading(true);
            try {
              const result = await transitionTask({
                taskId,
                toStatus,
                actorType: "HUMAN",
                actorUserId: "operator",
                idempotencyKey: `transition:${taskId}:${toStatus}:${Date.now()}`,
                reason: options.reason ?? "Manual transition from UI",
                reviewFindings: options.reviewFindings,
                blocker: options.blocker,
                blockerResolution: options.blockerResolution,
              });
              if (!result.success && result.errors) {
                toast(result.errors.map((e: any) => e.message).join("\n"), true);
                return false;
              }
              toast(`Task moved to ${formatStatusLabel(toStatus)}`);
              return true;
            } catch (e) {
              toast(e instanceof Error ? e.message : "Transition failed", true);
              return false;
            } finally {
              setLoading(false);
            }
          };

          return (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-line">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="space-y-0">
                      {task.identifier && (
                        <span className="text-[11px] font-mono text-ink-muted mb-0.5 block">{task.identifier}</span>
                      )}
                      <h2
                        aria-hidden="true"
                        className="text-base font-semibold leading-snug"
                      >
                        {task.title}
                      </h2>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap items-center">
                      <StatusBadge tone={taskStatusTone(task.status)}>
                        {task.status === "ASSIGNED" ? "READY" : formatStatusLabel(task.status)}
                      </StatusBadge>
                      {task.status === "ASSIGNED" ? (
                        <StatusBadge tone="neutral">Legacy state</StatusBadge>
                      ) : null}
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
                  <div
                    aria-label="Task detail content"
                    className="flex-1 overflow-auto p-5"
                    tabIndex={0}
                  >
                    {activeTab === "overview" && (
                      <OverviewTab
                        taskId={taskId}
                        task={task}
                        parentDelivery={task.parentDelivery}
                        workflowAttempts={workflowAttempts}
                        runs={runs}
                        approvals={approvals}
                        agents={agents as Doc<"agents">[]}
                        agentMap={agentMap}
                        onTransition={handleTransition}
                        loading={loading}
                        postMessage={postMessage}
                        assignTask={assignTask}
                        requestApproval={requestApproval}
                        setLoading={setLoading}
                        onNavigateToWorkOrder={onNavigateToWorkOrder}
                        onNavigateToMission={onNavigateToMission}
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

function ParentDeliverySection({
  taskId,
  projectId,
  parentDelivery,
  onNavigateToWorkOrder,
  onNavigateToMission,
}: {
  taskId: Id<"tasks">;
  projectId?: Id<"projects">;
  parentDelivery: ParentDelivery;
  onNavigateToWorkOrder?: (workOrderId: Id<"workOrders">) => void;
  onNavigateToMission?: (missionId: Id<"missions">) => void;
}) {
  const workOrders = useQuery(
    api.workOrders.list,
    projectId ? { projectId, limit: 200 } : "skip"
  );
  const linkToWorkOrder = useMutation(api.tasks.linkToWorkOrder);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [linking, setLinking] = useState(false);
  const { toast } = useToast();

  const handleLink = async () => {
    if (!projectId || !selectedWorkOrderId) return;
    setLinking(true);
    try {
      await linkToWorkOrder({
        taskId,
        projectId,
        workOrderId: selectedWorkOrderId as Id<"workOrders">,
        actorType: "HUMAN",
        actorId: "operator",
        idempotencyKey: `ui-link:${taskId}:${selectedWorkOrderId}`,
      });
      toast("Task linked to Work Order");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to link Task", true);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Section title="Parent Delivery">
      <div className="rounded-lg border border-line bg-surface-2 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              parentDelivery.governanceStatus === "GOVERNED"
                ? "success"
                : parentDelivery.governanceStatus === "UNGOVERNED"
                  ? "warning"
                  : "neutral"
            }
          >
            {parentDelivery.governanceStatus}
          </StatusBadge>
          {parentDelivery.governanceStatus === "UNGOVERNED" ? (
            <span className="text-xs text-warn">Work Order required before execution</span>
          ) : null}
        </div>

        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-ink-muted">Work Order</dt>
          <dd>
            {parentDelivery.workOrderId ? (
              <button
                type="button"
                className="text-left font-medium text-registry-accent underline-offset-4 hover:underline"
                onClick={() => onNavigateToWorkOrder?.(parentDelivery.workOrderId!)}
              >
                {parentDelivery.workOrderTitle}
              </button>
            ) : (
              <span className="text-ink-secondary">Not linked</span>
            )}
          </dd>
          <dt className="text-ink-muted">Mission</dt>
          <dd>
            {parentDelivery.missionId ? (
              <button
                type="button"
                className="text-left font-medium text-registry-accent underline-offset-4 hover:underline"
                onClick={() => onNavigateToMission?.(parentDelivery.missionId!)}
              >
                {parentDelivery.missionTitle}
              </button>
            ) : (
              <span className="text-ink-secondary">Not linked</span>
            )}
          </dd>
          <dt className="text-ink-muted">Repository</dt>
          <dd className="break-all text-ink-secondary">{parentDelivery.repository ?? "Not declared"}</dd>
          <dt className="text-ink-muted">Work Order state</dt>
          <dd className="text-ink-secondary">{parentDelivery.workOrderState?.replace(/_/g, " ") ?? "—"}</dd>
          <dt className="text-ink-muted">Risk</dt>
          <dd className="text-ink-secondary">{parentDelivery.riskLevel ?? "—"}</dd>
        </dl>

        {parentDelivery.governanceStatus === "UNGOVERNED" ? (
          <div className="mt-4 border-t border-line pt-4">
            <Label htmlFor={`link-work-order-${taskId}`} className="text-xs">
              Link to Work Order
            </Label>
            <div className="mt-2 flex gap-2">
              <select
                id={`link-work-order-${taskId}`}
                value={selectedWorkOrderId}
                onChange={(event) => setSelectedWorkOrderId(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-ink"
              >
                <option value="">Select a Work Order</option>
                {workOrders?.map((workOrder) => (
                  <option key={workOrder._id} value={workOrder._id}>
                    {workOrder.title}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleLink}
                disabled={!selectedWorkOrderId || linking}
              >
                {linking ? "Linking…" : "Link"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function TaskAttemptSection({
  taskId,
  taskStatus,
  parentDelivery,
  workflowAttempts,
}: {
  taskId: Id<"tasks">;
  taskStatus: Doc<"tasks">["status"];
  parentDelivery: ParentDelivery;
  workflowAttempts: Doc<"workflowRuns">[];
}) {
  const dispatchWorkOrder = useMutation(api.workOrders.dispatch);
  const activeFactory = useQuery(
    api["factory/configuration"].getActiveForWorkOrder,
    parentDelivery.workOrderId ? { workOrderId: parentDelivery.workOrderId } : "skip"
  );
  const activeFactoryVersionId = activeFactory?.version._id;
  const activeFactoryHostId = activeFactory?.host?.hostId;
  const [retryReason, setRetryReason] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const attempts = [...workflowAttempts].sort(
    (left, right) =>
      left.startedAt - right.startedAt ||
      String(left._id).localeCompare(String(right._id))
  );
  const current =
    attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const governedFactoryRequired = Boolean(parentDelivery.missionId || parentDelivery.repositoryId);
  const factoryReadyForDispatch = !governedFactoryRequired || Boolean(activeFactoryVersionId && activeFactoryHostId && activeFactory?.readyForBrowserDispatch);
  const scopeReadyForDispatch = !governedFactoryRequired || (
    parentDelivery.codeScopeIds.length > 0
    && parentDelivery.codeScopeIds.every((scopeId) => activeFactory?.version.codeScopeIds?.includes(scopeId))
  );
  const workOrderCanDispatch = [
    "READY",
    "BLOCKED",
    "DISPATCHED",
    "IN_PROGRESS",
    "AWAITING_APPROVAL",
    "AWAITING_VERIFICATION",
    "REOPENED",
  ].includes(parentDelivery.workOrderState ?? "");
  const canStart =
    parentDelivery.governanceStatus === "GOVERNED" &&
    !!parentDelivery.workOrderId &&
    workOrderCanDispatch &&
    factoryReadyForDispatch &&
    scopeReadyForDispatch &&
    ["READY", "ASSIGNED", "IN_PROGRESS", "FAILED"].includes(taskStatus) &&
    attempts.length === 0;
  const canRetry =
    parentDelivery.governanceStatus === "GOVERNED" &&
    !!parentDelivery.workOrderId &&
    workOrderCanDispatch &&
    factoryReadyForDispatch &&
    scopeReadyForDispatch &&
    ["READY", "ASSIGNED", "IN_PROGRESS"].includes(taskStatus) &&
    ["FAILED", "CANCELED"].includes(current?.status ?? "");

  const schedule = async (retry: boolean) => {
    if (!parentDelivery.workOrderId || scheduling) return;
    setError(null);
    setScheduling(true);
    try {
      const result = await dispatchWorkOrder({
        workOrderId: parentDelivery.workOrderId,
        taskId,
        workflowId: parentDelivery.workflowId ?? undefined,
        actorType: "HUMAN",
        actorId: "operator",
        idempotencyKey: retry
          ? `ui-task-attempt:${taskId}:retry:${current?._id ?? "missing"}`
          : `ui-task-attempt:${taskId}:start`,
        runtime: "Mission Control UI",
        repositoryId: parentDelivery.repositoryId ?? undefined,
        codeScopeIds: parentDelivery.codeScopeIds,
        executionEnvironment: parentDelivery.executionEnvironment ?? "LOCAL",
        executorHostId: governedFactoryRequired ? activeFactoryHostId : undefined,
        retryOfWorkflowRunId: retry ? current?._id : undefined,
        retryReason: retry ? retryReason.trim() : undefined,
        factoryDefinitionVersionId: governedFactoryRequired
          ? activeFactoryVersionId
          : undefined,
      });
      if (result.reason === "routing-exhausted") {
        throw new Error("Dispatch blocked: no safe model route satisfies this Work Order.");
      }
      setRetryReason("");
      toast(retry ? "Task retry scheduled" : "Task Attempt scheduled");
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "Unable to schedule Task Attempt."
      );
    } finally {
      setScheduling(false);
    }
  };

  return (
    <Section title="Attempts">
      <div className="rounded-lg border border-line bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">
              {attempts.length === 0
                ? "No Attempts"
                : `Attempt ${attempts.length} · ${current?.status.replace(/_/g, " ")}`}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {attempts.length} total · {Math.max(0, attempts.length - 1)} retries
            </p>
          </div>
          {canStart ? (
            <Button
              size="sm"
              onClick={() => void schedule(false)}
              disabled={scheduling}
            >
              {scheduling ? "Scheduling…" : "Start Attempt"}
            </Button>
          ) : null}
        </div>

        {!workOrderCanDispatch &&
        parentDelivery.governanceStatus === "GOVERNED" ? (
          <p className="mt-3 rounded-md border border-line bg-surface-1 px-3 py-2 text-xs text-ink-muted">
            This Work Order is {parentDelivery.workOrderState?.replace(/_/g, " ").toLowerCase() ?? "not ready"} and cannot schedule an Attempt.
          </p>
        ) : null}

        {governedFactoryRequired && !factoryReadyForDispatch ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Activate a passing Factory version and report a current clean host before starting this Attempt.
          </p>
        ) : null}

        {governedFactoryRequired && !scopeReadyForDispatch ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Open the Work Order and bind a code scope frozen into the active Factory version.
          </p>
        ) : null}

        {workOrderCanDispatch &&
        parentDelivery.governanceStatus === "GOVERNED" &&
        !["READY", "ASSIGNED", "IN_PROGRESS"].includes(taskStatus) ? (
          <p className="mt-3 rounded-md border border-line bg-surface-1 px-3 py-2 text-xs text-ink-muted">
            Assign this Task before starting an Attempt.
          </p>
        ) : null}

        {attempts.length > 0 ? (
          <ol className="mt-4 space-y-2" aria-label="Task Attempt history">
            {[...attempts].reverse().map((attempt, reverseIndex) => {
              const attemptNumber = attempts.length - reverseIndex;
              return (
                <li
                  key={attempt._id}
                  className="rounded-md border border-line bg-surface-1 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-medium text-ink">Attempt {attemptNumber}</span><span className="ml-2 font-mono text-ink-muted">{attempt.runId}</span></div>
                    <div className="flex items-center gap-2"><StatusBadge tone={attempt.status === "FAILED" ? "error" : attempt.status === "COMPLETED" ? "success" : "info"}>{attempt.status.replace(/_/g, " ")}</StatusBadge><span className="text-ink-muted">{new Date(attempt.startedAt).toLocaleString()}</span></div>
                  </div>
                  <AttemptToolCapability attempt={attempt} />
                </li>
              );
            })}
          </ol>
        ) : null}

        {canRetry ? (
          <div className="mt-4 border-t border-line pt-4">
            <Label htmlFor={`retry-reason-${taskId}`}>Recovery reason</Label>
            <textarea
              id={`retry-reason-${taskId}`}
              value={retryReason}
              onChange={(event) => setRetryReason(event.target.value)}
              aria-describedby={`retry-help-${taskId}`}
              rows={3}
              className="mt-2 w-full resize-y rounded-md border border-line bg-surface-1 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Explain what changed before retrying."
            />
            <p id={`retry-help-${taskId}`} className="mt-1 text-xs text-ink-muted">
              At least 10 characters. The prior Attempt remains in history.
            </p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => void schedule(true)}
              disabled={scheduling || retryReason.trim().length < 10}
            >
              {scheduling ? "Scheduling…" : "Retry Attempt"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-err/30 bg-err/10 px-3 py-2 text-sm text-err"
          >
            {error}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function AttemptToolCapability({ attempt }: { attempt: Doc<"workflowRuns"> }) {
  const receipts = useQuery(api["factory/governedMcp"].listReceiptsForAttempt, { workflowRunId: attempt._id });
  const profile = attempt.executionProfileSnapshot as Record<string, any> | undefined;
  const grant = profile?.toolGrant;
  if (!grant) return <p className="mt-2 text-[11px] text-ink-muted">MCP: no tool capability</p>;
  if (receipts === undefined) return <div className="mt-2 h-7 animate-pulse rounded bg-surface-2" aria-label="Loading governed tool receipts" />;
  return (
    <details className="mt-2 rounded border border-line bg-surface-2 p-2">
      <summary className="cursor-pointer font-medium text-ink">Governed MCP · {grant.grantSnapshot?.toolVersionSnapshot?.admission === "QUALIFIED_REAL_READ_ONLY_SERVICE" ? "one real read-only service" : "qualification fixture"} · {receipts.length} receipt{receipts.length === 1 ? "" : "s"}</summary>
      <p className="mt-1 break-all font-mono text-[10px] text-ink-muted">{grant.grantSnapshot?.toolVersionSnapshot?.server?.key} · {grant.grantSnapshot?.operation} · {grant.grantDigest}</p>
      {receipts.length === 0 ? <p className="mt-1 text-[11px] text-ink-muted">No governed MCP call was recorded for this Attempt.</p> : (
        <ol className="mt-2 space-y-1" aria-label="Governed MCP receipt history">{receipts.map((receipt) => (
          <li key={receipt._id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-1 px-2 py-1">
            <span>
              {receipt.phase.toLowerCase()} · {receipt.reason.toLowerCase().replaceAll("_", " ")}{receipt.durationMs !== undefined ? ` · ${receipt.durationMs}ms` : ""}{receipt.retryCount ? ` · ${receipt.retryCount} retries` : ""}{receipt.lateOrStale ? " · late/stale evidence" : ""}
              {receipt.expectedInputSchemaDigest ? <span className="mt-0.5 block break-all font-mono text-[9px] text-ink-muted">schema expected {receipt.expectedInputSchemaDigest.slice(0, 12)} · observed {receipt.observedInputSchemaDigest?.slice(0, 12) ?? "not observed"} · server {receipt.observedServerVersion ?? "not observed"}/{receipt.expectedServerVersion}</span> : null}
            </span>
            <StatusBadge tone={receipt.lateOrStale ? "warning" : receipt.status === "SUCCEEDED" || receipt.status === "ALLOWED" ? "success" : receipt.status === "DENIED" || receipt.status === "FAILED" ? "error" : "warning"}>{receipt.status.toLowerCase()}</StatusBadge>
          </li>
        ))}</ol>
      )}
      <p className="mt-2 text-[10.5px] text-warning">Tool output is untrusted evidence and cannot change policy, intent, acceptance, or tool scope.</p>
    </details>
  );
}

function OverviewTab({
  taskId,
  task,
  parentDelivery,
  workflowAttempts,
  runs,
  approvals,
  agents,
  agentMap,
  onTransition,
  loading,
  postMessage,
  assignTask,
  requestApproval,
  setLoading,
  onNavigateToWorkOrder,
  onNavigateToMission,
}: {
  taskId: Id<"tasks">;
  task: Doc<"tasks">;
  parentDelivery: ParentDelivery;
  workflowAttempts: Doc<"workflowRuns">[];
  runs: Doc<"runs">[];
  approvals: Doc<"approvals">[];
  agents: Doc<"agents">[];
  agentMap: Map<Id<"agents">, Doc<"agents">>;
  onTransition: (status: TaskStatus, options?: TransitionOptions) => Promise<boolean>;
  loading: boolean;
  postMessage: (args: {
    taskId: Id<"tasks">;
    authorType: "HUMAN";
    authorUserId: string;
    type: "COMMENT";
    content: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  assignTask: (args: {
    taskId: Id<"tasks">;
    agentIds: Id<"agents">[];
    actorType: "HUMAN";
    actorUserId: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  requestApproval: (args: {
    projectId?: Id<"projects">;
    taskId: Id<"tasks">;
    requestorAgentId: Id<"agents">;
    actionType: string;
    actionSummary: string;
    riskLevel: string;
    justification: string;
    expiresInMinutes?: number;
    idempotencyKey?: string;
  }) => Promise<unknown>;
  setLoading: (value: boolean) => void;
  onNavigateToWorkOrder?: (workOrderId: Id<"workOrders">) => void;
  onNavigateToMission?: (missionId: Id<"missions">) => void;
}) {
  const [contextAction, setContextAction] = useState<
    "BLOCK" | "REQUEST_CHANGES" | "UNBLOCK" | null
  >(null);
  const verificationTrace = buildVerificationTrace(task, runs, approvals);
  const approved = approvals.some((approval) => approval.status === "APPROVED");
  const pendingApproval = approvals.some((approval) =>
    ["PENDING", "ESCALATED"].includes(approval.status)
  );

  const handleRequestApproval = async () => {
    const requestorAgentId = task.assigneeIds[0];
    if (!requestorAgentId) {
      window.alert("Assign an agent before requesting approval.");
      return;
    }
    setLoading(true);
    try {
      await requestApproval({
        projectId: task.projectId,
        taskId,
        requestorAgentId,
        actionType: "TASK_COMPLETION",
        actionSummary: `Approve completion of ${task.identifier ?? task.title}`,
        riskLevel: "YELLOW",
        justification:
          task.deliverable?.summary ??
          "Task deliverable is ready for an explicit operator decision.",
        expiresInMinutes: 120,
        idempotencyKey: `task-review:${taskId}:${task.reviewCycles}`,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to request approval.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <VerificationTracePanel trace={verificationTrace} />

      <ParentDeliverySection
        taskId={taskId}
        projectId={task.projectId}
        parentDelivery={parentDelivery}
        onNavigateToWorkOrder={onNavigateToWorkOrder}
        onNavigateToMission={onNavigateToMission}
      />

      <TaskModelRoutingSection taskId={taskId} />
      <TaskAttemptSection
        taskId={taskId}
        taskStatus={task.status}
        parentDelivery={parentDelivery}
        workflowAttempts={workflowAttempts}
      />

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
            assignTask={assignTask}
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

      {task.review && (
        <Section title="Review Context">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <DetailItem
              label="Owner"
              value={task.review.ownerId ? agentMap.get(task.review.ownerId)?.name ?? "Assigned reviewer" : "Not assigned"}
            />
            <DetailItem
              label="Entered"
              value={task.review.enteredAt ? new Date(task.review.enteredAt).toLocaleString() : "Not recorded"}
            />
            <DetailItem label="Result" value={task.review.result ? formatStatusLabel(task.review.result) : "Pending"} />
            <DetailItem label="Resubmissions" value={String(task.review.resubmissionCount)} />
          </dl>
          {task.review.reason ? (
            <p className="mt-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-secondary">
              {task.review.reason}
            </p>
          ) : null}
        </Section>
      )}

      {task.status === "BLOCKED" && (task.blocker || task.blockedReason) && (
        <Section title="Blocker Context">
          <p className="text-sm text-err">{task.blocker?.reason ?? task.blockedReason}</p>
          {task.blocker ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <DetailItem label="Type" value={formatStatusLabel(task.blocker.type)} />
              <DetailItem
                label="Blocked since"
                value={new Date(task.blocker.blockedSince).toLocaleString()}
              />
              <DetailItem label="Owner" value={task.blocker.ownerRef ?? "Not assigned"} />
              <DetailItem label="Required action" value={task.blocker.requiredAction ?? "Not specified"} />
            </dl>
          ) : (
            <p className="mt-2 text-xs text-warn">Legacy blocker: structured context will be added when resolved.</p>
          )}
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
            <Button size="sm" onClick={() => void onTransition("READY")} disabled={loading}>
              Mark ready
            </Button>
          )}
          {task.status === "REVIEW" && approved && (
            <Button size="sm" onClick={() => void onTransition("DONE")} disabled={loading}>
              Accept and mark done
            </Button>
          )}
          {task.status === "REVIEW" && (
            <Button size="sm" variant="outline" onClick={() => setContextAction("REQUEST_CHANGES")} disabled={loading}>
              Request changes
            </Button>
          )}
          {task.status === "REVIEW" && !approved && !pendingApproval && (
            <Button size="sm" onClick={handleRequestApproval} disabled={loading}>
              Request approval
            </Button>
          )}
          {task.status === "REVIEW" && pendingApproval && (
            <Button size="sm" variant="outline" disabled>
              Awaiting approval
            </Button>
          )}
          {task.status === "BLOCKED" && (
            <Button size="sm" onClick={() => setContextAction("UNBLOCK")} disabled={loading}>
              Unblock
            </Button>
          )}
          {["READY", "ASSIGNED", "IN_PROGRESS", "REVIEW"].includes(task.status) && (
            <Button size="sm" variant="outline" onClick={() => setContextAction("BLOCK")} disabled={loading}>
              Block task
            </Button>
          )}
        </div>
      </Section>

      <TransitionContextDialog
        action={contextAction}
        taskStarted={!!task.startedAt}
        loading={loading}
        onClose={() => setContextAction(null)}
        onSubmit={async (status, options) => {
          const success = await onTransition(status, options);
          if (success) setContextAction(null);
          return success;
        }}
      />
    </div>
  );
}

function TaskModelRoutingSection({ taskId }: { taskId: Id<"tasks"> }) {
  const routing = useQuery(api.modelRoutingDecisions.getForTask, { taskId });
  const catalog = useQuery(
    api.modelCatalog.list,
    routing?.projectId ? { projectId: routing.projectId } : "skip",
  );
  const setOverride = useMutation(api.workOrders.setAuthorizedModelOverride);
  const { toast } = useToast();
  const [modelId, setModelId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModelId(routing?.overrideModelId ?? "");
    setReason(routing?.overrideReason ?? "");
  }, [routing?.overrideModelId, routing?.overrideReason]);

  if (routing === undefined || catalog === undefined) {
    return <Section title="Model routing"><p className="text-sm text-ink-muted">Loading route…</p></Section>;
  }
  if (!routing?.workOrderId) {
    return (
      <Section title="Model routing">
        <p className="text-sm text-ink-muted">Link this task to a Work Order before selecting a model route.</p>
      </Section>
    );
  }

  const decision = routing.decision;
  const save = async () => {
    if (!modelId || !reason.trim()) return;
    setSaving(true);
    try {
      await setOverride({
        workOrderId: routing.workOrderId!,
        modelId,
        reason: reason.trim(),
      });
      toast("Model override saved for the next dispatch");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save model override", true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Model routing">
      <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
        <div className="grid gap-1 text-sm">
          <span className="text-xs text-ink-muted">Selected route</span>
          <span className="font-mono font-medium text-ink">{decision?.selectedModelId ?? "Not routed yet"}</span>
          {decision && <span className="text-xs leading-5 text-ink-secondary">{decision.explanation}</span>}
          {decision && <span className="text-xs text-ink-muted">{decision.complexity ?? "STANDARD"} complexity · {decision.riskLevel} risk · {decision.mode.toLowerCase()} mode</span>}
        </div>
        {!routing.canChange ? (
          <p className="border-t border-line pt-3 text-xs leading-5 text-ink-muted">
            This run is active. Cancel or complete it before changing the model; the next dispatch will record a new route.
          </p>
        ) : (
          <div className="space-y-2 border-t border-line pt-3">
            <Label htmlFor={`task-model-${taskId}`} className="text-xs">Next dispatch override</Label>
            <select
              id={`task-model-${taskId}`}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              className="w-full rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-ink"
            >
              <option value="">Follow workspace policy</option>
              {catalog.filter((model) => !model.deprecated && model.availability === "HEALTHY").map((model) => (
                <option key={model._id} value={model.modelId}>{model.displayName} · {model.tier}</option>
              ))}
            </select>
            {modelId && (
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this exception needed?"
                rows={2}
                className="w-full rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              />
            )}
            <div className="flex gap-2">
              {modelId ? (
                <Button size="sm" onClick={save} disabled={saving || !reason.trim()}>{saving ? "Saving…" : "Save override"}</Button>
              ) : routing.overrideModelId ? (
                <Button size="sm" variant="outline" onClick={async () => {
                  setSaving(true);
                  try {
                    await setOverride({ workOrderId: routing.workOrderId! });
                    toast("Model override cleared; workspace policy will apply");
                  } catch (error) {
                    toast(error instanceof Error ? error.message : "Unable to clear model override", true);
                  } finally {
                    setSaving(false);
                  }
                }} disabled={saving}>Clear override</Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink-secondary">{value}</dd>
    </div>
  );
}

function TransitionContextDialog({
  action,
  taskStarted,
  loading,
  onClose,
  onSubmit,
}: {
  action: "BLOCK" | "REQUEST_CHANGES" | "UNBLOCK" | null;
  taskStarted: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (status: TaskStatus, options: TransitionOptions) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [findings, setFindings] = useState("");
  const [blockerType, setBlockerType] = useState<NonNullable<TransitionOptions["blocker"]>["type"]>("UNKNOWN");
  const [ownerRef, setOwnerRef] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const [resolution, setResolution] = useState<NonNullable<TransitionOptions["blockerResolution"]>["resolution"]>("RESOLVED");
  const [unblockTarget, setUnblockTarget] = useState<TaskStatus>(taskStarted ? "IN_PROGRESS" : "READY");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!action) return;
    setReason("");
    setFindings("");
    setBlockerType("UNKNOWN");
    setOwnerRef("");
    setRequiredAction("");
    setResolution("RESOLVED");
    setUnblockTarget(taskStarted ? "IN_PROGRESS" : "READY");
    setError("");
  }, [action, taskStarted]);

  if (!action) return null;

  const title =
    action === "BLOCK"
      ? "Block task"
      : action === "REQUEST_CHANGES"
        ? "Request changes"
        : "Resolve blocker";
  const description =
    action === "BLOCK"
      ? "Record what prevents progress and who owns the next action."
      : action === "REQUEST_CHANGES"
        ? "Return the Task to an actionable state while retaining the review decision."
        : "Record how the blocker was resolved before work resumes.";

  const handleSubmit = async () => {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10) {
      setError("Provide a meaningful reason of at least 10 characters.");
      return;
    }
    setError("");

    if (action === "BLOCK") {
      await onSubmit("BLOCKED", {
        reason: normalizedReason,
        blocker: {
          type: blockerType,
          reason: normalizedReason,
          ownerRef: ownerRef.trim() || undefined,
          requiredAction: requiredAction.trim() || undefined,
        },
      });
      return;
    }

    if (action === "REQUEST_CHANGES") {
      await onSubmit("IN_PROGRESS", {
        reason: normalizedReason,
        reviewFindings: findings
          .split("\n")
          .map((finding) => finding.trim())
          .filter(Boolean),
      });
      return;
    }

    await onSubmit(unblockTarget, {
      reason: normalizedReason,
      blockerResolution: { resolution, reason: normalizedReason },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {action === "BLOCK" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="blocker-type">Blocker type</Label>
                <select
                  id="blocker-type"
                  value={blockerType}
                  onChange={(event) => setBlockerType(event.target.value as typeof blockerType)}
                  className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {(["TASK", "EXTERNAL", "POLICY", "APPROVAL", "CAPACITY", "UNKNOWN"] as const).map((type) => (
                    <option key={type} value={type}>{formatStatusLabel(type)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blocker-owner">Responsible owner</Label>
                <Input id="blocker-owner" value={ownerRef} onChange={(event) => setOwnerRef(event.target.value)} placeholder="Operator, agent, or team" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="required-action">Required action</Label>
                <Input id="required-action" value={requiredAction} onChange={(event) => setRequiredAction(event.target.value)} placeholder="What must happen next?" />
              </div>
            </>
          ) : null}

          {action === "UNBLOCK" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="blocker-resolution">Resolution</Label>
                <select
                  id="blocker-resolution"
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value as typeof resolution)}
                  className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="RESOLVED">Resolved</option>
                  <option value="WAIVED">Waived</option>
                  <option value="REPLACED">Replaced</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unblock-target">Return task to</Label>
                <select
                  id="unblock-target"
                  value={unblockTarget}
                  onChange={(event) => setUnblockTarget(event.target.value as TaskStatus)}
                  className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="READY">Ready</option>
                  <option value="IN_PROGRESS">In Progress</option>
                </select>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="workflow-reason">
              {action === "REQUEST_CHANGES" ? "Reason for changes" : action === "UNBLOCK" ? "Resolution reason" : "Blocker reason"}
            </Label>
            <textarea
              id="workflow-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              aria-describedby={error ? "workflow-reason-error" : undefined}
              className="w-full resize-y rounded-md border border-line bg-surface-1 p-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Explain the evidence and next action…"
            />
          </div>

          {action === "REQUEST_CHANGES" ? (
            <div className="space-y-1.5">
              <Label htmlFor="review-findings">Findings (one per line)</Label>
              <textarea
                id="review-findings"
                value={findings}
                onChange={(event) => setFindings(event.target.value)}
                rows={3}
                className="w-full resize-y rounded-md border border-line bg-surface-1 p-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Missing evidence\nAcceptance criterion not met"
              />
            </div>
          ) : null}

          {error ? <p id="workflow-reason-error" role="alert" className="text-sm text-err">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={loading || reason.trim().length < 10}>
            {loading ? "Saving…" : action === "BLOCK" ? "Block task" : action === "REQUEST_CHANGES" ? "Request changes" : "Resolve blocker"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDropdown({
  taskId,
  currentAssigneeIds,
  agents,
  assignTask,
  setLoading,
}: {
  taskId: Id<"tasks">;
  currentAssigneeIds: Id<"agents">[];
  agents: Doc<"agents">[];
  assignTask: (args: {
    taskId: Id<"tasks">;
    agentIds: Id<"agents">[];
    actorType: "HUMAN";
    actorUserId: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  setLoading: (value: boolean) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Id<"agents">[]>(currentAssigneeIds);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSelectedIds(currentAssigneeIds);
  }, [currentAssigneeIds]);

  const handleReassign = async (nextIds: Id<"agents">[]) => {
    setSelectedIds(nextIds);
    setLoading(true);
    try {
      const result = await assignTask({
        taskId,
        agentIds: nextIds,
        actorType: "HUMAN",
        actorUserId: "operator",
        idempotencyKey: `assign:${taskId}:${nextIds.join(",")}:${Date.now()}`,
      });
      const assignment = result as { success?: boolean; error?: string };
      if (assignment.success === false) {
        throw new Error(assignment.error ?? "Assignment failed");
      }
      setOpen(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Assignment failed", true);
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
            onCheckedChange={() => {
              const nextIds = selectedIds.includes(agent._id)
                ? selectedIds.filter((candidate) => candidate !== agent._id)
                : [...selectedIds, agent._id];
              void handleReassign(nextIds);
            }}
          >
            <span>{agent.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void handleReassign([])}
        >
          Clear assignees
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
  const approve = useMutation(api.approvals.approve);
  const deny = useMutation(api.approvals.deny);
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);

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
            {["PENDING", "ESCALATED"].includes(a.status) && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <input
                  value={decisionReasons[a._id] ?? ""}
                  onChange={(event) =>
                    setDecisionReasons((current) => ({
                      ...current,
                      [a._id]: event.target.value,
                    }))
                  }
                  placeholder="Decision reason (required)"
                  aria-label={`Decision reason for ${a.actionSummary}`}
                  className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={
                      busyApprovalId === a._id || !(decisionReasons[a._id] ?? "").trim()
                    }
                    onClick={async () => {
                      setBusyApprovalId(a._id);
                      try {
                        const result = await approve({
                          approvalId: a._id,
                          decidedByUserId: "operator",
                          reason: decisionReasons[a._id].trim(),
                        });
                        if (!result.success) window.alert(result.error ?? "Approval failed.");
                      } finally {
                        setBusyApprovalId(null);
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busyApprovalId === a._id || !(decisionReasons[a._id] ?? "").trim()
                    }
                    onClick={async () => {
                      setBusyApprovalId(a._id);
                      try {
                        const result = await deny({
                          approvalId: a._id,
                          decidedByUserId: "operator",
                          reason: decisionReasons[a._id].trim(),
                        });
                        if (!result.success) window.alert(result.error ?? "Rejection failed.");
                      } finally {
                        setBusyApprovalId(null);
                      }
                    }}
                  >
                    Reject
                  </Button>
                </div>
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
  const compatibilityReport = useQuery(
    api.tasks.getWorkflowStateCompatibilityReport,
    task.projectId ? { projectId: task.projectId } : "skip"
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
        <h3 className="text-sm font-semibold text-ink mb-3">Workflow compatibility</h3>
        <div className="p-4 bg-surface-2 border border-line rounded-md">
          {compatibilityReport ? (
            <>
              <ExplainRow
                label="Mode"
                value="READ ONLY"
                detail="This report cannot mutate Tasks"
              />
              <ExplainRow
                label="Ready presentation"
                value={String(compatibilityReport.canonicalStatusCounts.READY ?? 0)}
                detail={`${compatibilityReport.legacyAssignedCount} legacy Assigned`}
              />
              <ExplainRow
                label="Migration eligible"
                value={String(compatibilityReport.eligibleLegacyAssignedCount)}
                detail="No migration is authorized in this cycle"
              />
              <ExplainRow
                label="Missing structured context"
                value={String(
                  compatibilityReport.reviewMissingStructuredCount +
                    compatibilityReport.blockedMissingStructuredCount
                )}
                detail={`${compatibilityReport.reviewMissingStructuredCount} review · ${compatibilityReport.blockedMissingStructuredCount} blocked`}
              />
            </>
          ) : (
            <div className="text-xs text-ink-muted">Loading compatibility evidence…</div>
          )}
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
  PRD_IMPORT: { label: "Imported PRD" },
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
