import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { isHarnessView, type HarnessView } from "./harnessViews";
import { HarnessFactoryHealthView } from "./views/HarnessFactoryHealthView";
import { HarnessLoopsView } from "./views/HarnessLoopsView";
import { HarnessControlPlaneView } from "./views/HarnessControlPlaneView";
import { HarnessWorkLedgerView } from "./views/HarnessWorkLedgerView";
import { HarnessVerifiersView } from "./views/HarnessVerifiersView";
import { HarnessChangeReviewView } from "./views/HarnessChangeReviewView";
import { HarnessChangeRiskView } from "./views/HarnessChangeRiskView";
import { HarnessLaunchView } from "./views/HarnessLaunchView";
import { HarnessMetaLoopView } from "./views/HarnessMetaLoopView";
import { HarnessTeamPulseView } from "./views/HarnessTeamPulseView";
import { HarnessBuilderView } from "./views/HarnessBuilderView";
import { HarnessMaintenanceView } from "./views/HarnessMaintenanceView";
import { HarnessWorkshopView } from "./views/HarnessWorkshopView";
import { HarnessAutomationsView } from "./views/HarnessAutomationsView";
import { HarnessAgentFleetView } from "./views/HarnessAgentFleetView";
import { HarnessSoftwareFactoryView } from "./views/HarnessSoftwareFactoryView";
import { HarnessArchitectView } from "./views/HarnessArchitectView";
import { HarnessPatternsView } from "./views/HarnessPatternsView";
import { HarnessCodeReviewWizardView } from "./views/HarnessCodeReviewWizardView";

export { isHarnessView, HARNESS_VIEWS } from "./harnessViews";
export type { HarnessView } from "./harnessViews";

interface HarnessSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}

export function HarnessSection({ currentView, projectId, onNavigate }: HarnessSectionProps): JSX.Element | null {
  if (!isHarnessView(currentView)) return null;

  switch (currentView) {
    case "harness-software-factory":
      return <HarnessSoftwareFactoryView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-workshop":
      return <HarnessWorkshopView />;
    case "harness-automations":
      return <HarnessAutomationsView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-agent-fleet":
      return <HarnessAgentFleetView projectId={projectId} />;
    case "harness-architect":
      return <HarnessArchitectView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-patterns":
      return <HarnessPatternsView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-health":
      return <HarnessFactoryHealthView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-loops":
      return <HarnessLoopsView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-control-plane":
      return <HarnessControlPlaneView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-work-ledger":
      return <HarnessWorkLedgerView projectId={projectId} />;
    case "harness-verifiers":
      return <HarnessVerifiersView projectId={projectId} />;
    case "harness-change-review":
      return <HarnessChangeReviewView projectId={projectId} />;
    case "harness-change-risk":
      return <HarnessChangeRiskView projectId={projectId} />;
    case "harness-launch":
      return <HarnessLaunchView projectId={projectId} />;
    case "harness-meta-loop":
      return <HarnessMetaLoopView projectId={projectId} onNavigate={onNavigate} />;
    case "harness-team-pulse":
      return <HarnessTeamPulseView projectId={projectId} />;
    case "harness-builder":
      return <HarnessBuilderView onNavigate={onNavigate} />;
    case "harness-maintenance":
      return <HarnessMaintenanceView />;
    case "harness-code-review-wizard":
      return <HarnessCodeReviewWizardView onNavigate={onNavigate} projectId={projectId} />;
    default: {
      const _exhaustive: never = currentView;
      return _exhaustive;
    }
  }
}
