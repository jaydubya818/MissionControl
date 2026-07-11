import { useState, useEffect, createContext, useContext, useMemo, useCallback, lazy, Suspense } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { type MainView, type CommandSection } from "./TopNav";
import { CommandNav } from "./components/CommandNav";
import { TabBar, type TabItem } from "./components/TabBar";
import { AppTopBar } from "./components/AppTopBar";
import { Sidebar, SIDEBAR_WIDTH } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { useToast } from "./Toast";
import { useKeyboardShortcuts } from "./KeyboardShortcuts";
import { useModalState } from "./hooks/useModalState";
import { PrivacyProvider } from "./contexts/PrivacyContext";

const DashboardOverview = lazy(() =>
  import("./DashboardOverview").then((module) => ({ default: module.DashboardOverview }))
);
const TaskDrawerTabs = lazy(() =>
  import("./TaskDrawerTabs").then((module) => ({ default: module.TaskDrawerTabs }))
);
const ModalLayer = lazy(() =>
  import("./ModalLayer").then((module) => ({ default: module.ModalLayer }))
);
const OpsSection = lazy(() =>
  import("./sections/OpsSection").then((module) => ({ default: module.OpsSection }))
);
const AgentsSection = lazy(() =>
  import("./sections/AgentsSection").then((module) => ({ default: module.AgentsSection }))
);
const ChatSection = lazy(() =>
  import("./sections/ChatSection").then((module) => ({ default: module.ChatSection }))
);
const ContentSection = lazy(() =>
  import("./sections/ContentSection").then((module) => ({ default: module.ContentSection }))
);
const CommsSection = lazy(() =>
  import("./sections/CommsSection").then((module) => ({ default: module.CommsSection }))
);
const KnowledgeSection = lazy(() =>
  import("./sections/KnowledgeSection").then((module) => ({ default: module.KnowledgeSection }))
);
const CodeSection = lazy(() =>
  import("./sections/CodeSection").then((module) => ({ default: module.CodeSection }))
);
const QualitySection = lazy(() =>
  import("./sections/QualitySection").then((module) => ({ default: module.QualitySection }))
);
const PlatformSection = lazy(() =>
  import("./sections/PlatformSection").then((module) => ({ default: module.PlatformSection }))
);
const ControlSection = lazy(() =>
  import("./sections/ControlSection").then((module) => ({ default: module.ControlSection }))
);

// ============================================================================
// PROJECT CONTEXT
// ============================================================================

interface ProjectContextType {
  projectId: Id<"projects"> | null;
  setProjectId: (id: Id<"projects"> | null) => void;
  project: Doc<"projects"> | null | undefined;
}

type ShellAiTone = "active" | "thinking" | "idle" | "offline";

interface ShellAiStatus {
  tone: ShellAiTone;
  label: string;
  detail: string;
  lastSeenLabel: string;
  agentId: Id<"agents"> | null;
  taskId: Id<"tasks"> | null;
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
      className="h-10 min-w-[168px] rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--background)_90%,transparent))] px-3.5 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
// VIEW PERSISTENCE (reopen where operator left off)
// ============================================================================

const STORAGE_KEY_VIEW = "mc.last_view";

const VALID_MAIN_VIEWS: MainView[] = [
  "home", "atc", "tasks", "agents", "directory", "policies", "deployments", "audit", "telemetry",
  "dag", "chat", "council", "calendar", "projects", "memory", "captures", "docs", "skills", "people", "org",
  "design-system",
  "office", "live-office", "search", "identity", "telegraph", "meetings", "voice", "content-pipeline",
  "crm", "command", "code", "recorder", "test-generation", "api-import", "execution", "flaky-steps",
  "hybrid-workflows", "schedule", "codegen", "gherkin", "metrics", "qc-dashboard", "qc-runs",
  "qc-environments", "qc-findings", "qc-metrics", "qc-rulesets", "gateway", "live-chat", "schedules",
  "hiring", "team", "system", "radar", "factory", "pipeline", "feedback", "ops-schedule", "goals",
  "control-portfolio", "control-work-orders", "control-fleet", "control-approvals",
];

function readPersistedView(): MainView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_VIEW);
    if (!raw) return null;
    const view = raw as MainView;
    return VALID_MAIN_VIEWS.includes(view) ? view : null;
  } catch {
    return null;
  }
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
  platform: "system",
  control: "control-portfolio",
};

