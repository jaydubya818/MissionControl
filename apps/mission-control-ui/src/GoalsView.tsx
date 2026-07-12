import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/factory/badges";
import { MetricBlock } from "@/components/factory/MetricBlock";
import {
  Target,
  Building2,
  Users,
  Bot,
  ClipboardList,
  ChevronRight,
  Plus,
  type LucideIcon,
} from "lucide-react";

interface GoalsViewProps {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

type GoalLevel = "COMPANY" | "TEAM" | "AGENT" | "TASK";
type GoalStatus = "PLANNED" | "ACTIVE" | "ACHIEVED" | "CANCELLED";

const LEVEL_CONFIG: Record<GoalLevel, { label: string; icon: LucideIcon }> = {
  COMPANY: { label: "Company", icon: Building2 },
  TEAM: { label: "Team", icon: Users },
  AGENT: { label: "Agent", icon: Bot },
  TASK: { label: "Task", icon: ClipboardList },
};

const STATUS_CONFIG: Record<GoalStatus, { label: string; badge: string }> = {
  PLANNED: { label: "Planned", badge: "border-line bg-surface-2 text-ink-secondary" },
  ACTIVE: { label: "Active", badge: "border-transparent bg-info-soft text-info-accent" },
  ACHIEVED: { label: "Achieved", badge: "border-transparent bg-ok-soft text-ok" },
  CANCELLED: { label: "Cancelled", badge: "border-transparent bg-err-soft text-err" },
};

// ============================================================================
// CREATE GOAL MODAL
// ============================================================================

interface CreateGoalModalProps {
  projectId: Id<"projects">;
  parentGoalId?: Id<"goals">;
  defaultLevel: GoalLevel;
  onClose: () => void;
}

function CreateGoalModal({ projectId, parentGoalId, defaultLevel, onClose }: CreateGoalModalProps) {
  const createGoal = useMutation(api.goals.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<GoalLevel>(defaultLevel);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createGoal({
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        level,
        parentGoalId,
      });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-line bg-surface-3 p-6 shadow-[var(--shadow-elevation-2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-ink mb-4">
          {parentGoalId ? "Add Sub-Goal" : "Create Goal"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-[12.5px] font-medium text-ink-secondary mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Reach $1M ARR by Q3"
              className="w-full h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why does this goal matter?"
              rows={3}
              className="w-full rounded-lg border border-line bg-surface-1 px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink-secondary mb-1">Level</label>
            <div className="flex gap-1 rounded-lg border border-line p-0.5 w-fit">
              {(["COMPANY", "TEAM", "AGENT", "TASK"] as GoalLevel[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150",
                    level === l
                      ? "bg-surface-2 text-ink"
                      : "text-ink-secondary hover:text-ink"
                  )}
                >
                  {LEVEL_CONFIG[l].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-lg border border-line text-[13px] font-medium text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || saving}
            className="h-9 px-3 rounded-lg bg-act text-act-ink text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-colors duration-150"
          >
            {saving ? "Creating..." : "Create Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GOAL NODE (recursive tree)
// ============================================================================

interface GoalNodeData {
  _id: Id<"goals">;
  title: string;
  description?: string;
  level: GoalLevel;
  status: GoalStatus;
  progressPct?: number;
  parentGoalId?: Id<"goals">;
  ownerAgentId?: Id<"agents">;
  children: GoalNodeData[];
}

interface GoalNodeProps {
  node: GoalNodeData;
  depth: number;
  projectId: Id<"projects">;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

const TASK_DOT: Record<string, string> = {
  DONE: "bg-ok",
  IN_PROGRESS: "bg-info-accent",
  BLOCKED: "bg-warn",
  FAILED: "bg-err",
};

function GoalNode({ node, depth, projectId, onTaskSelect }: GoalNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const updateGoal = useMutation(api.goals.update);

  const linkedTasks = useQuery(api.goals.getLinkedTasks, { goalId: node._id });
  const levelCfg = LEVEL_CONFIG[node.level];
  const LevelIcon = levelCfg.icon;
  const statusCfg = STATUS_CONFIG[node.status];
  const hasChildren = node.children.length > 0;
  const taskCount = linkedTasks?.length ?? 0;
  const doneCount = linkedTasks?.filter((t) => t.status === "DONE").length ?? 0;

  const nextLevel = (): GoalLevel => {
    if (node.level === "COMPANY") return "TEAM";
    if (node.level === "TEAM") return "AGENT";
    return "TASK";
  };

  const handleStatusCycle = async () => {
    const order: GoalStatus[] = ["PLANNED", "ACTIVE", "ACHIEVED", "CANCELLED"];
    const idx = order.indexOf(node.status);
    const next = order[(idx + 1) % order.length];
    await updateGoal({ goalId: node._id, status: next });
  };

  return (
    <div className={cn("border-l border-line", depth > 0 && "ml-6")}>
      <div
        className={cn(
          "group flex items-start gap-3 px-4 py-3 rounded-lg transition-colors duration-150 cursor-pointer",
          "hover:bg-surface-2",
          showDetail && "bg-surface-2"
        )}
        onClick={() => setShowDetail(!showDetail)}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={cn(
            "mt-0.5 w-5 h-5 flex items-center justify-center rounded text-ink-muted transition-transform duration-150",
            expanded && "rotate-90",
            !hasChildren && taskCount === 0 && "invisible"
          )}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
        </button>

        {/* Level icon */}
        <LevelIcon size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[13.5px] text-ink truncate">{node.title}</span>
            <span className="text-[11.5px] text-ink-muted">
              {levelCfg.label}
            </span>
          </div>

          {showDetail && node.description && (
            <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed">{node.description}</p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1">
            {taskCount > 0 && (
              <span className="text-[11.5px] text-ink-muted">
                {doneCount}/{taskCount} tasks
              </span>
            )}
            {node.progressPct !== undefined && node.progressPct > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ok transition-all duration-150"
                    style={{ width: `${Math.min(100, node.progressPct)}%` }}
                  />
                </div>
                <span className="text-[11.5px] text-ink-muted">{Math.round(node.progressPct)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Status badge */}
        <button
          onClick={(e) => { e.stopPropagation(); handleStatusCycle(); }}
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium leading-none transition-colors duration-150",
            statusCfg.badge
          )}
          title="Click to cycle status"
        >
          {statusCfg.label}
        </button>

        {/* Add sub-goal */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowCreate(true); }}
          className="opacity-0 group-hover:opacity-100 mt-0.5 w-6 h-6 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150"
          title="Add sub-goal"
          aria-label="Add sub-goal"
        >
          <Plus size={14} strokeWidth={1.6} aria-hidden />
        </button>
      </div>

      {/* Linked tasks (when expanded and detail shown) */}
      {expanded && showDetail && linkedTasks && linkedTasks.length > 0 && (
        <div className="ml-14 mb-2 space-y-1">
          {linkedTasks.map((task) => (
            <button
              key={task._id}
              onClick={() => onTaskSelect?.(task._id)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md text-[12.5px] hover:bg-surface-2 transition-colors duration-150"
            >
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                TASK_DOT[task.status] ?? "bg-ink-muted/50"
              )} />
              <span className="text-ink-muted font-mono mr-1">{task.identifier ?? ""}</span>
              <span className="text-ink truncate">{task.title}</span>
              <span className="text-[11.5px] text-ink-muted ml-auto">{task.status}</span>
            </button>
          ))}
        </div>
      )}

      {/* Children */}
      {expanded && node.children.map((child) => (
        <GoalNode
          key={child._id}
          node={child as GoalNodeData}
          depth={depth + 1}
          projectId={projectId}
          onTaskSelect={onTaskSelect}
        />
      ))}

      {showCreate && (
        <CreateGoalModal
          projectId={projectId}
          parentGoalId={node._id}
          defaultLevel={nextLevel()}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// GOALS VIEW (main export)
// ============================================================================

export function GoalsView({ projectId, onTaskSelect }: GoalsViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "ALL">("ALL");

  const hierarchy = useQuery(
    api.goals.getHierarchy,
    projectId ? { projectId } : "skip"
  );

  if (!projectId) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Goals"
          description="Track the hierarchy between company goals, team goals, and task execution."
          icon={<Target className="h-4.5 w-4.5" strokeWidth={1.7} />}
          eyebrow="Operations"
        />
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          <EmptyState
            icon={Target}
            title="No project selected"
            description="Select a project to view goals."
          />
        </div>
      </main>
    );
  }

  const filteredHierarchy = hierarchy?.filter((root) => {
    if (statusFilter === "ALL") return true;
    return root.status === statusFilter;
  });
  const topLevelGoals = hierarchy ?? [];
  const activeGoals = topLevelGoals.filter((goal) => goal.status === "ACTIVE").length;
  const achievedGoals = topLevelGoals.filter((goal) => goal.status === "ACHIEVED").length;
  const plannedGoals = topLevelGoals.filter((goal) => goal.status === "PLANNED").length;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Goals"
        description="Every task should trace back to a real goal. If you cannot explain why it matters, it should not be in the system."
        icon={<Target className="h-4.5 w-4.5" strokeWidth={1.7} />}
        eyebrow="Operations"
        status={
          <StatusBadge tone="neutral">{topLevelGoals.length} top-level goals</StatusBadge>
        }
        actions={
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Target className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.7} />
            New Goal
          </Button>
        }
      />
      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        <div className="grid shrink-0 gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Top level"
              value={topLevelGoals.length}
              detail="Company-level direction currently tracked"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Active"
              value={activeGoals}
              detail="Goals currently driving execution"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Achieved"
              value={achievedGoals}
              detail="Goals that have already closed the loop"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Planned"
              value={plannedGoals}
              detail="Ideas not yet shaping execution"
            />
          </Card>
        </div>

        <Card className="shrink-0 p-4">
          <div className="flex items-center justify-between gap-3 overflow-x-auto flex-nowrap">
            <div>
              <div className="text-[15px] font-semibold text-ink">Goal filters</div>
              <div className="mt-1 text-[12.5px] text-ink-muted">Focus the goal tree by lifecycle state</div>
            </div>
            <div className="flex gap-1 rounded-lg border border-line p-0.5">
              {(["ALL", "ACTIVE", "PLANNED", "ACHIEVED", "CANCELLED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                    statusFilter === s
                      ? "bg-surface-2 text-ink"
                      : "text-ink-secondary hover:text-ink"
                  )}
                >
                  {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {!hierarchy ? (
          <Card className="flex flex-col gap-3 p-6" aria-label="Loading goals">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface-2" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface-2" />
          </Card>
        ) : filteredHierarchy && filteredHierarchy.length === 0 ? (
          <EmptyState
            icon={Target}
            title={statusFilter === "ALL" ? "No goals yet" : `No ${statusFilter.toLowerCase()} goals`}
            description={
              statusFilter === "ALL"
                ? "Start by defining your company mission."
                : undefined
            }
            action={
              statusFilter === "ALL" ? (
                <Button onClick={() => setShowCreate(true)} size="sm">
                  Create First Goal
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="p-4">
              <div className="mb-4">
                <div className="text-[15px] font-semibold text-ink">Goal tree</div>
                <div className="mt-1 text-[12.5px] text-ink-muted">Execution should ladder into strategy</div>
              </div>
              <div className="space-y-1">
                {filteredHierarchy?.map((root) => (
                  <GoalNode
                    key={root._id}
                    node={root as GoalNodeData}
                    depth={0}
                    projectId={projectId}
                    onTaskSelect={onTaskSelect}
                  />
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-[15px] font-semibold text-ink">Operator guidance</div>
              <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
                <p>Goals should stay few, sharp, and causal. If a task cannot trace back to a goal, it is work without a reason.</p>
                <p>Use company goals to set direction, team goals to route ownership, and task goals only when work needs measurable closure.</p>
              </div>
              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                <div className="text-[11.5px] font-medium text-ink-muted">Current mix</div>
                <div className="mt-3 grid gap-2 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Active</span>
                    <span className="font-semibold text-ink">{activeGoals}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Planned</span>
                    <span className="font-semibold text-ink">{plannedGoals}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Achieved</span>
                    <span className="font-semibold text-ink">{achievedGoals}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {showCreate && (
          <CreateGoalModal
            projectId={projectId}
            defaultLevel="COMPANY"
            onClose={() => setShowCreate(false)}
          />
        )}
      </div>
    </main>
  );
}
