import { useState } from "react";
import { Workflow } from "lucide-react";
import type { MainView } from "../../TopNav";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { FactoryTabBar } from "@/components/factory/FactoryPageLayout";
import { HarnessThreeActors } from "../components/HarnessThreeActors";
import { HarnessSoftwareFactoryDiagram } from "../components/HarnessSoftwareFactoryDiagram";
import { HarnessAdwProgression } from "../components/HarnessAdwProgression";
import { HarnessAdwPrinciples } from "../components/HarnessAdwPrinciples";
import { Button } from "@/components/ui/button";

const TABS = [
  { id: "factory", label: "Software factory" },
  { id: "progression", label: "ADW progression" },
  { id: "principles", label: "Build tips" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HarnessSoftwareFactoryView({
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  const [tab, setTab] = useState<TabId>("factory");

  return (
    <HarnessPage
      eyebrow="IndyDevDan · ADW"
      title="AI developer workflows"
      description="Forget loop engineering — combine engineers, agents, and code into workflows that run through your software factory."
      icon={<Workflow className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FactoryTabBar tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="ADW sections" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-agent-fleet")}>
              Agent fleet
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("tasks")}>
              Kanban
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-launch")}>
              Launch ADW
            </Button>
          </div>
        </div>

        <HarnessThreeActors />

        {tab === "factory" && <HarnessSoftwareFactoryDiagram />}
        {tab === "progression" && <HarnessAdwProgression />}
        {tab === "principles" && <HarnessAdwPrinciples />}

        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-secondary">
          <strong className="text-ink">Agentic layer, not app layer.</strong> Meta-engineering on the factory that
          builds your product — template your expertise into repeatable ADWs at absurd scale.
        </div>
      </div>
    </HarnessPage>
  );
}
