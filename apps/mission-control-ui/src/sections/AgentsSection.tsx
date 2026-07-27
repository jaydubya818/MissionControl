import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { AgentRegistryView } from "../AgentRegistryView";
import { AtcBoardView } from "../AtcBoardView";
import { DirectoryView } from "../DirectoryView";
import { IdentityDirectoryView } from "../IdentityDirectoryView";
import { PoliciesView } from "../PoliciesView";
import { DeploymentsView } from "../DeploymentsView";
import { GatewaySettingsView } from "../GatewaySettingsView";
import { GatewayInboxView } from "../eos/views/GatewayInboxView";
import { useFlag } from "../hooks/useFlag";
import { SchedulesView } from "../SchedulesView";

interface AgentsSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onNavigateToIdentity?: () => void;
  onNavigateToTask?: (taskId: Id<"tasks">) => void;
  onNavigateToTasks?: () => void;
  onNavigateToAgent?: (agentId: Id<"agents">) => void;
  onOpenCreateAgent?: () => void;
}

export function AgentsSection({
  currentView,
  projectId,
  onNavigateToIdentity,
  onNavigateToTask,
  onNavigateToTasks,
  onNavigateToAgent,
  onOpenCreateAgent,
}: AgentsSectionProps) {
  const eosPreview = useFlag("eos.command-center-preview");
  if (currentView === "atc")
    return (
      <AtcBoardView
        projectId={projectId}
        onNavigateToTask={onNavigateToTask}
        onNavigateToTasks={onNavigateToTasks}
        onNavigateToAgent={onNavigateToAgent}
      />
    );
  if (currentView === "agents") return <AgentRegistryView projectId={projectId} onNavigateToIdentity={onNavigateToIdentity} onOpenCreateAgent={onOpenCreateAgent} />;
  if (currentView === "directory") return <DirectoryView projectId={projectId} />;
  if (currentView === "identity") return <IdentityDirectoryView projectId={projectId} />;
  if (currentView === "policies") return <PoliciesView projectId={projectId} />;
  if (currentView === "deployments") return <DeploymentsView projectId={projectId} />;
  if (currentView === "gateway") {
    return eosPreview ? <GatewayInboxView /> : <GatewaySettingsView />;
  }
  if (currentView === "schedules") return <SchedulesView projectId={projectId} />;
  return null;
}
