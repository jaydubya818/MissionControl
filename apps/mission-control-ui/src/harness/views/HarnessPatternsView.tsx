import { useState } from "react";
import { Brain } from "lucide-react";
import type { MainView } from "../../TopNav";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { FactoryTabBar } from "@/components/factory/FactoryPageLayout";
import { HarnessEnablementLadder } from "../components/HarnessEnablementLadder";
import { HarnessPatternCategories } from "../components/HarnessPatternCategories";
import {
  HarnessCollaborationModes,
  HarnessTechMaturityStack,
  HarnessAdoptionMetrics,
  HarnessScalingPlaybook,
  HarnessPatternsPrinciples,
  HarnessHiringSignals,
} from "../components/HarnessPatternsExtras";
import { Button } from "@/components/ui/button";

const TABS = [
  { id: "enablement", label: "Enablement" },
  { id: "patterns", label: "Patterns index" },
  { id: "scale", label: "Scale & ROI" },
  { id: "people", label: "People" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HarnessPatternsView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  const [tab, setTab] = useState<TabId>("enablement");

  return (
    <HarnessPage
      eyebrow="Patrick Debois · AI Native Dev"
      title="AI Patterns & org enablement"
      description="Agent → team → platform → org. Continuous learning compounds — measure shared-system contribution, not token billionaires."
      icon={<Brain className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[1100px] space-y-6 pb-4">
        <HarnessPatternsPrinciples />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FactoryTabBar tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="Patterns sections" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate("registry-inventory")}>
              Skill inventory
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-meta-loop")}>
              Meta loop
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-team-pulse")}>
              Team pulse
            </Button>
          </div>
        </div>

        {tab === "enablement" && (
          <>
            <HarnessEnablementLadder activeLevel="platform" />
            <HarnessCollaborationModes />
            <HarnessTechMaturityStack />
          </>
        )}
        {tab === "patterns" && <HarnessPatternCategories highlightId="platform" />}
        {tab === "scale" && (
          <>
            <HarnessAdoptionMetrics projectId={projectId} />
            <HarnessScalingPlaybook />
          </>
        )}
        {tab === "people" && (
          <>
            <HarnessHiringSignals />
            <HarnessPatternCategories highlightId="changing-roles" />
          </>
        )}

        <div className="rounded-xl border border-registry-accent/20 bg-registry-accent-soft/30 px-4 py-3 text-[13px] text-ink-secondary">
          <strong className="text-ink">Start small:</strong> find one success story team, force the next cadence jump
          (context in repo → tests), then share via lunch &amp; learn. Platform unlocks multiplayer — registry and
          centralized evals are the compounding layer.
        </div>
      </div>
    </HarnessPage>
  );
}