const SECTION_TABS: Record<CommandSection, TabItem[] | null> = {
  home: null,
  ops: [
    { id: "tasks", label: "Tasks" },
    { id: "goals", label: "Goals" },
    { id: "dag", label: "DAG" },
    { id: "calendar", label: "Calendar" },
    { id: "ops-schedule", label: "Schedule" },
    { id: "audit", label: "Audit" },
    { id: "telemetry", label: "Telemetry" },
  ],
  agents: [
    { id: "atc", label: "ATC" },
    { id: "agents", label: "Registry" },
    { id: "directory", label: "Templates" },
    { id: "identity", label: "Identities" },
    { id: "policies", label: "Policies" },
    { id: "deployments", label: "Deployments" },
    { id: "gateway", label: "Gateway" },
    { id: "schedules", label: "Schedules" },
  ],
  chat: [
    { id: "chat", label: "Chat" },
    { id: "live-chat", label: "Live" },
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
    { id: "team", label: "Team" },
    { id: "org", label: "Org Chart" },
    { id: "office", label: "Office" },
    { id: "live-office", label: "Live Office" },
    { id: "hiring", label: "Hiring" },
  ],
  knowledge: [
    { id: "docs", label: "Knowledge" },
    { id: "design-system", label: "Design DNA" },
    { id: "skills", label: "Skills" },
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
    { id: "qc-environments", label: "Environments" },
    { id: "qc-findings", label: "Findings" },
    { id: "qc-metrics", label: "Metrics" },
    { id: "qc-rulesets", label: "Rulesets" },
  ],
  platform: [
    { id: "system", label: "System" },
    { id: "radar", label: "Radar" },
    { id: "factory", label: "Factory" },
    { id: "pipeline", label: "Build Pipeline" },
    { id: "feedback", label: "Feedback" },
  ],
  control: [
    { id: "control-portfolio", label: "Portfolio" },
    { id: "control-work-orders", label: "Work Orders" },
    { id: "control-fleet", label: "Fleet" },
    { id: "control-approvals", label: "Approvals" },
  ],
};

