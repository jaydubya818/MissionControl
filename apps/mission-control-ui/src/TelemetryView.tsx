import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

function compactJson(value: unknown) {
  if (value === undefined || value === null) return "n/a";
  const serialized = JSON.stringify(value);
  if (serialized.length <= 120) return serialized;
  return `${serialized.slice(0, 120)}...`;
}

export function TelemetryView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(60);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const events = useQuery(api["operations/opEvents"].listOpEvents, {
    projectId: projectId ?? undefined,
    type: typeFilter || undefined,
    limit: 200,
  });
  const stats = useQuery(api["operations/opEvents"].getOpEventStats, {
    projectId: projectId ?? undefined,
    windowMinutes,
  });
  const evaluateWithARM = useMutation(api.policy.evaluateWithARM);

  const handleEmitTestEvent = async () => {
    const agent = (agents ?? [])[0];
    if (!agent) {
      toast("No agents available in this project to emit telemetry.", true);
      return;
    }
    try {
      await evaluateWithARM({
        agentId: agent._id,
        actionType: "TOOL_CALL",
        toolName: "shell",
        toolArgs: { command: "echo telemetry_probe" },
        context: { source: "telemetry.ui" },
      });
      toast("Telemetry probe emitted via ARM policy evaluator.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to emit telemetry probe", true);
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">ARM Telemetry</h2>
        <p className="text-sm text-muted-foreground">
          Operational events stream (`opEvents`) for runs, tool calls, workflow steps, and decision traces.
        </p>
      </div>
      <div className="mb-4">
        <Button size="sm" onClick={handleEmitTestEvent}>
          Emit Test Event
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total Events" value={stats?.total ?? 0} />
        <Stat label={`Last ${stats?.windowMinutes ?? 60}m`} value={stats?.inWindow ?? 0} />
        <Stat label="Filtered Rows" value={(events ?? []).length} />
        <Stat label="Latest Event" value={stats?.latestTimestamp ? 1 : 0} />
      </div>

      <section className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Type filter</div>
            <input
              className="rounded border border-border bg-secondary px-2 py-1 text-foreground"
              placeholder="RUN_STARTED"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Window (minutes)</div>
            <select
              className="rounded border border-border bg-secondary px-2 py-1 text-foreground"
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(Number(e.target.value))}
            >
              <option value={15}>15</option>
              <option value={60}>60</option>
              <option value={240}>240</option>
              <option value={1440}>1440</option>
            </select>
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {(stats?.topTypes ?? []).map((row: any) => (
            <div key={row.type} className="rounded border border-border bg-secondary p-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{row.type}</div>
              <div className="text-lg font-semibold text-foreground">{row.count}</div>
            </div>
          ))}
          {(stats?.topTypes ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No events captured yet.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Events
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Timestamp</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Run</th>
                <th className="px-2 py-1">Instance</th>
                <th className="px-2 py-1">Version</th>
                <th className="px-2 py-1">Payload</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((event) => (
                <tr key={event._id} className="border-t border-border">
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(event.timestamp)}</td>
                  <td className="px-2 py-2">
                    <StatusPill value={event.type} />
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{event.runId ?? "n/a"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{event.instanceId ?? "n/a"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{event.versionId ?? "n/a"}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{compactJson(event.payload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(events ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No op events found.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const classes =
    value.includes("FAILED") || value.includes("BLOCKED")
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : value.includes("STARTED") || value.includes("STEP")
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classes}`}>{value}</span>;
}
