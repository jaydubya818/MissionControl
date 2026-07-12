import { CommandCenterView } from "./views/CommandCenterView";
import { MissionPortfolioView } from "./views/MissionPortfolioView";
import { MissionDetailView } from "./views/MissionDetailView";
import { TraceInspectorView } from "./views/TraceInspectorView";
import { EffectivenessView } from "./views/EffectivenessView";
import { FactoryHealthView } from "./views/FactoryHealthView";
import { ReadinessView } from "./views/ReadinessView";
import { FrictionView } from "./views/FrictionView";
import { AgentCatalogView } from "./views/AgentCatalogView";
import { DossierView } from "./views/DossierView";
import { RecommendationsView } from "./views/RecommendationsView";
import { DemoTourBar } from "./components";
import { SkillDetailView } from "./views/SkillDetailView";

export const EOS_VIEWS = [
  "command-center", "missions", "mission-detail", "trace-inspector",
  "effectiveness", "factory-health", "readiness", "friction",
  "agent-catalog", "dossier", "recommendations", "skill-detail",
] as const;

export type EosView = (typeof EOS_VIEWS)[number];

export function isEosView(view: string): view is EosView {
  return (EOS_VIEWS as readonly string[]).includes(view);
}

export function EosViewRenderer({ view, onNavigate }: { view: EosView; onNavigate: (v: string) => void }): JSX.Element {
  return (
    <>
      <EosViewBody view={view} onNavigate={onNavigate} />
      <DemoTourBar currentView={view} onNavigate={onNavigate} />
    </>
  );
}

function EosViewBody({ view, onNavigate }: { view: EosView; onNavigate: (v: string) => void }): JSX.Element {
  switch (view) {
    case "command-center": return <CommandCenterView onNavigate={onNavigate} />;
    case "missions": return <MissionPortfolioView onNavigate={onNavigate} />;
    case "mission-detail": return <MissionDetailView onNavigate={onNavigate} />;
    case "trace-inspector": return <TraceInspectorView onNavigate={onNavigate} />;
    case "effectiveness": return <EffectivenessView onNavigate={onNavigate} />;
    case "factory-health": return <FactoryHealthView onNavigate={onNavigate} />;
    case "readiness": return <ReadinessView onNavigate={onNavigate} />;
    case "friction": return <FrictionView onNavigate={onNavigate} />;
    case "agent-catalog": return <AgentCatalogView onNavigate={onNavigate} />;
    case "dossier": return <DossierView onNavigate={onNavigate} />;
    case "recommendations": return <RecommendationsView onNavigate={onNavigate} />;
    case "skill-detail": return <SkillDetailView onNavigate={onNavigate} />;
  }
}
