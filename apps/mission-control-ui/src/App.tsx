import { useState, useEffect, createContext, useContext } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { type MainView } from "./TopNav";
import { Kanban } from "./Kanban";
import { TaskDrawerTabs } from "./TaskDrawerTabs";
import { Sidebar } from "./Sidebar";
import { LiveFeed } from "./LiveFeed";
import { AppSideNav } from "./components/AppSideNav";
import { AppTopBar } from "./components/AppTopBar";
import { PageHeader } from "./components/PageHeader";
import { Button } from "@/components/ui/button";
import { CreateTaskModal } from "./CreateTaskModal";
import { ApprovalsModal } from "./ApprovalsModal";
import { PolicyModal } from "./PolicyModal";
import { OperatorControlsModal } from "./OperatorControlsModal";
import { NotificationsModal } from "./NotificationsModal";
import { StandupModal } from "./StandupModal";
import { useToast } from "./Toast";
import { SearchBar } from "./SearchBar";
import { AgentDashboard } from "./AgentDashboard";
import { AgentRegistryView } from "./AgentRegistryView";
import { KanbanFilters } from "./KanbanFilters";
import { CostAnalytics } from "./CostAnalytics";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { HealthDashboard } from "./HealthDashboard";
import { MonitoringDashboard } from "./MonitoringDashboard";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcutsHelp, useKeyboardShortcuts } from "./KeyboardShortcuts";
import { DashboardOverview } from "./DashboardOverview";
import { ActivityFeedModal } from "./ActivityFeed";
import { OrgView } from "./OrgView";
import { CalendarView } from "./CalendarView";
import { OfficeView } from "./OfficeView";
import { ProjectsView } from "./ProjectsView";
import { ChatView } from "./ChatView";
import { CouncilView } from "./CouncilView";
import { MemoryView } from "./MemoryView";
import { CapturesView } from "./CapturesView";
import { DocsView } from "./DocsView";
import { PeopleView } from "./PeopleView";
import { MissionDAGView } from "./MissionDAGView";
import { LoopDetectionPanel } from "./LoopDetectionPanel";
import { BudgetBurnDown } from "./BudgetBurnDown";
import { IdentityDirectoryView } from "./IdentityDirectoryView";
import { VoicePanel } from "./VoicePanel";
import { TelegraphInbox } from "./TelegraphInbox";
import { MeetingsView } from "./MeetingsView";

// ============================================================================
// PROJECT CONTEXT
// ============================================================================

interface ProjectContextType {
  projectId: Id<"projects"> | null;
  setProjectId: (id: Id<"projects"> | null) => void;
  project: Doc<"projects"> | null | undefined;
}

const ProjectContext = createContext<ProjectContextType>({
  projectId: null,
  setProjectId: () => {},
  project: null,
});

export function useProject() {
  return useContext(ProjectContext);
}

// ============================================================================
// PROJECT SWITCHER
// ============================================================================

