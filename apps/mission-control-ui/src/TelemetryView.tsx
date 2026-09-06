import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import { Activity, Zap, Filter, Radio, CheckCircle2 } from "lucide-react";
import { FactoryIncidentBoundary, FactoryIncidentWorkspace } from "./controlPlane/FactoryIncidentWorkspace";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

function compactJson(value: unknown) {
  if (value === undefined || value === null) return "n/a";
  const s = JSON.stringify(value);
  return s.length <= 100 ? s : `${s.slice(0, 100)}…`;
}

function eventPillTone(type: string): StatusBadgeProps["tone"] {
  if (type.includes("FAILED") || type.includes("BLOCKED")) return "error";
  if (type.includes("STARTED") || type.includes("STEP")) return "info";
  if (type.includes("COMPLETED") || type.includes("DONE")) return "success";
  if (type.includes("DECISION")) return "info";
  return "neutral";
}

function EventTypePill({ value }: { value: string }) {
  return (
    <StatusBadge tone={eventPillTone(value)} className="whitespace-nowrap">
      {value}
    </StatusBadge>
  );
}

export function TelemetryView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [surface, setSurface] = useState<"incidents" | "events">("incidents");

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Factory Incidents"
        description="Clarify, contain, restore, correct, and measure without rewriting source evidence."
        eyebrow="Review & release"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-1 p-1" role="tablist" aria-label="Incident operations views">
            <Button size="sm" variant={surface === "incidents" ? "default" : "ghost"} role="tab" aria-selected={surface === "incidents"} onClick={() => setSurface("incidents")}>Incident command</Button>
            <Button size="sm" variant={surface === "events" ? "default" : "ghost"} role="tab" aria-selected={surface === "events"} onClick={() => setSurface("events")}>Event stream</Button>
          </div>
        }
      />
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        {!projectId ? (
          <Card className="flex min-h-[360px] items-center justify-center p-8 text-center text-ink-muted">Select a workspace to inspect incidents.</Card>
        ) : surface === "incidents" ? (
          <FactoryIncidentBoundary key={projectId}>
            <FactoryIncidentWorkspace projectId={projectId} />
          </FactoryIncidentBoundary>
        ) : (
          <TelemetryEventStream projectId={projectId} />
        )}
      </div>
    </section>
  );
}

function TelemetryEventStream({ projectId }: { projectId: Id<"projects"> }) {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(60);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : "skip");
  const events = useQuery(
    api["operations/opEvents"].listOpEvents,
    projectId
      ? { projectId, type: typeFilter || undefined, limit: 200 }
      : "skip"
  );
  const stats = useQuery(
    api["operations/opEvents"].getOpEventStats,
    projectId ? { projectId, windowMinutes } : "skip"
  );
  const evaluateWithARM = useMutation(api.policy.evaluateWithARM);

  const handleEmitTestEvent = async () => {
    const agent = (agents ?? [])[0];
    if (!agent) { toast("No agents available to emit telemetry.", true); return; }
    try {
      await evaluateWithARM({
        agentId: agent._id,
        actionType: "TOOL_CALL",
        toolName: "shell",
        toolArgs: { command: "echo telemetry_probe" },
        context: { source: "telemetry.ui" },
      });
      toast("Telemetry probe emitted via ARM policy evaluator.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to emit telemetry probe", true);
    }
  };

  const topTypes: { type: string; count: number }[] = stats?.topTypes ?? [];
  const totalEvents = stats?.total ?? 0;
  const inWindow    = stats?.inWindow ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">{inWindow > 0 ? `${inWindow} events in the last ${windowMinutes}m` : "Operational evidence stream"}</p>
        <Button size="sm" onClick={handleEmitTestEvent} variant="outline">
          <Zap className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.7} />
          Emit Test Event
        </Button>
      </div>
      {/* Summary stats */}
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Activity,     label: "Total Events",     value: totalEvents },
          { icon: Radio,        label: `Last ${windowMinutes}m`, value: inWindow },
          { icon: Filter,       label: "Filtered Rows",    value: (events ?? []).length },
          { icon: CheckCircle2, label: "Latest Event",     value: stats?.latestTimestamp ? 1 : 0 },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.6} />
              <span className="text-[12.5px] font-medium text-ink-secondary">{label}</span>
            </div>
            <p className="text-[20px] font-semibold leading-none tabular-nums text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {/* Filters + Event type breakdown */}
        <Card className="overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 overflow-x-auto flex-nowrap border-b border-line px-5 py-3">
            <p className="shrink-0 text-[15px] font-semibold text-ink">Event Type Breakdown</p>
            <div className="flex shrink-0 items-center gap-3 overflow-x-auto flex-nowrap">
              <div className="flex items-center gap-2">
                <Filter className="h-3 w-3 text-ink-muted" strokeWidth={1.6} />
                <input
                  className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-36"
                  placeholder="Filter type…"
                  aria-label="Filter events by type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                />
              </div>
              <select
                className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Time window"
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))}
              >
                <option value={15}>Last 15m</option>
                <option value={60}>Last 60m</option>
                <option value={240}>Last 4h</option>
                <option value={1440}>Last 24h</option>
              </select>
            </div>
          </div>
          <div className="p-4">
            {topTypes.length === 0 ? (
              <p className="text-[13.5px] text-ink-muted text-center py-6">No events captured yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {topTypes.map((row) => (
                  <div key={row.type} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                    <p className="text-[11.5px] text-ink-muted font-medium mb-1 truncate">{row.type}</p>
                    <p className="text-[20px] font-semibold leading-none text-ink tabular-nums">{row.count}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Recent events table */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-line">
            <p className="text-[15px] font-semibold text-ink">Recent Events</p>
          </div>
          {(events ?? []).length === 0 ? (
            <div className="py-12 text-center">
              <Activity className="h-8 w-8 text-ink-muted/30 mx-auto mb-2" strokeWidth={1.6} />
              <p className="text-[13.5px] text-ink-muted">No op events found.</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    {["Timestamp", "Type", "Run", "Instance", "Version", "Payload"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(events ?? []).map((event) => (
                    <tr
                      key={event._id}
                      className="border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors duration-150"
                    >
                      <td className="px-4 py-3.5 font-mono text-ink-muted whitespace-nowrap">{fmtTime(event.timestamp)}</td>
                      <td className="px-4 py-3.5"><EventTypePill value={event.type} /></td>
                      <td className="px-4 py-3.5 font-mono text-ink-muted truncate max-w-[120px]">{event.runId ?? "n/a"}</td>
                      <td className="px-4 py-3.5 font-mono text-ink-muted truncate max-w-[120px]">{event.instanceId ?? "n/a"}</td>
                      <td className="px-4 py-3.5 font-mono text-ink-muted truncate max-w-[120px]">{event.versionId ?? "n/a"}</td>
                      <td className="px-4 py-3.5 text-ink-muted truncate max-w-[240px] font-mono">{compactJson(event.payload)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ink">Telemetry guidance</div>
        <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
          <p>Telemetry is useful only when it helps explain a decision, a failure, or a bottleneck. Treat spikes without narrative as a sign of poor instrumentation.</p>
          <p>Use the time window to isolate operator incidents first, then widen the window only when you need trend context.</p>
        </div>
      </Card>
      </div>
    </div>
  );
}
