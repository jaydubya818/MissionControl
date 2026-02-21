import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface MetricsViewProps {
  projectId: Id<"projects"> | null;
}

export function MetricsView({ projectId }: MetricsViewProps) {
  const [metricName, setMetricName] = useState("execution.duration_ms");
  const [value, setValue] = useState("123");

  const record = useMutation((api as any).metrics.record);
  const series = useQuery((api as any).metrics.queryRange, {
    projectId: projectId ?? undefined,
    metricName,
    limit: 100,
  });
  const aggregate = useQuery((api as any).metrics.aggregate, {
    projectId: projectId ?? undefined,
    metricName,
  });

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Metrics</h2>
        <p className="text-sm text-muted-foreground">Capture time-series metrics and inspect aggregate stats for quality and execution observability.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
          />
          <input
            className="h-9 w-36 rounded-md border border-input bg-background px-3 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            onClick={() =>
              record({
                projectId: projectId ?? undefined,
                metricName,
                metricType: "histogram",
                value: Number(value),
                labels: { source: "metrics-view" },
              })
            }
          >
            Record Metric
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Aggregate</h3>
        <div className="text-sm text-muted-foreground">
          count {aggregate?.count ?? 0} · min {aggregate?.min ?? 0} · avg {(aggregate?.avg ?? 0).toFixed?.(2) ?? 0} · p95 {aggregate?.p95 ?? 0} · p99 {aggregate?.p99 ?? 0}
        </div>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Recent Points</h3>
        <div className="space-y-1">
          {(series ?? []).slice(0, 20).map((point: any) => (
            <div key={point._id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
              <span>{new Date(point.timestamp).toLocaleTimeString()}</span>
              <span>{point.metricName}</span>
              <span>{point.value}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
