import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, GitBranch, Package, RefreshCw, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { cn } from "./lib/utils";

type Severity = "critical" | "high" | "medium";

interface TriageItem {
  id: string;
  title: string;
  severity: Severity;
  subtitle: string;
  repos: Array<{
    repoSlug: string;
    packageSlug: string;
    path: string;
    state: string;
    version: string;
    isOutdated: boolean;
  }>;
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};

function buildTriageItems(
  installations: Array<{
    repoSlug: string;
    packageSlug: string;
    version: string;
    state: string;
    isOutdated: boolean;
  }>
): TriageItem[] {
  const byPackage = new Map<string, typeof installations>();
  for (const row of installations) {
    const list = byPackage.get(row.packageSlug) ?? [];
    list.push(row);
    byPackage.set(row.packageSlug, list);
  }

  const items: TriageItem[] = [];

  for (const [packageSlug, rows] of byPackage.entries()) {
    const critical = rows.filter((r) => r.state === "MISSING" || r.state === "INCOMPATIBLE");
    if (critical.length > 0) {
      items.push({
        id: `crit-${packageSlug}`,
        title: `Fix ${packageSlug}`,
        severity: "critical",
        subtitle: `${critical.length} repo(s) · ${critical[0].state}`,
        repos: rows.map((r) => ({
          repoSlug: r.repoSlug,
          packageSlug: r.packageSlug,
          path: `.agents/skills/${r.packageSlug.split("/").pop()}`,
          state: r.state,
          version: r.version,
          isOutdated: r.isOutdated,
        })),
      });
      continue;
    }

    const stale = rows.filter((r) => r.state === "STALE");
    if (stale.length > 0 || rows.length > 2) {
      items.push({
        id: `high-${packageSlug}`,
        title:
          rows.length > 2
            ? `Pick a canonical '${packageSlug.split("/").pop()}'`
            : `Refresh stale ${packageSlug}`,
        severity: "high",
        subtitle: `${rows.length} variant${rows.length === 1 ? "" : "s"} · ${rows.length} repos`,
        repos: rows.map((r) => ({
          repoSlug: r.repoSlug,
          packageSlug: r.packageSlug,
          path: `.agents/skills/${r.packageSlug.split("/").pop()}`,
          state: r.state,
          version: r.version,
          isOutdated: r.isOutdated,
        })),
      });
      continue;
    }

    const outdated = rows.filter((r) => r.isOutdated);
    if (outdated.length > 0) {
      items.push({
        id: `med-${packageSlug}`,
        title: `Update ${packageSlug}`,
        severity: "medium",
        subtitle: `${outdated.length} outdated installation(s)`,
        repos: rows.map((r) => ({
          repoSlug: r.repoSlug,
          packageSlug: r.packageSlug,
          path: `.agents/skills/${r.packageSlug.split("/").pop()}`,
          state: r.state,
          version: r.version,
          isOutdated: r.isOutdated,
        })),
      });
    }
  }

  return items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

/** Skill inventory triage view (Tessl estate / Skill Inventory pattern). */
export function SkillInventoryPanel(): JSX.Element {
  const installations = useQuery(api.context.manifests.listInstallationOverview, {});
  const packages = useQuery(api.context.packages.listWithCurrentVersions, {});
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanCopied, setScanCopied] = useState(false);

  const copyScanCommand = async () => {
    const cmd = "node scripts/mc-context.mjs scan";
    try {
      await navigator.clipboard.writeText(cmd);
      setScanCopied(true);
      window.setTimeout(() => setScanCopied(false), 2000);
    } catch {
      setScanCopied(false);
    }
  };

  const items = useMemo(
    () => buildTriageItems(installations ?? []),
    [installations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.repos.some((r) => r.repoSlug.toLowerCase().includes(q))
    );
  }, [items, search]);

  const active = filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null;

  const stats = useMemo(() => {
    const rows = installations ?? [];
    const repos = new Set(rows.map((r) => r.repoSlug));
    return {
      repos: repos.size,
      skills: packages?.length ?? 0,
      findings: items.length,
      attention: items.filter((i) => i.severity !== "medium").length,
    };
  }, [installations, packages, items]);

  return (
    <div className="registry-inventory flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold text-ink">Skill inventory</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Cross-repo context resolution — triage duplicates, stale locks, and outdated packages.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyScanCommand()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
        >
          <RefreshCw size={14} aria-hidden />
          {scanCopied ? "Copied scan command" : "Scan local skills (CLI)"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InventoryStat icon={GitBranch} label="Repos" value={stats.repos} sub="with installation rows" />
        <InventoryStat icon={Package} label="Skills" value={stats.skills} sub="in registry" />
        <InventoryStat icon={AlertTriangle} label="Findings" value={stats.findings} sub="need review" />
        <InventoryStat icon={AlertTriangle} label="Triage" value={stats.attention} sub="critical + high" />
      </div>

      <div className="grid min-h-[480px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col rounded-xl border border-line bg-surface-1">
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter findings…"
                className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-2 text-[13px]"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            {(["critical", "high", "medium"] as Severity[]).map((sev) => {
              const group = filtered.filter((i) => i.severity === sev);
              if (group.length === 0) return null;
              return (
                <div key={sev} className="mb-3">
                  <div className={cn("mb-1 px-2 text-[11px] font-semibold uppercase", `registry-sev-${sev}`)}>
                    {SEV_LABEL[sev]} ({group.length})
                  </div>
                  {group.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "registry-triage-item w-full text-left",
                        active?.id === item.id && "registry-triage-item-active"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn("registry-sev-dot", `registry-sev-dot-${sev}`)} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-ink">{item.title}</div>
                          <div className="truncate text-[11px] text-ink-muted">{item.subtitle}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-muted">No findings — all installations healthy.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-1 p-4">
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[18px] font-semibold text-ink">{active.title}</h3>
                  <p className="mt-1 text-[13px] text-ink-muted">{active.subtitle}</p>
                </div>
                <span className={cn("registry-sev-pill", `registry-sev-pill-${active.severity}`)}>
                  {SEV_LABEL[active.severity]}
                </span>
              </div>

              <div className="registry-detail-tabs mt-4">
                <span className="registry-detail-tab registry-detail-tab-active">Affected ({active.repos.length})</span>
              </div>

              <div className="registry-scrolly mt-3">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">Repo</th>
                      <th className="px-3 py-2">Path</th>
                      <th className="px-3 py-2">State</th>
                      <th className="px-3 py-2">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.repos.map((r) => (
                      <tr key={`${r.repoSlug}-${r.packageSlug}`} className="border-t border-line">
                        <td className="schematic-dbcell px-3 py-2">{r.repoSlug}</td>
                        <td className="schematic-dbcell px-3 py-2">{r.path}</td>
                        <td className="px-3 py-2 text-[12px]">{r.state}</td>
                        <td className="px-3 py-2 font-mono text-[12px]">v{r.version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">Select a finding to inspect affected repositories.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  sub: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} aria-hidden />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 font-mono text-[26px] font-semibold text-ink">{value}</div>
      <p className="mt-1 text-[11px] text-ink-muted">{sub}</p>
    </div>
  );
}
