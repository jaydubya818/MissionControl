import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface FlakyStepsViewProps {
  projectId: Id<"projects"> | null;
}

export function FlakyStepsView({ projectId }: FlakyStepsViewProps) {
  const [stepName, setStepName] = useState("checkout.submit");
  const [failed, setFailed] = useState(false);

  const list = useQuery((api as any).flakySteps.list, { projectId: projectId ?? undefined, activeOnly: false, limit: 50 });
  const recordRun = useMutation((api as any).flakySteps.recordRun);
  const markResolved = useMutation((api as any).flakySteps.markResolved);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Flaky Detection</h2>
        <p className="text-sm text-muted-foreground">Track unstable steps, monitor failure ratios, and resolve flaky checks.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={stepName}
            onChange={(e) => setStepName(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={failed ? "failed" : "passed"}
            onChange={(e) => setFailed(e.target.value === "failed")}
          >
            <option value="passed">passed</option>
            <option value="failed">failed</option>
          </select>
          <Button
            onClick={() =>
              recordRun({
                projectId: projectId ?? undefined,
                stepName,
                status: failed ? "failed" : "passed",
                responseTimeMs: 120,
              })
            }
          >
            Record Step Result
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Flaky Steps</h3>
        <div className="space-y-2">
          {(list ?? []).map((row: any) => (
            <div key={row._id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{row.stepName}</div>
                <div className="text-xs text-muted-foreground">
                  ratio {(row.failureRatio * 100).toFixed(1)}% · runs {row.totalRuns} · failed {row.failedRuns} · {row.isActive ? "active" : "resolved"}
                </div>
              </div>
              {row.isActive && (
                <Button size="sm" variant="outline" onClick={() => markResolved({ id: row._id })}>
                  Mark Resolved
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
