import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  type LucideIcon,
} from "lucide-react";

type TaskStatus = Doc<"tasks">["status"];

const COLUMNS: { status: TaskStatus; label: string; color: string; icon: LucideIcon }[] = [
  { status: "INBOX", label: "Inbox", color: "text-indigo-400", icon: Inbox },
  { status: "ASSIGNED", label: "Assigned", color: "text-amber-400", icon: UserCheck },
  { status: "IN_PROGRESS", label: "In Progress", color: "text-blue-400", icon: Play },
  { status: "REVIEW", label: "Review", color: "text-violet-400", icon: Eye },
  { status: "NEEDS_APPROVAL", label: "Needs Approval", color: "text-red-400", icon: ShieldAlert },
  { status: "BLOCKED", label: "Blocked", color: "text-orange-400", icon: Ban },
  { status: "FAILED", label: "Failed", color: "text-red-400", icon: AlertTriangle },
  { status: "DONE", label: "Done", color: "text-emerald-400", icon: CheckCircle2 },
  { status: "CANCELED", label: "Canceled", color: "text-gray-400", icon: XCircle },
];

const COLUMN_BG: Record<string, string> = {
  INBOX: "bg-indigo-500/5",
  ASSIGNED: "bg-amber-500/5",
  IN_PROGRESS: "bg-blue-500/5",
  REVIEW: "bg-violet-500/5",
  NEEDS_APPROVAL: "bg-red-500/5",
  BLOCKED: "bg-orange-500/5",
  FAILED: "bg-red-500/5",
  DONE: "bg-emerald-500/5",
  CANCELED: "bg-gray-500/5",
};

const COLUMN_DOT: Record<string, string> = {
  INBOX: "bg-indigo-400",
  ASSIGNED: "bg-amber-400",
  IN_PROGRESS: "bg-blue-400",
  REVIEW: "bg-violet-400",
  NEEDS_APPROVAL: "bg-red-400",
  BLOCKED: "bg-orange-400",
  FAILED: "bg-red-400",
  DONE: "bg-emerald-400",
  CANCELED: "bg-gray-400",
};

const PRIORITY_LABELS: Record<number, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  1: { label: "Critical", variant: "destructive" },
  2: { label: "High", variant: "default" },
  3: { label: "Normal", variant: "secondary" },
  4: { label: "Low", variant: "outline" },
};

type Task = {
  _id: Id<"tasks">;
  title: string;
  type: string;
  status: TaskStatus;
  priority: number;
  actualCost: number;
  estimatedCost?: number;
  assigneeIds: Id<"agents">[];
  labels?: string[];
  blockedReason?: string;
  source?: string;
  sourceRef?: string;
};