function ProjectSwitcher() {
  const projects = useQuery(api.projects.list);
  const { projectId, setProjectId } = useProject();

  if (!projects) return null;

  return (
    <select
      value={projectId ?? ""}
      onChange={(e) => {
        const value = e.target.value;
        setProjectId(value ? (value as Id<"projects">) : null);
      }}
      className="h-8 rounded-md border border-input bg-secondary px-3 text-sm text-foreground cursor-pointer min-w-[140px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">All Projects</option>
      {projects.map((p) => (
        <option key={p._id} value={p._id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// ============================================================================
// HEADER METRICS
// ============================================================================

function useHeaderMetrics() {
  const { projectId } = useProject();
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const activeCount = agents?.filter((a) => a.status === "ACTIVE").length ?? 0;
  const taskCount = tasks?.length ?? 0;
  return { activeCount, taskCount };
}

export default function App() {
  const [currentView, setCurrentView] = useState<MainView>("tasks");
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showOperatorControls, setShowOperatorControls] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showStandup, setShowStandup] = useState(false);
  const [showAgentDashboard, setShowAgentDashboard] = useState(false);
  const [showCostAnalytics, setShowCostAnalytics] = useState(false);
  const [showBudgetBurnDown, setShowBudgetBurnDown] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [showHealthDashboard, setShowHealthDashboard] = useState(false);
  const [showMonitoringDashboard, setShowMonitoringDashboard] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showDashboardOverview, setShowDashboardOverview] = useState(false);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [liveFeedExpanded, setLiveFeedExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mc.live_feed_expanded") === "1";
  });
  const [kanbanFilters, setKanbanFilters] = useState<{
    agents: string[];
    priorities: number[];
    types: string[];
  }>({ agents: [], priorities: [], types: [] });
  
  // Get current project details
  const project = useQuery(
    api.projects.get,
    projectId ? { projectId } : "skip"
  );
  
  // Auto-select first project if none selected
  const projects = useQuery(api.projects.list);
  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0]._id);
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mc.live_feed_expanded", liveFeedExpanded ? "1" : "0");
  }, [liveFeedExpanded]);
  
  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const { toast } = useToast();
  
  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewTask: () => setShowCreateTask(true),
    onSearch: () => setShowCommandPalette(true),
    onApprovals: () => setShowApprovals(true),
    onAgents: () => setCurrentView("agents"),
  });
  
  // Provide project context
  const projectContextValue = { projectId, setProjectId, project };

  const handlePauseSquad = async () => {
    if (!window.confirm("Pause all ACTIVE agents? They will stop until you resume them.")) return;
    try {
      const result = await pauseAll({ 
        projectId: projectId ?? undefined,
        reason: "Pause squad from Mission Control", 
        userId: "operator" 
      });
      toast(`Paused ${(result as { paused: number }).paused} agent(s)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Pause failed", true);
    }
  };
  
  const handleResumeSquad = async () => {
    try {
      const result = await resumeAll({ 
        projectId: projectId ?? undefined,
        reason: "Resume squad from Mission Control", 
        userId: "operator" 
      });
      toast(`Resumed ${(result as { resumed: number }).resumed} agent(s)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Resume failed", true);
    }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  return (
    <ProjectContext.Provider value={projectContextValue}>
    <AppContent
      currentView={currentView}
      setCurrentView={setCurrentView}
      projectId={projectId}
      selectedTaskId={selectedTaskId}
      setSelectedTaskId={setSelectedTaskId}
      showCreateTask={showCreateTask}
      setShowCreateTask={setShowCreateTask}
      showApprovals={showApprovals}
      setShowApprovals={setShowApprovals}
      showPolicy={showPolicy}
      setShowPolicy={setShowPolicy}
      showOperatorControls={showOperatorControls}
      setShowOperatorControls={setShowOperatorControls}
      showNotifications={showNotifications}
      setShowNotifications={setShowNotifications}
      showStandup={showStandup}
      setShowStandup={setShowStandup}
      showAgentDashboard={showAgentDashboard}
      setShowAgentDashboard={setShowAgentDashboard}
      showCostAnalytics={showCostAnalytics}
      setShowCostAnalytics={setShowCostAnalytics}
      showBudgetBurnDown={showBudgetBurnDown}
      setShowBudgetBurnDown={setShowBudgetBurnDown}
      showAdvancedAnalytics={showAdvancedAnalytics}
      setShowAdvancedAnalytics={setShowAdvancedAnalytics}
      showHealthDashboard={showHealthDashboard}
      setShowHealthDashboard={setShowHealthDashboard}
      showMonitoringDashboard={showMonitoringDashboard}
      setShowMonitoringDashboard={setShowMonitoringDashboard}
      showCommandPalette={showCommandPalette}
      setShowCommandPalette={setShowCommandPalette}
      showKeyboardHelp={showKeyboardHelp}
      setShowKeyboardHelp={setShowKeyboardHelp}
      showDashboardOverview={showDashboardOverview}
      setShowDashboardOverview={setShowDashboardOverview}
      showActivityFeed={showActivityFeed}
      setShowActivityFeed={setShowActivityFeed}
      liveFeedExpanded={liveFeedExpanded}
      setLiveFeedExpanded={setLiveFeedExpanded}
      kanbanFilters={kanbanFilters}
      setKanbanFilters={setKanbanFilters}
      handlePauseSquad={handlePauseSquad}
      handleResumeSquad={handleResumeSquad}
      timeStr={timeStr}
      dateStr={dateStr}
      toast={toast}
    />
    </ProjectContext.Provider>
  );
}

function AppContent({
  currentView,
  setCurrentView,
  projectId,
  selectedTaskId,
  setSelectedTaskId,
  showCreateTask,
  setShowCreateTask,
  showApprovals,
  setShowApprovals,
  showPolicy,
  setShowPolicy,
  showOperatorControls,
  setShowOperatorControls,
  showNotifications,
  setShowNotifications,
  showStandup,
  setShowStandup,
  showAgentDashboard,
  setShowAgentDashboard,
  showCostAnalytics,
  setShowCostAnalytics,
  showBudgetBurnDown,
  setShowBudgetBurnDown,
  showAdvancedAnalytics,
  setShowAdvancedAnalytics,
  showHealthDashboard,
  setShowHealthDashboard,
  showMonitoringDashboard,
  setShowMonitoringDashboard,
  showCommandPalette,
  setShowCommandPalette,
  showKeyboardHelp,
  setShowKeyboardHelp,
  showDashboardOverview,
  setShowDashboardOverview,
  showActivityFeed,
  setShowActivityFeed,
  liveFeedExpanded,
  setLiveFeedExpanded,
  kanbanFilters,
  setKanbanFilters,
  handlePauseSquad,
  handleResumeSquad,
  timeStr,
  dateStr,
  toast,
}: {
  currentView: MainView;
  setCurrentView: (view: MainView) => void;
  projectId: Id<"projects"> | null;
  selectedTaskId: Id<"tasks"> | null;
  setSelectedTaskId: (id: Id<"tasks"> | null) => void;
  showCreateTask: boolean;
  setShowCreateTask: (v: boolean) => void;
  showApprovals: boolean;
  setShowApprovals: (v: boolean) => void;
  showPolicy: boolean;
  setShowPolicy: (v: boolean) => void;
  showOperatorControls: boolean;
  setShowOperatorControls: (v: boolean) => void;
  showNotifications: boolean;
  setShowNotifications: (v: boolean) => void;
  showStandup: boolean;
  setShowStandup: (v: boolean) => void;
  showAgentDashboard: boolean;
  setShowAgentDashboard: (v: boolean) => void;
  showCostAnalytics: boolean;
  setShowCostAnalytics: (v: boolean) => void;
  showBudgetBurnDown: boolean;
  setShowBudgetBurnDown: (v: boolean) => void;
  showAdvancedAnalytics: boolean;
  setShowAdvancedAnalytics: (v: boolean) => void;
  showHealthDashboard: boolean;
  setShowHealthDashboard: (v: boolean) => void;
  showMonitoringDashboard: boolean;
  setShowMonitoringDashboard: (v: boolean) => void;
  showCommandPalette: boolean;
  setShowCommandPalette: (v: boolean) => void;
  showKeyboardHelp: boolean;
  setShowKeyboardHelp: (v: boolean) => void;
  showDashboardOverview: boolean;
  setShowDashboardOverview: (v: boolean) => void;
  showActivityFeed: boolean;
  setShowActivityFeed: (v: boolean) => void;
  liveFeedExpanded: boolean;
  setLiveFeedExpanded: (v: boolean) => void;
  kanbanFilters: {
    agents: string[];
    priorities: number[];
    types: string[];
  };
  setKanbanFilters: (v: { agents: string[]; priorities: number[]; types: string[] }) => void;
  handlePauseSquad: () => void;
  handleResumeSquad: () => void;
  timeStr: string;
  dateStr: string;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { activeCount, taskCount } = useHeaderMetrics();
  const pendingApprovals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 10 } : { limit: 10 });
  
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top Bar */}
      <AppTopBar
        projectSwitcher={<ProjectSwitcher />}
        searchBar={
          <SearchBar
            projectId={projectId ?? undefined}
            onResultClick={(taskId) => {
              setSelectedTaskId(taskId as Id<"tasks">);
            }}
          />
        }
        activeCount={activeCount}
        taskCount={taskCount}
        timeStr={timeStr}
        dateStr={dateStr}
        onNewTask={() => setShowCreateTask(true)}
        onOpenControls={() => setShowOperatorControls(true)}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        onOpenCostAnalytics={() => setShowCostAnalytics(true)}
        onOpenBudgetBurnDown={() => setShowBudgetBurnDown(true)}
        onOpenAdvancedAnalytics={() => setShowAdvancedAnalytics(true)}
        onOpenHealthDashboard={() => setShowHealthDashboard(true)}
        onOpenMonitoringDashboard={() => setShowMonitoringDashboard(true)}
        onOpenDashboardOverview={() => setShowDashboardOverview(true)}
        onOpenActivityFeed={() => setShowActivityFeed(true)}
        onOpenKeyboardHelp={() => setShowKeyboardHelp(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Side Navigation */}
        <AppSideNav
          currentView={currentView}
          onViewChange={setCurrentView}
          onOpenApprovals={() => setShowApprovals(true)}
          onOpenNotifications={() => setShowNotifications(true)}
          pendingApprovals={pendingApprovals?.length ?? 0}
        />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {currentView === "tasks" && (
            <>
              <main className="flex flex-1 flex-col overflow-auto">
                <PageHeader
                  title="Mission Queue"
                  description={`${taskCount} tasks across all states`}
                  actions={
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handlePauseSquad}>
                        Pause Squad
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowStandup(true)}>
                        Standup
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowPolicy(true)}>
                        Policy
                      </Button>
                    </div>
                  }
                />
                <LoopDetectionPanel
                  projectId={projectId}
                  onTaskSelect={(taskId) => setSelectedTaskId(taskId)}
                />
                <KanbanFilters
                  projectId={projectId}
                  currentUserId="operator"
                  filters={kanbanFilters}
                  onFiltersChange={setKanbanFilters}
                />
                <Kanban
                  projectId={projectId}
                  onSelectTask={setSelectedTaskId}
                  filters={kanbanFilters}
                />
              </main>
              <LiveFeed
                projectId={projectId}
                expanded={liveFeedExpanded}
                onToggle={() => setLiveFeedExpanded(!liveFeedExpanded)}
              />
            </>
          )}
          {currentView === "agents" && <AgentRegistryView projectId={projectId} />}
          {currentView === "dag" && (
            <MissionDAGView
              projectId={projectId}
              onTaskSelect={(taskId) => {
                setSelectedTaskId(taskId);
                setCurrentView("tasks");
              }}
            />
          )}
          {currentView === "org" && <OrgView projectId={projectId} />}
          {currentView === "calendar" && <CalendarView projectId={projectId} />}
          {currentView === "office" && <OfficeView projectId={projectId} />}
          {currentView === "projects" && <ProjectsView projectId={projectId} />}
          {currentView === "chat" && <ChatView projectId={projectId} />}
          {currentView === "council" && <CouncilView projectId={projectId} />}
          {currentView === "memory" && <MemoryView projectId={projectId} />}
          {currentView === "captures" && <CapturesView projectId={projectId} />}
          {currentView === "docs" && <DocsView />}
          {currentView === "people" && <PeopleView projectId={projectId} />}
          {currentView === "identity" && <IdentityDirectoryView projectId={projectId} />}
          {currentView === "telegraph" && <TelegraphInbox projectId={projectId} />}
          {currentView === "meetings" && <MeetingsView projectId={projectId} />}
          {currentView === "voice" && <VoicePanel projectId={projectId} />}
          {currentView === "search" && (
            <main className="flex-1 overflow-auto p-6">
              <h2 className="text-foreground mb-4 text-lg font-semibold">Search</h2>
              <SearchBar
                projectId={projectId ?? undefined}
                onResultClick={(taskId) => {
                  setSelectedTaskId(taskId as Id<"tasks">);
                  setCurrentView("tasks");
                }}
              />
            </main>
          )}
        </div>
      </div>
      <TaskDrawerTabs taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {showCreateTask && (
        <CreateTaskModal
          projectId={projectId}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => toast("Task created")}
        />
      )}
      {showApprovals && <ApprovalsModal projectId={projectId} onClose={() => setShowApprovals(false)} />}
      {showPolicy && <PolicyModal onClose={() => setShowPolicy(false)} />}
      {showOperatorControls && (
        <OperatorControlsModal
          projectId={projectId}
          onClose={() => setShowOperatorControls(false)}
        />
      )}
      {showNotifications && (
        <NotificationsModal
          onClose={() => setShowNotifications(false)}
          onSelectTask={setSelectedTaskId}
        />
      )}
      {showStandup && <StandupModal projectId={projectId} onClose={() => setShowStandup(false)} />}
      {showAgentDashboard && (
        <AgentDashboard
          projectId={projectId}
          onClose={() => setShowAgentDashboard(false)}
        />
      )}
      {showCostAnalytics && (
        <CostAnalytics
          projectId={projectId}
          onClose={() => setShowCostAnalytics(false)}
        />
      )}
      {showBudgetBurnDown && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBudgetBurnDown(false);
          }}
        >
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 12,
              width: "min(90vw, 800px)",
              maxHeight: "85vh",
              overflow: "auto",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowBudgetBurnDown(false)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "none",
                border: "none",
                color: "#94a3b8",
                fontSize: "1.5rem",
                cursor: "pointer",
                zIndex: 10,
              }}
            >
              ×
            </button>
            <BudgetBurnDown projectId={projectId} />
          </div>
        </div>
      )}

      {showAdvancedAnalytics && (
        <AnalyticsDashboard
          projectId={projectId}
          onClose={() => setShowAdvancedAnalytics(false)}
        />
      )}
      {showHealthDashboard && (
        <HealthDashboard
          projectId={projectId}
          onClose={() => setShowHealthDashboard(false)}
        />
      )}
      {showMonitoringDashboard && (
        <MonitoringDashboard
          onClose={() => setShowMonitoringDashboard(false)}
        />
      )}
      {showCommandPalette && (
        <CommandPalette
          projectId={projectId}
          onClose={() => setShowCommandPalette(false)}
          onSelectTask={setSelectedTaskId}
          onCreateTask={() => {
            setShowCommandPalette(false);
            setShowCreateTask(true);
          }}
          onOpenApprovals={() => {
            setShowCommandPalette(false);
            setShowApprovals(true);
          }}
          onOpenAgents={() => {
            setShowCommandPalette(false);
            setCurrentView("agents");
          }}
          onOpenControls={() => {
            setShowCommandPalette(false);
            setShowOperatorControls(true);
          }}
        />
      )}
      {showKeyboardHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowKeyboardHelp(false)} />
      )}
      {showDashboardOverview && (
        <DashboardOverview
          projectId={projectId}
          onClose={() => setShowDashboardOverview(false)}
        />
      )}
      {showActivityFeed && (
        <ActivityFeedModal
          projectId={projectId}
          onClose={() => setShowActivityFeed(false)}
        />
      )}
      
      {/* Error Boundary wraps everything */}
    </div>
  );
}
