import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface FlakyStepsViewProps {
  projectId: Id<"projects"> | null;
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-line-control bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted";

export function FlakyStepsView({ projectId }: FlakyStepsViewProps) {
  const [stepName, setStepName] = useState("checkout.submit");
  const [failed, setFailed] = useState(false);

  const list = useQuery((api as any).flakySteps.list, { projectId: projectId ?? undefined, activeOnly: false, limit: 50 });
  const recordRun = useMutation((api as any).flakySteps.recordRun);
  const markResolved = useMutation((api as any).flakySteps.markResolved);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">Flaky Detection</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">Track unstable steps, monitor failure ratios, and resolve flaky checks.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex gap-2">
          <input
            className={`flex-1 ${INPUT_CLASS}`}
            value={stepName}
            onChange={(e) => setStepName(e.target.value)}
          />
          <select
            className={INPUT_CLASS}
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

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Flaky Steps</h2>
        <div className="flex flex-col gap-2">
          {(list ?? []).map((row: any) => (
            <div
              key={row._id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 transition-colors duration-150 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="font-mono text-[13px] font-medium text-ink">{row.stepName}</div>
                <div className="text-[12.5px] text-ink-muted">
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
    </div>
  );
}
