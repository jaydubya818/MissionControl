import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/factory/badges";
import { PriorityChip } from "@/components/PriorityChip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Inbox,
  UserCheck,
  Play,
  Eye,
  ShieldAlert,
  Ban,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Undo2,
  DollarSign,
  GripVertical,
  MoreHorizontal,
  ExternalLink,
  Link2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PlanningModal } from "./PlanningModal";

type TaskStatus = Doc<"tasks">["status"];

const COLUMNS: { status: TaskStatus; label: string; color: string; icon: LucideIcon }[] = [
  { status: "INBOX", label: "Inbox", color: "text-ink-muted", icon: Inbox },
  { status: "READY", label: "Ready", color: "text-ink-muted", icon: UserCheck },
  { status: "IN_PROGRESS", label: "In Progress", color: "text-ink-muted", icon: Play },
  { status: "REVIEW", label: "Review", color: "text-ink-muted", icon: Eye },
  { status: "NEEDS_APPROVAL", label: "Needs Approval", color: "text-ink-muted", icon: ShieldAlert },
  { status: "BLOCKED", label: "Blocked", color: "text-ink-muted", icon: Ban },
  { status: "FAILED", label: "Failed", color: "text-ink-muted", icon: AlertTriangle },
  { status: "DONE", label: "Done", color: "text-ink-muted", icon: CheckCircle2 },
  { status: "CANCELED", label: "Canceled", color: "text-ink-muted", icon: XCircle },
];

/** Flat status-dot colors per UI_STYLE_GUIDE task-state mapping. */
const COLUMN_DOT: Record<string, string> = {
  INBOX: "bg-ink-muted",
  READY: "bg-info-accent",
  ASSIGNED: "bg-ink-muted",
  IN_PROGRESS: "bg-info-accent",
  REVIEW: "bg-info-accent",
  NEEDS_APPROVAL: "bg-warn",
  BLOCKED: "bg-warn",
  FAILED: "bg-err",
  DONE: "bg-ok",
  CANCELED: "bg-ink-muted",
};

type Task = {
  _id: Id<"tasks">;
  title: string;
  type: string;
  status: TaskStatus;
  presentationStatus: TaskStatus;
  priority: number;
  actualCost: number;
  estimatedCost?: number;
  assigneeIds: Id<"agents">[];
  labels?: string[];
  blockedReason?: string;
  blocker?: {
    type: string;
    reason: string;
    ownerRef?: string;
    requiredAction?: string;
    blockedSince: number;
    resolvedAt?: number;
  };
  source?: string;
  sourceRef?: string;
  identifier?: string;
  dueAt?: number;
  parentDelivery: {
    governanceStatus: "UNGOVERNED" | "GOVERNED" | "LEGACY";
    workOrderTitle: string | null;
    workOrderState: string | null;
    missionTitle: string | null;
  };
  attempt: {
    currentAttemptNumber: number;
    currentAttemptStatus: string | null;
    attemptCount: number;
    retryCount: number;
    legacyRetryAmbiguous: boolean;
  };
  metadata?: {
    workflowRunId?: string;
    workflowAttempt?: {
      attemptNumber?: number;
      retryNumber?: number;
      supersededAt?: number;
    };
  };
};

const SOURCE_CONFIG: Record<string, { label: string; isSpecial?: boolean }> = {
  DASHBOARD: { label: "Dashboard" },
  TELEGRAM:  { label: "Telegram" },
  GITHUB:    { label: "GitHub" },
  AGENT:     { label: "Agent" },
  API:       { label: "API" },
  TRELLO:    { label: "Trello" },
  SEED:      { label: "Seed" },
  MISSION_PROMPT: { label: "Mission", isSpecial: true },
  PRD_IMPORT: { label: "Imported PRD", isSpecial: true },
  UNKNOWN:   { label: "Unknown" },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  INBOX: "Inbox",
  READY: "Ready",
  ASSIGNED: "Ready (legacy)",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  NEEDS_APPROVAL: "Needs Approval",
  BLOCKED: "Blocked",
  FAILED: "Failed",
  DONE: "Done",
  CANCELED: "Canceled",
};

