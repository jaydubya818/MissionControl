import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
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
import { useFlag, useFlagResolution } from "./hooks/useFlag";
import { AppShellV2, initialViewFromLocation } from "./shellV2/AppShellV2";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  WorkspaceScopeProvider,
  useWorkspaceScope,
} from "./workspace/WorkspaceScopeProvider";
import { selectAccessibleWorkspace } from "./workspace/workspaceSelection";
import { selectAccessibleCompany } from "./workspace/companySelection";
import { useAuthRuntime } from "./auth/AuthRuntimeContext";
import { BootstrapOwner } from "./auth/BootstrapOwner";
import { shouldBypassRuntimeCompatibility } from "./lib/runtimeCompatibility";
import { isRouteAuthorized } from "./shellV2/routeCapabilities";
import { AccessDeniedState } from "./access/AccessDeniedState";
import { isPersonaKey, type PersonaKey } from "@mission-control/shared";

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
const HarnessSection = lazy(() =>
  import("./harness/HarnessSection").then((module) => ({ default: module.HarnessSection }))
);
const ControlSection = lazy(() =>
  import("./sections/ControlSection").then((module) => ({ default: module.ControlSection }))
);
const AccessProfilesView = lazy(() =>
  import("./access/AccessProfilesView").then((module) => ({ default: module.AccessProfilesView }))
);

type ShellAiTone = "active" | "thinking" | "idle" | "offline";

interface ShellAiStatus {
  tone: ShellAiTone;
  label: string;
  detail: string;
  lastSeenLabel: string;
  agentId: Id<"agents"> | null;
  taskId: Id<"tasks"> | null;
}

// ============================================================================
// PROJECT SWITCHER
// ============================================================================

function ProjectSwitcher({
  projects,
  onManage,
  showDetails = false,
}: {
  projects: Doc<"projects">[] | undefined;
  onManage?: () => void;
  showDetails?: boolean;
}) {
  const { projectId, setProjectId, project } = useWorkspaceScope();

  if (!projects) {
    return (
      <div className="h-8 min-w-[140px] rounded-md border border-input bg-secondary/50 px-3 text-sm text-muted-foreground flex items-center">
        Loading projects...
      </div>
    );
  }

  const availableProjects = projects.filter((item) => item.status !== "ARCHIVED");
  const repositoryStatus =
    project?.repositoryStatus ?? (project?.githubRepo ? "CONFIGURED" : "UNCONFIGURED");

  return (
    <div className="space-y-2">
      <select
        aria-label="Workspace"
        value={projectId ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          if (value) setProjectId(value as Id<"projects">);
        }}
        className="h-9 min-w-[168px] rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] font-medium text-ink transition-colors duration-150 cursor-pointer hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="" disabled>
          {availableProjects.length === 0 ? "No workspaces" : "Select workspace"}
        </option>
        {availableProjects.map((p) => (
          <option key={p._id} value={p._id}>
            {p.name}
          </option>
        ))}
      </select>
      {showDetails ? (
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
          <div className="truncate font-mono text-[10.5px] text-ink-secondary">
            {project?.githubRepo ?? "No repository connected"}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
            <span className="truncate">
              {project?.githubRepo
                ? `${project.githubBranch || "main"} · ${repositoryStatus.toLowerCase()}`
                : "Setup required"}
            </span>
            {onManage ? (
              <button
                type="button"
                onClick={onManage}
                className="shrink-0 font-medium text-ink-secondary hover:text-ink"
              >
                Manage
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface CompanyOption {
  tenantId: Id<"tenants">;
  name: string;
  slug: string;
}

function CompanySwitcher({
  companies,
  tenantId,
  onChange,
}: {
  companies: CompanyOption[];
  tenantId: Id<"tenants"> | null;
  onChange: (tenantId: Id<"tenants">) => void;
}) {
  const selected = companies.find((company) => company.tenantId === tenantId);
  if (companies.length <= 1) {
    return (
      <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
        <div className="truncate text-[13px] font-medium text-ink">
          {selected?.name ?? "Company unavailable"}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-ink-muted">
          {selected?.slug ?? "No membership"}
        </div>
      </div>
    );
  }
  return (
    <select
      aria-label="Company account"
      value={tenantId ?? ""}
      onChange={(event) => onChange(event.target.value as Id<"tenants">)}
      className="h-9 w-full rounded-lg border border-line bg-surface-1 px-2.5 text-[13px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {companies.map((company) => (
        <option key={company.tenantId} value={company.tenantId}>
          {company.name}
        </option>
      ))}
    </select>
  );
}

// ============================================================================
// VIEW PERSISTENCE (reopen where operator left off)
// ============================================================================

const STORAGE_KEY_VIEW = "mc.last_view";
const STORAGE_KEY_PROJECT = "mc.last_project";
const STORAGE_KEY_COMPANY = "mc.last_company";
const WORKSPACE_RECOVERY_WARNING =
  "The requested workspace was unavailable. Mission Control opened an accessible workspace instead.";
const LEGACY_AUTOMATION_TABS = new Set([
  "overview",
  "definitions",
  "runs",
  "schedule",
  "candidates",
  "receipts",
  "decisions",
]);

function readPersistedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY_PROJECT);
  } catch {
    return null;
  }
}

function readPersistedCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY_COMPANY);
  } catch {
    return null;
  }
}

function ScopeRecoveryNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[100] flex w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 items-start justify-between gap-4 rounded-lg border border-amber-500/30 bg-card px-4 py-3 text-sm text-card-foreground shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Close toast"
        onClick={onDismiss}
        className="shrink-0 rounded px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Dismiss
      </button>
    </div>
  );
}

const VALID_MAIN_VIEWS: MainView[] = [
  "home", "atc", "tasks", "agents", "directory", "policies", "deployments", "audit", "telemetry", "automations", "automation-runs",
  "dag", "chat", "council", "calendar", "projects", "model-routing", "access-profiles", "memory", "captures", "docs", "skills", "people", "org",
  "design-system",
  "office", "live-office", "search", "identity", "telegraph", "meetings", "voice", "content-pipeline",
  "crm", "command", "code", "recorder", "test-generation", "api-import", "execution", "flaky-steps",
  "hybrid-workflows", "schedule", "codegen", "gherkin", "metrics", "qc-dashboard", "qc-runs",
  "qc-environments", "qc-findings", "qc-metrics", "qc-rulesets", "gateway", "live-chat", "schedules",
  "hiring", "team", "system", "radar", "factory", "pipeline", "feedback", "ops-schedule", "goals",
  "analytics", "command-center", "missions", "mission-detail", "trace-inspector", "effectiveness", "operator-evals",
  "factory-health", "readiness", "friction", "agent-catalog", "dossier", "recommendations",
  "control-portfolio", "control-work-orders", "control-fleet", "control-approvals",
  "harness-health", "harness-loops", "harness-control-plane", "harness-work-ledger",
  "harness-verifiers", "harness-change-review", "harness-change-risk", "harness-launch",
  "harness-meta-loop", "harness-team-pulse", "harness-builder", "harness-maintenance", "harness-code-review-wizard",
  "harness-workshop", "harness-automations", "harness-agent-fleet", "harness-software-factory", "harness-architect", "harness-patterns",
  "registry-lifecycle", "registry-evaluate", "registry-inventory", "registry-installations", "registry-runs",
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

function readInitialView(): MainView {
  if (typeof window === "undefined") return readPersistedView() ?? "home";
  return initialViewFromLocation(
    window.location.pathname,
    VALID_MAIN_VIEWS,
    readPersistedView(),
    window.location.search
  );
}

// ============================================================================
// SECTION <-> VIEW MAPPING
// ============================================================================

const SECTION_DEFAULT_VIEW: Record<CommandSection, MainView> = {
  home: "home",
  control: "harness-health",
  ops: "tasks",
  agents: "agents",
  chat: "chat",
  content: "content-pipeline",
  comms: "telegraph",
  knowledge: "docs",
  code: "code",
  quality: "qc-dashboard",
  platform: "system",
};

const SECTION_TABS: Record<CommandSection, TabItem[] | null> = {
  home: null,
  control: [
    { id: "control-portfolio", label: "Portfolio" },
    { id: "control-work-orders", label: "Work Orders" },
    { id: "control-fleet", label: "Fleet" },
    { id: "control-approvals", label: "Approvals" },
  ],
  ops: [
    { id: "tasks", label: "Tasks" },
    { id: "goals", label: "Goals" },
    { id: "dag", label: "DAG" },
    { id: "calendar", label: "Calendar" },
    { id: "ops-schedule", label: "Schedule" },
    { id: "audit", label: "Audit" },
    { id: "telemetry", label: "Telemetry" },
    { id: "automations", label: "Automations" },
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
    { id: "skills", label: "Discover skills" },
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
    { id: "system", label: "Database" },
    { id: "radar", label: "Radar" },
    { id: "factory", label: "Factory" },
    { id: "pipeline", label: "Build Pipeline" },
    { id: "feedback", label: "Feedback" },
    { id: "analytics", label: "Analytics" },
  ],
};

function viewToSection(view: MainView): CommandSection {
  if (view === "home") return "home";
  if (
    [
      "control-portfolio",
      "control-work-orders",
      "control-fleet",
      "control-approvals",
    ].includes(view)
  ) {
    return "control";
  }
  if (
    [
      "harness-health",
      "harness-loops",
      "harness-control-plane",
      "harness-work-ledger",
      "harness-team-pulse",
      "harness-meta-loop",
      "harness-builder",
      "harness-verifiers",
      "harness-change-review",
      "harness-change-risk",
      "harness-launch",
      "harness-maintenance",
      "harness-code-review-wizard",
      "harness-workshop",
      "harness-automations",
      "harness-agent-fleet",
      "harness-software-factory",
      "harness-architect",
      "harness-patterns",
    ].includes(view)
  ) {
    return "control";
  }
  if (["tasks", "goals", "dag", "calendar", "ops-schedule", "audit", "telemetry", "automations", "automation-runs"].includes(view)) return "ops";
  if (["atc", "agents", "directory", "identity", "policies", "deployments", "gateway", "schedules"].includes(view)) return "agents";
  if (["chat", "live-chat", "council", "command"].includes(view)) return "chat";
  if (["captures", "projects", "content-pipeline"].includes(view)) return "content";
  if (["qc-dashboard", "qc-runs", "qc-environments", "qc-findings", "qc-metrics", "qc-rulesets"].includes(view)) return "quality";
  if (["telegraph", "meetings", "voice", "people", "org", "office", "live-office", "crm", "hiring", "team"].includes(view)) return "comms";
  if (
    [
      "docs",
      "design-system",
      "skills",
      "registry-lifecycle",
      "registry-evaluate",
      "registry-inventory",
      "registry-installations",
      "registry-runs",
      "search",
      "memory",
    ].includes(view)
  )
    return "knowledge";
  if (["system", "radar", "factory", "pipeline", "feedback", "analytics", "model-routing", "access-profiles", "command-center", "missions", "mission-detail", "trace-inspector", "effectiveness", "operator-evals", "factory-health", "readiness", "friction", "agent-catalog", "dossier", "recommendations"].includes(view)) return "platform";
  if ([
    "code", "recorder", "test-generation", "api-import", "execution",
    "flaky-steps", "hybrid-workflows", "schedule", "codegen", "gherkin", "metrics",
  ].includes(view)) return "code";
  return "home";
}

// ============================================================================
// HEADER METRICS
// ============================================================================

function useHeaderMetrics(
  projectId: Id<"projects"> | null,
  access: { agents: boolean; tasks: boolean },
) {
  const agents = useQuery(api.agents.listAll, projectId && access.agents ? { projectId } : "skip");
  const tasks = useQuery(api.tasks.listAll, projectId && access.tasks ? { projectId } : "skip");
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

function SectionLoadingState() {
  return (
    <div className="flex flex-1 overflow-hidden" role="status" aria-label="Loading workspace">
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="h-16 rounded-xl border border-line animate-pulse bg-surface-2" />
        <div className="grid flex-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-line animate-pulse bg-surface-2" />
          <div className="rounded-xl border border-line animate-pulse bg-surface-2 lg:col-span-2" />
        </div>
      </div>
    </div>
  );
}

function CompanyAccessState({
  status,
  externalUserId,
}: {
  status: "AUTH_REQUIRED" | "NO_MEMBERSHIP";
  externalUserId?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
      <div className="max-w-lg rounded-xl border border-line bg-surface-1 p-6 text-center">
        <h1 className="text-lg font-semibold">
          {status === "AUTH_REQUIRED" ? "Sign in to Mission Control" : "No company access"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {status === "AUTH_REQUIRED"
            ? "Company accounts and workspaces are protected by operator membership. Configure the application authentication provider or explicitly enable the local demo adapter."
            : "Your authenticated operator identity is not assigned to an active company account. Ask a company administrator to add or reactivate your membership."}
        </p>
        {status === "NO_MEMBERSHIP" && externalUserId ? (
          <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left">
            <div className="text-[11px] font-medium text-ink-secondary">Clerk user ID</div>
            <code className="mt-1 block break-all text-[11px] text-ink">{externalUserId}</code>
          </div>
        ) : null}
        {status === "NO_MEMBERSHIP" ? <BootstrapOwner /> : null}
      </div>
    </main>
  );
}

// ============================================================================
// APP
// ============================================================================

export default function App() {
  const authRuntime = useAuthRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyContext = useFlagResolution("company.context");
  const companyContextEnabled = companyContext.enabled;
  // ── Navigation & selection (persist last view so UI reopens where operator left off) ─
  const [currentView, setCurrentView] = useState<MainView>(readInitialView);
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [tenantId, setTenantId] = useState<Id<"tenants"> | null>(null);
  const [companyWarning, setCompanyWarning] = useState(false);
  const intentionallyClearedWorkspace = useRef<string | null>(null);
  const [workspaceWarning, setWorkspaceWarning] = useState<{
    requestedWorkspace: string;
    visible: boolean;
  } | null>(null);
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
  const { modals, open, close, closeAll } = useModalState();

  // ── Derived ─────────────────────────────────────────────────────────────
  const activeSection = useMemo(() => viewToSection(currentView), [currentView]);
  const sectionTabs = SECTION_TABS[activeSection];

  // ── Data ─────────────────────────────────────────────────────────────────
  const companySession = useQuery(
    api.companyContext.getSession,
    companyContextEnabled ? {} : "skip"
  );
  const companies = companySession?.companies ?? [];
  const requestedTenantId = searchParams.get("company");
  const companySelection = useMemo(
    () =>
      selectAccessibleCompany({
        requestedCompany: requestedTenantId,
        persistedCompany: readPersistedCompanyId(),
        companies,
      }),
    [companies, requestedTenantId]
  );
  const scopedProjects = useQuery(
    api.companyContext.listWorkspaces,
    companyContextEnabled && tenantId ? { tenantId } : "skip"
  );
  const legacyProjects = useQuery(
    api.projects.list,
    companyContextEnabled || companyContext.loading ? "skip" : {}
  );
  const projects = companyContextEnabled ? scopedProjects : legacyProjects;
  const scopedProject = useQuery(
    api.companyContext.getWorkspace,
    companyContextEnabled && tenantId && projectId ? { tenantId, projectId } : "skip"
  );
  const legacyProject = useQuery(
    api.projects.get,
    !companyContextEnabled && !companyContext.loading && projectId
      ? { projectId }
      : "skip"
  );
  const project = companyContextEnabled ? scopedProject : legacyProject;
  const availableProjects = useMemo(
    () => projects?.filter((item) => item.status !== "ARCHIVED"),
    [projects]
  );
  const requestedProjectId = searchParams.get("workspace");
  const workspaceSelection = useMemo(
    () => {
      if (!availableProjects) {
        return { projectId: null, requestedUnavailable: false };
      }
      return selectAccessibleWorkspace({
        requestedWorkspace: requestedProjectId,
        persistedWorkspace: readPersistedProjectId(),
        workspaces: availableProjects,
      });
    },
    [availableProjects, requestedProjectId]
  );
  const requestedDemoPersona = searchParams.get("personaPreview");
  const accessContext = useQuery(
    api.accessProfiles.getMyAccessContext,
    companyContextEnabled && tenantId
      ? {
          tenantId,
          ...(projectId ? { projectId } : {}),
          ...(requestedDemoPersona && isPersonaKey(requestedDemoPersona)
            ? { demoPersona: requestedDemoPersona }
            : {}),
        }
      : "skip"
  );
  const canAccessView = useCallback(
    (view: MainView) => {
      if (companyContextEnabled && tenantId && !accessContext) return false;
      return isRouteAuthorized(view, accessContext);
    },
    [accessContext, companyContextEnabled, tenantId],
  );
  const pendingApprovals = useQuery(
    api.approvals.listPending,
    projectId && canAccessView("control-approvals")
      ? { projectId, limit: 10 }
      : "skip"
  );

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = searchParams.get("tab");
    const looksLikeLegacyAutomationLink =
      location.pathname === "/v2/skills" &&
      ((tab !== null && LEGACY_AUTOMATION_TABS.has(tab)) ||
        searchParams.has("workOrder"));
    if (!looksLikeLegacyAutomationLink) return;
    setCurrentView("automations");
    navigate(
      {
        pathname: "/v2/automations",
        search: `?${searchParams.toString()}`,
      },
      { replace: true }
    );
  }, [location.pathname, navigate, searchParams]);

  useEffect(() => {
    if (!companyContextEnabled || companySession?.status !== "READY") return;
    if (
      !tenantId ||
      !companies.some((company) => company.tenantId === tenantId)
    ) {
      setTenantId(companySelection.tenantId);
    }
    if (companySelection.requestedUnavailable) setCompanyWarning(true);
  }, [
    companies,
    companyContextEnabled,
    companySelection.requestedUnavailable,
    companySelection.tenantId,
    companySession?.status,
    tenantId,
  ]);

  useEffect(() => {
    if (!companyContextEnabled || !tenantId || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY_COMPANY, tenantId);
    if (searchParams.get("company") !== tenantId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("company", tenantId);
        return next;
      }, { replace: true });
    }
  }, [companyContextEnabled, searchParams, setSearchParams, tenantId]);

  useEffect(() => {
    if (
      projects &&
      availableProjects &&
      availableProjects.length > 0 &&
      (!projectId || !availableProjects.some((item) => item._id === projectId))
    ) {
      setProjectId(workspaceSelection.projectId);
    } else if (availableProjects && availableProjects.length === 0 && projectId) {
      setProjectId(null);
    }
  }, [availableProjects, projectId, workspaceSelection.projectId]);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_PROJECT, projectId);
      if (searchParams.get("workspace") !== projectId) {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set("workspace", projectId);
          return next;
        }, { replace: true });
      }
    } catch {
      // ignore
    }
  }, [projectId, searchParams, setSearchParams]);

  useEffect(() => {
    setSelectedTaskId(null);
    setSelectedQcRunId(null);
    setSidebarSelectedAgentId(null);
    setKanbanFilters({ agents: [], priorities: [], types: [] });
    closeAll();
  }, [projectId, closeAll]);

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

  useEffect(() => {
    if (
      companyContextEnabled &&
      requestedTenantId !== null &&
      requestedTenantId !== tenantId
    ) {
      return;
    }
    if (
      requestedProjectId &&
      intentionallyClearedWorkspace.current === requestedProjectId
    ) {
      return;
    }
    if (!workspaceSelection.requestedUnavailable || !requestedProjectId) return;
    setWorkspaceWarning((current) =>
      current?.requestedWorkspace === requestedProjectId
        ? current
        : { requestedWorkspace: requestedProjectId, visible: true }
    );
  }, [
    companyContextEnabled,
    requestedProjectId,
    requestedTenantId,
    tenantId,
    workspaceSelection.requestedUnavailable,
  ]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    onNewTask: () => { if (canAccessView("tasks")) open("createTask"); },
    onSearch: () => open("commandPalette"),
    onApprovals: () => { if (canAccessView("control-approvals")) open("approvals"); },
    onAgents: () => { if (canAccessView("agents")) { setSidebarSelectedAgentId(null); open("agentsFlyout"); } },
    onCostAnalytics: () => { if (canAccessView("analytics")) open("costAnalytics"); },
    onGoToBoard: () => { if (canAccessView("tasks")) setCurrentView("tasks"); },
    onShowHelp: () => open("keyboardHelp"),
    onMission: () => { if (canAccessView("missions")) open("missionModal"); },
  });

  // ── Callbacks ────────────────────────────────────────────────────────────
  const handleConfirmPauseSquad = useCallback(async () => {
    close("pauseConfirm");
    if (!projectId) {
      toast("Select a workspace before pausing agents.", true);
      return;
    }
    try {
      const result = await pauseAll({
        projectId,
        reason: "Pause squad from Mission Control",
        userId: "operator",
      });
      toast(`Paused ${(result as { paused: number }).paused} agent(s)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Pause failed", true);
    }
  }, [pauseAll, projectId, toast, close]);

  const handleResumeSquad = useCallback(async () => {
    if (!projectId) {
      toast("Select a workspace before resuming agents.", true);
      return;
    }
    try {
      const result = await resumeAll({
        projectId,
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

  const handleCompanyChange = useCallback((nextTenantId: Id<"tenants">) => {
    if (nextTenantId === tenantId) return;
    intentionallyClearedWorkspace.current = requestedProjectId;
    setTenantId(nextTenantId);
    setProjectId(null);
    setWorkspaceWarning(null);
    setCompanyWarning(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY_PROJECT);
      window.localStorage.setItem(STORAGE_KEY_COMPANY, nextTenantId);
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("company", nextTenantId);
      next.delete("workspace");
      return next;
    }, { replace: true });
  }, [requestedProjectId, setSearchParams, tenantId]);

  // ── Header data ──────────────────────────────────────────────────────────
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  const { activeCount, taskCount, aiStatus } = useHeaderMetrics(projectId, {
    agents: canAccessView("agents"),
    tasks: canAccessView("tasks"),
  });

  // ── Section renderer ─────────────────────────────────────────────────────
  function renderSection() {
    const shellOnlyE2E = shouldBypassRuntimeCompatibility(
      import.meta.env.DEV,
      import.meta.env.VITE_RUNTIME_CONTRACT_E2E_BYPASS,
    );
    const sectionProjectId =
      projectId ??
      (shellOnlyE2E ? ("e2e-shell-project" as Id<"projects">) : null);

    if (accessContext && !isRouteAuthorized(currentView, accessContext)) {
      const landing = (accessContext.profile?.defaultLandingView ?? "command-center") as MainView;
      return (
        <AccessDeniedState
          requestedView={currentView}
          persona={accessContext.persona}
          reason={accessContext.denialReason}
          landingView={landing}
          onReturn={(view) => {
            setCurrentView(view);
            navigate({
              pathname: `/v2/${view}`,
              search: `?${searchParams.toString()}`,
            });
          }}
        />
      );
    }

    if (currentView === "access-profiles") {
      return tenantId ? <AccessProfilesView tenantId={tenantId} /> : <SectionLoadingState />;
    }

    if (!shellOnlyE2E && currentView !== "projects") {
      if (!projects || (projectId && project === undefined)) {
        return <SectionLoadingState />;
      }
      if (availableProjects.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center bg-app p-6">
            <div className="max-w-md rounded-xl border border-line bg-surface-1 p-6 text-center">
              <h1 className="text-lg font-semibold text-ink">Create a workspace</h1>
              <p className="mt-2 text-sm text-ink-secondary">
                Work Orders, agents, runs, and evidence require an explicit workspace boundary.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView("projects")}
                className="mt-4 h-9 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink"
              >
                Open workspace settings
              </button>
            </div>
          </div>
        );
      }
      if (!projectId || !project) {
        return <SectionLoadingState />;
      }
    }

    if (
      [
        "harness-health",
        "harness-loops",
        "harness-control-plane",
        "harness-work-ledger",
        "harness-verifiers",
        "harness-change-review",
        "harness-change-risk",
        "harness-launch",
        "harness-meta-loop",
        "harness-team-pulse",
        "harness-builder",
        "harness-maintenance",
        "harness-code-review-wizard",
        "harness-workshop",
        "harness-automations",
        "harness-agent-fleet",
        "harness-software-factory",
        "harness-architect",
      "harness-patterns",
      ].includes(currentView)
    ) {
      return (
        <HarnessSection
          currentView={currentView}
          projectId={sectionProjectId}
          onNavigate={setCurrentView}
        />
      );
    }

    switch (activeSection) {
      case "home":
        return (
          <DashboardOverview
            projectId={sectionProjectId}
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
      case "control":
        return (
          <ControlSection
            currentView={currentView}
            projectId={sectionProjectId}
            onNavigate={setCurrentView}
          />
        );
      case "ops":
        return (
          <OpsSection
            currentView={currentView}
            projectId={sectionProjectId}
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
            projectId={sectionProjectId}
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
            projectId={sectionProjectId}
            onOpenSuggestionsDrawer={() => open("suggestionsDrawer")}
          />
        );
      case "content":
        return (
          <ContentSection
            currentView={currentView}
            projectId={sectionProjectId}
            onProjectSelect={setProjectId}
            tenantId={companyContextEnabled ? tenantId : null}
            companyContextEnabled={companyContextEnabled}
          />
        );
      case "comms":
        return (
          <CommsSection
            currentView={currentView}
            projectId={sectionProjectId}
            onNavigate={setCurrentView}
          />
        );
      case "knowledge":
        return (
          <KnowledgeSection
            currentView={currentView}
            projectId={sectionProjectId}
            onNavigate={setCurrentView}
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
            projectId={sectionProjectId}
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
            projectId={sectionProjectId}
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
            projectId={sectionProjectId}
            onNavigate={setCurrentView}
            onOpenHealthDashboard={() => open("healthDashboard")}
            onOpenMonitoringDashboard={() => open("monitoringDashboard")}
            onTaskSelect={(taskId) => {
              setSelectedTaskId(taskId);
              setCurrentView("tasks");
            }}
          />
        );
      default:
        return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  // The Software Factory v2 shell is now the default UI. Set the `ui.shell.v1`
  // flag (or VITE_FLAG_UI_SHELL_V1=true) to fall back to the legacy shell.
  const legacyShell = useFlag("ui.shell.v1");

  if (companyContext.loading || (companyContextEnabled && companySession === undefined)) {
    return <SectionLoadingState />;
  }
  if (companyContextEnabled && tenantId && accessContext === undefined) {
    return <SectionLoadingState />;
  }
  if (
    companyContextEnabled &&
    companySession &&
    companySession.status !== "READY"
  ) {
    return (
      <CompanyAccessState
        status={companySession.status}
        externalUserId={authRuntime.externalUserId}
      />
    );
  }

  if (!legacyShell) {
    return (
      <WorkspaceScopeProvider value={{ projectId, setProjectId, project }}>
        <PrivacyProvider>
          <ScopeRecoveryNotice
            message={
              companyWarning
                ? "The requested company account was unavailable. Mission Control opened an accessible account instead."
                : workspaceWarning?.visible === true
                  ? WORKSPACE_RECOVERY_WARNING
                  : null
            }
            onDismiss={() =>
              companyWarning
                ? setCompanyWarning(false)
                : setWorkspaceWarning((current) =>
                    current ? { ...current, visible: false } : current
                  )
            }
          />
          <AppShellV2
            activeView={currentView}
            onNavigate={setCurrentView}
            workspaceSwitcher={
              <ProjectSwitcher
                projects={projects}
                showDetails
                onManage={() => setCurrentView("projects")}
              />
            }
            companySwitcher={
              companyContextEnabled ? (
                <CompanySwitcher
                  companies={companies}
                  tenantId={tenantId}
                  onChange={handleCompanyChange}
                />
              ) : undefined
            }
            footer={authRuntime.userControl}
            onOpenSearch={() => open("commandPalette")}
            pendingApprovals={pendingApprovals?.length ?? 0}
            onOpenApprovals={() => open("approvals")}
            canOpenApprovals={canAccessView("control-approvals")}
            projectId={projectId}
            access={accessContext}
            onDemoPersonaChange={(persona?: PersonaKey) => {
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (persona) next.set("personaPreview", persona);
                else next.delete("personaPreview");
                return next;
              }, { replace: true });
            }}
          >
            <Suspense fallback={<SectionLoadingState />}>{renderSection()}</Suspense>
          </AppShellV2>
          <Suspense fallback={null}>
            <TaskDrawerTabs
              taskId={selectedTaskId}
              onClose={() => setSelectedTaskId(null)}
              onNavigateToWorkOrder={(workOrderId) => {
                const next = new URLSearchParams(searchParams);
                next.set("workOrder", workOrderId);
                setSelectedTaskId(null);
                setCurrentView("control-work-orders");
                navigate({
                  pathname: "/v2/control-work-orders",
                  search: `?${next.toString()}`,
                });
              }}
              onNavigateToMission={(missionId) => {
                const next = new URLSearchParams(searchParams);
                next.set("mission", missionId);
                setSelectedTaskId(null);
                setCurrentView("mission-detail");
                navigate({
                  pathname: "/v2/mission-detail",
                  search: `?${next.toString()}`,
                });
              }}
            />
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
              canAccessView={canAccessView}
            />
          </Suspense>
        </PrivacyProvider>
      </WorkspaceScopeProvider>
    );
  }

  return (
    <WorkspaceScopeProvider value={{ projectId, setProjectId, project }}>
      <PrivacyProvider>
      <ScopeRecoveryNotice
        message={
          companyWarning
            ? "The requested company account was unavailable. Mission Control opened an accessible account instead."
            : workspaceWarning?.visible === true
              ? WORKSPACE_RECOVERY_WARNING
              : null
        }
        onDismiss={() =>
          companyWarning
            ? setCompanyWarning(false)
            : setWorkspaceWarning((current) =>
                current ? { ...current, visible: false } : current
              )
        }
      />
      <div className="flex h-screen flex-col bg-background text-foreground">
        <AppTopBar
          projectSwitcher={<ProjectSwitcher projects={projects} />}
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
          <TaskDrawerTabs
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            onNavigateToWorkOrder={(workOrderId) => {
              const next = new URLSearchParams(searchParams);
              next.set("workOrder", workOrderId);
              setSelectedTaskId(null);
              setCurrentView("control-work-orders");
              navigate({
                pathname: "/v2/control-work-orders",
                search: `?${next.toString()}`,
              });
            }}
            onNavigateToMission={(missionId) => {
              const next = new URLSearchParams(searchParams);
              next.set("mission", missionId);
              setSelectedTaskId(null);
              setCurrentView("mission-detail");
              navigate({
                pathname: "/v2/mission-detail",
                search: `?${next.toString()}`,
              });
            }}
          />
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
            canAccessView={canAccessView}
          />
        </Suspense>
      </div>
      </PrivacyProvider>
    </WorkspaceScopeProvider>
  );
}
