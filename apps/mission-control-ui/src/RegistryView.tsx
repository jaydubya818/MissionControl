import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  BookOpen,
  Boxes,
  Bug,
  Cloud,
  Database,
  FlaskConical,
  GitBranch,
  Globe,
  Layers,
  PackageCheck,
  Radio,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { ScoreBadge, StatusBadge } from "./components/factory/badges";
import { DataTable, type Column } from "./components/factory/DataTable";
import { RegistryInstallationsPanel } from "./RegistryInstallationsPanel";
import { RegistryEvalsPanel } from "./RegistryEvalsPanel";
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
}

interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
}

const REGISTRY_TABS = [
  { id: "catalog", label: "Catalog" },
  { id: "installations", label: "Installations" },
  { id: "evals", label: "Evals" },
] as const;

type RegistryTab = (typeof REGISTRY_TABS)[number]["id"];

const CATEGORIES: Category[] = [
  { id: "all", label: "All", icon: Boxes },
  { id: "testing-quality", label: "Testing & Quality", icon: FlaskConical },
  { id: "security-compliance", label: "Security & Compliance", icon: Shield },
  { id: "documentation", label: "Documentation", icon: BookOpen },
  { id: "debugging", label: "Debugging & Errors", icon: Bug },
  { id: "api-development", label: "API Development", icon: Layers },
  { id: "web-development", label: "Web Development", icon: Globe },
  { id: "database", label: "Database", icon: Database },
  { id: "infrastructure", label: "Infrastructure", icon: Cloud },
  { id: "git-delivery", label: "Git & Delivery", icon: GitBranch },
  { id: "observability", label: "Observability", icon: Radio },
  { id: "release-engineering", label: "Release Engineering", icon: Rocket },
  { id: "agent-operations", label: "Agent Operations", icon: Bot },
];

const TYPE_TABS = [
  { id: "ALL", label: "All" },
  { id: "SKILL", label: "Skills" },
  { id: "DOCUMENTATION", label: "Docs" },
  { id: "RULES", label: "Rules" },
] as const;

const SECURITY_TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  PASSED: "success",
  UNSCANNED: "neutral",
  FAILED: "error",
  QUARANTINED: "error",
};

function CategoryChip({
  category,
  active,
  onClick,
}: {
  category: Category;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const Icon = category.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-[92px] w-[118px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-center transition-colors duration-150",
        active
          ? "border-info-accent bg-surface-1 text-ink"
          : "border-line bg-surface-1/60 text-ink-secondary hover:border-line-strong hover:text-ink"
      )}
    >
      <Icon size={18} strokeWidth={1.6} aria-hidden />
      <span className="text-[11.5px] leading-tight">{category.label}</span>
    </button>
  );
}

