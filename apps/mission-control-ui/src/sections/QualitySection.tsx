import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { QcDashboardView } from "../QcDashboardView";
import { QcRunDetailView } from "../QcRunDetailView";

interface QualitySectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  selectedQcRunId: Id<"qcRuns"> | null;
  setSelectedQcRunId: (id: Id<"qcRuns"> | null) => void;
  onNavigate: (view: MainView) => void;
}

export function QualitySection({
  currentView,
  projectId,
  selectedQcRunId,
  setSelectedQcRunId,
  onNavigate,
}: QualitySectionProps) {
  if (currentView === "qc-dashboard") {
    return (
      <QcDashboardView
        projectId={projectId}
        onRunSelect={(runId) => {
          setSelectedQcRunId(runId);
          onNavigate("qc-runs");
        }}
      />
    );
  }
  if (currentView === "qc-runs" && selectedQcRunId) {
    return (
      <QcRunDetailView
        runId={selectedQcRunId}
        onBack={() => {
          setSelectedQcRunId(null);
          onNavigate("qc-dashboard");
        }}
      />
    );
  }
  return null;
}