const SOURCE_CONFIG: Record<string, { icon: string; label: string }> = {
  DASHBOARD: { icon: "🖥️", label: "Dashboard" },
  TELEGRAM:  { icon: "✈️", label: "Telegram" },
  GITHUB:    { icon: "🐙", label: "GitHub" },
  AGENT:     { icon: "🤖", label: "Agent" },
  API:       { icon: "🔌", label: "API" },
  TRELLO:    { icon: "📋", label: "Trello" },
  SEED:      { icon: "🌱", label: "Seed" },
  UNKNOWN:   { icon: "❓", label: "Unknown" },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  INBOX: "Inbox",
  ASSIGNED: "Assigned",
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
  const [lastMove, setLastMove] = useState<{
    taskId: Id<"tasks">;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
  } | null>(null);
  
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const allowedMap = useQuery(api.tasks.getAllowedTransitionsForHuman);
  const transitionTask = useMutation(api.tasks.transition);
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
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Loading tasks...
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

  const agentMap = new Map(agents.map((a: Doc<"agents">) => [a._id, a]));
  const byStatus = (status: TaskStatus) =>
    filteredTasks.filter((t: Doc<"tasks">) => t.status === status);

  const handleMoveTo = async (taskId: Id<"tasks">, fromStatus: TaskStatus, toStatus: TaskStatus) => {
    try {
      setLastMove({ taskId, fromStatus, toStatus });
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="relative flex-1">
        {/* Undo toast */}
        {lastMove && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button onClick={handleUndo} className="shadow-lg gap-2">
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
          </div>
        )}
        
        <div className="flex gap-3 overflow-x-auto p-4 min-h-[500px]">
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
            />
          ))}
        </div>
      </div>
      
      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="min-w-[240px] rounded-lg border-2 border-primary bg-card p-3 shadow-xl opacity-95">
            <div className="font-medium text-sm text-card-foreground mb-1 line-clamp-2">
              {activeTask.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {activeTask.type} &bull; P{activeTask.priority}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
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
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[264px] max-w-[264px] flex-col rounded-lg border transition-colors",
        COLUMN_BG[status],
        isOver
          ? "border-primary/50 bg-primary/10"
          : "border-border"
      )}
    >
      {/* Lane header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
        <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[status])} />
        <Icon className={cn("h-3.5 w-3.5", colorClass)} />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Badge variant="secondary" className="ml-auto h-5 text-[10px] font-medium px-1.5">
          {tasks.length}
        </Badge>
      </div>
      
      {/* Cards */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-240px)]">
        <div className="flex flex-col gap-2 p-2">
          {tasks.map((t) => (
            <Card
              key={t._id}
              task={t}
              agentMap={agentMap}
              allowedToStatuses={(allowedMap[t.status] as TaskStatus[] | undefined) ?? []}
              onSelect={() => onSelectTask(t._id)}
              onMoveTo={(toStatus) => onMoveTo(t._id, t.status, toStatus)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <span className="text-2xl mb-2">
                {status === "BLOCKED" ? "🎉" : status === "DONE" ? "✨" : "📭"}
              </span>
              <span className="text-xs">
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
}: {
  task: Task;
  agentMap: Map<Id<"agents">, { name: string; emoji?: string }>;
  allowedToStatuses: TaskStatus[];
  onSelect: () => void;
  onMoveTo: (toStatus: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    disabled: allowedToStatuses.length === 0,
  });
  
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const assignees = task.assigneeIds
    .map((id) => agentMap.get(id))
    .filter(Boolean);

  const src = task.source ? (SOURCE_CONFIG[task.source] || SOURCE_CONFIG.UNKNOWN) : null;

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        "group rounded-lg border bg-card p-3 transition-all",
        isDragging ? "opacity-50 shadow-lg border-primary" : "border-border hover:border-muted-foreground/30 hover:shadow-sm",
        allowedToStatuses.length > 0 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        className="outline-none"
      >
        {/* Title */}
        <div className="font-medium text-sm text-card-foreground leading-snug line-clamp-2 mb-2">
          {task.title}
        </div>

        {/* Metadata chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
            {task.type}
          </Badge>
          <Badge variant={priority.variant} className="text-[10px] h-5 px-1.5 font-medium">
            {priority.label}
          </Badge>
          {src && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal gap-1">
              <span className="text-[9px]">{src.icon}</span>
              {src.label}
            </Badge>
          )}
        </div>

        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
              >
                {label}
              </span>
            ))}
            {task.labels.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{task.labels.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Blocked reason */}
        {task.blockedReason && (
          <div className="text-xs px-2 py-1.5 bg-destructive/10 text-destructive rounded mb-2 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{task.blockedReason}</span>
          </div>
        )}

        {/* Footer: Cost & Assignees */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {task.actualCost.toFixed(2)}
            {task.estimatedCost != null && (
              <span className="text-muted-foreground/60"> / ${task.estimatedCost.toFixed(2)}</span>
            )}
          </span>
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 3).map((agent, i) => (
              <span
                key={i}
                title={agent!.name}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] border-2 border-card"
              >
                {agent!.emoji || agent!.name.charAt(0)}
              </span>
            ))}
            {assignees.length > 3 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] border-2 border-card">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hover actions */}
      {allowedToStatuses.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground">
                <ArrowRight className="h-3 w-3 mr-1" />
                Move
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {allowedToStatuses.map((s: TaskStatus) => (
                <DropdownMenuItem
                  key={s}
                  onClick={(e) => { e.stopPropagation(); onMoveTo(s); }}
                >
                  <span className={cn("h-2 w-2 rounded-full mr-2", COLUMN_DOT[s])} />
                  {STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 text-muted-foreground ml-auto"
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
