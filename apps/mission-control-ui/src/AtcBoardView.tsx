/**
 * Air Traffic Control (ATC) board — real-time view of all agents:
 * status, current task, model, token/cost, last heartbeat. Idle agents highlighted.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Radio, User, ExternalLink } from "lucide-react";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { EmptyState } from "@/components/ui/empty-state";
import { usePrivacy } from "./contexts/PrivacyContext";
import { redact } from "@/lib/redact";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  INTERN: "Intern",
  SPECIALIST: "Specialist",
  LEAD: "Lead",
  CEO: "CEO",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  DRAINED: "Drained",
  QUARANTINED: "Quarantined",
  OFFLINE: "Offline",
};

const STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DRAINED: "neutral",
  QUARANTINED: "error",
  OFFLINE: "neutral",
};

function formatTimeAgo(ts: number | undefined): string {
  if (ts == null) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface AtcBoardViewProps {
  projectId: Id<"projects"> | null;
  onNavigateToTask?: (taskId: Id<"tasks">) => void;
  onNavigateToAgent?: (agentId: Id<"agents">) => void;
  onNavigateToTasks?: () => void;
}

export function AtcBoardView({
  projectId,
  onNavigateToTask,
  onNavigateToAgent,
  onNavigateToTasks,
}: AtcBoardViewProps) {
  const { privacyMode } = usePrivacy();
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const runs = useQuery(api.runs.listRecent, projectId ? { projectId, limit: 500 } : { limit: 500 });

  if (agents === undefined || tasks === undefined || runs === undefined) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PageHeader title="Air Traffic Control" />
        <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-3">
          <div className="h-3.5 w-48 animate-pulse rounded bg-surface-2" />
          <div className="h-3.5 w-72 animate-pulse rounded bg-surface-2" />
          <div className="h-3.5 w-56 animate-pulse rounded bg-surface-2" />
        </div>
      </main>
    );
  }

  const activeTaskStatuses = new Set(["ASSIGNED", "IN_PROGRESS", "REVIEW"]);
  const busyAgentIds = new Set(
    tasks
      .filter((t) => activeTaskStatuses.has(t.status))
      .flatMap((t) => t.assigneeIds)
  );

  const agentRows = agents.map((agent) => {
    const currentTask = tasks.find(
      (t) =>
        t.assigneeIds.includes(agent._id) &&
        activeTaskStatuses.has(t.status)
    );
    const agentRuns = runs.filter((r) => r.agentId === agent._id);
    const sessionCost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const sessionTokens =
      agentRuns.reduce((sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);
    const isIdle = agent.status === "ACTIVE" && !currentTask;

    return {
      agent,
      currentTask,
      sessionCost,
      sessionTokens,
      isIdle,
    };
  });

  const idleCount = agentRows.filter((r) => r.isIdle).length;
  const busyCount = agents.length - idleCount;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Air Traffic Control"
        description="Real-time agent status. Idle agents are highlighted — assign work from Tasks."
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        {/* Command bar */}
        <div className="flex shrink-0 items-center justify-between gap-4 overflow-x-auto flex-nowrap">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-[13.5px] text-ink-secondary">
              <Radio size={15} strokeWidth={1.7} aria-hidden />
              {idleCount === 0
                ? "All agents busy"
                : `${idleCount} agent${idleCount === 1 ? "" : "s"} idle`}
            </span>
            {idleCount > 0 && (
              <Button size="sm" variant="outline" onClick={onNavigateToTasks}>
                Assign idle agents
              </Button>
            )}
          </div>
          <span className="text-[12.5px] text-ink-muted">
            {agents.length} total · {busyCount} busy
          </span>
        </div>

        {/* Agent grid */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agentRows.map(({ agent, currentTask, sessionCost, sessionTokens, isIdle }) => (
            <Card
              key={agent._id}
              className={cn(
                "p-4 flex flex-col gap-3",
                isIdle && "border-line-strong"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate flex items-center gap-2 text-[13.5px]">
                    <User size={14} strokeWidth={1.7} className="shrink-0 text-ink-muted" aria-hidden />
                    {redact(agent.name, privacyMode)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <StatusBadge tone="neutral">
                      {ROLE_LABELS[agent.role] ?? agent.role}
                    </StatusBadge>
                    <StatusBadge tone={STATUS_TONE[agent.status] ?? "neutral"}>
                      {STATUS_LABELS[agent.status] ?? agent.status}
                    </StatusBadge>
                  </div>
                </div>
                {isIdle && <StatusBadge tone="warning">Idle</StatusBadge>}
              </div>

              {currentTask ? (
                <div className="space-y-1.5">
                  <p className="text-[12.5px] text-ink-muted">Current task</p>
                  <p className="text-[13.5px] font-medium text-ink truncate" title={currentTask.title}>
                    {redact(currentTask.title, privacyMode)}
                  </p>
                  <StatusBadge tone="neutral">{currentTask.status}</StatusBadge>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => onNavigateToTask?.(currentTask._id)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-[12.5px] text-ink-muted py-1">No active task</div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11.5px] font-mono text-ink-muted border-t border-line pt-2 mt-auto">
                <span title="Cost this session">${sessionCost.toFixed(3)}</span>
                <span title="Tokens this session">{sessionTokens.toLocaleString()} tok</span>
              </div>

              <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
                <span title="Last heartbeat">hb {formatTimeAgo(agent.lastHeartbeatAt)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-xs"
                  onClick={() => onNavigateToAgent?.(agent._id)}
                >
                  Details
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {agents.length === 0 && (
          <EmptyState
            icon={Radio}
            title="No agents in this project"
            description="Register agents to see them here."
          />
        )}
      </div>
    </main>
  );
}
