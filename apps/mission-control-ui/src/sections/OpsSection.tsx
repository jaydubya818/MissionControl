import { useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { Sidebar } from "../Sidebar";
import { Kanban } from "../Kanban";
import { KanbanFilters } from "../KanbanFilters";
import { LiveFeed } from "../LiveFeed";
import { MissionDAGView } from "../MissionDAGView";
import { CalendarView } from "../CalendarView";
import { ScheduleView } from "../ScheduleView";
import { AuditView } from "../AuditView";
import { TelemetryView } from "../TelemetryView";
import { GoalsView } from "../GoalsView";
import { AutomationsView } from "../automations/AutomationsView";
import { PageHeader } from "../components/PageHeader";
import { TaskboardStats } from "../components/TaskboardStats";
import { resolveTaskWorkOrderScope } from "../components/taskWorkOrderScope";
import { Button } from "@/components/ui/button";
import { LoopDetectionPanel } from "../LoopDetectionPanel";
import { FileUp, Plus, PauseCircle, ShieldCheck, TriangleAlert, Users, X } from "lucide-react";

export interface OpsSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  taskCount: number;
  onTaskSelect: (taskId: Id<"tasks">) => void;
  liveFeedExpanded: boolean;
  onToggleLiveFeed: () => void;
  kanbanFilters: { agents: string[]; priorities: number[]; types: string[] };
  onFiltersChange: (f: { agents: string[]; priorities: number[]; types: string[] }) => void;
  sidebarSelectedAgentId: Id<"agents"> | null;
  onAgentSelect: (agentId: Id<"agents">) => void;
  onSidebarWidthChange: (w: number) => void;
  onOpenApprovals: () => void;
  onOpenPolicy: () => void;
  onOpenOperatorControls: () => void;
  onOpenNotifications: () => void;
  onOpenStandup: () => void;
  onPauseSquad: () => void;
  onResumeSquad: () => void;
  onOpenImportPrd: () => void;
  onNavigate: (view: MainView) => void;
  onNewTask?: () => void;
}

