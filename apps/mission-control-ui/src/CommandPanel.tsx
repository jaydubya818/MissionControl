import { useState, useRef } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  Play, Pause, Plus, Shield, Terminal, AlertTriangle,
  CheckCircle2, Sparkles, XCircle, Zap, Activity, Users, ClipboardList,
  Radio, ChevronRight, Send, Clock, TrendingUp, BarChart3, Loader2, Bot,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/factory/ProgressBar";
import { PageHeader } from "./components/PageHeader";
import { RiskBadge, type RiskLevel } from "./components/factory/badges";
import { useToast } from "./Toast";

interface CommandPanelProps {
  projectId: Id<"projects"> | null;
  onOpenSuggestionsDrawer?: () => void;
}

// ---------------------------------------------------------------------------
// QUICK ACTIONS
// ---------------------------------------------------------------------------

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  variant: "default" | "warning" | "danger" | "success" | "info";
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "reverse-prompt",  label: "Reverse Prompt",     description: "AI suggests tasks to advance your mission",  icon: Sparkles,      accent: "text-ink-secondary", variant: "default"  },
  { id: "pause-all",       label: "Pause All Agents",   description: "Immediately halt all active agents",         icon: Pause,         accent: "text-warn",          variant: "warning"  },
  { id: "resume-all",      label: "Resume All Agents",  description: "Resume all paused agents",                   icon: Play,          accent: "text-ok",            variant: "success"  },
  { id: "broadcast",       label: "Broadcast",          description: "Send directive to all active agents",        icon: Radio,         accent: "text-ink-secondary", variant: "info"     },
  { id: "emergency-stop",  label: "Emergency Stop",     description: "Kill switch — quarantine all agents",        icon: AlertTriangle, accent: "text-err",           variant: "danger"   },
];

const variantHover: Record<string, string> = {
  default: "hover:bg-surface-2 hover:border-line-strong",
  warning: "hover:bg-surface-2 hover:border-line-strong",
  danger:  "hover:bg-surface-2 hover:border-line-strong",
  success: "hover:bg-surface-2 hover:border-line-strong",
  info:    "hover:bg-surface-2 hover:border-line-strong",
};

// ---------------------------------------------------------------------------
// STATUS DOT
// ---------------------------------------------------------------------------

function statusColor(status: string) {
  switch (status) {
    case "ACTIVE":      return "bg-ok";
    case "PAUSED":      return "bg-warn";
    case "DRAINED":     return "bg-info-accent";
    case "QUARANTINED": return "bg-err";
    case "OFFLINE":     return "bg-ink-muted";
    default:            return "bg-ink-muted";
  }
}

// ---------------------------------------------------------------------------
// SUB-SECTIONS
// ---------------------------------------------------------------------------

