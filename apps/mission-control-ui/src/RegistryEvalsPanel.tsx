import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FlaskConical, Play, TrendingUp } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DataTable, type Column } from "./components/factory/DataTable";
import { ScoreBadge, StatusBadge } from "./components/factory/badges";
import { cn } from "./lib/utils";

export interface EvalRunRow {
  _id: string;
  packageSlug: string;
  packageName: string;
  versionLabel: string;
  status: string;
  scenarioCount: number;
  completedScenarios: number;
  baselineScore?: number;
  candidateScore?: number;
  impactScore?: number;
  impactDelta?: number;
  createdAt: number;
  completedAt?: number;
}

const STATUS_TONE: Record<string, "success" | "warning" | "error" | "neutral" | "info"> = {
  COMPLETED: "success",
  RUNNING: "info",
  PENDING: "neutral",
  FAILED: "error",
  CANCELED: "neutral",
};

export interface RegistryEvalsContentProps {
  runs: EvalRunRow[] | undefined;
  packages:
    | Array<{
        _id: string;
        slug: string;
        name: string;
        version: string | null;
        impactScore: number | null;
        qualityScore: number | null;
      }>
    | undefined;
  onRunEval?: (packageId: Id<"contextPackages">) => Promise<void>;
  runningPackageId?: string | null;
}

export function RegistryEvalsContent({
  runs,
  packages,
  onRunEval,
  runningPackageId,
}: RegistryEvalsContentProps): JSX.Element {
  const completed = runs?.filter((r) => r.status === "COMPLETED") ?? [];
  const avgImpact = useMemo(() => {
    if (completed.length === 0) return null;
    return Math.round(
      completed.reduce((sum, r) => sum + (r.impactScore ?? 0), 0) / completed.length
    );
  }, [completed]);

  const withImpact = packages?.filter((p) => p.impactScore !== null) ?? [];

  const runColumns: Column<EvalRunRow>[] = [
    {
      id: "package",
      header: "Package",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{r.packageName}</div>
          <div className="truncate font-mono text-[11px] text-ink-muted">
            {r.packageSlug} · v{r.versionLabel}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "110px",
      cell: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge>
      ),
    },
    {
      id: "scores",
      header: "Baseline → Candidate",
      width: "180px",
      cell: (r) =>
        r.baselineScore !== undefined && r.candidateScore !== undefined ? (
          <span className="font-mono text-[12px] text-ink-secondary">
            {r.baselineScore} → {r.candidateScore}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      id: "impact",
      header: "Impact",
      width: "100px",
      align: "right",
      cell: (r) =>
        r.impactScore !== undefined ? (
          <ScoreBadge score={r.impactScore} />
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      id: "scenarios",
      header: "Scenarios",
      width: "100px",
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-ink-muted">
          {r.completedScenarios}/{r.scenarioCount}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={FlaskConical} label="Eval runs" value={runs?.length ?? "—"} />
        <MetricCard icon={TrendingUp} label="Avg impact" value={avgImpact ?? "—"} />
        <MetricCard icon={Play} label="Packages w/ impact" value={withImpact.length} />
        <MetricCard icon={FlaskConical} label="In registry" value={packages?.length ?? "—"} />
      </div>

      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">
          Run evaluation
        </h2>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Baseline vs candidate comparison — evidence that context improves agent
          output. Proxy mode uses the structural review score until an external
          agent runner is connected.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {(packages ?? []).slice(0, 8).map((pkg) => (
            <div
              key={pkg._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{pkg.name}</div>
                <div className="truncate font-mono text-[11px] text-ink-muted">
                  {pkg.slug}
                  {pkg.version ? ` · v${pkg.version}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pkg.qualityScore !== null && <ScoreBadge score={pkg.qualityScore} />}
                {pkg.impactScore !== null && (
                  <StatusBadge tone="success">Impact {pkg.impactScore}</StatusBadge>
                )}
                {onRunEval && (
                  <button
                    type="button"
                    disabled={runningPackageId === pkg._id || !pkg.version}
                    onClick={() => void onRunEval(pkg._id as Id<"contextPackages">)}
                    className={cn(
                      "rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] transition-colors duration-150",
                      runningPackageId === pkg._id
                        ? "cursor-wait text-ink-muted"
                        : "text-ink-secondary hover:bg-surface-3 hover:text-ink"
                    )}
                  >
                    {runningPackageId === pkg._id ? "Running…" : "Run eval"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <code className="mt-3 block rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-muted">
          node scripts/run-context-eval.mjs software-factory/your-skill
        </code>
      </div>

      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">Recent runs</h2>
        <DataTable
          columns={runColumns}
          rows={runs ?? []}
          rowKey={(r) => r._id}
          loading={runs === undefined}
          emptyState={
            <span>
              No eval runs yet. Enable{" "}
              <code className="font-mono text-[12px]">eval.framework</code> and run
              an evaluation above or via the CLI.
            </span>
          }
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number | string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        <span className="text-[11.5px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">
        {value}
      </div>
    </div>
  );
}

/** Data container for the Evals tab. */
export function RegistryEvalsPanel(): JSX.Element {
  const [runningPackageId, setRunningPackageId] = useState<string | null>(null);
  const runs = useQuery(api.context.evals.listRecentRuns, { limit: 25 });
  const packages = useQuery(api.context.packages.listWithCurrentVersions, {});
  const runProxyEval = useMutation(api.context.evals.runProxyEval);

  const handleRunEval = async (packageId: Id<"contextPackages">) => {
    setRunningPackageId(packageId);
    try {
      await runProxyEval({
        packageId,
        idempotencyKey: `ui-eval:${packageId}:${Date.now()}`,
        actorId: "registry-ui",
      });
    } finally {
      setRunningPackageId(null);
    }
  };

  return (
    <RegistryEvalsContent
      runs={runs ?? undefined}
      packages={packages ?? undefined}
      onRunEval={handleRunEval}
      runningPackageId={runningPackageId}
    />
  );
}