function viewToSection(view: MainView): CommandSection {
  if (view === "home") return "home";
  if (["control-portfolio", "control-work-orders", "control-fleet", "control-approvals"].includes(view)) return "control";
  if (["tasks", "goals", "dag", "calendar", "ops-schedule", "audit", "telemetry"].includes(view)) return "ops";
  if (["atc", "agents", "directory", "identity", "policies", "deployments", "gateway", "schedules"].includes(view)) return "agents";
  if (["chat", "live-chat", "council", "command"].includes(view)) return "chat";
  if (["captures", "projects", "content-pipeline"].includes(view)) return "content";
  if (["qc-dashboard", "qc-runs", "qc-environments", "qc-findings", "qc-metrics", "qc-rulesets"].includes(view)) return "quality";
  if (["telegraph", "meetings", "voice", "people", "org", "office", "live-office", "crm", "hiring", "team"].includes(view)) return "comms";
  if (["docs", "design-system", "skills", "search", "memory"].includes(view)) return "knowledge";
  if (["system", "radar", "factory", "pipeline", "feedback"].includes(view)) return "platform";
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
  const [statusTick, setStatusTick] = useState(() => Date.now());
  const activeCount = agents?.filter((a) => a.status === "ACTIVE").length ?? 0;
  const taskCount = tasks?.length ?? 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStatusTick(Date.now());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const aiStatus = useMemo<ShellAiStatus>(() => {
    if (!agents || agents.length === 0) {
      return {
        tone: "offline",
        label: "No active fleet",
        detail: "Register or resume an agent to bring Mission Control online.",
        lastSeenLabel: "No heartbeat",
        agentId: null,
        taskId: null,
      };
    }

    const taskTitleById = new Map(tasks?.map((task) => [task._id, task.title]) ?? []);
    const freshestAgent = [...agents].sort((left, right) => {
      const leftStamp = left.lastHeartbeatAt ?? 0;
      const rightStamp = right.lastHeartbeatAt ?? 0;
      return rightStamp - leftStamp;
    })[0];

    const lastHeartbeatAt = freshestAgent?.lastHeartbeatAt ?? null;
    const ageMs = lastHeartbeatAt ? statusTick - lastHeartbeatAt : Number.POSITIVE_INFINITY;
    const taskTitle = freshestAgent?.currentTaskId
      ? taskTitleById.get(freshestAgent.currentTaskId) ?? "active task"
      : null;

    const lastSeenLabel = !lastHeartbeatAt
      ? "No signal"
      : ageMs < 60_000
        ? "Live now"
        : ageMs < 3_600_000
          ? `Last signal ${Math.floor(ageMs / 60_000)}m ago`
          : ageMs < 86_400_000
            ? `Last signal ${Math.floor(ageMs / 3_600_000)}h ago`
            : `Last signal ${Math.floor(ageMs / 86_400_000)}d ago`;

    if (!freshestAgent || freshestAgent.status === "OFFLINE") {
      return {
        tone: "offline",
        label: "Fleet offline",
        detail: "No agents are currently reporting into Mission Control.",
        lastSeenLabel,
        agentId: freshestAgent?._id ?? null,
        taskId: freshestAgent?.currentTaskId ?? null,
      };
    }

    if (freshestAgent.status === "PAUSED") {
      return {
        tone: "idle",
        label: "Paused by operator",
        detail: `${freshestAgent.name} is standing by until work resumes.`,
        lastSeenLabel,
        agentId: freshestAgent._id,
        taskId: freshestAgent.currentTaskId ?? null,
      };
    }

    if (freshestAgent.status === "QUARANTINED" || freshestAgent.status === "DRAINED") {
      return {
        tone: "thinking",
        label: "Needs operator review",
        detail: `${freshestAgent.name} is ${freshestAgent.status.toLowerCase()} and may need intervention.`,
        lastSeenLabel,
        agentId: freshestAgent._id,
        taskId: freshestAgent.currentTaskId ?? null,
      };
    }

    if (ageMs <= 45_000) {
      return {
        tone: "active",
        label: taskTitle ? "Working now" : "Live and responding",
        detail: taskTitle
          ? `${freshestAgent.name} is working on ${taskTitle}.`
          : `${freshestAgent.name} is actively reporting heartbeat traffic.`,
        lastSeenLabel,
        agentId: freshestAgent._id,
        taskId: freshestAgent.currentTaskId ?? null,
      };
    }

    if (ageMs <= 180_000) {
      return {
        tone: "thinking",
        label: taskTitle ? "Thinking through execution" : "Thinking",
        detail: taskTitle
          ? `${freshestAgent.name} last reported while working on ${taskTitle}.`
          : `${freshestAgent.name} is between updates but still warm.`,
        lastSeenLabel,
        agentId: freshestAgent._id,
        taskId: freshestAgent.currentTaskId ?? null,
      };
    }

    if (ageMs > 21_600_000) {
      return {
        tone: "offline",
        label: "Stale signal",
        detail: `${freshestAgent.name} has not reported a trustworthy heartbeat recently. Inspect the fleet before relying on this state.`,
        lastSeenLabel,
        agentId: freshestAgent._id,
        taskId: freshestAgent.currentTaskId ?? null,
      };
    }

    return {
      tone: "idle",
      label: "Ready for next assignment",
      detail: `${freshestAgent.name} is online but hasn’t reported activity recently.`,
      lastSeenLabel,
      agentId: freshestAgent._id,
      taskId: freshestAgent.currentTaskId ?? null,
    };
  }, [agents, statusTick, tasks]);

  return { activeCount, taskCount, aiStatus };
}

// ============================================================================
// PAGE TRANSITION
// ============================================================================

// CSS animation (not framer-motion) so a lazy section suspending mid-transition
// can never freeze the wrapper at opacity 0 and leave the page invisible.
function PageTransition({ children, viewKey }: { children: React.ReactNode; viewKey: string }) {
  return (
    <div key={viewKey} className="page-enter flex flex-1 overflow-hidden">
      {children}
    </div>
  );
}

