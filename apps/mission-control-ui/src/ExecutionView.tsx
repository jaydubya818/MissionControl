import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ExecutionViewProps {
  projectId: Id<"projects"> | null;
}

export function ExecutionView({ projectId }: ExecutionViewProps) {
  const results = useQuery((api as any).execution.list, { projectId: projectId ?? undefined, limit: 50 });

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Execution Engine</h2>
        <p className="text-sm text-muted-foreground">Unified run history for API/UI/Hybrid executions with step-level outcomes.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Execution Results</h3>
        <div className="space-y-2">
          {(results ?? []).map((row: any) => (
            <div key={row._id} className="rounded-md border border-border/60 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{row.resultId}</span>
                <span className="text-xs text-muted-foreground">{row.executionType} · {row.success ? "success" : "failed"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                passed {row.passed} · failed {row.failed} · total {row.totalTime}ms
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
