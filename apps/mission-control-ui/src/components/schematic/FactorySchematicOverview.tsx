import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { buildFactoryKpis, SchematicKpiStrip } from "./SchematicKpiStrip";
import { DispatchGateBar } from "./DispatchGateBar";
import { FactoryArchitectureDiagram } from "./FactoryArchitectureDiagram";
import { SchematicSectionTitle } from "./SchematicSectionTitle";
import { TurnCard } from "@/components/operator/TurnCard";
import { formatRelativeSeconds } from "@/lib/schematicFormatters";

export interface FactorySchematicOverviewProps {
  onNavigate: (view: string) => void;
  projectId?: Id<"projects"> | null;
  projectLabel?: string;
  scannedAt: number;
  /** Page title in sticky header (default Overview) */
  title?: string;
}

/** Waku-agent-inspired schematic overview block for factory operator surfaces. */
export function FactorySchematicOverview({
  onNavigate,
  projectId,
  projectLabel,
  scannedAt,
  title = "Overview",
}: FactorySchematicOverviewProps): JSX.Element {
  const stats = useQuery(
    api.analytics.schematicOverview,
    projectId ? { projectId } : "skip"
  );
  const latestTurn = useQuery(
    api.analytics.recentRunTurns,
    projectId ? { projectId, limit: 1 } : "skip"
  );

  const loading = stats === undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="sticky top-0 z-[5] border-b border-line bg-app pb-2.5 pt-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
          <p className="font-mono text-[12px] text-ink-muted">
            {/* Freshness must describe the data, not the render. While the
                workspace projection has not resolved, "live · updated 0s ago"
                is a false signal — the panels below are skeletons and the
                backend may be unreachable. */}
            {loading ? (
              <span
                className="inline-flex items-center gap-1.5 text-warn"
                title="The workspace projection has not resolved yet"
              >
                <span className="relative inline-flex h-2 w-2 rounded-full bg-warn" />
                loading
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-40" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
                  </span>
                  live
                </span>
                {" · "}updated {formatRelativeSeconds(scannedAt)}
              </>
            )}
            {projectLabel ? ` · ${projectLabel}` : ""}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : (
        <>
          <SchematicKpiStrip
            kpis={buildFactoryKpis({
              totalCost: stats.totalCost,
              avgTurnMs: stats.avgTurnMs,
              turns: stats.turns,
              toolCalls: stats.toolCalls,
              facts: stats.facts,
              events: stats.events,
            })}
            className="mt-4"
          />
          <DispatchGateBar
            pendingApprovals={stats.pendingApprovals ?? 0}
            blockedTasks={stats.blockedTasks ?? 0}
          />
          <FactoryArchitectureDiagram
            stats={{
              pendingApprovals: stats.pendingApprovals ?? 0,
              blockedTasks: stats.blockedTasks ?? 0,
              contextPackageCount: stats.skillCount,
              knowledgeNodeCount: stats.facts,
              completedRunCount: stats.episodeCount,
              recordedRunCount: stats.turns,
            }}
            onNavigate={onNavigate}
          />
          {latestTurn?.[0] ? (
            <>
              <SchematicSectionTitle className="mt-6">Latest turn</SchematicSectionTitle>
              <TurnCard
                turn={{
                  userMessage: latestTurn[0].userMessage,
                  reply: latestTurn[0].reply,
                  gate: latestTurn[0].gate,
                  tools: latestTurn[0].tools,
                  timestamp: latestTurn[0].timestamp,
                  latencyMs: latestTurn[0].latencyMs,
                  cost: latestTurn[0].cost,
                  model: latestTurn[0].model,
                }}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
