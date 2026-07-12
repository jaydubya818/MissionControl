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
import { eosNavigate, setSelectedSkillSlug } from "./eos/skillSelection";
import { cn } from "./lib/utils";

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
  impactScore: number | null;
  securityStatus: string | null;
  sourceRepo: string | null;
  updatedAt: number;
}

interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const CATEGORIES: Category[] = [
  { id: "all", label: "All", icon: Boxes , description: "Everything in the governed registry, ranked by quality." },
  { id: "testing-quality", label: "Testing & Quality", icon: FlaskConical , description: "Skills for writing, running, and debugging tests across unit, integration, and E2E." },
  { id: "security-compliance", label: "Security & Compliance", icon: Shield , description: "Harden agents and code, enforce policy, and keep approvals audit-ready." },
  { id: "documentation", label: "Documentation", icon: BookOpen , description: "Generate and maintain READMEs, API docs, runbooks, and inline guidance." },
  { id: "debugging", label: "Debugging & Errors", icon: Bug , description: "Diagnose failures, trace errors, and encode resilient recovery patterns." },
  { id: "api-development", label: "API Development", icon: Layers , description: "Design, build, and document APIs with consistent contracts." },
  { id: "web-development", label: "Web Development", icon: Globe , description: "UI components, layout systems, and design-to-code workflows." },
  { id: "database", label: "Database", icon: Database , description: "Schema design, query optimization, and migration patterns." },
  { id: "infrastructure", label: "Infrastructure", icon: Cloud , description: "Provisioning, environments, and deployment pipeline skills." },
  { id: "git-delivery", label: "Git & Delivery", icon: GitBranch , description: "Worktrees, branches, PR discipline, and safe delivery flows." },
  { id: "observability", label: "Observability", icon: Radio , description: "Telemetry, run inspection, and evidence-first diagnostics." },
  { id: "release-engineering", label: "Release Engineering", icon: Rocket , description: "Release readiness, verification gates, and rollback safety." },
  { id: "agent-operations", label: "Agent Operations", icon: Bot , description: "Registration, heartbeats, budgets, memory, and the factory contract." },
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
        "flex min-h-[132px] w-full flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-colors duration-150",
        active
          ? "border-info-accent bg-surface-1 text-ink"
          : "border-line bg-surface-1/60 text-ink-secondary hover:border-line-strong hover:text-ink"
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2">
        <Icon size={16} strokeWidth={1.6} aria-hidden />
      </span>
      <span className="text-[13.5px] font-semibold text-ink">{category.label}</span>
      <span className="line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
        {category.description}
      </span>
    </button>
  );
}

/** Set cross-view selection, then route to the detail page. */
function openSkillDetail(slug: string): void {
  setSelectedSkillSlug(slug);
  eosNavigate("skill-detail");
}

function TopPackageCard({ entry }: { entry: RegistryEntry }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => openSkillDetail(entry.slug)}
      className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
    >
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
    </button>
  );
}

export interface RegistryViewContentProps {
  entries: RegistryEntry[] | undefined;
}

/** Presentational registry (exported for tests). */
export function RegistryViewContent({ entries }: RegistryViewContentProps): JSX.Element {
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
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
          Skills Marketplace
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">
          Governed skills and context packages — evaluated, secured, versioned.
        </p>
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
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">Browse by category</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">Find exactly what you need, organized by use case.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
        </div>
      </section>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Top packages
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Ranked by structural quality score from the skill linter.
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
        onRowClick={(e) => openSkillDetail(e.slug)}
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

      <section className="rounded-xl border border-line bg-surface-1 p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ok">Publish a skill</div>
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">
              Make your skill work correctly — provably.
            </h2>
            <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-ink-secondary">
              Register a skill and the factory lints it, versions it by content
              hash, and lists it here. Scenario evaluations attach scores and
              lift once the evaluation pipeline runs.
            </p>
            <code className="w-fit rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-ink">
              node scripts/import-repo-skills.mjs
            </code>
          </div>
          <ol className="flex flex-col gap-2">
            {[
              ["Submit your skill", "Point the importer at a SKILL.md — frontmatter is validated and the content hash recorded."],
              ["Get your score", "mc skill lint runs the structural review; scenario evals add impact once PRs 8\u20139 land."],
              ["Improve and republish", "Act on lint findings, re-import, and every version stays tracked and comparable."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3">
                <span className="font-mono text-[12.5px] text-ok">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[13.5px] font-medium text-ink">{title}</span>
                  <span className="block text-[12.5px] text-ink-muted">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="flex items-center gap-1.5 pb-4 text-[12px] text-ink-muted">
        <Sparkles size={12} aria-hidden />
        Impact scores appear once the evaluation framework runs baseline and
        candidate scenarios.
      </div>
    </div>
  );
}

/** Data container — queries the governed context registry. */
export function RegistryView(): JSX.Element {
  const entries = useQuery(api.context.packages.listWithCurrentVersions, {}) as
    | RegistryEntry[]
    | undefined;
  return <RegistryViewContent entries={entries} />;
}
