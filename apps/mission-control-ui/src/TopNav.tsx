import { cn } from "@/lib/utils";

/** Primary app shell uses CommandNav + TabBar in App.tsx; TopNav is available for alternative layouts. */
export type MainView =
  | "home"
  | "atc"
  | "tasks"
  | "agents"
  | "directory"
  | "policies"
  | "deployments"
  | "audit"
  | "telemetry"
  | "dag"
  | "chat"
  | "council"
  | "calendar"
  | "projects"
  | "memory"
  | "captures"
  | "docs"
  | "design-system"
  | "skills"
  | "people"
  | "org"
  | "office"
  | "live-office"
  | "search"
  | "identity"
  | "telegraph"
  | "meetings"
  | "voice"
  | "content-pipeline"
  | "crm"
  | "command"
  | "code"
  | "recorder"
  | "test-generation"
  | "api-import"
  | "execution"
  | "flaky-steps"
  | "hybrid-workflows"
  | "schedule"
  | "codegen"
  | "gherkin"
  | "metrics"
  | "qc-dashboard"
  | "qc-runs"
  | "qc-environments"
  | "qc-findings"
  | "qc-metrics"
  | "qc-rulesets"
  | "gateway"
  | "live-chat"
  | "schedules"
  | "hiring"
  | "team"
  | "system"
  | "radar"
  | "factory"
  | "pipeline"
  | "feedback"
  | "ops-schedule"
  | "goals"
  | "control-portfolio"
  | "control-work-orders"
  | "control-fleet"
  | "control-approvals";

/** Top-level command center sections */
export type CommandSection =
  | "home"
  | "control"
  | "ops"
  | "agents"
  | "chat"
  | "content"
  | "comms"
  | "knowledge"
  | "code"
  | "quality"
  | "platform";

interface TopNavProps {
  currentView: MainView;
  onViewChange: (view: MainView) => void;
}

interface NavItem {
  id: MainView;
  label: string;
  icon?: string;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { id: "control-portfolio", label: "Control" },
  { id: "tasks", label: "Tasks", shortcut: "1" },
  { id: "agents", label: "Agents" },
  { id: "directory", label: "Directory" },
  { id: "policies", label: "Policies" },
  { id: "deployments", label: "Deployments" },
  { id: "audit", label: "Audit" },
  { id: "telemetry", label: "Telemetry" },
  { id: "dag", label: "DAG" },
  { id: "chat", label: "Chat", shortcut: "2" },
  { id: "council", label: "Council", shortcut: "3" },
  { id: "calendar", label: "Calendar", shortcut: "4" },
  { id: "projects", label: "Projects", shortcut: "5" },
  { id: "memory", label: "Memory", shortcut: "6" },
  { id: "captures", label: "Captures", shortcut: "7" },
  { id: "docs", label: "Docs", shortcut: "8" },
  { id: "people", label: "People", shortcut: "9" },
  { id: "org", label: "Org", shortcut: "0" },
  { id: "office", label: "Office" },
  { id: "identity", label: "Identity" },
  { id: "telegraph", label: "Telegraph" },
  { id: "meetings", label: "Meetings" },
  { id: "voice", label: "Voice" },
  { id: "hiring", label: "Hiring" },
  { id: "search", label: "Search" },
];

export function TopNav({ currentView, onViewChange }: TopNavProps) {
  return (
    <nav
      className="sticky top-0 z-[100] border-b border-border bg-card"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center gap-1 overflow-x-auto px-4">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap border-none bg-transparent px-4 py-3 text-sm font-medium transition-colors cursor-pointer",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              )}
              aria-label={`Navigate to ${item.label}`}
              aria-current={isActive ? "page" : undefined}
              title={item.shortcut ? `${item.label} (Cmd+${item.shortcut})` : item.label}
            >
              {item.icon && <span className="text-[1.1rem] leading-none">{item.icon}</span>}
              <span className="leading-none">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
