import { useState } from "react";
import { Factory } from "lucide-react";
import { HarnessPage } from "../components/HarnessUi";
import { FactoryTabBar } from "@/components/factory/FactoryPageLayout";
import { HarnessAutonomyLadder } from "../components/HarnessAutonomyLadder";
import { HarnessFactoryChecklist } from "../components/HarnessFactoryChecklist";
import { HarnessAssemblyLine } from "../components/HarnessAssemblyLine";
import { HarnessManagerPrinciples } from "../components/HarnessManagerPrinciples";
import { HarnessFactoryBlueprint } from "../components/HarnessFactoryBlueprint";

const TABS = [
  { id: "vision", label: "Vision" },
  { id: "build", label: "Build" },
  { id: "run", label: "Run" },
  { id: "scale", label: "Scale" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HarnessWorkshopView(): JSX.Element {
  const [tab, setTab] = useState<TabId>("vision");

  return (
    <HarnessPage
      eyebrow="Cursor workshop"
      title="Software factory"
      description="Eric's practical path from pair programmer to dark factory — primitives, guardrails, verifiable systems, and manager mindset."
      icon={<Factory className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[960px] space-y-6 pb-4">
        <FactoryTabBar tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="Workshop sections" />
        {tab === "vision" && (
          <>
            <HarnessAutonomyLadder currentLevel={4} />
            <div className="registry-optimize-block">
              <div>
                <div className="registry-kicker">Why a factory?</div>
                <h3 className="registry-optimize-title">Throughput · Consistency · Taste</h3>
                <p className="registry-optimize-body">
                  Agents run 24/7 with assembly-line outputs. Guardrails restore determinism when models feel probabilistic.
                  You supply intent; the factory supplies code.
                </p>
              </div>
              <HarnessManagerPrinciples />
            </div>
          </>
        )}
        {tab === "build" && (
          <>
            <HarnessFactoryChecklist />
            <HarnessFactoryBlueprint />
          </>
        )}
        {tab === "run" && (
          <>
            <HarnessAssemblyLine activeStage="review" />
            <HarnessManagerPrinciples />
          </>
        )}
        {tab === "scale" && (
          <>
            <HarnessAssemblyLine activeStage="ship" />
            <p className="registry-eval-footnote">
              Nested agent orchestration — managers of managers. Observability beats reading every diff as fleet size grows.
            </p>
            <HarnessFactoryBlueprint />
          </>
        )}
      </div>
    </HarnessPage>
  );
}
