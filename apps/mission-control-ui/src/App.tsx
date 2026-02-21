import { useState, useEffect, createContext, useContext, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { type MainView, type CommandSection } from "./TopNav";
import { CommandNav } from "./components/CommandNav";
import { TabBar, type TabItem } from "./components/TabBar";
import { AppTopBar } from "./components/AppTopBar";
import { DashboardOverview } from "./DashboardOverview";
import { TaskDrawerTabs } from "./TaskDrawerTabs";
import { Sidebar, SIDEBAR_WIDTH } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { useToast } from "./Toast";
import { useKeyboardShortcuts } from "./KeyboardShortcuts";

// Sections
import { OpsSection } from "./sections/OpsSection";
import { AgentsSection } from "./sections/AgentsSection";
import { ChatSection } from "./sections/ChatSection";
import { ContentSection } from "./sections/ContentSection";
import { CommsSection } from "./sections/CommsSection";
import { KnowledgeSection } from "./sections/KnowledgeSection";
import { CodeSection } from "./sections/CodeSection";
import { QualitySection } from "./sections/QualitySection";

// Modal layer + state
import { ModalLayer } from "./ModalLayer";
import { useModalState } from "./hooks/useModalState";

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
  ],
};

function viewToSection(view: MainView): CommandSection {
  if (view === "home") return "home";
  if (["tasks", "dag", "calendar", "audit", "telemetry"].includes(view)) return "ops";
  if (["agents", "directory", "identity", "policies", "deployments"].includes(view)) return "agents";
  if (["chat", "council", "command"].includes(view)) return "chat";
  if (["captures", "projects", "content-pipeline"].includes(view)) return "content";
  if (["qc-dashboard", "qc-runs"].includes(view)) return "quality";
  if (["telegraph", "meetings", "voice", "people", "org", "office", "crm"].includes(view)) return "comms";
  if (["docs", "search", "memory"].includes(view)) return "knowledge";
  if ([
    "code", "recorder", "test-generation", "api-import", "execution",
    "flaky-steps", "hybrid-workflows", "schedule", "codegen", "gherkin", "metrics",
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
// PAGE TRANSITION
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
  // ── Navigation & selection ──────────────────────────────────────────────
  const [currentView, setCurrentView] = useState<MainView>("home");
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [selectedQcRunId, setSelectedQcRunId] = useState<Id<"qcRuns"> | null>(null);

  // ── Sidebar / ops-section state ─────────────────────────────────────────
  const [sidebarSelectedAgentId, setSidebarSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH);
  const [liveFeedExpanded, setLiveFeedExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mc.live_feed_expanded") === "1";
  });
  const [kanbanFilters, setKanbanFilters] = useState<{
    agents: string[];
    priorities: number[];
    types: string[];
  }>({ agents: [], priorities: [], types: [] });

  // ── Modal state (19 booleans extracted to hook) ──────────────────────────
  const { modals, open, close } = useModalState();

  // ── Derived ─────────────────────────────────────────────────────────────
  const activeSection = useMemo(() => viewToSection(currentView), [currentView]);
  const sectionTabs = SECTION_TABS[activeSection];

  // ── Data ─────────────────────────────────────────────────────────────────
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const projects = useQuery(api.projects.list);
  const pendingApprovals = useQuery(
    api.approvals.listPending,
    projectId ? { projectId, limit: 10 } : { limit: 10 }
  );

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      const preferred =
        projects.find((p) => p.name.trim().toLowerCase() === "mission control") ??
        projects.find((p) => p.name.toLowerCase().includes("mission control")) ??
        projects[0];
      setProjectId(preferred._id);
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mc.live_feed_expanded", liveFeedExpanded ? "1" : "0");
    }
  }, [liveFeedExpanded]);

  useEffect(() => {
    if (currentView !== "tasks") setSidebarSelectedAgentId(null);
  }, [currentView]);

  useEffect(() => {
    if (!modals.pauseConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("pauseConfirm");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modals.pauseConfirm, close]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const { toast } = useToast();

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    onNewTask: () => open("createTask"),
    onSearch: () => open("commandPalette"),
    onApprovals: () => open("approvals"),
    onAgents: () => { setSidebarSelectedAgentId(null); open("agentsFlyout"); },
    onGoToBoard: () => setCurrentView("tasks"),
    onShowHelp: () => open("keyboardHelp"),
    onMission: () => open("missionModal"),
  });

  // ── Callbacks ────────────────────────────────────────────────────────────
  const handleConfirmPauseSquad = useCallback(async () => {
    close("pauseConfirm");
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
  }, [pauseAll, projectId, toast, close]);

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

  const handleSectionChange = useCallback((section: CommandSection) => {
    close("agentsFlyout");
    setSidebarSelectedAgentId(null);
    setCurrentView(SECTION_DEFAULT_VIEW[section]);
  }, [close]);

  const handleTabChange = useCallback((tabId: string) => {
    close("agentsFlyout");
    setSidebarSelectedAgentId(null);
    setCurrentView(tabId as MainView);
  }, [close]);

  // ── Header data ──────────────────────────────────────────────────────────
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  const { activeCount, taskCount } = useHeaderMetrics();

  // ── Section renderer ─────────────────────────────────────────────────────
  function renderSection() {
    switch (activeSection) {
      case "home":
        return (
          <DashboardOverview
            projectId={projectId}
            onClose={() => {}}
            onOpenMissionModal={() => open("missionModal")}
            onOpenSuggestionsDrawer={() => open("suggestionsDrawer")}
          />
        );
      case "ops":
        return (
          <OpsSection
            currentView={currentView}
            projectId={projectId}
            taskCount={taskCount}
            onTaskSelect={setSelectedTaskId}
            liveFeedExpanded={liveFeedExpanded}
            onToggleLiveFeed={() => setLiveFeedExpanded((v) => !v)}
            kanbanFilters={kanbanFilters}
            onFiltersChange={setKanbanFilters}
            sidebarSelectedAgentId={sidebarSelectedAgentId}
            onAgentSelect={setSidebarSelectedAgentId}
            onSidebarWidthChange={setSidebarWidth}
            onOpenApprovals={() => open("approvals")}
            onOpenPolicy={() => open("policy")}
            onOpenOperatorControls={() => open("operatorControls")}
            onOpenNotifications={() => open("notifications")}
            onOpenStandup={() => open("standup")}
            onPauseSquad={() => open("pauseConfirm")}
            onResumeSquad={handleResumeSquad}
            onNavigate={setCurrentView}
          />
        );
      case "agents":
        return <AgentsSection currentView={currentView} projectId={projectId} />;
      case "chat":
        return (
          <ChatSection
            currentView={currentView}
            projectId={projectId}
            onOpenSuggestionsDrawer={() => open("suggestionsDrawer")}
          />
        );
      case "content":
        return <ContentSection currentView={currentView} projectId={projectId} />;
      case "comms":
        return <CommsSection currentView={currentView} projectId={projectId} />;
      case "knowledge":
        return (
          <KnowledgeSection
            currentView={currentView}
            projectId={projectId}
            onTaskSelect={(taskId) => {
              setSelectedTaskId(taskId as Id<"tasks">);
              setCurrentView("tasks");
            }}
          />
        );
      case "code":
        return (
          <CodeSection
            currentView={currentView}
            projectId={projectId}
            onTaskSelect={(taskId) => {
              setSelectedTaskId(taskId);
              setCurrentView("tasks");
            }}
          />
        );
      case "quality":
        return (
          <QualitySection
            currentView={currentView}
            projectId={projectId}
            selectedQcRunId={selectedQcRunId}
            setSelectedQcRunId={setSelectedQcRunId}
            onNavigate={setCurrentView}
          />
        );
      default:
        return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ProjectContext.Provider value={{ projectId, setProjectId, project }}>
      <div className="flex h-screen flex-col bg-background text-foreground">
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
          onNewTask={() => open("createTask")}
          onOpenControls={() => open("operatorControls")}
          onOpenCommandPalette={() => open("commandPalette")}
          onOpenCostAnalytics={() => open("costAnalytics")}
          onOpenBudgetBurnDown={() => open("budgetBurnDown")}
          onOpenAdvancedAnalytics={() => open("advancedAnalytics")}
          onOpenHealthDashboard={() => open("healthDashboard")}
          onOpenMonitoringDashboard={() => open("monitoringDashboard")}
          onOpenDashboardOverview={() => handleSectionChange("home")}
          onOpenActivityFeed={() => open("activityFeed")}
          onOpenKeyboardHelp={() => open("keyboardHelp")}
          onOpenApprovals={() => open("approvals")}
          onOpenNotifications={() => open("notifications")}
          onOpenAgentsFlyout={() => { setSidebarSelectedAgentId(null); open("agentsFlyout"); }}
          onOpenMissionModal={() => open("missionModal")}
          onOpenSuggestionsDrawer={() => open("suggestionsDrawer")}
        />

        <CommandNav activeSection={activeSection} onSectionChange={handleSectionChange} />

        {sectionTabs && (
          <TabBar tabs={sectionTabs} activeTab={currentView} onTabChange={handleTabChange} />
        )}

        <div className="flex flex-1 overflow-hidden">
          <PageTransition viewKey={currentView}>
            {renderSection()}
          </PageTransition>
        </div>

        <TaskDrawerTabs taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

        <ModalLayer
          projectId={projectId}
          modals={modals}
          open={open}
          close={close}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          sidebarSelectedAgentId={sidebarSelectedAgentId}
          setSidebarSelectedAgentId={setSidebarSelectedAgentId}
          sidebarWidth={sidebarWidth}
          onNavigate={setCurrentView}
          onConfirmPauseSquad={handleConfirmPauseSquad}
          onResumeSquad={handleResumeSquad}
          onToast={toast}
        />
      </div>
    </ProjectContext.Provider>
  );
}
