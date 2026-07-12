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
import { PageHeader } from "../components/PageHeader";
import { TaskboardStats } from "../components/TaskboardStats";
import { Button } from "@/components/ui/button";
import { LoopDetectionPanel } from "../LoopDetectionPanel";
import { FileUp, Plus, PauseCircle, ShieldCheck, Users } from "lucide-react";

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
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PageHeader
            title="Tasks"
            description="Execution queue for active work orders"
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
          <TaskboardStats projectId={projectId} />
          <KanbanFilters
            projectId={projectId}
            currentUserId="operator"
            filters={kanbanFilters}
            onFiltersChange={onFiltersChange}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Kanban
              projectId={projectId}
              onSelectTask={onTaskSelect}
              filters={kanbanFilters}
            />
            <LoopDetectionPanel projectId={projectId} onTaskSelect={onTaskSelect} />
          </div>
        </main>
        <LiveFeed
          projectId={projectId}
          expanded={liveFeedExpanded}
          onToggle={onToggleLiveFeed}
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
