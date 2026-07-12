import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiscoverAgentsModal } from "./DiscoverAgentsModal";
import {
  Bot,
  Activity,
  ShieldAlert,
  ListTodo,
  Clock,
  DollarSign,
  AlertTriangle,
  Radio,
  Search,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
} from "lucide-react";
import { AgentSettingsPanel } from "./AgentSettingsPanel";

const STATUS_CONFIG: Record<string, { label: string; tone: StatusBadgeProps["tone"]; dotClass: string }> = {
  ACTIVE: { label: "Active", tone: "success", dotClass: "bg-ok" },
  PAUSED: { label: "Paused", tone: "warning", dotClass: "bg-warn" },
  DRAINED: { label: "Drained", tone: "neutral", dotClass: "bg-ink-muted" },
  QUARANTINED: { label: "Quarantined", tone: "error", dotClass: "bg-err" },
  OFFLINE: { label: "Offline", tone: "neutral", dotClass: "bg-ink-muted" },
};

const STATUS_FILTER_OPTIONS = ["ACTIVE", "PAUSED", "QUARANTINED", "OFFLINE"] as const;

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const FILTER_CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 h-8 text-xs font-medium transition-colors duration-150";
const FILTER_CHIP_ACTIVE = "border-line-strong bg-surface-2 text-ink";
const FILTER_CHIP_INACTIVE =
  "border-line text-ink-secondary hover:border-line-strong hover:text-ink";

