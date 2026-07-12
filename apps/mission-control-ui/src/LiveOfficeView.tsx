/**
 * Live Office — 2D view of Mission Control agents
 * Workstations for agents currently working; Break Room for idle/paused/offline.
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { EmptyState } from "@/components/ui/empty-state";
import { Coffee, Bot, ListChecks, Building2, Waves } from "lucide-react";

interface LiveOfficeViewProps {
  projectId: Id<"projects"> | null;
}

const WORKSTATION_SLOTS = 6;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function LiveOfficeView({ projectId }: LiveOfficeViewProps) {
  const agents = useQuery(api.agents.list, { projectId: projectId ?? undefined });
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const activities = useQuery(
    api.activities.listRecent,
    projectId ? { projectId, limit: 12 } : { limit: 12 }
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const { working, onBreak } = useMemo(() => {
    if (!agents) {
      return { working: [] as { agent: Doc<"agents">; currentTask: Doc<"tasks"> | null | undefined }[], onBreak: [] as { agent: Doc<"agents">; currentTask: Doc<"tasks"> | null | undefined }[] };
    }
    const withTasks = agents.map((agent) => {
      const currentTask = agent.currentTaskId
        ? tasks?.find((t) => t._id === agent.currentTaskId)
        : null;
      return { agent, currentTask };
    });
    const workingList = withTasks.filter(
      (x) => x.agent.status === "ACTIVE" && x.currentTask
    );
    const onBreakList = withTasks.filter(
      (x) => x.agent.status !== "ACTIVE" || !x.currentTask
    );
    return { working: workingList, onBreak: onBreakList };
  }, [agents, tasks]);

  const workingCount = working.length;
  const onBreakCount = onBreak.length;

  if (agents === undefined) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app" role="region" aria-label="Live Office">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
          <div className="h-[620px] animate-pulse rounded-xl border border-line bg-surface-2" />
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app"
      role="region"
      aria-label="Live Office"
      data-testid="live-office-view"
    >
      <PageHeader
        title="Live Office"
        description="A spatial view of active desks, idle agents, and recent motion across the office floor."
        eyebrow="Comms"
        icon={<Building2 size={16} strokeWidth={1.7} />}
        status={
          <StatusBadge tone="neutral">
            {workingCount} working / {onBreakCount} on break
          </StatusBadge>
        }
      />

      <div className="mx-auto flex w-full min-h-0 max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Working desks"
              value={workingCount}
              detail="Desks currently attached to active task execution"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Break room"
              value={onBreakCount}
              detail="Agents waiting, paused, offline, or otherwise detached from work"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Recent activity"
              value={activities?.length ?? 0}
              detail="Latest recorded events available for visual context"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Clock"
              value={new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              detail="Local operator time for reading the office state"
            />
          </Card>
        </div>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="min-h-0 overflow-hidden p-0">
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-line px-5 py-4">
                <h3 className="text-[15px] font-semibold text-ink">Office floor</h3>
                <div className="mt-1 text-[13.5px] text-ink-secondary">
                  Use the floor plan to understand who is actually busy, who is parked, and whether the execution surface feels balanced.
                </div>
              </div>

              {/* Left: Office canvas (orchestrator + workstations + break room) */}
              <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6">
          {/* Orchestrator */}
                <div className="flex justify-center mb-4 shrink-0">
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-3 text-ink-secondary">
                      <Bot size={16} strokeWidth={1.75} aria-hidden />
                    </div>
                    <div>
                      <div className="text-[11.5px] text-ink-muted">
                        Mission Control
                      </div>
                      <div className="text-[13.5px] font-medium text-ink">
                        Orchestrating the team
                      </div>
                    </div>
                  </div>
                </div>

                {/* Workstations + Break Room in a responsive grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 lg:gap-6 min-h-0">
            {/* Workstations — fixed 2x3 grid with min height so it always shows */}
                  <section aria-label="Workstations" className="min-h-[320px]">
              <div className="grid grid-cols-2 grid-rows-3 gap-3 sm:gap-4">
                {Array.from({ length: WORKSTATION_SLOTS }).map((_, i) => {
                  const slot = working[i];
                  return (
                    <article
                      key={i}
                      className={cn(
                        "rounded-xl border flex flex-col overflow-hidden min-h-[120px] transition-colors duration-150",
                        slot
                          ? "border-line-strong bg-surface-2"
                          : "border-line bg-surface-2"
                      )}
                    >
                      <div className="flex-1 flex flex-col p-2 min-h-0">
                        {/* Monitor area */}
                        <div className="flex-1 min-h-[80px] rounded-lg border border-line bg-surface-1 flex flex-col overflow-hidden">
                          {slot ? (
                            <>
                              <div className="p-1.5 sm:p-2 flex items-center gap-2 border-b border-line shrink-0">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border border-line bg-surface-3 text-ink shrink-0">
                                  {slot.agent.emoji || slot.agent.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12.5px] font-semibold text-ink truncate">
                                    {slot.agent.name}
                                  </div>
                                  <div className="text-[11.5px] text-ink-muted truncate">
                                    Working
                                  </div>
                                </div>
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-ok shrink-0"
                                  aria-hidden
                                />
                              </div>
                              <div className="p-1.5 sm:p-2 flex-1 min-h-0 overflow-hidden">
                                <div className="text-[11.5px] text-ink-muted mb-0.5">
                                  Current task
                                </div>
                                <div className="text-[12.5px] font-medium text-ink line-clamp-2">
                                  {slot.currentTask?.title ?? "—"}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex-1 flex items-center justify-center min-h-[80px] text-ink-muted">
                              <span className="text-[12.5px]">Empty desk</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
                  </section>

            {/* Break Room */}
                  <section aria-label="Break Room" className="lg:max-w-[240px] shrink-0">
              <div className="rounded-xl border border-dashed border-line bg-surface-2 p-3 min-h-[200px] flex flex-col">
                <div className="text-[11.5px] font-medium text-ink-muted mb-2 flex items-center gap-2 shrink-0">
                  <Coffee size={14} strokeWidth={1.75} aria-hidden />
                  Break room
                </div>
                <div className="flex-1 flex flex-wrap content-start gap-2 overflow-auto min-h-0">
                  {onBreak.map(({ agent }) => (
                    <div
                      key={agent._id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg border border-line bg-surface-1 shrink-0",
                        agent.status === "OFFLINE" && "opacity-75"
                      )}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border border-line bg-surface-3 text-ink shrink-0">
                        {agent.emoji || agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 max-w-[100px]">
                        <div className="text-[12.5px] font-medium text-ink truncate leading-tight">
                          {agent.name}
                        </div>
                        <div className="text-[11.5px] text-ink-muted truncate">
                          {agent.status === "ACTIVE" ? "Idle" : agent.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
                  </section>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden p-0">
              <div className="border-b border-line px-4 py-3 flex items-center gap-2">
                <ListChecks size={15} strokeWidth={1.75} className="text-ink-muted" aria-hidden />
                <span className="text-[15px] font-semibold text-ink">Recent activity</span>
              </div>
              <div className="max-h-[420px] overflow-auto p-3">
                {activities === undefined ? (
                  <div className="space-y-2">
                    <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
                    <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
                    <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
                  </div>
                ) : activities.length === 0 ? (
                  <EmptyState
                    icon={Waves}
                    title="No recent activity"
                    description="Live Office becomes more useful once the activity stream has events to anchor what you’re seeing."
                    className="px-4 py-10"
                  />
                ) : (
                  <ul className="space-y-2" role="list">
                    {activities.map((act) => {
                      const created =
                        "_creationTime" in act && typeof (act as { _creationTime?: number })._creationTime === "number"
                          ? (act as { _creationTime: number })._creationTime
                          : Date.now();
                      return (
                        <li
                          key={act._id}
                          className="rounded-lg border border-line bg-surface-2 p-3 text-[12.5px]"
                        >
                          <div className="mb-0.5 text-ink-muted">{formatTime(created)}</div>
                          <div className="line-clamp-2 text-ink">{act.description}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-[15px] font-semibold text-ink">Operator guidance</h3>
              <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                  Live Office is for situational awareness, not deep diagnostics. If something looks off here, drill into Office or System.
                </div>
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                  A healthy floor should show a believable balance between active desks and deliberate idle time, not constant saturation.
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <footer className="border-t border-line bg-surface-1 px-5 py-3 text-[12.5px] text-ink-muted">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ok" aria-hidden />
            {workingCount} working
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ink-muted" aria-hidden />
            {onBreakCount} on break
          </span>
          <time className="ml-auto tabular-nums" dateTime={new Date().toISOString()}>
            {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </time>
        </div>
      </footer>
    </main>
  );
}
