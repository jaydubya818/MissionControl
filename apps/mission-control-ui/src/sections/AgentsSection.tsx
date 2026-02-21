import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { AgentRegistryView } from "../AgentRegistryView";
import { DirectoryView } from "../DirectoryView";
import { IdentityDirectoryView } from "../IdentityDirectoryView";
import { PoliciesView } from "../PoliciesView";
import { DeploymentsView } from "../DeploymentsView";
import { MemoryView } from "../MemoryView";

interface AgentsSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
}

export function AgentsSection({ currentView, projectId }: AgentsSectionProps) {
  if (currentView === "agents") return <AgentRegistryView projectId={projectId} />;
  if (currentView === "directory") return <DirectoryView projectId={projectId} />;
  if (currentView === "identity") return <IdentityDirectoryView projectId={projectId} />;
  if (currentView === "policies") return <PoliciesView projectId={projectId} />;
  if (currentView === "deployments") return <DeploymentsView projectId={projectId} />;
  if (currentView === "memory") return <MemoryView projectId={projectId} />;
  return null;
}