export function AgentRegistryView({
  projectId,
  onNavigateToIdentity,
  onOpenCreateAgent,
}: {
  projectId: Id<"projects"> | null;
  onNavigateToIdentity?: () => void;
  onOpenCreateAgent?: () => void;
}) {
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [settingsAgent, setSettingsAgent] = useState<Doc<"agents"> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTER_OPTIONS[number] | "ALL">("ALL");
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [gatewayConfigured, setGatewayConfigured] = useState(false);

  const orchestrationBase = getOrchestrationBaseUrl();

  useEffect(() => {
    let cancelled = false;
    fetch(orchestrationBase ? `${orchestrationBase}/gateway/status` : "/gateway/status")
      .then((r) => r.json())
      .then((data: { configured?: boolean; urlConfigured?: boolean; tokenConfigured?: boolean }) => {
        if (!cancelled)
          setGatewayConfigured(Boolean(data.configured ?? (data.urlConfigured && data.tokenConfigured)));
      })
      .catch(() => {
        if (!cancelled) setGatewayConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orchestrationBase]);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const updateStatus = useMutation(api.agents.updateStatus);
  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const resetAll = useMutation(api.agents.resetAll);
  const { toast } = useToast();

  const taskCountByAgent = useMemo(() => {
    const map = new Map<Id<"agents">, number>();
    if (!tasks) return map;
    for (const task of tasks)
      for (const id of task.assigneeIds)
        map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [tasks]);

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    let list = agents;
    if (statusFilter !== "ALL") list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          (a.emoji ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [agents, statusFilter, search]);

  if (!agents || !tasks) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <div className="h-6 w-40 rounded animate-pulse bg-surface-2 mb-2" />
        <div className="h-4 w-56 rounded animate-pulse bg-surface-2" />
      </main>
    );
  }

  const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
  const pausedCount = agents.filter((a) => a.status === "PAUSED").length;
  const quarantinedCount = agents.filter((a) => a.status === "QUARANTINED").length;
  const offlineCount = agents.filter((a) => a.status === "OFFLINE").length;
  const assignedCount = tasks.filter((t) => t.assigneeIds.length > 0).length;

  async function setStatus(agent: Doc<"agents">, status: string, reason: string) {
    const isDangerous = status === "QUARANTINED" || status === "DRAINED";
    if (isDangerous) {
      setConfirmState({
        open: true,
        title: `Set ${agent.name} to ${status}?`,
        description: `This will change the agent's status. ${status === "QUARANTINED" ? "The agent will be isolated from receiving new work." : ""}`,
        danger: true,
        onConfirm: async () => {
          try {
            await updateStatus({ agentId: agent._id, status, reason });
            toast(`${agent.name} → ${status}`);
          } catch (e) {
            toast(e instanceof Error ? e.message : "Status update failed", true);
          }
          setConfirmState(null);
        },
      });
      return;
    }
    try {
      await updateStatus({ agentId: agent._id, status, reason });
      toast(`${agent.name} → ${status}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Status update failed", true);
    }
  }

  const handlePauseAll = () => {
    setConfirmState({
      open: true,
      title: "Pause all active agents?",
      description: "All agents currently active will be paused. You can resume them from the operator controls.",
      danger: true,
      onConfirm: async () => {
        try {
          const r = await pauseAll({ projectId: projectId ?? undefined, reason: "Operator pause", userId: "operator" });
          toast(`Paused ${(r as { paused: number }).paused} agent(s)`);
        } catch (e) {
          toast(e instanceof Error ? e.message : "Failed", true);
        }
        setConfirmState(null);
      },
    });
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Agent Registry"
        description={`${agents.length} agents · ${activeCount} active`}
        eyebrow="Agents"
        status={
          gatewayConfigured ? (
            <StatusBadge tone="success">Gateway connected</StatusBadge>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {onOpenCreateAgent && (
              <Button size="sm" onClick={onOpenCreateAgent}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create agent
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setDiscoverOpen(true)}>
              <Radio className="h-3.5 w-3.5 mr-1.5" />
              Discover agents
            </Button>
          </div>
        }
      />
      <DiscoverAgentsModal
        projectId={projectId}
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        onImported={() => toast("Agent imported")}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
      <div className="grid shrink-0 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <MetricBlock
            label="Active"
            value={activeCount}
            detail="Agents currently trusted to take live work"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Paused"
            value={pausedCount}
            detail="Agents intentionally held out of the queue"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Quarantined"
            value={quarantinedCount}
            detail="Agents requiring intervention before reuse"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Assigned tasks"
            value={assignedCount}
            detail="Tasks currently routed to one or more agents"
          />
        </Card>
      </div>

      {/* Fleet health bar */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto flex-nowrap">
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className={cn(
            FILTER_CHIP_BASE,
            statusFilter === "ALL" ? FILTER_CHIP_ACTIVE : FILTER_CHIP_INACTIVE
          )}
        >
          <Bot size={13} strokeWidth={1.7} aria-hidden />
          All {agents.length}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("ACTIVE")}
          className={cn(
            FILTER_CHIP_BASE,
            statusFilter === "ACTIVE" ? FILTER_CHIP_ACTIVE : FILTER_CHIP_INACTIVE
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          Active {activeCount}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("PAUSED")}
          className={cn(
            FILTER_CHIP_BASE,
            statusFilter === "PAUSED" ? FILTER_CHIP_ACTIVE : FILTER_CHIP_INACTIVE
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-warn" />
          Paused {pausedCount}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("QUARANTINED")}
          className={cn(
            FILTER_CHIP_BASE,
            statusFilter === "QUARANTINED" ? FILTER_CHIP_ACTIVE : FILTER_CHIP_INACTIVE
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-err" />
          Quarantined {quarantinedCount}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("OFFLINE")}
          className={cn(
            FILTER_CHIP_BASE,
            statusFilter === "OFFLINE" ? FILTER_CHIP_ACTIVE : FILTER_CHIP_INACTIVE
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" />
          Offline {offlineCount}
        </button>
      </div>

      {/* Compact operator controls */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto flex-nowrap">
        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handlePauseAll}>
          <Pause className="h-3 w-3 mr-1" />
          Pause Squad
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={async () => {
            try {
              const r = await resumeAll({ projectId: projectId ?? undefined, reason: "Operator resume", userId: "operator" });
              toast(`Resumed ${(r as { resumed: number }).resumed} agent(s)`);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Failed", true);
            }
          }}
        >
          <Play className="h-3 w-3 mr-1" />
          Resume Squad
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={async () => {
            try {
              const r = await resetAll({ projectId: projectId ?? undefined });
              toast(`Reset ${(r as { resetCount: number }).resetCount} agent(s)`);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Failed", true);
            }
          }}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset Quarantined/Offline
        </Button>
      </div>

      {/* Search + filters */}
      <div>
        <div className="relative max-w-xs">
          <Search size={14} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="text"
            placeholder="Search by name or role..."
            aria-label="Search agents by name or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-lg border border-line bg-surface-1 pl-8 pr-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* 2-column agent grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2">
        {filteredAgents.map((agent) => {
          const lastHB = agent.lastHeartbeatAt ? formatRelativeTime(agent.lastHeartbeatAt) : "Never";
          const aCount = taskCountByAgent.get(agent._id) ?? 0;
          const remaining = agent.budgetDaily - agent.spendToday;
          const budgetPct = Math.min(100, (agent.spendToday / Math.max(agent.budgetDaily, 0.01)) * 100);
          const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.OFFLINE;
          const currentTask = agent.currentTaskId ? tasks.find((t) => t._id === agent.currentTaskId) : null;

          return (
            <Card key={agent._id} className="p-4 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-lg shrink-0">
                    {agent.emoji || agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink leading-tight truncate text-[13.5px]">{agent.name}</p>
                    <p className="text-[11.5px] text-ink-muted">{agent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn("h-2 w-2 rounded-full", cfg.dotClass)} />
                  <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
                </div>
              </div>

              {/* Budget bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11.5px] text-ink-muted mb-1">
                  <span>Budget</span>
                  <span className={cn("font-mono font-medium tabular-nums", remaining < 1 ? "text-err" : "text-ink-secondary")}>
                    ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      budgetPct >= 90 ? "bg-err" : budgetPct >= 70 ? "bg-warn" : "bg-ok"
                    )}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>

              {currentTask && (
                <p className="text-[12.5px] text-ink-secondary truncate mb-1" title={currentTask.title}>
                  Task: {currentTask.title}
                </p>
              )}
              <p className="text-[11.5px] text-ink-muted flex items-center gap-1 mb-3">
                <Clock size={11} strokeWidth={1.7} aria-hidden />
                Last heartbeat {lastHB}
              </p>

              <div className="flex flex-wrap gap-1.5 pt-3 border-t border-line mt-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 mr-auto"
                  onClick={() => setSettingsAgent(agent)}
                  title="Agent settings"
                  aria-label={`Settings for ${agent.name}`}
                >
                  <Settings className="h-3 w-3" />
                </Button>
                {[
                  { label: "Activate", s: "ACTIVE" },
                  { label: "Pause", s: "PAUSED" },
                  { label: "Drain", s: "DRAINED" },
                ].map(({ label, s }) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    disabled={agent.status === s}
                    onClick={() => setStatus(agent, s, `Operator ${label.toLowerCase()}d agent`)}
                    className="h-7 text-xs px-2"
                  >
                    {label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={agent.status === "QUARANTINED"}
                  onClick={() => setStatus(agent, "QUARANTINED", "Operator quarantined agent")}
                  className="h-7 text-xs px-2"
                >
                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                  Quarantine
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredAgents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-ink-muted text-[13.5px] mb-4">
            {agents.length === 0 ? "No agents registered yet." : "No agents match the current filters."}
          </p>
          {agents.length === 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {onOpenCreateAgent && (
                <Button onClick={onOpenCreateAgent}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first agent
                </Button>
              )}
              <Button variant="outline" onClick={() => setDiscoverOpen(true)}>
                <Activity className="h-4 w-4 mr-2" />
                Discover agents
              </Button>
            </div>
          )}
        </div>
      )}

      {settingsAgent && (
        <AgentSettingsPanel
          agent={settingsAgent}
          open={!!settingsAgent}
          onClose={() => setSettingsAgent(null)}
          onNavigateToIdentity={() => {
            setSettingsAgent(null);
            onNavigateToIdentity?.();
          }}
          onDelete={(agentId) => {
            setConfirmState({
              open: true,
              title: "Delete agent",
              description: "Agent removal (Gateway + Convex/ARM cleanup) is not yet implemented. Use OpenClaw Studio or Gateway to remove the agent.",
              danger: true,
              onConfirm: () => {
                setConfirmState(null);
                setSettingsAgent(null);
                toast("Agent deletion not yet implemented.", true);
              },
            });
          }}
        />
      )}

      {/* Confirmation dialog */}
      <Dialog open={!!confirmState?.open} onOpenChange={(open) => !open && setConfirmState(null)}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{confirmState?.title}</DialogTitle>
            <DialogDescription>{confirmState?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmState(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmState?.danger ? "destructive" : "default"}
              onClick={() => confirmState?.onConfirm()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </main>
  );
}