function ReviewAxesBar({ axes }: { axes: ReviewAxes }): JSX.Element {
  const items = [
    { key: "validation", label: "Val", score: axes.validation },
    { key: "implementation", label: "Impl", score: axes.implementation },
    { key: "activation", label: "Act", score: axes.activation },
  ] as const;

  return (
    <div className="flex flex-col gap-1" aria-label="Review axes">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className="w-7 text-[10px] uppercase tracking-wide text-ink-muted">
            {item.label}
          </span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn(
                "h-full rounded-full",
                item.score >= 90
                  ? "bg-ok"
                  : item.score >= 70
                    ? "bg-warn"
                    : "bg-err"
              )}
              style={{ width: `${item.score}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-ink-muted">{item.score}</span>
        </div>
      ))}
    </div>
  );
}

function TopPackageCard({ entry }: { entry: RegistryEntry }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-center gap-2">
        {entry.qualityScore !== null && <ScoreBadge score={entry.qualityScore} />}
        {entry.version && (
          <StatusBadge tone="neutral">v{entry.version}</StatusBadge>
        )}
      </div>
      <div className="mt-1 min-w-0">
        <div className="truncate text-[11.5px] text-ink-muted">
          {entry.sourceRepo ?? entry.owner}
        </div>
        <div className="truncate text-[15px] font-semibold text-ink">
          {entry.displayName ?? entry.name}
        </div>
      </div>
      <p className="line-clamp-3 text-[12.5px] leading-relaxed text-ink-secondary">
        {entry.description}
      </p>
      {entry.reviewAxes && <ReviewAxesBar axes={entry.reviewAxes} />}
    </div>
  );
}

export interface RegistryViewContentProps {
  entries: RegistryEntry[] | undefined;
  activeTab?: RegistryTab;
  onTabChange?: (tab: RegistryTab) => void;
}

/** Presentational registry (exported for tests). */
export function RegistryViewContent({
  entries,
  activeTab = "catalog",
  onTabChange,
}: RegistryViewContentProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [typeTab, setTypeTab] = useState<(typeof TYPE_TABS)[number]["id"]>("ALL");

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
    .slice(0, 4);

  const scoredCount = (entries ?? []).filter((e) => e.qualityScore !== null).length;

  const columns: Column<RegistryEntry>[] = [
    {
      id: "name",
      header: "Name",
      cell: (e) => (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-ink">{e.displayName ?? e.name}</span>
            <span className="truncate text-[11.5px] text-ink-muted">
              {e.sourceRepo ?? e.owner}
            </span>
          </div>
          <div className="mt-0.5 line-clamp-1 max-w-[72ch] text-[12.5px] text-ink-muted">
            {e.description}
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Contains",
      width: "120px",
      cell: (e) => <StatusBadge tone="neutral">{e.type.replace(/_/g, " ")}</StatusBadge>,
    },
    {
      id: "security",
      header: "Security",
      width: "120px",
      cell: (e) =>
        e.securityStatus ? (
          <StatusBadge tone={SECURITY_TONE[e.securityStatus] ?? "neutral"}>
            {e.securityStatus}
          </StatusBadge>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      id: "review",
      header: "Review",
      width: "140px",
      cell: (e) =>
        e.reviewAxes ? (
          <ReviewAxesBar axes={e.reviewAxes} />
        ) : e.qualityScore !== null ? (
          <ScoreBadge score={e.qualityScore} />
        ) : (
          <span className="text-ink-muted">Unreviewed</span>
        ),
    },
    {
      id: "impact",
      header: "Impact",
      width: "90px",
      align: "right",
      cell: (e) =>
        e.impactScore !== null ? (
          <ScoreBadge score={e.impactScore} />
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      id: "score",
      header: "Score",
      width: "90px",
      align: "right",
      cell: (e) =>
        e.qualityScore !== null ? (
          <ScoreBadge score={e.qualityScore} />
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            Registry
          </h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-ink-secondary">
            Governed context packages — versioned skills, rules, and docs with
            structural reviews, install tracking, and rollout visibility.
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

      {activeTab === "installations" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RegistryInstallationsPanel />
        </div>
      ) : activeTab === "evals" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RegistryEvalsPanel />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              icon={Boxes}
              label="Packages"
              value={entries?.length ?? "—"}
              hint="Published and draft context in the registry"
            />
            <StatCard
              icon={PackageCheck}
              label="Reviewed"
              value={entries ? scoredCount : "—"}
              hint="Packages with a structural quality score"
            />
            <StatCard
              icon={Sparkles}
              label="Avg score"
              value={
                entries && scoredCount > 0
                  ? Math.round(
                      (entries
                        .filter((e) => e.qualityScore !== null)
                        .reduce((sum, e) => sum + (e.qualityScore ?? 0), 0) /
                        scoredCount) *
                        10
                    ) / 10
                  : "—"
              }
              hint="Mean validation + implementation + activation score"
            />
          </div>

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
              placeholder="Search packages…"
              aria-label="Search packages"
              className="h-10 w-full rounded-lg border border-line bg-surface-1 pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:border-line-strong"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
              />
            ))}
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight text-ink">
                Top packages
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">
                Ranked by structural review score (validation, implementation,
                activation).
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
                <TopPackageCard key={entry._id} entry={entry} />
              ))}
            </div>
          )}

          <DataTable
            columns={columns}
            rows={filtered ?? []}
            rowKey={(e) => e._id}
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

          <div className="flex items-center gap-1.5 pb-4 text-[12px] text-ink-muted">
            <Sparkles size={12} aria-hidden />
            Run evals from the Evals tab to populate impact scores (baseline vs
            candidate comparison).
          </div>
        </>
        </div>
      )}
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint: string;
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
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{hint}</p>
    </div>
  );
}

/** Data container — queries the governed context registry. */
export function RegistryView(): JSX.Element {
  const [activeTab, setActiveTab] = useState<RegistryTab>("catalog");
  const entries = useQuery(api.context.packages.listWithCurrentVersions, {}) as
    | RegistryEntry[]
    | undefined;
  return (
    <RegistryViewContent
      entries={entries}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}