function SectionLoadingState() {
  return (
    <main className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="h-16 rounded-2xl border border-[var(--panel-line)] skeleton-shimmer" />
        <div className="grid flex-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--panel-line)] skeleton-shimmer" />
          <div className="rounded-2xl border border-[var(--panel-line)] skeleton-shimmer lg:col-span-2" />
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// APP
// ============================================================================

export default function App() {
  // ── Navigation & selection (persist last view so UI reopens where operator left off) ─
  const [currentView, setCurrentView] = useState<MainView>(() => readPersistedView() ?? "home");
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
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY_VIEW, currentView);
      } catch {
        // ignore
      }
    }
  }, [currentView]);

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
    onCostAnalytics: () => open("costAnalytics"),
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
  const { activeCount, taskCount, aiStatus } = useHeaderMetrics();

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
            onNavigate={setCurrentView}
            onOpenApprovals={() => open("approvals")}
            onOpenCostAnalytics={() => open("costAnalytics")}
            onOpenAlertRules={() => open("alertRules")}
            onTaskSelect={setSelectedTaskId}
            onNavigateToGateway={() => {
              handleSectionChange("agents");
              handleTabChange("gateway");
            }}
            onOpenCreateTask={() => open("createTask")}
            onSelectAgent={(id) => {
              setSidebarSelectedAgentId(id);
              open("agentsFlyout");
            }}
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
            onOpenImportPrd={() => open("importPrd")}
            onNavigate={setCurrentView}
            onNewTask={() => open("createTask")}
          />
        );
      case "agents":
        return (
          <AgentsSection
            currentView={currentView}
            projectId={projectId}
            onNavigateToIdentity={() => setCurrentView("identity")}
            onNavigateToTask={(taskId) => {
              setSelectedTaskId(taskId);
              setCurrentView("tasks");
            }}
            onNavigateToTasks={() => setCurrentView("tasks")}
            onNavigateToAgent={(agentId) => {
              setSidebarSelectedAgentId(agentId);
              setCurrentView("agents");
            }}
            onOpenCreateAgent={() => open("createAgent")}
          />
        );
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
        return (
          <CommsSection
            currentView={currentView}
            projectId={projectId}
            onNavigate={setCurrentView}
          />
        );
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
            onOpenStartQcRun={() => open("startQcRun")}
          />
        );
      case "platform":
        return (
          <PlatformSection
            currentView={currentView}
            projectId={projectId}
            onNavigate={setCurrentView}
            onOpenHealthDashboard={() => open("healthDashboard")}
            onOpenMonitoringDashboard={() => open("monitoringDashboard")}
            onTaskSelect={(taskId) => {
              setSelectedTaskId(taskId);
              setCurrentView("tasks");
            }}
          />
        );
      case "control":
        return (
          <ControlSection
            currentView={currentView}
            projectId={projectId}
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
      <PrivacyProvider>
      <div className="flex h-screen flex-col bg-background text-foreground neon-app-bg">
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
          aiStatus={aiStatus}
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
          onOpenAiStatus={() => {
            if (aiStatus.taskId) {
              setSelectedTaskId(aiStatus.taskId);
              setCurrentView("tasks");
              return;
            }
            setCurrentView("agents");
          }}
          onOpenMissionModal={() => open("missionModal")}
          onOpenSuggestionsDrawer={() => open("suggestionsDrawer")}
        />

        <CommandNav activeSection={activeSection} onSectionChange={handleSectionChange} />

        {sectionTabs && (
          <TabBar tabs={sectionTabs} activeTab={currentView} onTabChange={handleTabChange} />
        )}

        <div className="flex flex-1 overflow-hidden">
          <PageTransition viewKey={currentView}>
            <Suspense fallback={<SectionLoadingState />}>
              {renderSection()}
            </Suspense>
          </PageTransition>
        </div>

        <Suspense fallback={null}>
          <TaskDrawerTabs taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
        </Suspense>

        <Suspense fallback={null}>
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
            onNavigateToGateway={() => {
              handleSectionChange("agents");
              handleTabChange("gateway");
            }}
          />
        </Suspense>
      </div>
      </PrivacyProvider>
    </ProjectContext.Provider>
  );
}
