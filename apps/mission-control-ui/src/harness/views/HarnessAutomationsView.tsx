import type { Id } from "../../../../../convex/_generated/dataModel";
import type { MainView } from "../../TopNav";
import { Sparkles } from "lucide-react";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessAutomationsCatalog } from "../components/HarnessAutomationsCatalog";
import { HarnessRepetitiveTasksPanel } from "../components/HarnessRepetitiveTasksPanel";
import { HarnessAutomatePanel } from "../components/HarnessAutomatePanel";

export function HarnessAutomationsView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  return (
    <HarnessPage
      eyebrow="Automate yourself away"
      title="Factory automations"
      description="Daily review, PR comment mining, agentic code owners, continual learning — codify the flywheels Eric runs at Cursor."
      icon={<Sparkles className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[1000px] space-y-8 pb-4">
        <HarnessAutomationsCatalog
          projectId={projectId}
          onScheduled={() => onNavigate("harness-launch")}
        />
        <HarnessRepetitiveTasksPanel />
        <HarnessAutomatePanel projectId={projectId} onNavigate={onNavigate} />
      </div>
    </HarnessPage>
  );
}