export function Kanban({ 
  projectId,
  onSelectTask,
  filters,
}: { 
  projectId: Id<"projects"> | null;
  onSelectTask: (id: Id<"tasks">) => void;
  filters?: {
    agents: string[];
    priorities: number[];
    types: string[];
  };
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [planningTaskId, setPlanningTaskId] = useState<Id<"tasks"> | null>(null);
  const [lastMove, setLastMove] = useState<{
    taskId: Id<"tasks">;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
  } | null>(null);
  
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const allowedMap = useQuery(api.tasks.getAllowedTransitionsForHuman);
  const transitionTask = useAction(api.tasks.transition);
  const { toast } = useToast();
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  if (tasks === undefined || agents === undefined) {
    return (
      <div className="flex flex-col gap-3 p-6" aria-label="Loading tasks">
        <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-56 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  const filteredTasks = tasks.filter((task) => {
    if (!filters) return true;
    if (filters.agents.length > 0) {
      const hasMatchingAgent = task.assigneeIds.some((id) =>
        filters.agents.includes(id)
      );
      if (!hasMatchingAgent && task.assigneeIds.length > 0) return false;
    }
    if (filters.priorities.length > 0) {
      if (!filters.priorities.includes(task.priority)) return false;
    }
    if (filters.types.length > 0) {
      if (!filters.types.includes(task.type)) return false;
    }
    return true;
  });

  const agentMap = new Map<Id<"agents">, Doc<"agents">>(
    (agents as Doc<"agents">[]).map((a: Doc<"agents">) => [a._id, a])
  );
  const byStatus = (status: TaskStatus) =>
    filteredTasks.filter((task) => task.presentationStatus === status);

  const handleMoveTo = async (taskId: Id<"tasks">, fromStatus: TaskStatus, toStatus: TaskStatus) => {
    try {
      const result = await transitionTask({
        taskId,
        toStatus,
        actorType: "HUMAN",
        actorUserId: "operator",
        idempotencyKey: `ui-${taskId}-${toStatus}-${Date.now()}`,
      });
      if (result && typeof result === "object" && "success" in result && !result.success) {
        const err = (result as { errors?: { message: string }[] }).errors?.[0]?.message ?? "Transition failed";
        toast(err, true);
      } else {
        setLastMove({ taskId, fromStatus, toStatus });
        toast(`Moved to ${STATUS_LABELS[toStatus]}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transition failed", true);
    }
  };
  
  const handleUndo = async () => {
    if (!lastMove) return;
    try {
      await transitionTask({
        taskId: lastMove.taskId,
        toStatus: lastMove.fromStatus,
        actorType: "HUMAN",
        actorUserId: "operator",
        idempotencyKey: `undo-${lastMove.taskId}-${Date.now()}`,
      });
      toast("Undone");
      setLastMove(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Undo failed", true);
    }
  };
  
  const handleDragStart = (event: DragStartEvent) => {
    const task = filteredTasks.find((t) => t._id === event.active.id);
    if (task) setActiveTask(task as Task);
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const task = filteredTasks.find((t) => t._id === active.id);
    const toStatus = over.id as TaskStatus;
    if (!task) return;
    const allowed = allowedMap?.[task.status] ?? [];
    if (!allowed.includes(toStatus)) {
      toast("Transition not allowed", true);
      return;
    }
    handleMoveTo(task._id, task.status, toStatus);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Undo toast */}
        {lastMove && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button onClick={handleUndo} className="shadow-[var(--shadow-elevation-2)] gap-2">
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
          </div>
        )}
        
        <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto p-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              label={col.label}
              icon={col.icon}
              colorClass={col.color}
              status={col.status}
              tasks={byStatus(col.status) as Task[]}
              agentMap={agentMap}
              allowedMap={allowedMap ?? {}}
              onSelectTask={onSelectTask}
              onMoveTo={handleMoveTo}
              onPlanTask={col.status === "INBOX" ? setPlanningTaskId : undefined}
            />
          ))}
        </div>
      </div>
      
      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="min-w-[240px] rounded-xl border border-line-strong bg-surface-3 p-3 shadow-[var(--shadow-elevation-2)] opacity-95">
            <div className="font-medium text-[13.5px] text-ink mb-1 line-clamp-2">
              {activeTask.title}
            </div>
            <div className="text-[12.5px] text-ink-muted">
              {activeTask.type} · P{activeTask.priority}
            </div>
          </div>
        ) : null}
      </DragOverlay>
      <PlanningModal
        taskId={planningTaskId}
        onClose={() => setPlanningTaskId(null)}
        onSuccess={() => setPlanningTaskId(null)}
      />
    </DndContext>
    </div>
  );
}

function Column({
  label,
  icon: Icon,
  colorClass,
  status,
  tasks,
  agentMap,
  allowedMap,
  onSelectTask,
  onMoveTo,
  onPlanTask,
}: {
  label: string;
  icon: LucideIcon;
  colorClass: string;
  status: TaskStatus;
  tasks: Task[];
  agentMap: Map<Id<"agents">, { name: string; emoji?: string }>;
  allowedMap: Record<string, string[]>;
  onSelectTask: (id: Id<"tasks">) => void;
  onMoveTo: (taskId: Id<"tasks">, fromStatus: TaskStatus, toStatus: TaskStatus) => void;
  onPlanTask?: (taskId: Id<"tasks">) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full min-h-0 min-w-[264px] max-w-[264px] flex-col rounded-xl border bg-surface-1 transition-colors duration-150 overflow-hidden",
        isOver ? "border-line-strong bg-surface-2" : "border-line"
      )}
    >
      {/* Lane header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <Icon size={14} strokeWidth={1.6} className={cn("shrink-0", colorClass)} />
        <span className="text-[12.5px] font-medium text-ink-secondary">{label}</span>
        <StatusBadge tone="neutral" className="ml-auto">
          {tasks.length}
        </StatusBadge>
      </div>
      
      {/* Cards */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          {tasks.map((t) => (
            <Card
              key={t._id}
              task={t}
              agentMap={agentMap}
              allowedToStatuses={(allowedMap[t.status] as TaskStatus[] | undefined) ?? []}
              onSelect={() => onSelectTask(t._id)}
              onMoveTo={(toStatus) => onMoveTo(t._id, t.status, toStatus)}
              onPlanTask={onPlanTask}
            />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-ink-muted">
              <span className="text-[12.5px]">
                {status === "BLOCKED"
                  ? "No blocked tasks"
                  : status === "DONE"
                    ? "Nothing completed yet"
                    : "Drop tasks here"}
              </span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


function Card({
  task,
  agentMap,
  allowedToStatuses,
  onSelect,
  onMoveTo,
  onPlanTask,
}: {
  task: Task;
  agentMap: Map<Id<"agents">, { name: string; emoji?: string }>;
  allowedToStatuses: TaskStatus[];
  onSelect: () => void;
  onMoveTo: (toStatus: TaskStatus) => void;
  onPlanTask?: (taskId: Id<"tasks">) => void;
}) {
  const isUngoverned = task.parentDelivery.governanceStatus === "UNGOVERNED";
  const effectiveAllowedStatuses = isUngoverned
    ? allowedToStatuses.filter((status) => status === "CANCELED")
    : allowedToStatuses;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    disabled: effectiveAllowedStatuses.length === 0,
  });
  
  const assignees = task.assigneeIds
    .map((id) => agentMap.get(id))
    .filter(Boolean);

  const src = task.source ? (SOURCE_CONFIG[task.source] || SOURCE_CONFIG.UNKNOWN) : null;
  const workflowAttempt = task.metadata?.workflowAttempt;

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-xl border bg-surface-1 p-3 transition-colors duration-150",
        isDragging ? "opacity-50 border-line-strong" : "border-line hover:border-line-strong hover:bg-surface-2",
        "cursor-pointer"
      )}
    >
      {effectiveAllowedStatuses.length > 0 ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute right-2 top-2 z-10 rounded p-1 text-ink-muted opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink-secondary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          aria-label={`Drag ${task.title}`}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open task ${task.title}`}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Identifier + Title */}
        {task.identifier && (
          <div className="text-[11.5px] font-mono text-ink-muted mb-1">{task.identifier}</div>
        )}
        <div className="mb-2 line-clamp-2 pr-5 text-[13.5px] font-medium leading-snug text-ink">
          {task.title}
        </div>

        {isUngoverned ? (
          <div className="mb-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5">
            <div className="text-[11px] font-semibold tracking-wide text-warn">UNGOVERNED</div>
            <div className="mt-0.5 text-[11.5px] text-ink-secondary">Work Order required before execution</div>
          </div>
        ) : (
          <div className="mb-2 space-y-1 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[11.5px]">
            <div className="truncate font-medium text-ink-secondary">
              Work Order: {task.parentDelivery.workOrderTitle ?? "Legacy relationship"}
            </div>
            <div className="truncate text-ink-muted">
              Mission: {task.parentDelivery.missionTitle ?? "Not linked"}
            </div>
          </div>
        )}

        {/* Metadata chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          <StatusBadge tone="neutral">{task.type}</StatusBadge>
          <PriorityChip priority={task.priority} />
          {src && (
            <StatusBadge tone={src.isSpecial ? "info" : "neutral"}>
              {src.isSpecial && <Sparkles size={11} strokeWidth={1.75} aria-hidden />}
              {src.label}
            </StatusBadge>
          )}
          {task.metadata?.workflowRunId && workflowAttempt?.attemptNumber ? (
            <StatusBadge tone={workflowAttempt.supersededAt ? "warning" : "info"}>
              Attempt {workflowAttempt.attemptNumber}
              {workflowAttempt.retryNumber ? ` · Retry ${workflowAttempt.retryNumber}` : ""}
            </StatusBadge>
          ) : null}
          {task.attempt.attemptCount > 0 ? (
            <StatusBadge tone="info">
              Attempt {task.attempt.currentAttemptNumber} · {task.attempt.currentAttemptStatus}
            </StatusBadge>
          ) : null}
          {task.attempt.retryCount > 0 ? (
            <StatusBadge tone="warning">
              {task.attempt.retryCount} {task.attempt.retryCount === 1 ? "retry" : "retries"}
            </StatusBadge>
          ) : null}
          <StatusBadge
            tone={
              isUngoverned
                ? "warning"
                : task.parentDelivery.governanceStatus === "GOVERNED"
                  ? "success"
                  : "neutral"
            }
          >
            {task.parentDelivery.governanceStatus}
          </StatusBadge>
        </div>

        {task.dueAt ? (
          <div className="mb-2 text-[11.5px] text-ink-muted">
            Due {new Date(task.dueAt).toLocaleDateString()}
          </div>
        ) : null}

        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="text-[11.5px] px-1.5 py-0.5 bg-surface-2 text-ink-secondary rounded-md"
              >
                {label}
              </span>
            ))}
            {task.labels.length > 3 && (
              <span className="text-[11.5px] text-ink-muted">
                +{task.labels.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Blocked reason */}
        {task.status === "BLOCKED" && (task.blocker?.reason || task.blockedReason) && (
          <div className="text-[12.5px] px-2 py-1.5 bg-err-soft text-err rounded-md mb-2 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" strokeWidth={1.75} />
            <span className="line-clamp-2">{task.blocker?.reason ?? task.blockedReason}</span>
          </div>
        )}

        {/* Footer: Cost & Assignees */}
        <div className="flex items-center justify-between text-[12.5px] text-ink-muted">
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" strokeWidth={1.75} />
            {task.actualCost.toFixed(2)}
            {task.estimatedCost != null && (
              <span className="text-ink-muted/60"> / ${task.estimatedCost.toFixed(2)}</span>
            )}
          </span>
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 3).map((agent, i) => (
              <span
                key={i}
                title={agent!.name}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[11px] text-ink-secondary border border-line"
              >
                {agent!.emoji || agent!.name.charAt(0)}
              </span>
            ))}
            {assignees.length > 3 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[11px] text-ink-secondary border border-line">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hover actions */}
      {(effectiveAllowedStatuses.length > 0 || onPlanTask || isUngoverned) && (
        <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
          {onPlanTask && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={(e) => { e.stopPropagation(); onPlanTask(task._id); }}
            >
              <Sparkles className="h-3 w-3 mr-1" strokeWidth={1.75} />
              Plan with AI
            </Button>
          )}
          {effectiveAllowedStatuses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2">
                  <ArrowRight className="h-3 w-3 mr-1" strokeWidth={1.75} />
                  Move
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {effectiveAllowedStatuses.map((s: TaskStatus) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={(e) => { e.stopPropagation(); onMoveTo(s); }}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full mr-2", COLUMN_DOT[s])} />
                    {STATUS_LABELS[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isUngoverned ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={onSelect}
            >
              <Link2 className="mr-1 h-3 w-3" aria-hidden />
              Link Work Order
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 ml-auto"
            onClick={onSelect}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Open
          </Button>
        </div>
      )}
    </div>
  );
}
