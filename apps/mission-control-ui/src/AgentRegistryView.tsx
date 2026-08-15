import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { loadGatewayStatus } from "@/lib/gatewayStatus";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
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
  AlertTriangle,
  Radio,
  Search,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Pencil,
  Eye,
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
  const [settingsMode, setSettingsMode] = useState<"view" | "edit">("view");
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
    loadGatewayStatus().then((snapshot) => {
      if (!cancelled) setGatewayConfigured(Boolean(snapshot.status?.configured));
    });
    return () => {
      cancelled = true;
    };
  }, [orchestrationBase]);

  useEffect(() => {
    setSettingsAgent(null);
    setSearch("");
    setStatusFilter("ALL");
  }, [projectId]);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : "skip");
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : "skip");
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const updateStatus = useMutation(api.agents.updateStatus);
  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const resetAll = useMutation(api.agents.resetAll);
  const { toast } = useToast();

  const currentSettingsAgent = settingsAgent
    ? agents?.find((agent) => agent._id === settingsAgent._id) ?? settingsAgent
    : null;

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
    const statusRank: Record<string, number> = {
      QUARANTINED: 0,
      OFFLINE: 1,
      PAUSED: 2,
      DRAINED: 3,
      ACTIVE: 4,
    };
    return [...list].sort(
      (left, right) =>
        (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9) ||
        left.name.localeCompare(right.name)
    );
  }, [agents, statusFilter, search]);

  if (!agents || !tasks || !project) {
    return (
      <section className="flex-1 overflow-auto p-6">
        <div className="h-6 w-40 rounded animate-pulse bg-surface-2 mb-2" />
        <div className="h-4 w-56 rounded animate-pulse bg-surface-2" />
      </section>
    );
  }

  const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
  const pausedCount = agents.filter((a) => a.status === "PAUSED").length;
  const quarantinedCount = agents.filter((a) => a.status === "QUARANTINED").length;
  const offlineCount = agents.filter((a) => a.status === "OFFLINE").length;
  const assignedCount = tasks.filter((t) => t.assigneeIds.length > 0).length;

  async function setStatus(agent: Doc<"agents">, status: string, reason: string) {
    if (!projectId) {
      toast("Select a workspace before changing an agent.", true);
      return;
    }
    const isDangerous = status === "QUARANTINED" || status === "DRAINED";
    if (isDangerous) {
      setConfirmState({
        open: true,
        title: `Set ${agent.name} to ${status}?`,
        description: `This will change the agent's status. ${status === "QUARANTINED" ? "The agent will be isolated from receiving new work." : ""}`,
        danger: true,
        onConfirm: async () => {
          try {
            await updateStatus({ agentId: agent._id, projectId, status, reason });
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
      await updateStatus({ agentId: agent._id, projectId, status, reason });
      toast(`${agent.name} → ${status}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Status update failed", true);
    }
  }

  const handlePauseAll = () => {
    if (!projectId) {
      toast("Select a workspace before pausing agents.", true);
      return;
    }
    setConfirmState({
      open: true,
      title: "Pause all active agents?",
      description: "All agents currently active will be paused. You can resume them from the operator controls.",
      danger: true,
      onConfirm: async () => {
        try {
          const r = await pauseAll({ projectId, reason: "Operator pause", userId: "operator" });
          toast(`Paused ${(r as { paused: number }).paused} agent(s)`);
        } catch (e) {
          toast(e instanceof Error ? e.message : "Failed", true);
        }
        setConfirmState(null);
      },
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
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

      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        <div className="grid shrink-0 overflow-hidden rounded-lg border border-line bg-surface-1 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Active", activeCount, "Ready for work"],
            ["Paused", pausedCount, "Held from queue"],
            ["Needs attention", quarantinedCount + offlineCount, "Quarantined or offline"],
            ["Assigned tasks", assignedCount, "Routed in this workspace"],
          ].map(([label, value, detail]) => (
            <div key={label} className="border-b border-line px-4 py-3 last:border-0 sm:border-r lg:border-b-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
              <p className="text-[11.5px] text-ink-muted">{detail}</p>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { key: "ALL" as const, label: "All", count: agents.length, dot: "bg-ink-muted" },
              { key: "ACTIVE" as const, label: "Active", count: activeCount, dot: "bg-ok" },
              { key: "PAUSED" as const, label: "Paused", count: pausedCount, dot: "bg-warn" },
              { key: "QUARANTINED" as const, label: "Quarantined", count: quarantinedCount, dot: "bg-err" },
              { key: "OFFLINE" as const, label: "Offline", count: offlineCount, dot: "bg-ink-muted" },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                className={cn(
                  FILTER_CHIP_BASE,
                  statusFilter === filter.key ? FILTER_CHIP_ACTIVE : FILTER_CHIP_INACTIVE
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", filter.dot)} />
                {filter.label} {filter.count}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={handlePauseAll}>
              <Pause className="mr-1 h-3 w-3" />
              Pause active
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={async () => {
                try {
                  if (!projectId) throw new Error("Select a workspace before resuming agents.");
                  const result = await resumeAll({ projectId, reason: "Operator resume", userId: "operator" });
                  toast(`Resumed ${(result as { resumed: number }).resumed} agent(s)`);
                } catch (cause) {
                  toast(cause instanceof Error ? cause.message : "Failed", true);
                }
              }}
            >
              <Play className="mr-1 h-3 w-3" />
              Resume paused
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={async () => {
                try {
                  if (!projectId) throw new Error("Select a workspace before resetting agents.");
                  const result = await resetAll({ projectId });
                  toast(`Reset ${(result as { resetCount: number }).resetCount} agent(s)`);
                } catch (cause) {
                  toast(cause instanceof Error ? cause.message : "Failed", true);
                }
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset unavailable
            </Button>
          </div>
        </div>

        <div className="relative max-w-sm shrink-0">
          <Search size={14} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            placeholder="Search agents by name or role…"
            aria-label="Search agents by name or role"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface-1 pl-8 pr-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface-1">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
                <th className="px-4 py-3">Agent</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Assignment</th>
                <th className="px-3 py-3">Model route</th>
                <th className="px-3 py-3">Daily budget</th>
                <th className="px-3 py-3">Heartbeat</th>
                <th className="sticky right-0 bg-surface-2 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const lastHeartbeat = agent.lastHeartbeatAt ? formatRelativeTime(agent.lastHeartbeatAt) : "Never";
                const taskCount = taskCountByAgent.get(agent._id) ?? 0;
                const status = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.OFFLINE;
                const currentTask = agent.currentTaskId
                  ? tasks.find((task) => task._id === agent.currentTaskId)
                  : null;
                const effectiveModel = project.swarmConfig?.defaultModel ?? "operator-default";
                const openPanel = (mode: "view" | "edit") => {
                  setSettingsMode(mode);
                  setSettingsAgent(agent);
                };

                return (
                  <tr key={agent._id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-base">
                          {agent.emoji || agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <button className="block max-w-48 truncate text-[13px] font-semibold text-ink hover:underline" onClick={() => openPanel("view")}>
                            {agent.name}
                          </button>
                          <p className="text-[11px] text-ink-muted">{agent.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </td>
                    <td className="max-w-64 px-3 py-3">
                      <p className="truncate text-[12.5px] text-ink-secondary" title={currentTask?.title}>
                        {currentTask?.title ?? (taskCount ? `${taskCount} assigned task${taskCount === 1 ? "" : "s"}` : "Unassigned")}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="max-w-44 truncate font-mono text-[11.5px] text-ink-secondary" title={effectiveModel}>
                        {effectiveModel}
                      </p>
                      <p className="text-[10.5px] text-ink-muted">Workspace default</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11.5px] tabular-nums text-ink-secondary">
                      ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-ink-muted">{lastHeartbeat}</td>
                    <td className="sticky right-0 bg-surface-1 px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openPanel("view")}>
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openPanel("edit")}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setStatus(
                              agent,
                              agent.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                              agent.status === "ACTIVE" ? "Operator paused agent" : "Operator activated agent"
                            )
                          }
                        >
                          {agent.status === "ACTIVE" ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          disabled={agent.status === "QUARANTINED"}
                          onClick={() => setStatus(agent, "QUARANTINED", "Operator quarantined agent")}
                          className="h-7 w-7"
                          title="Quarantine agent"
                          aria-label={`Quarantine ${agent.name}`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredAgents.length === 0 && (
            <div className="py-14 text-center">
              <p className="mb-4 text-[13.5px] text-ink-muted">
                {agents.length === 0 ? "No agents registered in this workspace." : "No agents match the current filters."}
              </p>
              {agents.length === 0 && (
                <div className="flex items-center justify-center gap-3">
                  {onOpenCreateAgent && (
                    <Button onClick={onOpenCreateAgent}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create agent
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDiscoverOpen(true)}>
                    <Activity className="mr-2 h-4 w-4" />
                    Discover agents
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

      {currentSettingsAgent && (
        <AgentSettingsPanel
          agent={currentSettingsAgent}
          projectId={projectId!}
          effectiveModel={project.swarmConfig?.defaultModel ?? "operator-default"}
          open={!!currentSettingsAgent}
          initialEditing={settingsMode === "edit"}
          onClose={() => setSettingsAgent(null)}
          onNavigateToIdentity={() => {
            setSettingsAgent(null);
            onNavigateToIdentity?.();
          }}
          onDeactivate={() => {
            setSettingsAgent(null);
            void setStatus(currentSettingsAgent, "DRAINED", "Operator deactivated agent");
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
    </section>
  );
}
