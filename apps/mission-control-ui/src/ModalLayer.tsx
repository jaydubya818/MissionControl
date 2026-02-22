import type { Id } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
import type { Modals, ModalKey } from "./hooks/useModalState";
import { Button } from "@/components/ui/button";
import { CreateTaskModal } from "./CreateTaskModal";
import { ApprovalsModal } from "./ApprovalsModal";
import { PolicyModal } from "./PolicyModal";
import { OperatorControlsModal } from "./OperatorControlsModal";
import { NotificationsModal } from "./NotificationsModal";
import { StandupModal } from "./StandupModal";
import { AgentDashboard } from "./AgentDashboard";
import { CostAnalytics } from "./CostAnalytics";
import { BudgetBurnDown } from "./BudgetBurnDown";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { HealthDashboard } from "./HealthDashboard";
import { MonitoringDashboard } from "./MonitoringDashboard";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcutsHelp } from "./KeyboardShortcuts";
import { ActivityFeedModal } from "./ActivityFeed";
import { AgentsFlyout } from "./AgentsFlyout";
import { AgentDetailFlyout } from "./AgentDetailFlyout";
import { MissionModal } from "./MissionModal";
import { MissionSuggestionsDrawer } from "./MissionSuggestionsDrawer";
import { ImportPrdModal } from "./ImportPrdModal";

// ============================================================================
// MODAL LAYER
// Renders all floating overlays — modals, flyouts, drawers — in a single
// declarative component, keeping App.tsx free of modal JSX.
// ============================================================================

interface ModalLayerProps {
  projectId: Id<"projects"> | null;
  modals: Modals;
  open: (key: ModalKey) => void;
  close: (key: ModalKey) => void;
  selectedTaskId: Id<"tasks"> | null;
  setSelectedTaskId: (id: Id<"tasks"> | null) => void;
  sidebarSelectedAgentId: Id<"agents"> | null;
  setSidebarSelectedAgentId: (id: Id<"agents"> | null) => void;
  sidebarWidth: number;
  onNavigate: (view: MainView) => void;
  onConfirmPauseSquad: () => void;
  onResumeSquad: () => void;
  onToast: (msg: string, error?: boolean) => void;
}

