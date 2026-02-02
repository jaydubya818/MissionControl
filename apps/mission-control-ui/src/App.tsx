import { useState, useEffect, createContext, useContext } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Kanban } from "./Kanban";
import { TaskDrawerTabs } from "./TaskDrawerTabs";
import { Sidebar } from "./Sidebar";
import { LiveFeed } from "./LiveFeed";
import { CreateTaskModal } from "./CreateTaskModal";
import { ApprovalsModal } from "./ApprovalsModal";
import { PolicyModal } from "./PolicyModal";
import { NotificationsModal } from "./NotificationsModal";
import { StandupModal } from "./StandupModal";
import { useToast } from "./Toast";
import { SearchBar } from "./SearchBar";
import { AgentDashboard } from "./AgentDashboard";
import { KanbanFilters } from "./KanbanFilters";
import { CostAnalytics } from "./CostAnalytics";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

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
      style={{
        padding: "6px 12px",
        background: "#1e293b",
        border: "1px solid #475569",
        borderRadius: 6,
        color: "#e2e8f0",
        fontSize: "0.85rem",
        cursor: "pointer",
        minWidth: 140,
      }}
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
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showStandup, setShowStandup] = useState(false);
  const [showAgentDashboard, setShowAgentDashboard] = useState(false);
  const [showCostAnalytics, setShowCostAnalytics] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
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
  
  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const { toast } = useToast();
  
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
      projectId={projectId}
      selectedTaskId={selectedTaskId}
      setSelectedTaskId={setSelectedTaskId}
      showCreateTask={showCreateTask}
      setShowCreateTask={setShowCreateTask}
      showApprovals={showApprovals}
      setShowApprovals={setShowApprovals}
      showPolicy={showPolicy}
      setShowPolicy={setShowPolicy}
      showNotifications={showNotifications}
      setShowNotifications={setShowNotifications}
      showStandup={showStandup}
      setShowStandup={setShowStandup}
      showAgentDashboard={showAgentDashboard}
      setShowAgentDashboard={setShowAgentDashboard}
      showCostAnalytics={showCostAnalytics}
      setShowCostAnalytics={setShowCostAnalytics}
      showAdvancedAnalytics={showAdvancedAnalytics}
      setShowAdvancedAnalytics={setShowAdvancedAnalytics}
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
  projectId,
  selectedTaskId,
  setSelectedTaskId,
  showCreateTask,
  setShowCreateTask,
  showApprovals,
  setShowApprovals,
  showPolicy,
  setShowPolicy,
  showNotifications,
  setShowNotifications,
  showStandup,
  setShowStandup,
  showAgentDashboard,
  setShowAgentDashboard,
  showCostAnalytics,
  setShowCostAnalytics,
  showAdvancedAnalytics,
  setShowAdvancedAnalytics,
  kanbanFilters,
  setKanbanFilters,
  handlePauseSquad,
  handleResumeSquad,
  timeStr,
  dateStr,
  toast,
}: {
  projectId: Id<"projects"> | null;
  selectedTaskId: Id<"tasks"> | null;
  setSelectedTaskId: (id: Id<"tasks"> | null) => void;
  showCreateTask: boolean;
  setShowCreateTask: (v: boolean) => void;
  showApprovals: boolean;
  setShowApprovals: (v: boolean) => void;
  showPolicy: boolean;
  setShowPolicy: (v: boolean) => void;
  showNotifications: boolean;
  setShowNotifications: (v: boolean) => void;
  showStandup: boolean;
  setShowStandup: (v: boolean) => void;
  showAgentDashboard: boolean;
  setShowAgentDashboard: (v: boolean) => void;
  showCostAnalytics: boolean;
  setShowCostAnalytics: (v: boolean) => void;
  showAdvancedAnalytics: boolean;
  setShowAdvancedAnalytics: (v: boolean) => void;
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
  
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="app-header">
        <h1 className="app-header-title">Mission Control</h1>
        <ProjectSwitcher />
        <SearchBar
          projectId={projectId ?? undefined}
          onResultClick={(taskId) => {
            setSelectedTaskId(taskId as Id<"tasks">);
          }}
        />
        <div className="app-header-metrics">
          <span>{activeCount} Agents Active</span>
          <span>{taskCount} Tasks in Queue</span>
        </div>
        <div className="app-header-right">
          <button
            type="button"
            onClick={() => setShowAgentDashboard(true)}
            style={{
              padding: "6px 12px",
              background: "#10b981",
              border: "1px solid #059669",
              borderRadius: 6,
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
              marginRight: "8px",
            }}
          >
            📊 Agents
          </button>
          <button
            type="button"
            onClick={() => setShowCostAnalytics(true)}
            style={{
              padding: "6px 12px",
              background: "#8b5cf6",
              border: "1px solid #7c3aed",
              borderRadius: 6,
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
              marginRight: "8px",
            }}
          >
            💰 Costs
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedAnalytics(true)}
            style={{
              padding: "6px 12px",
              background: "#f59e0b",
              border: "1px solid #d97706",
              borderRadius: 6,
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
              marginRight: "8px",
            }}
          >
            📈 Analytics
          </button>
          <button type="button" className="app-header-docs">
            Docs
          </button>
          <span className="app-header-time">
            {timeStr} {dateStr}
          </span>
          <div className="app-header-status">
            <span className="app-header-status-dot" aria-hidden />
            Online
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateTask(true)}
          style={{
            padding: "6px 14px",
            background: "#3b82f6",
            border: "1px solid #2563eb",
            borderRadius: 6,
            color: "#fff",
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + New task
        </button>
      </header>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar
          projectId={projectId}
          onOpenApprovals={() => setShowApprovals(true)}
          onOpenPolicy={() => setShowPolicy(true)}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenStandup={() => setShowStandup(true)}
          onPauseSquad={handlePauseSquad}
          onResumeSquad={handleResumeSquad}
        />
        <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <h2 className="mission-queue-header">Mission Queue</h2>
          <KanbanFilters
            projectId={projectId}
            filters={kanbanFilters}
            onFiltersChange={setKanbanFilters}
          />
          <Kanban
            projectId={projectId}
            onSelectTask={setSelectedTaskId}
            filters={kanbanFilters}
          />
        </main>
        <LiveFeed projectId={projectId} />
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

      {showAdvancedAnalytics && (
        <AnalyticsDashboard
          projectId={projectId}
          onClose={() => setShowAdvancedAnalytics(false)}
        />
      )}
      
      {/* Error Boundary wraps everything */}
    </div>
  );
}
