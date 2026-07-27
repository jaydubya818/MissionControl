import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Code2, Github, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { MainView } from "./TopNav";
import { DataTable, type Column } from "./components/factory/DataTable";
import { RegistryInstallationsPanel } from "./RegistryInstallationsPanel";
import { RegistryEvalsPanel } from "./RegistryEvalsPanel";
import { SkillInventoryPanel } from "./SkillInventoryPanel";
import { RegistryScoreHex } from "./components/registry/RegistryScoreHex";
import { RegistryPackageDetail } from "./components/registry/RegistryPackageDetail";
import { RegistryCategoryGrid } from "./components/registry/RegistryCategoryGrid";
import { RegistryOptimizeCta } from "./components/registry/RegistryOptimizeCta";
import { RegistryEvaluateSkill } from "./components/registry/RegistryEvaluateSkill";
import { RegistryLifecyclePanel } from "./components/registry/RegistryLifecyclePanel";
import {
  REGISTRY_CATEGORIES,
  containsLabel,
  impactMultiplier,
} from "./lib/registryCategories";
import {
  type RegistryTab,
  registryViewFromTab,
} from "./lib/registryViews";
import { cn } from "./lib/utils";

export interface ReviewAxes {
  validation: number;
  implementation: number;
  activation: number;
}

export interface RegistryEntry {
  _id: string;
  slug: string;
  name: string;
  displayName?: string | null;
  description: string;
  type: string;
  status: string;
  owner: string;
  tags: string[];
  version: string | null;
  qualityScore: number | null;
  reviewAxes: ReviewAxes | null;
  impactScore: number | null;
  securityStatus: string | null;
  sourceRepo: string | null;
  updatedAt: number;
  scenarioCount?: number | null;
  evalRunStatus?: string | null;
  baselineScore?: number | null;
  candidateScore?: number | null;
  impactDelta?: number | null;
  evalCompletedAt?: number | null;
  hasEvalData?: boolean;
}

const REGISTRY_TABS = [
  { id: "catalog", label: "Discover" },
  { id: "lifecycle", label: "Context CDL" },
  { id: "evaluate", label: "Evaluate" },
  { id: "inventory", label: "Inventory" },
  { id: "installations", label: "Installations" },
  { id: "evals", label: "Runs" },
] as const;

const TYPE_TABS = [
  { id: "ALL", label: "All" },
  { id: "SKILL", label: "Skills" },
  { id: "DOCUMENTATION", label: "Docs" },
  { id: "RULES", label: "Rules" },
] as const;

