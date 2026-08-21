import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ExecutionViewProps {
  projectId: Id<"projects"> | null;
}

/**
 * Rows carry `metadata.producer` attesting where their numbers came from.
 * Anything without one predates that requirement and was produced by the
 * simulated executor that has since been removed — it is history, not evidence,
 * and is labelled as such rather than silently rendered as a passing run.
 */
function provenanceOf(row: { metadata?: { producer?: string; producedBy?: string } }): {
  label: string;
  trusted: boolean;
} {
  const producer = row.metadata?.producer;
  if (producer === "AUTOMATION_ADAPTER") return { label: "automation adapter", trusted: true };
  if (producer === "MANUAL_IMPORT") return { label: "manual import", trusted: false };
  if (producer === "FIXTURE") return { label: "fixture — not evidence", trusted: false };
  return { label: "unattributed (simulated executor)", trusted: false };
}

export function ExecutionView({ projectId }: ExecutionViewProps) {
  const results = useQuery((api as any).execution.list, { projectId: projectId ?? undefined, limit: 50 });
  const rows: any[] = results ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">Execution Engine</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">Unified run history for API/UI/Hybrid executions with step-level outcomes.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Execution Results</h2>
        {results !== undefined && rows.length === 0 && (
          <p className="text-[13px] text-ink-muted">
            No execution results. This deployment has no test execution runner configured, so Mission
            Control has nothing to report here — it does not synthesize results. Run suites through
            the orchestration server's automation adapter to populate this view.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {rows.map((row: any) => (
            <div
              key={row._id}
              className="rounded-lg border border-line px-3 py-2 transition-colors duration-150 hover:bg-surface-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-medium text-ink">{row.resultId}</span>
                <span className="text-[12.5px] text-ink-muted">{row.executionType} · {row.success ? "success" : "failed"}</span>
              </div>
              <div className="text-[12.5px] text-ink-muted">
                passed {row.passed} · failed {row.failed} · total {row.totalTime}ms
              </div>
              <div className={provenanceOf(row).trusted ? "text-[12px] text-ink-muted" : "text-[12px] text-warn"}>
                source: {provenanceOf(row).label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
