import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SchematicPageHead } from "@/components/schematic/SchematicPageHead";
import { SchematicKpiStrip, buildFactoryKpis } from "@/components/schematic/SchematicKpiStrip";
import { DispatchGateBar } from "@/components/schematic/DispatchGateBar";
import { TurnCard } from "@/components/operator/TurnCard";
import { formatMoney, formatSeconds } from "@/lib/schematicFormatters";

export interface FactoryOpsViewProps {
  projectId?: Id<"projects"> | null;
  onNavigate: (view: string) => void;
}

/** Consolidated ops dashboard (waku Ops tab). */
export function FactoryOpsView({ projectId, onNavigate }: FactoryOpsViewProps): JSX.Element {
  const stats = useQuery(api.analytics.schematicOverview, projectId ? { projectId } : {});
  const turns = useQuery(
    api.analytics.recentRunTurns,
    projectId ? { projectId, limit: 5 } : { limit: 5 }
  );
  const events = useQuery(
    api.analytics.recentHarnessEvents,
    projectId ? { projectId, limit: 8 } : { limit: 8 }
  );

  return (
    <div className="pb-6">
      <SchematicPageHead title="Ops" subtitle="cost · gate · traces · slow turns" updatedAt={Date.now()} />

      {stats === undefined ? (
        <div className="schematic-card animate-pulse text-ink-muted">Loading ops…</div>
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

          <h2 className="schematic-section-label mt-6">Dispatch gate</h2>
          <DispatchGateBar autoRouted={stats.gateAuto} gated={stats.gateGated} />

          <h2 className="schematic-section-label mt-6">Slowest recent turns</h2>
          {(turns ?? [])
            .slice()
            .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))
            .slice(0, 3)
            .map((t) => (
              <div key={t.id} className="schematic-card flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-ink-secondary">{t.label}</span>
                <span className="schematic-meta">
                  {formatSeconds(t.latencyMs)} · {formatMoney(t.cost ?? 0)} · {t.toolCount} tools
                </span>
              </div>
            ))}

          <h2 className="schematic-section-label mt-6">Activity tail</h2>
          {(events ?? []).map((e) => (
            <div key={e.id} className="schematic-card py-2">
              <code className="text-[12px] text-schematic-accent">{e.type}</code>
              <span className="ml-2 text-[13px] text-ink-secondary">{e.description}</span>
            </div>
          ))}

          <h2 className="schematic-section-label mt-6">Latest turn</h2>
          {turns?.[0] ? (
            <TurnCard
              turn={{
                userMessage: turns[0].userMessage,
                reply: turns[0].reply,
                gate: turns[0].gate,
                tools: turns[0].tools,
                timestamp: turns[0].timestamp,
                latencyMs: turns[0].latencyMs,
                cost: turns[0].cost,
                model: turns[0].model,
              }}
            />
          ) : (
            <div className="schematic-card text-ink-muted">No turns yet</div>
          )}

          <p className="schematic-meta mt-4">
            Deep dive:{" "}
            <button type="button" className="text-schematic-accent underline" onClick={() => onNavigate("telemetry")}>
              Incidents
            </button>
            {" · "}
            <button type="button" className="text-schematic-accent underline" onClick={() => onNavigate("analytics")}>
              Cost
            </button>
            {" · "}
            <button type="button" className="text-schematic-accent underline" onClick={() => onNavigate("audit")}>
              Audit
            </button>
          </p>
        </>
      )}
    </div>
  );
}