function TopPackageCard({
  entry,
  onClick,
}: {
  entry: RegistryEntry;
  onClick: () => void;
}): JSX.Element {
  const score = entry.qualityScore ?? 0;
  const delta = impactMultiplier(
    entry.qualityScore,
    entry.impactScore,
    entry.baselineScore,
    entry.candidateScore
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View details for ${entry.displayName ?? entry.name}`}
      className="registry-top-card registry-top-card-glow flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        {entry.qualityScore !== null ? (
          <RegistryScoreHex score={score} size="sm" delta={delta} />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-muted">
          <Github size={12} aria-hidden />
          {entry.sourceRepo ?? entry.owner}
        </div>
        <div className="truncate text-[15px] font-semibold text-ink">
          {entry.displayName ?? entry.name}
        </div>
      </div>
      <p className="line-clamp-3 text-[12.5px] leading-relaxed text-ink-secondary">
        {entry.description}
      </p>
    </button>
  );
}

export interface RegistryViewContentProps {
  entries: RegistryEntry[] | undefined;
  activeTab?: RegistryTab;
  onTabChange?: (tab: RegistryTab) => void;
  onOpenDetail?: (entry: RegistryEntry) => void;
}

/** Presentational registry (exported for tests). */
export function RegistryViewContent({
  entries,
  activeTab = "catalog",
  onTabChange,
  onOpenDetail,
}: RegistryViewContentProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [typeTab, setTypeTab] = useState<(typeof TYPE_TABS)[number]["id"]>("ALL");

  const handleCategorySelect = (id: string) => {
    setCategory(id);
    if (id === "documentation") {
      setTypeTab("DOCUMENTATION");
    } else if (id === "all") {
      setTypeTab("ALL");
    } else {
      setTypeTab("SKILL");
    }
  };

  const filtered = useMemo(() => {
    if (!entries) return undefined;
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeTab !== "ALL" && e.type !== typeTab) return false;
      if (category !== "all" && !e.tags.includes(category)) return false;
      if (
        q &&
        ![e.name, e.slug, e.description, e.owner, ...(e.tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [entries, search, category, typeTab]);

  const top = (filtered ?? [])
    .filter((e) => e.qualityScore !== null)
    .sort((a, b) => (b.impactScore ?? b.qualityScore ?? 0) - (a.impactScore ?? a.qualityScore ?? 0))
    .slice(0, 4);

  const openDetail = (entry: RegistryEntry) => {
    onOpenDetail?.(entry);
  };

  const columns: Column<RegistryEntry>[] = [
    {
      id: "name",
      header: "Name",
      cell: (e) => (
        <div className="min-w-0 py-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{e.displayName ?? e.name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
            <Github size={12} aria-hidden />
            <span className="truncate">{e.sourceRepo ?? e.owner}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 max-w-[72ch] text-[13px] leading-relaxed text-ink-secondary">
            {e.description}
          </p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Contains",
      width: "120px",
      cell: (e) => (
        <span className="registry-contains-pill">
          <Code2 size={12} aria-hidden />
          {containsLabel(e.type)}
        </span>
      ),
    },
    {
      id: "score",
      header: "Score",
      width: "120px",
      align: "right",
      cell: (e) =>
        e.qualityScore !== null ? (
          <RegistryScoreHex
            score={e.qualityScore}
            size="sm"
            delta={impactMultiplier(
              e.qualityScore,
              e.impactScore,
              e.baselineScore,
              e.candidateScore
            )}
          />
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
  ];

  return (
    <main className="factory-page registry-page flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div>
            <div className="registry-kicker">Context registry</div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
              {activeTab === "catalog" ? "Discover skills" : "Registry"}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[14px] text-ink-secondary">
              {activeTab === "catalog"
                ? "Discover and install skills to enhance your AI agent's capabilities."
                : "Governed context packages with structural reviews, evals, and rollout visibility."}
            </p>
          </div>
          <div
            className="flex rounded-lg border border-line p-0.5"
            role="tablist"
            aria-label="Registry sections"
          >
            {REGISTRY_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                onClick={() => onTabChange?.(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12.5px] transition-colors duration-150",
                  activeTab === tab.id
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:text-ink-secondary"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "inventory" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SkillInventoryPanel />
          </div>
        ) : activeTab === "installations" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RegistryInstallationsPanel />
          </div>
        ) : activeTab === "evaluate" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RegistryEvaluateSkill />
          </div>
        ) : activeTab === "lifecycle" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RegistryLifecyclePanel />
          </div>
        ) : activeTab === "evals" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RegistryEvalsPanel />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-8 pb-4">
              <RegistryCategoryGrid
                categories={REGISTRY_CATEGORIES}
                activeId={category}
                onSelect={handleCategorySelect}
              />

              <div className="relative">
                <Search
                  size={15}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search skills…"
                  aria-label="Search skills"
                  className="h-10 w-full rounded-lg border border-line bg-surface-1 pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:border-line-strong"
                />
              </div>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-[19px] font-semibold tracking-tight text-ink">
                    Top performing skills
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted">
                    Data-driven rankings. Real results from real agents.
                  </p>
                </div>
                <div className="flex rounded-lg border border-line p-0.5" role="tablist">
                  {TYPE_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      type="button"
                      aria-selected={typeTab === tab.id}
                      onClick={() => setTypeTab(tab.id)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[12.5px] transition-colors duration-150",
                        typeTab === tab.id
                          ? "bg-surface-2 text-ink"
                          : "text-ink-muted hover:text-ink-secondary"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {top.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {top.map((entry) => (
                    <TopPackageCard
                      key={entry._id}
                      entry={entry}
                      onClick={() => openDetail(entry)}
                    />
                  ))}
                </div>
              )}

              <DataTable
                columns={columns}
                rows={filtered ?? []}
                rowKey={(e) => e._id}
                onRowClick={(entry) => openDetail(entry)}
                loading={filtered === undefined}
                emptyState={
                  <span>
                    No packages match. Import repo skills with{" "}
                    <code className="font-mono text-[12px]">
                      node scripts/import-repo-skills.mjs
                    </code>
                  </span>
                }
              />

              <RegistryOptimizeCta onEvaluate={() => onTabChange?.("evaluate")} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** Data container — queries the governed context registry. */
export function RegistryView({
  initialTab = "catalog",
  onNavigate,
}: {
  initialTab?: RegistryTab;
  onNavigate?: (view: MainView) => void;
} = {}): JSX.Element {
  const [activeTab, setActiveTab] = useState<RegistryTab>(initialTab);
  const [detailEntry, setDetailEntry] = useState<RegistryEntry | null>(null);
  const entries = useQuery(api.context.packages.listWithCurrentVersions, {}) as
    | RegistryEntry[]
    | undefined;

  useEffect(() => {
    setActiveTab(initialTab);
    setDetailEntry(null);
  }, [initialTab]);

  const handleTabChange = (tab: RegistryTab) => {
    setActiveTab(tab);
    setDetailEntry(null);
    onNavigate?.(registryViewFromTab(tab));
  };

  if (detailEntry) {
    return (
      <main className="factory-page registry-page flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4"
          data-testid="registry-detail-panel"
        >
          <RegistryPackageDetail
            entry={detailEntry}
            allEntries={entries ?? []}
            onBack={() => setDetailEntry(null)}
            onSelectEntry={setDetailEntry}
          />
        </div>
      </main>
    );
  }

  return (
    <RegistryViewContent
      entries={entries}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onOpenDetail={setDetailEntry}
    />
  );
}