export function OpsSection({
  currentView,
  projectId,
  taskCount,
  onTaskSelect,
  liveFeedExpanded,
  onToggleLiveFeed,
  kanbanFilters,
  onFiltersChange,
  sidebarSelectedAgentId: _sidebarSelectedAgentId,
  onAgentSelect,
  onSidebarWidthChange,
  onOpenApprovals,
  onOpenPolicy,
  onOpenOperatorControls,
  onOpenNotifications,
  onOpenStandup,
  onPauseSquad,
  onResumeSquad,
  onOpenImportPrd,
  onNavigate,
  onNewTask,
}: OpsSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedWorkOrderId = currentView === "tasks" ? searchParams.get("workOrder") : null;
  const scopedWorkOrders = useQuery(
    api.workOrders.list,
    requestedWorkOrderId && projectId ? { projectId, limit: 500 } : "skip",
  );
  const taskWorkOrderScope = resolveTaskWorkOrderScope(
    requestedWorkOrderId,
    scopedWorkOrders,
  );
  const scopedWorkOrderId = taskWorkOrderScope.status === "FOUND"
    ? taskWorkOrderScope.workOrder._id as Id<"workOrders">
    : null;
  const clearWorkOrderScope = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("workOrder");
    setSearchParams(next, { replace: true });
  };

  if (currentView === "tasks") {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
        <Sidebar
          projectId={projectId}
          onOpenApprovals={onOpenApprovals}
          onOpenPolicy={onOpenPolicy}
          onOpenOperatorControls={onOpenOperatorControls}
          onOpenNotifications={onOpenNotifications}
          onOpenStandup={onOpenStandup}
          onPauseSquad={onPauseSquad}
          onResumeSquad={onResumeSquad}
          onAgentSelect={onAgentSelect}
          onWidthChange={onSidebarWidthChange}
        />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PageHeader
            title="Tasks"
            description="Kanban execution board for Tasks across active Work Orders."
            actions={
              <div className="flex items-center gap-2">
                {onNewTask && (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={onNewTask}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New task
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenImportPrd}
                  className="h-8 gap-1.5 text-xs font-medium border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Import PRD
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPauseSquad}
                  className="h-8 gap-1.5 text-xs font-medium border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 hover:border-amber-400/50"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  Pause Squad
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenStandup}
                  className="h-8 gap-1.5 text-xs font-medium"
                >
                  <Users className="h-3.5 w-3.5" />
                  Standup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenPolicy}
                  className="h-8 gap-1.5 text-xs font-medium border-slate-500/50 hover:border-slate-400"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Policy
                </Button>
              </div>
            }
          />
          {taskWorkOrderScope.status === "FOUND" ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-info/25 bg-info/10 px-4 py-2 text-xs" role="status">
              <span className="font-medium text-ink">Scoped to {taskWorkOrderScope.workOrder.title}</span>
              <span className="text-ink-muted">Only Tasks linked to this WorkOrder are shown.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 px-2 text-xs"
                onClick={clearWorkOrderScope}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear WorkOrder filter
              </Button>
            </div>
          ) : null}
          {taskWorkOrderScope.status === "LOADING" ? (
            <div className="flex flex-1 flex-col gap-3 p-6" aria-label="Loading WorkOrder task scope">
              <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
              <div className="h-32 w-full animate-pulse rounded-xl bg-surface-2" />
            </div>
          ) : taskWorkOrderScope.status === "UNAVAILABLE" ? (
            <div className="m-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-warning/35 bg-warning/10 p-8 text-center" role="alert">
              <TriangleAlert className="h-6 w-6 text-warning" aria-hidden />
              <h2 className="mt-3 text-sm font-semibold text-ink">WorkOrder unavailable</h2>
              <p className="mt-1 max-w-lg text-xs text-ink-secondary">
                This WorkOrder does not exist in the selected workspace or is no longer accessible. No unfiltered Tasks were shown.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearWorkOrderScope}>
                Clear WorkOrder filter
              </Button>
            </div>
          ) : (
            <>
              <TaskboardStats projectId={projectId} workOrderId={scopedWorkOrderId} />
              <KanbanFilters
                projectId={projectId}
                currentUserId="operator"
                filters={kanbanFilters}
                onFiltersChange={onFiltersChange}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <Kanban
                  projectId={projectId}
                  workOrderId={scopedWorkOrderId}
                  onSelectTask={onTaskSelect}
                  filters={kanbanFilters}
                />
                {!scopedWorkOrderId ? (
                  <LoopDetectionPanel projectId={projectId} onTaskSelect={onTaskSelect} />
                ) : null}
              </div>
            </>
          )}
        </section>
        <LiveFeed
          projectId={projectId}
          expanded={liveFeedExpanded}
          onToggle={onToggleLiveFeed}
          onTaskSelect={onTaskSelect}
          onExecutionSelect={() => onNavigate("control-work-orders")}
        />
      </div>
    );
  }

  if (currentView === "goals") {
    return (
      <GoalsView
        projectId={projectId}
        onTaskSelect={(taskId) => {
          onTaskSelect(taskId);
          onNavigate("tasks");
        }}
      />
    );
  }

  if (currentView === "dag") {
    return (
      <MissionDAGView
        projectId={projectId}
        onTaskSelect={(taskId) => {
          onTaskSelect(taskId);
          onNavigate("tasks");
        }}
      />
    );
  }

  if (currentView === "calendar") return <CalendarView projectId={projectId} />;
  if (currentView === "automations" || currentView === "automation-runs") {
    return <AutomationsView projectId={projectId} forceRuns={currentView === "automation-runs"} />;
  }
  if (currentView === "ops-schedule") {
    return (
      <ScheduleView
        projectId={projectId}
        onNavigate={onNavigate}
        onTaskSelect={onTaskSelect}
      />
    );
  }
  if (currentView === "audit") return <AuditView projectId={projectId} />;
  if (currentView === "telemetry") return <TelemetryView projectId={projectId} />;
  return null;
}