export function ModalLayer({
  projectId,
  modals,
  open,
  close,
  selectedTaskId: _selectedTaskId,
  setSelectedTaskId,
  sidebarSelectedAgentId,
  setSidebarSelectedAgentId,
  sidebarWidth,
  onNavigate,
  onConfirmPauseSquad,
  onResumeSquad,
  onToast,
}: ModalLayerProps) {
  return (
    <>
      {/* ── Pause confirmation dialog ── */}
      {modals.pauseConfirm && (
        <>
          <div
            className="fixed inset-0 z-[1000] bg-black/50"
            onClick={() => close("pauseConfirm")}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm pause squad"
            className="fixed left-1/2 top-1/2 z-[1001] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-foreground">
              Pause all active agents?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Active agents will stop until resumed. This action can be reversed with Resume.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => close("pauseConfirm")}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={onConfirmPauseSquad}>
                Pause Squad
              </Button>
            </div>
          </div>
        </>
      )}

      {modals.createTask && (
        <CreateTaskModal
          projectId={projectId}
          onClose={() => close("createTask")}
          onCreated={() => onToast("Task created")}
        />
      )}

      {modals.importPrd && (
        <ImportPrdModal
          projectId={projectId}
          onClose={() => close("importPrd")}
          onCreated={(count) => onToast(`${count} tasks created from PRD`)}
        />
      )}

      {modals.approvals && (
        <ApprovalsModal projectId={projectId} onClose={() => close("approvals")} />
      )}

      {modals.policy && <PolicyModal onClose={() => close("policy")} />}

      {modals.operatorControls && (
        <OperatorControlsModal
          projectId={projectId}
          onClose={() => close("operatorControls")}
        />
      )}

      {modals.notifications && (
        <NotificationsModal
          onClose={() => close("notifications")}
          onSelectTask={setSelectedTaskId}
        />
      )}

      {modals.standup && (
        <StandupModal projectId={projectId} onClose={() => close("standup")} />
      )}

      {modals.agentDashboard && (
        <AgentDashboard projectId={projectId} onClose={() => close("agentDashboard")} />
      )}

      {modals.costAnalytics && (
        <CostAnalytics projectId={projectId} onClose={() => close("costAnalytics")} />
      )}

      {modals.budgetBurnDown && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) close("budgetBurnDown");
          }}
        >
          <div className="relative w-[min(90vw,800px)] max-h-[85vh] overflow-auto rounded-xl border border-border bg-background">
            <button
              onClick={() => close("budgetBurnDown")}
              className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground text-xl bg-transparent border-none cursor-pointer"
            >
              &times;
            </button>
            <BudgetBurnDown projectId={projectId} />
          </div>
        </div>
      )}

      {modals.advancedAnalytics && (
        <AnalyticsDashboard
          projectId={projectId}
          onClose={() => close("advancedAnalytics")}
        />
      )}

      {modals.healthDashboard && (
        <HealthDashboard projectId={projectId} onClose={() => close("healthDashboard")} />
      )}

      {modals.monitoringDashboard && (
        <MonitoringDashboard onClose={() => close("monitoringDashboard")} />
      )}

      {modals.commandPalette && (
        <CommandPalette
          projectId={projectId}
          onClose={() => close("commandPalette")}
          onSelectTask={setSelectedTaskId}
          onCreateTask={() => {
            close("commandPalette");
            open("createTask");
          }}
          onOpenApprovals={() => {
            close("commandPalette");
            open("approvals");
          }}
          onOpenAgents={() => {
            close("commandPalette");
            setSidebarSelectedAgentId(null);
            open("agentsFlyout");
          }}
          onOpenControls={() => {
            close("commandPalette");
            open("operatorControls");
          }}
        />
      )}

      {modals.keyboardHelp && (
        <KeyboardShortcutsHelp onClose={() => close("keyboardHelp")} />
      )}

      {modals.activityFeed && (
        <ActivityFeedModal projectId={projectId} onClose={() => close("activityFeed")} />
      )}

      {modals.missionModal && (
        <MissionModal projectId={projectId} onClose={() => close("missionModal")} />
      )}

      {modals.suggestionsDrawer && (
        <MissionSuggestionsDrawer
          projectId={projectId}
          onClose={() => close("suggestionsDrawer")}
        />
      )}

      {modals.agentsFlyout && (
        <AgentsFlyout
          projectId={projectId}
          onClose={() => close("agentsFlyout")}
          onOpenApprovals={() => {
            close("agentsFlyout");
            open("approvals");
          }}
          onOpenPolicy={() => {
            close("agentsFlyout");
            open("policy");
          }}
          onOpenOperatorControls={() => {
            close("agentsFlyout");
            open("operatorControls");
          }}
          onOpenNotifications={() => {
            close("agentsFlyout");
            open("notifications");
          }}
          onOpenStandup={() => {
            close("agentsFlyout");
            open("standup");
          }}
          onPauseSquad={() => open("pauseConfirm")}
          onResumeSquad={onResumeSquad}
          onOpenOrg={(agentId) => {
            window.localStorage.setItem("mc.org.focusAgentId", agentId);
            close("agentsFlyout");
            onNavigate("org");
          }}
        />
      )}

      {sidebarSelectedAgentId && (
        <AgentDetailFlyout
          agentId={sidebarSelectedAgentId}
          onClose={() => setSidebarSelectedAgentId(null)}
          leftOffset={sidebarWidth}
          onEdit={(agentId) => {
            window.localStorage.setItem("mc.org.focusAgentId", agentId);
            setSidebarSelectedAgentId(null);
            onNavigate("org");
          }}
        />
      )}
    </>
  );
}
