import { EosViewRenderer, isEosView } from "../eos/EosSection";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { SystemView } from "../SystemView";
import { RadarView } from "../RadarView";
import { FactoryView } from "../FactoryView";
import { PipelineView } from "../PipelineView";
import { FeedbackView } from "../FeedbackView";
import { AnalyticsView } from "../AnalyticsView";

export interface PlatformSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
  onOpenHealthDashboard?: () => void;
  onOpenMonitoringDashboard?: () => void;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

export function PlatformSection({
  currentView,
  projectId,
  onNavigate,
  onOpenHealthDashboard,
  onOpenMonitoringDashboard,
  onTaskSelect,
}: PlatformSectionProps) {
  if (isEosView(currentView)) return <EosViewRenderer view={currentView} onNavigate={onNavigate as (v: string) => void} />;
  if (currentView === "system") {
    return (
      <SystemView
        projectId={projectId}
        onNavigate={onNavigate}
        onOpenHealthDashboard={onOpenHealthDashboard}
        onOpenMonitoringDashboard={onOpenMonitoringDashboard}
      />
    );
  }
  if (currentView === "radar") {
    return (
      <RadarView
        projectId={projectId}
        onNavigate={onNavigate}
        onTaskSelect={onTaskSelect}
      />
    );
  }
  if (currentView === "factory") {
    return (
      <FactoryView
        projectId={projectId}
        onNavigate={onNavigate}
      />
    );
  }
  if (currentView === "pipeline") {
    return (
      <PipelineView
        projectId={projectId}
        onNavigate={onNavigate}
      />
    );
  }
  if (currentView === "feedback") {
    return <FeedbackView projectId={projectId} onNavigate={onNavigate} />;
  }
  if (currentView === "analytics") {
    return <AnalyticsView />;
  }
  return null;
}
