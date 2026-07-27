import { useState } from "react";
import { Compass } from "lucide-react";
import type { MainView } from "../../TopNav";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { FlowStageId } from "@/lib/harnessArchitect";
import { HarnessPage } from "../components/HarnessUi";
import { FactoryTabBar } from "@/components/factory/FactoryPageLayout";
import { HarnessArchitectFlow } from "../components/HarnessArchitectFlow";
import { HarnessMergeGatesPanel } from "../components/HarnessMergeGatesPanel";
import { HarnessExecutableConstraints } from "../components/HarnessExecutableConstraints";
import { HarnessArchitectMetrics, HarnessTriageDemoPanel } from "../components/HarnessArchitectMetrics";
import {
  HarnessArchitectPrinciples,
  HarnessSupplyChainPanel,
  HarnessTestPyramid,
} from "../components/HarnessArchitectExtras";
import { Button } from "@/components/ui/button";

const TABS = [
  { id: "flow", label: "Architect flow" },
  { id: "gates", label: "Merge gates" },
  { id: "constraints", label: "Constraints" },
  { id: "policy", label: "Supply chain" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HarnessArchitectView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  const [tab, setTab] = useState<TabId>("flow");
  const [flowStage] = useState<FlowStageId>("plan-loop");

  return (
    <HarnessPage
      eyebrow="Paul Stack · Swamp Club"
      title="Architect, don't code"
      description="Humans own architecture and invariants — agents write every line. Build the machine that writes the code."
      icon={<Compass className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[1100px] space-y-6 pb-4">
        <HarnessArchitectPrinciples />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FactoryTabBar tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="Architect sections" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-change-review")}>
              Change review
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-meta-loop")}>
              Meta loop
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("tasks")}>
              Triage queue
            </Button>
          </div>
        </div>

        <HarnessTriageDemoPanel />
        <HarnessArchitectMetrics projectId={projectId} />

        {tab === "flow" && (
          <>
            <HarnessArchitectFlow activeStage={flowStage} />
            <HarnessTestPyramid />
          </>
        )}
        {tab === "gates" && <HarnessMergeGatesPanel projectId={projectId} />}
        {tab === "constraints" && <HarnessExecutableConstraints />}
        {tab === "policy" && <HarnessSupplyChainPanel />}

        <div className="rounded-xl border border-registry-accent/20 bg-registry-accent-soft/30 px-4 py-3 text-[13px] text-ink-secondary">
          <strong className="text-ink">Getting started:</strong> encode one tribal-knowledge constraint, run the loop
          once end-to-end, fix where it breaks — repeat. Context is the new code; intent is the new architecture.
        </div>
      </div>
    </HarnessPage>
  );
}
