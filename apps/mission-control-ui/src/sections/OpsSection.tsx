import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { Sidebar } from "../Sidebar";
import { Kanban } from "../Kanban";
import { KanbanFilters } from "../KanbanFilters";
import { LiveFeed } from "../LiveFeed";
import { MissionDAGView } from "../MissionDAGView";
import { CalendarView } from "../CalendarView";
import { AuditView } from "../AuditView";
import { TelemetryView } from "../TelemetryView";
import { PageHeader } from "../components/PageHeader";
import { Button } from "@/components/ui/button";
import { LoopDetectionPanel } from "../LoopDetectionPanel";

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
}: OpsSectionProps) {
  if (currentView === "tasks") {
    return (
      <>
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
        <main className="flex flex-1 flex-col overflow-auto">
          <PageHeader
            title="Mission Queue"
            description={`${taskCount} tasks across all states`}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onOpenImportPrd}>
                  Import PRD
                </Button>
                <Button variant="outline" size="sm" onClick={onPauseSquad}>
                  Pause Squad
                </Button>
                <Button variant="outline" size="sm" onClick={onOpenStandup}>
                  Standup
                </Button>
                <Button variant="outline" size="sm" onClick={onOpenPolicy}>
                  Policy
                </Button>
              </div>
            }
          />
          <LoopDetectionPanel projectId={projectId} onTaskSelect={onTaskSelect} />
          <KanbanFilters
            projectId={projectId}
            currentUserId="operator"
            filters={kanbanFilters}
            onFiltersChange={onFiltersChange}
          />
          <Kanban
            projectId={projectId}
            onSelectTask={onTaskSelect}
            filters={kanbanFilters}
          />
        </main>
        <LiveFeed
          projectId={projectId}
          expanded={liveFeedExpanded}
          onToggle={onToggleLiveFeed}
        />
      </>
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
  if (currentView === "audit") return <AuditView projectId={projectId} />;
  if (currentView === "telemetry") return <TelemetryView projectId={projectId} />;
  return null;
}
