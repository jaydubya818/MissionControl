import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MainView } from "../TopNav";
import { DEMO_APPROVALS, DEMO_EPICS, DEMO_FLEET } from "../controlPlane/demoData";
import { PortfolioDashboard } from "../controlPlane/PortfolioDashboard";
import { FleetCommander } from "../controlPlane/FleetCommander";
import { ApprovalQueue } from "../controlPlane/ApprovalQueue";
import { EpicCommandCenter } from "../controlPlane/EpicCommandCenter";
import type { ControlPlaneMode } from "../controlPlane/types";

interface ControlSectionProps {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
}

const STORAGE_KEY_MODE = "mc.control_plane_mode";

function readPersistedMode(): ControlPlaneMode {
  if (typeof window === "undefined") return "PM";
  return window.localStorage.getItem(STORAGE_KEY_MODE) === "DEV" ? "DEV" : "PM";
}

/**
 * Control plane section: portfolio dashboard, epic command center,
 * agent fleet commander, and human-in-the-loop approval queue.
 * Currently fed by deterministic demo data (see controlPlane/demoData.ts);
 * each view renders a "Demo data" badge until runtime adapters are wired.
 */
export function ControlSection({ currentView, onNavigate }: ControlSectionProps) {
  const [mode, setModeState] = useState<ControlPlaneMode>(readPersistedMode);
  const [selectedEpicKey, setSelectedEpicKey] = useState<string | null>(null);

  function setMode(next: ControlPlaneMode) {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_MODE, next);
    } catch {
      // ignore
    }
  }

  const selectedEpic = useMemo(
    () => DEMO_EPICS.find((e) => e.key === selectedEpicKey) ?? null,
    [selectedEpicKey]
  );

  const modeToggle = (
    <div className="flex items-center rounded-lg border border-[var(--panel-line)] bg-background/60 p-0.5">
      {(["PM", "DEV"] as const).map((m) => (
        <Button
          key={m}
          size="sm"
          variant={mode === m ? "secondary" : "ghost"}
          className="h-6 px-2.5 text-[10px] font-semibold tracking-[0.14em]"
          onClick={() => setMode(m)}
        >
          {m}
        </Button>
      ))}
    </div>
  );

  if (selectedEpic) {
    return (
      <EpicCommandCenter
        epic={selectedEpic}
        fleet={DEMO_FLEET}
        mode={mode}
        modeToggle={modeToggle}
        onBack={() => setSelectedEpicKey(null)}
      />
    );
  }

  switch (currentView) {
    case "control-fleet":
      return <FleetCommander fleet={DEMO_FLEET} modeToggle={modeToggle} onSelectEpic={setSelectedEpicKey} />;
    case "control-approvals":
      return <ApprovalQueue approvals={DEMO_APPROVALS} modeToggle={modeToggle} onSelectEpic={setSelectedEpicKey} />;
    case "control-portfolio":
    default:
      return (
        <PortfolioDashboard
          epics={DEMO_EPICS}
          fleet={DEMO_FLEET}
          approvals={DEMO_APPROVALS}
          mode={mode}
          modeToggle={modeToggle}
          onSelectEpic={setSelectedEpicKey}
          onOpenFleet={() => onNavigate("control-fleet")}
          onOpenApprovals={() => onNavigate("control-approvals")}
        />
      );
  }
}