function SectionHeader({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
      <span className="text-[13.5px] font-semibold text-ink">{title}</span>
      {count !== undefined && (
        <span className="text-[11.5px] font-medium px-1.5 py-0.5 rounded-md border border-line bg-surface-2 text-ink-secondary">{count}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AGENT FLEET
// ---------------------------------------------------------------------------

function AgentFleet({ projectId, onToast }: { projectId: Id<"projects"> | null; onToast: (msg: string, err?: boolean) => void }) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const updateStatus = useMutation(api.agents.updateStatus);

  if (!agents || agents.length === 0) {
    return (
      <div className="text-[12.5px] text-ink-muted text-center py-4">No agents registered</div>
    );
  }

  const handleToggle = async (agent: Doc<"agents">) => {
    try {
      if (agent.status === "ACTIVE") {
        await updateStatus({ agentId: agent._id, status: "PAUSED", reason: "Command Panel" });
        onToast(`Paused ${agent.name}`);
      } else if (agent.status === "PAUSED") {
        await updateStatus({ agentId: agent._id, status: "ACTIVE", reason: "Command Panel" });
        onToast(`Resumed ${agent.name}`);
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed", true);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {agents.slice(0, 8).map((agent) => (
        <div
          key={agent._id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-line bg-surface-2 hover:border-line-strong transition-colors duration-150 group"
        >
          {agent.emoji ? (
            <span className="text-lg shrink-0">{agent.emoji}</span>
          ) : (
            <Bot className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-ink truncate">{agent.name}</p>
            <p className="text-[11.5px] text-ink-muted truncate">{agent.role}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("h-2 w-2 rounded-full", statusColor(agent.status))} />
            <span className="text-[11.5px] text-ink-muted">{agent.status}</span>
            {(agent.status === "ACTIVE" || agent.status === "PAUSED") && (
              <button
                onClick={() => handleToggle(agent)}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded-md hover:bg-surface-3"
                title={agent.status === "ACTIVE" ? "Pause" : "Resume"}
                aria-label={agent.status === "ACTIVE" ? "Pause agent" : "Resume agent"}
              >
                {agent.status === "ACTIVE"
                  ? <Pause className="h-3 w-3 text-warn" />
                  : <Play className="h-3 w-3 text-ok" />}
              </button>
            )}
          </div>
        </div>
      ))}
      {agents.length > 8 && (
        <div className="col-span-full text-center text-[12.5px] text-ink-muted py-1">
          +{agents.length - 8} more agents
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// APPROVAL QUEUE
// ---------------------------------------------------------------------------

function ApprovalQueue({ projectId, onToast }: { projectId: Id<"projects"> | null; onToast: (msg: string, err?: boolean) => void }) {
  const approvals = useQuery(api.approvals.pendingSummary, projectId ? { projectId, limit: 6 } : "skip");
  const approve = useMutation(api.approvals.approve);
  const deny = useMutation(api.approvals.deny);
  const [loading, setLoading] = useState<string | null>(null);

  if (!approvals) return <div className="text-[12.5px] text-ink-muted text-center py-4">Loading…</div>;
  if (approvals.total === 0) return (
    <div className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-ink-muted">
      <CheckCircle2 className="h-3.5 w-3.5 text-ok" strokeWidth={1.75} />
      All clear — no pending approvals
    </div>
  );

  const handleApprove = async (id: Id<"approvals">) => {
    setLoading(id);
    try {
      await approve({ approvalId: id, reason: "Command Panel approval" });
      onToast("Approved");
    } catch (e) { onToast(e instanceof Error ? e.message : "Failed", true); }
    finally { setLoading(null); }
  };

  const handleDeny = async (id: Id<"approvals">) => {
    setLoading(id);
    try {
      await deny({ approvalId: id, reason: "Command Panel denial" });
      onToast("Denied");
    } catch (e) { onToast(e instanceof Error ? e.message : "Failed", true); }
    finally { setLoading(null); }
  };

  return (
    <div className="space-y-2">
      {approvals.items.map((a) => (
        <div key={a._id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-line bg-surface-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <RiskBadge level={a.riskLevel as RiskLevel} />
              <span className="text-[11.5px] text-ink-muted">{a.actionType}</span>
            </div>
            <p className="text-[12.5px] text-ink truncate">{a.actionSummary}</p>
            <p className="text-[11.5px] text-ink-muted mt-0.5">{a.justification?.slice(0, 80)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => handleApprove(a._id)}
              disabled={loading === a._id}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium bg-ok-soft text-ok hover:opacity-90 transition-opacity duration-150 disabled:opacity-40"
            >
              {loading === a._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              OK
            </button>
            <button
              onClick={() => handleDeny(a._id)}
              disabled={loading === a._id}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium bg-err-soft text-err hover:opacity-90 transition-opacity duration-150 disabled:opacity-40"
            >
              <XCircle className="h-3 w-3" />
              No
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QUICK TASK CREATOR
// ---------------------------------------------------------------------------

const TASK_TYPES = ["ENGINEERING", "CONTENT", "RESEARCH", "REVIEW", "PLANNING", "OPS"];

function QuickTaskCreator({ projectId, onToast }: { projectId: Id<"projects"> | null; onToast: (msg: string, err?: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("ENGINEERING");
  const [priority, setPriority] = useState(2);
  const [loading, setLoading] = useState(false);
  const createTask = useMutation(api.tasks.create);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (!title.trim() || loading) return;
    setLoading(true);
    try {
      await createTask({
        projectId: projectId ?? undefined,
        title: title.trim(),
        type,
        priority,
        source: "DASHBOARD",
        createdBy: "HUMAN",
        idempotencyKey: `cmd_${Date.now()}`,
      });
      onToast(`Task "${title.slice(0, 30)}" created`);
      setTitle("");
      inputRef.current?.focus();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to create task", true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="Task title…"
        aria-label="Task title"
        className="h-9 w-full px-3 rounded-lg border border-line bg-surface-1 text-[13.5px] text-ink placeholder:text-ink-muted"
      />
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Task type"
          className="flex-1 px-2 py-1.5 rounded-lg border border-line bg-surface-1 text-[12.5px] text-ink"
        >
          {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[12.5px] font-medium transition-colors duration-150",
                priority === p
                  ? p === 3 ? "bg-err-soft text-err" : p === 2 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"
                  : "bg-surface-2 text-ink-muted hover:text-ink"
              )}
            >
              P{p}
            </button>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!title.trim() || loading}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-act text-act-ink text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity duration-150"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTIVITY FEED
// ---------------------------------------------------------------------------

function ActivityFeed({ projectId }: { projectId: Id<"projects"> | null }) {
  const activities = useQuery(
    api.activities.listRecent,
    projectId ? { projectId, limit: 10 } : { limit: 10 }
  );

  if (!activities) return <div className="text-[12.5px] text-ink-muted text-center py-4">Loading…</div>;
  if (activities.length === 0) return <div className="text-[12.5px] text-ink-muted text-center py-4">No recent activity</div>;

  const actionColor = (action: string) => {
    if (action.includes("CREATED") || action.includes("CREATE")) return "text-ok";
    if (action.includes("APPROVED") || action.includes("DONE")) return "text-ok";
    if (action.includes("ERROR") || action.includes("FAIL") || action.includes("DENY")) return "text-err";
    if (action.includes("PAUSE") || action.includes("BLOCK")) return "text-warn";
    return "text-ink-muted";
  };

  return (
    <div className="space-y-0 divide-y divide-line">
      {activities.map((a) => (
        <div key={a._id} className="flex items-start gap-3 py-2.5">
          <span className={cn("text-[11.5px] font-medium mt-0.5 shrink-0 min-w-[70px]", actionColor(a.action))}>
            {a.action.replace(/_/g, " ").slice(0, 12)}
          </span>
          <p className="text-[12.5px] text-ink flex-1 leading-relaxed truncate">{a.description}</p>
          <span className="text-[11.5px] text-ink-muted shrink-0">
            {new Date(a._creationTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BROADCAST
// ---------------------------------------------------------------------------

function BroadcastPanel({ onToast }: { onToast: (msg: string, err?: boolean) => void }) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    // Simulate broadcast — wire to actual messaging when available
    await new Promise((r) => setTimeout(r, 800));
    onToast(`Broadcast sent to all agents`);
    setMsg("");
    setSending(false);
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="Send directive to all active agents…"
        aria-label="Broadcast directive"
        className="h-9 flex-1 px-3 rounded-lg border border-line bg-surface-1 text-[13.5px] text-ink placeholder:text-ink-muted"
      />
      <button
        onClick={handleSend}
        disabled={!msg.trim() || sending}
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-act text-act-ink text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity duration-150"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK PIPELINE STATS
// ---------------------------------------------------------------------------

function TaskPipeline({ projectId }: { projectId: Id<"projects"> | null }) {
  const allTasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });

  if (!allTasks) return null;

  const counts: Record<string, number> = {};
  for (const t of allTasks) counts[t.status] = (counts[t.status] ?? 0) + 1;

  const pipeline = [
    { label: "INBOX",      color: "bg-ink-muted" },
    { label: "ASSIGNED",   color: "bg-ink-muted" },
    { label: "IN_PROGRESS",color: "bg-info-accent" },
    { label: "REVIEW",     color: "bg-info-accent" },
    { label: "DONE",       color: "bg-ok" },
    { label: "BLOCKED",    color: "bg-warn" },
  ];
  const total = allTasks.length || 1;

  return (
    <div className="space-y-2">
      {pipeline.map(({ label, color }) => {
        const n = counts[label] ?? 0;
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="text-[11.5px] text-ink-muted w-24 shrink-0">{label.replace("_", " ")}</span>
            <div className="flex-1">
              <ProgressBar fraction={n / total} barClassName={color} />
            </div>
            <span className="text-[11.5px] font-medium text-ink w-6 text-right">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function CommandPanel({ projectId, onOpenSuggestionsDrawer }: CommandPanelProps) {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{ label: string; time: string }[]>([]);
  const { toast } = useToast();

  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.pendingSummary, projectId ? { projectId, limit: 10 } : "skip");
  const allTasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const approve = useMutation(api.approvals.approve);

  const activeCount  = agents?.filter((a) => a.status === "ACTIVE").length ?? 0;
  const pausedCount  = agents?.filter((a) => a.status === "PAUSED").length ?? 0;
  const pendingCount = approvals?.total ?? 0;
  const taskCount    = allTasks?.length ?? 0;
  const doneCount    = allTasks?.filter((t) => t.status === "DONE").length ?? 0;

  const logAction = (label: string) => {
    setLastAction(label);
    setActionLog((prev) => [{ label, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
  };

  const handleAction = async (actionId: string) => {
    logAction(actionId);
    try {
      switch (actionId) {
        case "reverse-prompt":
          if (onOpenSuggestionsDrawer) onOpenSuggestionsDrawer();
          else toast("Reverse Prompt drawer not available");
          break;
        case "pause-all": {
          const r = await pauseAll({ projectId: projectId ?? undefined, reason: "Command Panel" });
          toast(`Paused ${(r as { paused: number }).paused} agent(s)`);
          break;
        }
        case "resume-all": {
          const r = await resumeAll({ projectId: projectId ?? undefined, reason: "Command Panel" });
          toast(`Resumed ${(r as { resumed: number }).resumed} agent(s)`);
          break;
        }
        case "broadcast":
          toast("Use the Broadcast bar below");
          break;
        case "emergency-stop": {
          if (!window.confirm("Emergency stop: quarantine ALL agents?")) return;
          await pauseAll({ projectId: projectId ?? undefined, reason: "EMERGENCY STOP", userId: "operator" });
          toast("Emergency stop executed — all agents paused", true);
          break;
        }
        default:
          toast(`"${actionId}" not yet wired`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", true);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Command Panel"
        description="Orchestrate agents, tasks, and approvals in real-time"
        icon={<Terminal size={16} strokeWidth={1.7} />}
        status={
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Live
          </span>
        }
      />
      <div className="max-w-[1100px] mx-auto px-6 py-5 space-y-6">

        {/* Status Bar */}
        <Card className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Active Agents",  value: activeCount,  color: "text-ok",   dot: "bg-ok" },
              { label: "Paused Agents",  value: pausedCount,  color: "text-warn", dot: "bg-warn" },
              { label: "Pending Approvals", value: pendingCount, color: pendingCount > 0 ? "text-err" : "text-ink", dot: pendingCount > 0 ? "bg-err" : "bg-ink-muted" },
              { label: "Total Tasks",    value: taskCount,    color: "text-ink",  dot: "bg-ink-muted" },
              { label: "Done Today",     value: doneCount,    color: "text-ok",   dot: "bg-ok" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <span className={cn("h-2 w-2 rounded-full shrink-0", stat.dot)} />
                <div>
                  <p className={cn("text-[20px] font-semibold leading-none", stat.color)}>{stat.value}</p>
                  <p className="text-[11.5px] text-ink-muted mt-0.5">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Actions */}
        <div>
          <SectionHeader icon={Zap} title="Quick Actions" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.id}
                  className={cn("p-3.5 cursor-pointer transition-colors duration-150 border", variantHover[action.variant])}
                  onClick={() => handleAction(action.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-surface-2 p-1.5 border border-line shrink-0">
                      <Icon className={cn("h-4 w-4", action.accent)} strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-ink leading-tight">{action.label}</p>
                      <p className="text-[11.5px] text-ink-muted leading-relaxed mt-0.5 line-clamp-2">{action.description}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Broadcast */}
        <div>
          <SectionHeader icon={Radio} title="Broadcast Directive" />
          <Card className="p-4">
            <BroadcastPanel onToast={toast} />
          </Card>
        </div>

        {/* 2-col: Agent Fleet + Approval Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <SectionHeader icon={Users} title="Agent Fleet" count={agents?.length} />
            <AgentFleet projectId={projectId} onToast={toast} />
          </Card>
          <Card className="p-4">
            <SectionHeader icon={Shield} title="Approval Queue" count={pendingCount} />
            <ApprovalQueue projectId={projectId} onToast={toast} />
          </Card>
        </div>

        {/* 2-col: Quick Task Creator + Task Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <SectionHeader icon={Plus} title="Quick Task Creator" />
            <QuickTaskCreator projectId={projectId} onToast={toast} />
          </Card>
          <Card className="p-4">
            <SectionHeader icon={BarChart3} title="Task Pipeline" count={taskCount} />
            <TaskPipeline projectId={projectId} />
          </Card>
        </div>

        {/* Activity Feed + Action Log */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <SectionHeader icon={Activity} title="Activity Feed" />
            <ActivityFeed projectId={projectId} />
          </Card>
          <Card className="p-4">
            <SectionHeader icon={Clock} title="Action Log" count={actionLog.length} />
            {actionLog.length === 0 ? (
              <div className="text-[12.5px] text-ink-muted text-center py-4">No actions taken yet this session</div>
            ) : (
              <div className="space-y-0 divide-y divide-line">
                {actionLog.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="text-[12.5px] text-ink font-medium">{entry.label.replace(/-/g, " ")}</span>
                    <span className="text-[11.5px] text-ink-muted">{entry.time}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

      </div>
    </section>
  );
}
