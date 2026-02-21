import { useState, useEffect, createContext, useContext, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { type MainView, type CommandSection } from "./TopNav";
import { CommandNav } from "./components/CommandNav";
import { TabBar, type TabItem } from "./components/TabBar";
import { AppTopBar } from "./components/AppTopBar";
import { PageHeader } from "./components/PageHeader";
import { Button } from "@/components/ui/button";

// Views
import { Kanban } from "./Kanban";
import { TaskDrawerTabs } from "./TaskDrawerTabs";
import { Sidebar, SIDEBAR_WIDTH } from "./Sidebar";
import { LiveFeed } from "./LiveFeed";
import { DashboardOverview } from "./DashboardOverview";
import { AgentRegistryView } from "./AgentRegistryView";
import { DirectoryView } from "./DirectoryView";
import { PoliciesView } from "./PoliciesView";
import { DeploymentsView } from "./DeploymentsView";
import { AuditView } from "./AuditView";
import { TelemetryView } from "./TelemetryView";
import { CalendarView } from "./CalendarView";
import { ChatView } from "./ChatView";
import { CouncilView } from "./CouncilView";
import { CapturesView } from "./CapturesView";
import { DocsView } from "./DocsView";
import { MemoryView } from "./MemoryView";
import { MissionDAGView } from "./MissionDAGView";
import { TelegraphInbox } from "./TelegraphInbox";
import { MeetingsView } from "./MeetingsView";
import { VoicePanel } from "./VoicePanel";
import { PeopleView } from "./PeopleView";
import { OrgView } from "./OrgView";
import { OfficeView } from "./OfficeView";
import { ProjectsView } from "./ProjectsView";
import { IdentityDirectoryView } from "./IdentityDirectoryView";
import { ContentPipelineView } from "./ContentPipelineView";
import { CrmView } from "./CrmView";
import { CommandPanel } from "./CommandPanel";
import { CodePipelineView } from "./CodePipelineView";
import { QcDashboardView } from "./QcDashboardView";
import { QcRunDetailView } from "./QcRunDetailView";
import { RecorderView } from "./RecorderView";
import { TestGenerationView } from "./TestGenerationView";
import { ApiImportView } from "./ApiImportView";
import { ExecutionView } from "./ExecutionView";
import { FlakyStepsView } from "./FlakyStepsView";
import { HybridWorkflowView } from "./HybridWorkflowView";
import { ScheduleView } from "./ScheduleView";
import { CodeGenView } from "./CodeGenView";
import { GherkinStudioView } from "./GherkinStudioView";
import { MetricsView } from "./MetricsView";

// Modals & overlays
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
import { KeyboardShortcutsHelp, useKeyboardShortcuts } from "./KeyboardShortcuts";
import { ActivityFeedModal } from "./ActivityFeed";
import { AgentsFlyout } from "./AgentsFlyout";
import { AgentDetailFlyout } from "./AgentDetailFlyout";
import { MissionModal } from "./MissionModal";
import { MissionSuggestionsDrawer } from "./MissionSuggestionsDrawer";
import { useToast } from "./Toast";
import { SearchBar } from "./SearchBar";
import { KanbanFilters } from "./KanbanFilters";
import { LoopDetectionPanel } from "./LoopDetectionPanel";

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

  if (!projects) {
    return (
      <div className="h-8 min-w-[140px] rounded-md border border-input bg-secondary/50 px-3 text-sm text-muted-foreground flex items-center">
        Loading projects...
      </div>
    );
  }

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
// SECTION <-> VIEW MAPPING
// ============================================================================

const SECTION_DEFAULT_VIEW: Record<CommandSection, MainView> = {
  home: "home",
  ops: "tasks",
  agents: "agents",
  chat: "chat",
  content: "content-pipeline",
  comms: "telegraph",
  knowledge: "docs",
  code: "code",
  quality: "qc-dashboard",
};

const SECTION_TABS: Record<CommandSection, TabItem[] | null> = {
  home: null,
  ops: [
    { id: "tasks", label: "Tasks" },
    { id: "dag", label: "DAG" },
    { id: "calendar", label: "Calendar" },
    { id: "audit", label: "Audit" },
    { id: "telemetry", label: "Telemetry" },
  ],
  agents: [
    { id: "agents", label: "Registry" },
    { id: "directory", label: "Directory" },
    { id: "identity", label: "Identities" },
    { id: "policies", label: "Policies" },
    { id: "deployments", label: "Deployments" },
  ],
  chat: [
    { id: "chat", label: "Chat" },
    { id: "council", label: "Council" },
    { id: "command", label: "Command" },
  ],
  content: [
    { id: "content-pipeline", label: "Pipeline" },
    { id: "captures", label: "Captures" },
    { id: "projects", label: "Projects" },
  ],
  comms: [
    { id: "telegraph", label: "Telegraph" },
    { id: "meetings", label: "Meetings" },
    { id: "voice", label: "Voice" },
    { id: "crm", label: "CRM" },
    { id: "people", label: "People" },
    { id: "org", label: "Org Chart" },
    { id: "office", label: "Office" },
  ],
  knowledge: [
    { id: "docs", label: "Knowledge" },
    { id: "memory", label: "Memory" },
    { id: "search", label: "Search" },
  ],
  code: [
    { id: "code", label: "Pipeline" },
    { id: "recorder", label: "Recorder" },
    { id: "test-generation", label: "Tests" },
    { id: "api-import", label: "API Import" },
    { id: "execution", label: "Execution" },
    { id: "flaky-steps", label: "Flaky" },
    { id: "hybrid-workflows", label: "Hybrid" },
    { id: "schedule", label: "Schedule" },
    { id: "codegen", label: "CodeGen" },
    { id: "gherkin", label: "Gherkin" },
    { id: "metrics", label: "Metrics" },
  ],
  quality: [
    { id: "qc-dashboard", label: "Dashboard" },
    { id: "qc-runs", label: "Runs" },
    { id: "qc-config", label: "Config" },
  ],
};

function viewToSection(view: MainView): CommandSection {
  if (view === "home") return "home";
  if (["tasks", "dag", "calendar", "audit", "telemetry"].includes(view)) return "ops";
  if (["agents", "directory", "identity", "policies", "deployments"].includes(view)) return "agents";
  if (["chat", "council", "command"].includes(view)) return "chat";
  if (["captures", "projects", "content-pipeline"].includes(view)) return "content";
  if (["qc-dashboard", "qc-runs", "qc-config"].includes(view)) return "quality";
  if (["telegraph", "meetings", "voice", "people", "org", "office", "crm"].includes(view)) return "comms";
  if (["docs", "search", "memory"].includes(view)) return "knowledge";
  if ([
    "code",
    "recorder",
    "test-generation",
    "api-import",
    "execution",
    "flaky-steps",
    "hybrid-workflows",
    "schedule",
    "codegen",
    "gherkin",
    "metrics",
  ].includes(view)) return "code";
  return "home";
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

// ============================================================================
// PAGE TRANSITION WRAPPER
// ============================================================================

function PageTransition({ children, viewKey }: { children: React.ReactNode; viewKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex flex-1 overflow-hidden"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// APP
// ============================================================================

export default function App() {
  const [currentView, setCurrentView] = useState<MainView>("home");
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [selectedQcRunId, setSelectedQcRunId] = useState<Id<"qcRuns"> | null>(null);
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
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [showAgentsFlyout, setShowAgentsFlyout] = useState(false);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showSuggestionsDrawer, setShowSuggestionsDrawer] = useState(false);
  const [sidebarSelectedAgentId, setSidebarSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [liveFeedExpanded, setLiveFeedExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mc.live_feed_expanded") === "1";
  });
  const [kanbanFilters, setKanbanFilters] = useState<{
    agents: string[];
    priorities: number[];
    types: string[];
  }>({ agents: [], priorities: [], types: [] });

  // Derived section from current view
  const activeSection = useMemo(() => viewToSection(currentView), [currentView]);
  const sectionTabs = SECTION_TABS[activeSection];

  // Get current project details
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");

  // Auto-select first project if none selected
  const projects = useQuery(api.projects.list);
  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      const preferredProject =
        projects.find((p) => p.name.trim().toLowerCase() === "mission control") ??
        projects.find((p) => p.name.toLowerCase().includes("mission control")) ??
        projects[0];
      setProjectId(preferredProject._id);
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mc.live_feed_expanded", liveFeedExpanded ? "1" : "0");
  }, [liveFeedExpanded]);

  useEffect(() => {
    if (!showPauseConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPauseConfirm(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPauseConfirm]);

  useEffect(() => {
    if (currentView !== "tasks") {
      setSidebarSelectedAgentId(null);
    }
  }, [currentView]);

  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const { toast } = useToast();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewTask: () => setShowCreateTask(true),
    onSearch: () => setShowCommandPalette(true),
    onApprovals: () => setShowApprovals(true),
    onAgents: () => {
      setSidebarSelectedAgentId(null);
      setShowAgentsFlyout(true);
    },
    onGoToBoard: () => setCurrentView("tasks"),
    onShowHelp: () => setShowKeyboardHelp(true),
    onMission: () => setShowMissionModal(true),
  });

  const projectContextValue = { projectId, setProjectId, project };

  const handlePauseSquad = useCallback(async () => {
    setShowPauseConfirm(true);
  }, []);

  const handleConfirmPauseSquad = useCallback(async () => {
    setShowPauseConfirm(false);
    try {
      const result = await pauseAll({
        projectId: projectId ?? undefined,
        reason: "Pause squad from Mission Control",
        userId: "operator",
      });
      toast(`Paused ${(result as { paused: number }).paused} agent(s)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Pause failed", true);
    }
  }, [pauseAll, projectId, toast]);

  const handleResumeSquad = useCallback(async () => {
    try {
      const result = await resumeAll({
        projectId: projectId ?? undefined,
        reason: "Resume squad from Mission Control",
        userId: "operator",
      });
      toast(`Resumed ${(result as { resumed: number }).resumed} agent(s)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Resume failed", true);
    }
  }, [resumeAll, projectId, toast]);

  const handleSectionChange = useCallback(
    (section: CommandSection) => {
      setShowAgentsFlyout(false);
      setSidebarSelectedAgentId(null);
      setCurrentView(SECTION_DEFAULT_VIEW[section]);
    },
    []
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      setShowAgentsFlyout(false);
      setSidebarSelectedAgentId(null);
      setCurrentView(tabId as MainView);
    },
    []
  );

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  const { activeCount, taskCount } = useHeaderMetrics();
  const pendingApprovals = useQuery(
    api.approvals.listPending,
    projectId ? { projectId, limit: 10 } : { limit: 10 }
  );

  return (
    <ProjectContext.Provider value={projectContextValue}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {/* Top Bar */}
        <AppTopBar
          projectSwitcher={<ProjectSwitcher />}
          searchBar={
            <SearchBar
              projectId={projectId ?? undefined}
              onResultClick={(taskId) => setSelectedTaskId(taskId as Id<"tasks">)}
            />
          }
          activeCount={activeCount}
          taskCount={taskCount}
          timeStr={timeStr}
          dateStr={dateStr}
          pendingApprovals={pendingApprovals?.length ?? 0}
          projectId={projectId}
          onNewTask={() => setShowCreateTask(true)}
          onOpenControls={() => setShowOperatorControls(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenCostAnalytics={() => setShowCostAnalytics(true)}
          onOpenBudgetBurnDown={() => setShowBudgetBurnDown(true)}
          onOpenAdvancedAnalytics={() => setShowAdvancedAnalytics(true)}
          onOpenHealthDashboard={() => setShowHealthDashboard(true)}
          onOpenMonitoringDashboard={() => setShowMonitoringDashboard(true)}
          onOpenDashboardOverview={() => handleSectionChange("home")}
          onOpenActivityFeed={() => setShowActivityFeed(true)}
          onOpenKeyboardHelp={() => setShowKeyboardHelp(true)}
          onOpenApprovals={() => setShowApprovals(true)}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenAgentsFlyout={() => {
            setSidebarSelectedAgentId(null);
            setShowAgentsFlyout(true);
          }}
          onOpenMissionModal={() => setShowMissionModal(true)}
          onOpenSuggestionsDrawer={() => setShowSuggestionsDrawer(true)}
        />

        {/* Command Center Navigation */}
        <CommandNav
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        {/* Sub-tabs for sections that have them */}
        {sectionTabs && (
          <TabBar
            tabs={sectionTabs}
            activeTab={currentView}
            onTabChange={handleTabChange}
          />
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          <PageTransition viewKey={currentView}>
            {/* HOME */}
            {currentView === "home" && (
              <DashboardOverview
                projectId={projectId}
                onClose={() => {}}
                onOpenMissionModal={() => setShowMissionModal(true)}
                onOpenSuggestionsDrawer={() => setShowSuggestionsDrawer(true)}
              />
            )}

            {/* OPS: Tasks */}
            {currentView === "tasks" && (
              <>
                <Sidebar
                  projectId={projectId}
                  onOpenApprovals={() => setShowApprovals(true)}
                  onOpenPolicy={() => setShowPolicy(true)}
                  onOpenOperatorControls={() => setShowOperatorControls(true)}
                  onOpenNotifications={() => setShowNotifications(true)}
                  onOpenStandup={() => setShowStandup(true)}
                  onPauseSquad={handlePauseSquad}
                  onResumeSquad={handleResumeSquad}
                  onAgentSelect={(agentId) => setSidebarSelectedAgentId(agentId)}
                  onWidthChange={setSidebarWidth}
                />
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

            {/* OPS: DAG */}
            {currentView === "dag" && (
              <MissionDAGView
                projectId={projectId}
                onTaskSelect={(taskId) => {
                  setSelectedTaskId(taskId);
                  setCurrentView("tasks");
                }}
              />
            )}

            {/* OPS: Calendar */}
            {currentView === "calendar" && <CalendarView projectId={projectId} />}

            {/* OPS: Audit */}
            {currentView === "audit" && <AuditView projectId={projectId} />}

            {/* OPS: Telemetry */}
            {currentView === "telemetry" && <TelemetryView projectId={projectId} />}

            {/* AGENTS: Registry */}
            {currentView === "agents" && <AgentRegistryView projectId={projectId} />}

            {/* AGENTS: Directory */}
            {currentView === "directory" && <DirectoryView projectId={projectId} />}

            {/* AGENTS: Identities */}
            {currentView === "identity" && <IdentityDirectoryView projectId={projectId} />}

            {/* AGENTS: Policies */}
            {currentView === "policies" && <PoliciesView projectId={projectId} />}

            {/* AGENTS: Deployments */}
            {currentView === "deployments" && <DeploymentsView projectId={projectId} />}

            {/* AGENTS: Memory */}
            {currentView === "memory" && <MemoryView projectId={projectId} />}

            {/* CHAT */}
            {currentView === "chat" && <ChatView projectId={projectId} />}

            {/* CHAT: Council */}
            {currentView === "council" && <CouncilView projectId={projectId} />}

            {/* CHAT: Command */}
            {currentView === "command" && (
              <CommandPanel 
                projectId={projectId} 
                onOpenSuggestionsDrawer={() => setShowSuggestionsDrawer(true)}
              />
            )}

            {/* CONTENT: Captures */}
            {currentView === "captures" && <CapturesView projectId={projectId} />}

            {/* CONTENT: Projects */}
            {currentView === "projects" && <ProjectsView projectId={projectId} />}

            {/* CONTENT: Docs (shared with knowledge) */}
            {currentView === "docs" && <DocsView />}

            {/* COMMS: Telegraph */}
            {currentView === "telegraph" && <TelegraphInbox projectId={projectId} />}

            {/* COMMS: Meetings */}
            {currentView === "meetings" && <MeetingsView projectId={projectId} />}

            {/* COMMS: Voice */}
            {currentView === "voice" && <VoicePanel projectId={projectId} />}

            {/* COMMS: People */}
            {currentView === "people" && <PeopleView projectId={projectId} />}

            {/* COMMS: Org (accessible via People) */}
            {currentView === "org" && <OrgView projectId={projectId} />}

            {/* COMMS: Office */}
            {currentView === "office" && <OfficeView projectId={projectId} />}

            {/* KNOWLEDGE: Search */}
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

            {/* CONTENT: Pipeline */}
            {currentView === "content-pipeline" && <ContentPipelineView projectId={projectId} />}

            {/* COMMS: CRM */}
            {currentView === "crm" && <CrmView projectId={projectId} />}

            {/* CODE */}
            {currentView === "code" && (
              <CodePipelineView
                projectId={projectId}
                onTaskSelect={(taskId) => {
                  setSelectedTaskId(taskId);
                  setCurrentView("tasks");
                }}
              />
            )}

            {currentView === "recorder" && <RecorderView projectId={projectId} />}
            {currentView === "test-generation" && <TestGenerationView projectId={projectId} />}
            {currentView === "api-import" && <ApiImportView projectId={projectId} />}
            {currentView === "execution" && <ExecutionView projectId={projectId} />}
            {currentView === "flaky-steps" && <FlakyStepsView projectId={projectId} />}
            {currentView === "hybrid-workflows" && <HybridWorkflowView projectId={projectId} />}
            {currentView === "schedule" && <ScheduleView projectId={projectId} />}
            {currentView === "codegen" && <CodeGenView projectId={projectId} />}
            {currentView === "gherkin" && <GherkinStudioView projectId={projectId} />}
            {currentView === "metrics" && <MetricsView projectId={projectId} />}

            {/* QUALITY: Dashboard */}
            {currentView === "qc-dashboard" && (
              <QcDashboardView
                projectId={projectId}
                onRunSelect={(runId) => {
                  setSelectedQcRunId(runId);
                  setCurrentView("qc-runs");
                }}
              />
            )}

            {/* QUALITY: Run Detail */}
            {currentView === "qc-runs" && selectedQcRunId && (
              <QcRunDetailView
                runId={selectedQcRunId}
                onBack={() => {
                  setSelectedQcRunId(null);
                  setCurrentView("qc-dashboard");
                }}
              />
            )}

            {/* QUALITY: Config (placeholder) */}
            {currentView === "qc-config" && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-lg font-semibold mb-2">QC Configuration</h2>
                  <p className="text-sm text-muted-foreground">Ruleset management coming soon</p>
                </div>
              </div>
            )}
          </PageTransition>
        </div>

        {/* Task Drawer */}
        <TaskDrawerTabs taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

        {/* Modals */}
        {showPauseConfirm && (
          <>
            <div className="fixed inset-0 z-[1000] bg-black/50" onClick={() => setShowPauseConfirm(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm pause squad"
              className="fixed left-1/2 top-1/2 z-[1001] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-2xl"
            >
              <h2 className="text-base font-semibold text-foreground">Pause all active agents?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Active agents will stop until resumed. This action can be reversed with Resume.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPauseConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={handleConfirmPauseSquad}>
                  Pause Squad
                </Button>
              </div>
            </div>
          </>
        )}
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
          <OperatorControlsModal projectId={projectId} onClose={() => setShowOperatorControls(false)} />
        )}
        {showNotifications && (
          <NotificationsModal onClose={() => setShowNotifications(false)} onSelectTask={setSelectedTaskId} />
        )}
        {showStandup && <StandupModal projectId={projectId} onClose={() => setShowStandup(false)} />}
        {showAgentDashboard && (
          <AgentDashboard projectId={projectId} onClose={() => setShowAgentDashboard(false)} />
        )}
        {showCostAnalytics && (
          <CostAnalytics projectId={projectId} onClose={() => setShowCostAnalytics(false)} />
        )}
        {showBudgetBurnDown && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowBudgetBurnDown(false);
            }}
          >
            <div className="relative w-[min(90vw,800px)] max-h-[85vh] overflow-auto rounded-xl border border-border bg-background">
              <button
                onClick={() => setShowBudgetBurnDown(false)}
                className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground text-xl bg-transparent border-none cursor-pointer"
              >
                &times;
              </button>
              <BudgetBurnDown projectId={projectId} />
            </div>
          </div>
        )}
        {showAdvancedAnalytics && (
          <AnalyticsDashboard projectId={projectId} onClose={() => setShowAdvancedAnalytics(false)} />
        )}
        {showHealthDashboard && (
          <HealthDashboard projectId={projectId} onClose={() => setShowHealthDashboard(false)} />
        )}
        {showMonitoringDashboard && (
          <MonitoringDashboard onClose={() => setShowMonitoringDashboard(false)} />
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
              setSidebarSelectedAgentId(null);
              setShowAgentsFlyout(true);
            }}
            onOpenControls={() => {
              setShowCommandPalette(false);
              setShowOperatorControls(true);
            }}
          />
        )}
        {showKeyboardHelp && <KeyboardShortcutsHelp onClose={() => setShowKeyboardHelp(false)} />}
        {showActivityFeed && (
          <ActivityFeedModal projectId={projectId} onClose={() => setShowActivityFeed(false)} />
        )}
        {showMissionModal && (
          <MissionModal projectId={projectId} onClose={() => setShowMissionModal(false)} />
        )}
        {showSuggestionsDrawer && (
          <MissionSuggestionsDrawer projectId={projectId} onClose={() => setShowSuggestionsDrawer(false)} />
        )}
        {showAgentsFlyout && (
          <AgentsFlyout
            projectId={projectId}
            onClose={() => setShowAgentsFlyout(false)}
            onOpenApprovals={() => { setShowAgentsFlyout(false); setShowApprovals(true); }}
            onOpenPolicy={() => { setShowAgentsFlyout(false); setShowPolicy(true); }}
            onOpenOperatorControls={() => { setShowAgentsFlyout(false); setShowOperatorControls(true); }}
            onOpenNotifications={() => { setShowAgentsFlyout(false); setShowNotifications(true); }}
            onOpenStandup={() => { setShowAgentsFlyout(false); setShowStandup(true); }}
            onPauseSquad={handlePauseSquad}
            onResumeSquad={handleResumeSquad}
            onOpenOrg={(agentId) => {
              window.localStorage.setItem("mc.org.focusAgentId", agentId);
              setShowAgentsFlyout(false);
              setCurrentView("org");
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
              setCurrentView("org");
            }}
          />
        )}
      </div>
    </ProjectContext.Provider>
  );
}
