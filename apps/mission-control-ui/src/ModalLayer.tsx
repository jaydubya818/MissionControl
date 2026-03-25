import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
import type { Modals, ModalKey } from "./hooks/useModalState";
import { Button } from "@/components/ui/button";
import { CreateAgentModal } from "./CreateAgentModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { StartQcRunModal } from "./StartQcRunModal";
import { AlertRulesModal } from "./AlertRulesModal";

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
  onNavigateToGateway?: () => void;
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
  onNavigateToGateway,
}: ModalLayerProps) {
  const registerAgent = useMutation(api.agents.register);

  const handleCreateAgentSubmit = async (form: import("./CreateAgentModal").CreateAgentForm) => {
    const meta: Record<string, string> = {};
    if (form.email) meta.email = form.email;
    if (form.telegram) meta.telegram = form.telegram;
    if (form.whatsapp) meta.whatsapp = form.whatsapp;
    if (form.discord) meta.discord = form.discord;
    try {
      await registerAgent({
        projectId: projectId ?? undefined,
        name: form.name,
        emoji: form.emoji || undefined,
        role: form.role,
        workspacePath: form.workspacePath,
        allowedTaskTypes: form.allowedTaskTypes ? form.allowedTaskTypes.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        allowedTools: form.allowedTools ? form.allowedTools.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        budgetDaily: form.budgetDaily ? Number(form.budgetDaily) : undefined,
        budgetPerRun: form.budgetPerRun ? Number(form.budgetPerRun) : undefined,
        canSpawn: form.canSpawn,
        maxSubAgents: form.canSpawn ? Number(form.maxSubAgents || 0) : 0,
        parentAgentId: undefined,
        metadata: Object.keys(meta).length > 0 ? meta : undefined,
      });
      close("createAgent");
      onToast("Agent created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create agent.";
      onToast(message, true);
      throw err;
    }
  };

  return (
    <>
      {/* ── Pause confirmation (shared Dialog for focus/escape) ── */}
      <Dialog open={modals.pauseConfirm} onOpenChange={(open) => !open && close("pauseConfirm")}>
        <DialogContent
          aria-describedby="pause-confirm-description"
          onPointerDownOutside={() => close("pauseConfirm")}
          onEscapeKeyDown={() => close("pauseConfirm")}
        >
          <DialogHeader>
            <DialogTitle>Pause all active agents?</DialogTitle>
            <DialogDescription id="pause-confirm-description">
              Active agents will stop until resumed. This action can be reversed with Resume.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => close("pauseConfirm")}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={onConfirmPauseSquad}>
              Pause Squad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {modals.startQcRun && (
        <StartQcRunModal
          projectId={projectId}
          onClose={() => close("startQcRun")}
          onStarted={(runId) => onToast(`QC run ${runId} started`)}
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
        <AgentDashboard
          projectId={projectId}
          onClose={() => close("agentDashboard")}
          onSelectAgent={(id) => {
            setSidebarSelectedAgentId(id);
            close("agentDashboard");
            open("agentsFlyout");
          }}
        />
      )}

      {modals.costAnalytics && (
        <CostAnalytics projectId={projectId} onClose={() => close("costAnalytics")} />
      )}

      {modals.createAgent && (
        <CreateAgentModal
          open={modals.createAgent}
          projectId={projectId}
          onClose={() => close("createAgent")}
          onCreate={handleCreateAgentSubmit}
        />
      )}

      {modals.alertRules && (
        <AlertRulesModal projectId={projectId} onClose={() => close("alertRules")} />
      )}

      {modals.budgetBurnDown && (
        <Dialog open onOpenChange={(open) => !open && close("budgetBurnDown")}>
          <DialogContent className="max-w-[800px] max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Budget burn-down</DialogTitle>
            </DialogHeader>
            <BudgetBurnDown projectId={projectId} />
          </DialogContent>
        </Dialog>
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
          onOpenCostAnalytics={() => {
            close("commandPalette");
            open("costAnalytics");
          }}
          onOpenCreateAgent={() => {
            close("commandPalette");
            open("createAgent");
          }}
          onNavigateToGateway={onNavigateToGateway}
          onNavigateView={(view) => {
            close("commandPalette");
            onNavigate(view);
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
