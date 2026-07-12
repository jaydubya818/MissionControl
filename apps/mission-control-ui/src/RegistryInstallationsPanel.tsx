import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, GitBranch, Package } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { DataTable, type Column } from "./components/factory/DataTable";
import { StatusBadge } from "./components/factory/badges";
import { cn } from "./lib/utils";

export interface InstallationRow {
  repoSlug: string;
  packageSlug: string;
  version: string;
  contentHash: string;
  state: "INSTALLED" | "STALE" | "MISSING" | "INCOMPATIBLE";
  latestVersion: string | null;
  isOutdated: boolean;
}

export interface RepoSummary {
  repoSlug: string;
  total: number;
  installed: number;
  stale: number;
  missing: number;
  incompatible: number;
  outdated: number;
}

const STATE_TONE: Record<
  InstallationRow["state"],
  "success" | "warning" | "error" | "neutral"
> = {
  INSTALLED: "success",
  STALE: "warning",
  MISSING: "error",
  INCOMPATIBLE: "error",
};

export interface RegistryInstallationsContentProps {
  installations: InstallationRow[] | undefined;
  repoSummaries: RepoSummary[] | undefined;
}

export function RegistryInstallationsContent({
  installations,
  repoSummaries,
}: RegistryInstallationsContentProps): JSX.Element {
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!installations) return undefined;
    return installations.filter((row) => {
      if (repoFilter !== "all" && row.repoSlug !== repoFilter) return false;
      if (needsAttentionOnly && row.state === "INSTALLED" && !row.isOutdated) {
        return false;
      }
      return true;
    });
  }, [installations, repoFilter, needsAttentionOnly]);

  const totals = useMemo(() => {
    const rows = installations ?? [];
    return {
      repos: repoSummaries?.length ?? 0,
      packages: rows.length,
      outdated: rows.filter((r) => r.isOutdated).length,
      attention: rows.filter((r) => r.state !== "INSTALLED" || r.isOutdated).length,
    };
  }, [installations, repoSummaries]);

  const columns: Column<InstallationRow>[] = [
    {
      id: "repo",
      header: "Repository",
      width: "180px",
      cell: (row) => (
        <span className="font-mono text-[12px] text-ink-secondary">{row.repoSlug}</span>
      ),
    },
    {
      id: "package",
      header: "Package",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{row.packageSlug}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
            {row.contentHash.slice(0, 18)}…
          </div>
        </div>
      ),
    },
    {
      id: "installed",
      header: "Installed",
      width: "100px",
      cell: (row) => <span className="font-mono text-[12.5px]">v{row.version}</span>,
    },
    {
      id: "latest",
      header: "Latest",
      width: "100px",
      cell: (row) =>
        row.latestVersion ? (
          <span
            className={cn(
              "font-mono text-[12.5px]",
              row.isOutdated ? "text-warn" : "text-ink-secondary"
            )}
          >
            v{row.latestVersion}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      id: "state",
      header: "State",
      width: "130px",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge tone={STATE_TONE[row.state]}>{row.state}</StatusBadge>
          {row.isOutdated && row.state === "INSTALLED" && (
            <StatusBadge tone="warning">OUTDATED</StatusBadge>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={GitBranch}
          label="Tracked repos"
          value={totals.repos}
          hint="Repositories with synced installation rows"
        />
        <SummaryCard
          icon={Package}
          label="Installed packages"
          value={totals.packages}
          hint="Locked context packages across all repos"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Outdated"
          value={totals.outdated}
          hint="Newer published version available in registry"
          tone={totals.outdated > 0 ? "warning" : "neutral"}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Needs attention"
          value={totals.attention}
          hint="Stale, missing, incompatible, or outdated installs"
          tone={totals.attention > 0 ? "warning" : "success"}
        />
      </div>

      {repoSummaries && repoSummaries.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {repoSummaries.map((repo) => (
            <button
              key={repo.repoSlug}
              type="button"
              onClick={() =>
                setRepoFilter((current) =>
                  current === repo.repoSlug ? "all" : repo.repoSlug
                )
              }
              className={cn(
                "rounded-xl border p-3 text-left transition-colors duration-150",
                repoFilter === repo.repoSlug
                  ? "border-info-accent bg-surface-1"
                  : "border-line bg-surface-1/60 hover:border-line-strong"
              )}
            >
              <div className="truncate font-mono text-[12px] text-ink-secondary">
                {repo.repoSlug}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11.5px]">
                <span className="text-ink-muted">{repo.total} packages</span>
                {repo.outdated > 0 && (
                  <span className="text-warn">{repo.outdated} outdated</span>
                )}
                {repo.stale > 0 && (
                  <span className="text-warn">{repo.stale} stale</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-secondary">
            <input
              type="checkbox"
              checked={needsAttentionOnly}
              onChange={(e) => setNeedsAttentionOnly(e.target.checked)}
              className="rounded border-line"
            />
            Needs attention only
          </label>
          {repoFilter !== "all" && (
            <button
              type="button"
              onClick={() => setRepoFilter("all")}
              className="text-[12px] text-info-accent hover:underline"
            >
              Clear repo filter
            </button>
          )}
        </div>
        <code className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-muted">
          node scripts/mc-context.mjs lock
        </code>
      </div>

      <DataTable
        columns={columns}
        rows={filtered ?? []}
        rowKey={(row) => `${row.repoSlug}:${row.packageSlug}`}
        loading={filtered === undefined}
        emptyState={
          <span>
            No installation rows yet. Run{" "}
            <code className="font-mono text-[12px]">mc context lock</code> from a
            repo to sync manifest, lock, and installation state to Convex.
          </span>
        }
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: typeof Package;
  label: string;
  value: number;
  hint: string;
  tone?: "neutral" | "warning" | "success";
}): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        <span className="text-[11.5px] uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={cn(
          "mt-2 font-mono text-[26px] font-semibold leading-none",
          tone === "warning" && value > 0 && "text-warn",
          tone === "success" && value === 0 && "text-ok",
          tone === "neutral" && "text-ink"
        )}
      >
        {value}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{hint}</p>
    </div>
  );
}

/** Data container for installation lifecycle state. */
export function RegistryInstallationsPanel(): JSX.Element {
  const installations = useQuery(api.context.manifests.listInstallationOverview, {});
  const repoSummaries = useQuery(api.context.manifests.listRepoSummaries, {});
  return (
    <RegistryInstallationsContent
      installations={installations ?? undefined}
      repoSummaries={repoSummaries ?? undefined}
    />
  );
}
