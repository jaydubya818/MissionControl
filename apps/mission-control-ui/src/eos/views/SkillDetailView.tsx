/**
 * Skills Marketplace detail page (view id "skill-detail").
 *
 * Real Convex fields (package identity, version, qualityScore,
 * securityStatus, provenance fields, inlineContent) render unbadged.
 * Every surface backed by a pipeline that has not shipped yet (impact,
 * eval scenarios, LLM dimension review, security scanning, claiming)
 * carries a ProvenanceBadge ("demo" / "preview") — honest labeling per
 * the EOS type system in ../types.ts.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Copy, PackageSearch } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Breadcrumbs } from "../../components/factory/Breadcrumbs";
import { DetailTabs, MetadataPanel, type DetailTab, type MetadataEntry } from "../../components/factory/DetailLayout";
import { RiskBadge, ScoreBadge, StatusBadge, type RiskLevel, type StatusBadgeProps } from "../../components/factory/badges";
import { DataTable, type Column } from "../../components/factory/DataTable";
import { EmptyState } from "../../components/ui/empty-state";
import { cn } from "../../lib/utils";
import { ProvenanceBadge } from "../components";
import { getSelectedSkillSlug } from "../skillSelection";

export interface SkillDetailViewProps {
  onNavigate: (view: string) => void;
}

type PackageDoc = NonNullable<FunctionReturnType<typeof api.context.packages.getBySlug>>;
type VersionDoc = FunctionReturnType<typeof api.context.packages.listVersions>[number];

type TabId = "skill-md" | "quality" | "evals" | "security";

const TABS: DetailTab[] = [
  { id: "skill-md", label: "SKILL.md" },
  { id: "quality", label: "Quality" },
  { id: "evals", label: "Evals" },
  { id: "security", label: "Security" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Date.now() - timestamp) / 1000;
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Deterministic hash so demo projections differ per skill but stay stable. */
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h;
}

function humanizeName(name: string): string {
  return name.replace(/[-_]/g, " ");
}

function truncateHash(hash: string): string {
  return hash.length > 22 ? `${hash.slice(0, 15)}…${hash.slice(-6)}` : hash;
}

interface SecurityDisplay {
  tone: StatusBadgeProps["tone"];
  label: string;
  explanation: string;
}

function securityDisplay(status: string | undefined): SecurityDisplay {
  switch (status) {
    case "PASSED":
      return {
        tone: "success",
        label: "Passed",
        explanation:
          "The security pipeline scanned this version and found no prompt-injection, secret, or exfiltration patterns.",
      };
    case "QUARANTINED":
      return {
        tone: "error",
        label: "Quarantined",
        explanation:
          "This version failed security scanning and is quarantined — agents will not load it until a clean version is published.",
      };
    case "FAILED":
      return {
        tone: "error",
        label: "Failed",
        explanation: "Security scanning found findings on this version. Review before installing.",
      };
    default:
      return {
        tone: "neutral",
        label: "Unscanned",
        explanation:
          "This version has not been scanned. Its content is registered and hash-pinned, but no security verdict exists yet.",
      };
  }
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function CopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const onCopy = (): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className="shrink-0 rounded p-1 text-ink-muted transition-colors duration-150 hover:text-ink"
    >
      {copied ? <Check size={14} strokeWidth={1.75} aria-hidden /> : <Copy size={14} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}

function LoadingBars(): JSX.Element {
  const widths = ["w-1/3", "w-2/3", "w-full", "w-5/6", "w-1/2", "w-3/4"];
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading skill detail">
      {widths.map((w, i) => (
        <div key={i} className={cn("h-4 animate-pulse rounded bg-surface-2", w)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight SKILL.md renderer — no HTML injection, no new deps.
// ---------------------------------------------------------------------------

function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter: null, body: content };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return {
        frontmatter: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { frontmatter: null, body: content };
}

function renderInline(text: string): JSX.Element[] {
  // Minimal inline markdown: **bold** and `code`. No HTML injection —
  // output is plain React elements.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function parseMarkdownBlocks(body: string): JSX.Element[] {
  const lines = body.split("\n");
  const out: JSX.Element[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      out.push(
        <pre
          key={out.length}
          className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink-secondary"
        >
          {buf.join("\n")}
        </pre>
      );
      continue;
    }
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:-|]+\|?$/)) {
      const header = line.trim().split("|").map((c) => c.trim()).filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim().split("|").map((c) => c.trim()).filter(Boolean));
        i++;
      }
      out.push(
        <div key={out.length} className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                {header.map((h, j) => (
                  <th key={j} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, r) => (
                <tr key={r} className="border-b border-line last:border-b-0">
                  {cells.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top text-ink-secondary">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(
        <h4 key={out.length} className="pt-1 text-[15px] font-semibold text-ink">
          {line.slice(4)}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        <h3 key={out.length} className="pt-2 text-[19px] font-semibold tracking-tight text-ink">
          {line.slice(3)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(
        <h2 key={out.length} className="pt-2 text-[24px] font-semibold tracking-tight text-ink">
          {line.slice(2)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={out.length} className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] leading-relaxed text-ink-secondary">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("- ") &&
      !lines[i].trim().startsWith("```")
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p key={out.length} className="text-[13.5px] leading-relaxed text-ink-secondary">
        {renderInline(para.join(" "))}
      </p>
    );
  }
  return out;
}

function SkillMarkdown({ content }: { content: string }): JSX.Element {
  const { frontmatter, body } = useMemo(() => splitFrontmatter(content), [content]);
  const blocks = useMemo(() => parseMarkdownBlocks(body), [body]);
  return (
    <div className="flex flex-col gap-3">
      {frontmatter !== null && (
        <details className="rounded-lg border border-line bg-surface-1">
          <summary className="cursor-pointer px-3 py-2 text-[12.5px] text-ink-muted transition-colors duration-150 hover:text-ink-secondary">
            Frontmatter
          </summary>
          <pre className="overflow-x-auto border-t border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink-secondary">
            {frontmatter}
          </pre>
        </details>
      )}
      {blocks}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bodies
// ---------------------------------------------------------------------------

function SkillMdTab({ version }: { version: VersionDoc | null }): JSX.Element {
  if (!version?.inlineContent) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Content not inlined"
        description="This version stores its body by content hash / storage reference rather than inline. Inline previews arrive with the import pipeline."
      />
    );
  }
  return <SkillMarkdown content={version.inlineContent} />;
}

interface DimensionRow {
  label: string;
  reasoning: string;
  score: string;
}

function buildDimensionRows(slug: string, skillName: string): DimensionRow[] {
  const h = hashSlug(slug);
  const pick = (i: number): string => (((h >> (i * 2)) & 1) === 0 ? "3 / 3" : "2 / 3");
  return [
    {
      label: "Conciseness",
      reasoning: `Instructions in ${skillName} stay close to the workflows they describe; a few sections restate context the agent already holds.`,
      score: pick(0),
    },
    {
      label: "Actionability",
      reasoning: `Steps are phrased as concrete agent actions with explicit commands, so ${skillName} can be followed without interpretation.`,
      score: pick(1),
    },
    {
      label: "Workflow clarity",
      reasoning: `The happy path through ${skillName} is unambiguous; failure and retry branches are described where they matter.`,
      score: pick(2),
    },
    {
      label: "Progressive disclosure",
      reasoning: `${skillName} front-loads the minimum viable context and defers detail to later sections instead of dumping everything up front.`,
      score: pick(3),
    },
  ];
}

function QualityTab({
  slug,
  skillName,
  version,
}: {
  slug: string;
  skillName: string;
  version: VersionDoc | null;
}): JSX.Element {
  const score = version?.qualityScore ?? null;
  const reviewedAt = version?.publishedAt ?? version?.createdAt ?? null;
  const dimensions = buildDimensionRows(slug, skillName);
  const suggestions = [
    `Tighten the opening section of ${skillName} — state in one line when NOT to use the skill.`,
    "Add one worked example with expected output so agents can self-verify before acting.",
  ];
  return (
    <section className="flex flex-col gap-5">
      <div>
        {score !== null ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[24px] font-semibold text-ink">{Math.round(score)} / 100</span>
            <ScoreBadge score={score} />
          </div>
        ) : (
          <span className="text-[15px] text-ink-muted">Not yet scored — the skill linter has not run on this version.</span>
        )}
        {reviewedAt !== null && (
          <div className="mt-1 text-[12.5px] text-ink-muted">Reviewed {timeAgo(reviewedAt)}</div>
        )}
      </div>

      <div className="flex flex-col rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center gap-2 pb-3">
          <h3 className="text-[15px] font-semibold text-ink">Dimensions</h3>
          <ProvenanceBadge provenance="demo" />
        </div>
        <div className="divide-y divide-line">
          {dimensions.map((dim) => (
            <div key={dim.label} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink">{dim.label}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{dim.reasoning}</p>
              </div>
              <span className="shrink-0 font-mono text-[13px] text-ink">{dim.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-ink">Suggestions</h3>
          <ProvenanceBadge provenance="demo" />
        </div>
        {suggestions.map((s) => (
          <div key={s} className="rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-[13px] leading-relaxed text-ink-secondary">
            {s}
          </div>
        ))}
      </div>

      <p className="text-[12px] text-ink-muted">
        Structural score is real (skill linter). Dimension analysis is a demo projection until the LLM review tier ships.
      </p>
    </section>
  );
}

interface CriterionRow {
  id: string;
  criteria: string;
  baseline: string;
  withContext: string;
}

const GENERIC_CRITERIA = [
  "Identifies when the skill applies",
  "Follows the documented workflow order",
  "Uses the prescribed commands and flags",
  "Handles the failure path without looping",
  "Reports status in the expected format",
  "Stays within budget and permission limits",
  "Verifies the outcome before claiming done",
];

function buildCriteriaRows(slug: string, version: VersionDoc | null): CriterionRow[] {
  const h = hashSlug(slug);
  const caps = version?.capabilities ?? [];
  const names =
    caps.length >= 4
      ? caps.slice(0, 7).map((c) => `Applies ${humanizeName(c)} correctly`)
      : GENERIC_CRITERIA;
  const warnIndex = h % names.length;
  return names.map((name, i) => ({
    id: `crit-${i}`,
    criteria: name,
    baseline: ((h >> i) & 1) === 0 ? "0%" : "100%",
    withContext: i === warnIndex ? "60%" : "100%",
  }));
}

function PercentCell({ value }: { value: string }): JSX.Element {
  const color = value === "0%" ? "text-err" : value === "60%" ? "text-warn" : "text-ok";
  return <span className={cn("font-mono text-[12.5px]", color)}>{value}</span>;
}

function EvalsTab({
  slug,
  skillName,
  version,
}: {
  slug: string;
  skillName: string;
  version: VersionDoc | null;
}): JSX.Element {
  const rows = buildCriteriaRows(slug, version);
  const columns: Column<CriterionRow>[] = [
    { id: "criteria", header: "Criteria", cell: (r) => <span className="text-[13px] text-ink">{r.criteria}</span> },
    { id: "baseline", header: "Baseline", width: "130px", cell: (r) => <PercentCell value={r.baseline} /> },
    { id: "with-context", header: "With context", width: "130px", cell: (r) => <PercentCell value={r.withContext} /> },
  ];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-[19px] font-semibold tracking-tight text-ink">Evaluation results</h3>
          <ProvenanceBadge provenance="preview" />
        </div>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          Scenario evaluations ship with PRs 8–9. The layout below is populated with a demo scenario.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[24px] font-semibold text-ok">100%</span>
          <StatusBadge tone="success">↑ 20%</StatusBadge>
          <ProvenanceBadge provenance="demo" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-ink">
            Agent applies {skillName} correctly under budget pressure
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Scored against {rows.length} criteria — baseline is the same task without the skill installed.
          </p>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </div>
    </section>
  );
}

function SecurityTab({ version }: { version: VersionDoc | null }): JSX.Element {
  const display = securityDisplay(version?.securityStatus);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
        <p className="text-[13.5px] leading-relaxed text-ink-secondary">{display.explanation}</p>
      </div>

      <div className="flex flex-col rounded-xl border border-line bg-surface-1 p-4">
        <h3 className="pb-3 text-[15px] font-semibold text-ink">Provenance</h3>
        <div className="divide-y divide-line">
          <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
            <span className="text-[12.5px] text-ink-muted">Content hash</span>
            {version?.contentHash ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-[12.5px] text-ink" title={version.contentHash}>
                  {truncateHash(version.contentHash)}
                </span>
                <CopyButton text={version.contentHash} label="Copy content hash" />
              </span>
            ) : (
              <span className="text-[12.5px] text-ink-muted">—</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-[12.5px] text-ink-muted">Source commit</span>
            <span className="font-mono text-[12.5px] text-ink">
              {version?.sourceCommitSha ? version.sourceCommitSha.slice(0, 7) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5 last:pb-0">
            <span className="text-[12.5px] text-ink-muted">Source path</span>
            <span className="truncate font-mono text-[12.5px] text-ink">{version?.sourcePath ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        <ProvenanceBadge provenance="preview" />
        Prompt-injection / secret / exfiltration scanning ships with PR 11 (security pipeline).
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Score band + header pieces
// ---------------------------------------------------------------------------

function ScoreBand({ version }: { version: VersionDoc | null }): JSX.Element {
  const security = securityDisplay(version?.securityStatus);
  const quality = version?.qualityScore ?? null;
  const unscanned = version?.securityStatus === undefined || version?.securityStatus === "UNSCANNED";
  return (
    <div className="grid grid-cols-1 gap-6 border-b border-line pb-6 sm:grid-cols-3">
      <div className="flex flex-col gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Quality</span>
        {quality !== null ? (
          <ScoreBadge score={quality} size="lg" className="self-start" />
        ) : (
          <span className="font-mono text-[20px] text-ink-muted">—</span>
        )}
        <span className="text-[12px] text-ink-muted">Structural review score from the skill linter</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Impact</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[20px] text-ink-muted">—</span>
          <ProvenanceBadge provenance="preview" />
        </span>
        <span className="text-[12px] text-ink-muted">
          Average across eval scenarios — ships with the evaluation pipeline (PRs 8–9)
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Security</span>
        <StatusBadge tone={security.tone} className="self-start">
          {security.label}
        </StatusBadge>
        {unscanned && <span className="text-[12px] text-ink-muted">Scanning ships with PR 11</span>}
      </div>
    </div>
  );
}

function InstallCard({ slug }: { slug: string }): JSX.Element {
  const command = `mc context add ${slug}`;
  return (
    <div className="w-full max-w-[340px] shrink-0 rounded-xl border border-line bg-surface-1 p-3">
      <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
        Install with mc CLI
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
        <code className="truncate font-mono text-[12.5px] text-ink">{command}</code>
        <CopyButton text={command} label="Copy install command" />
      </div>
      <div className="mt-2 text-[12px] text-ink-muted">
        What are skills? → docs/software-factory/CONTEXT_MANIFESTS.md
      </div>
    </div>
  );
}

function ClaimCard(): JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium text-ink">Is this your skill?</span>
        <ProvenanceBadge provenance="preview" />
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-secondary">
        Maintainers can manage eval scenarios, bundle related skills, and attach documentation or rules.
      </p>
      <button
        type="button"
        disabled
        title="Preview"
        className="h-9 cursor-not-allowed rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink opacity-60"
      >
        Claim skill
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SkillDetailContent({
  pkg,
  version,
  onNavigate,
}: {
  pkg: PackageDoc;
  version: VersionDoc | null;
  onNavigate: (view: string) => void;
}): JSX.Element {
  const [tab, setTab] = useState<TabId>("skill-md");
  const name = pkg.displayName ?? pkg.name;
  const skillName = humanizeName(pkg.name);

  const metadata: MetadataEntry[] = [
    {
      label: "Repository",
      value: <span className="font-mono text-[12.5px]">{version?.sourceRepo ?? "jaydubya818/MissionControl"}</span>,
    },
    {
      label: "Commit",
      value: (
        <span className="font-mono text-[12.5px]">
          {version?.sourceCommitSha ? version.sourceCommitSha.slice(0, 7) : "—"}
        </span>
      ),
    },
    { label: "Version", value: version ? <span className="font-mono text-[12.5px]">v{version.version}</span> : "—" },
    { label: "Published", value: version?.publishedAt ? timeAgo(version.publishedAt) : "Draft" },
    { label: "Owner", value: pkg.owner },
    { label: "Type", value: <StatusBadge tone="neutral">{pkg.type.replace(/_/g, " ")}</StatusBadge> },
    { label: "Risk", value: <RiskBadge level={pkg.riskLevel as RiskLevel} /> },
    {
      label: "Content hash",
      value: version?.contentHash ? (
        <span className="font-mono text-[12px]" title={version.contentHash}>
          {truncateHash(version.contentHash)}
        </span>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Knowledge" },
          { label: "Skills Marketplace", onClick: () => onNavigate("skills") },
          { label: name, current: true },
        ]}
      />

      <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{name}</h1>
          <p className="mt-2 line-clamp-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-secondary">
            {pkg.description}
          </p>
        </div>
        <InstallCard slug={pkg.slug} />
      </div>

      <ScoreBand version={version} />

      <DetailTabs tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          {tab === "skill-md" && <SkillMdTab version={version} />}
          {tab === "quality" && <QualityTab slug={pkg.slug} skillName={skillName} version={version} />}
          {tab === "evals" && <EvalsTab slug={pkg.slug} skillName={skillName} version={version} />}
          {tab === "security" && <SecurityTab version={version} />}
        </div>
        <div className="xl:col-span-4">
          <MetadataPanel entries={metadata} className="w-full">
            <ClaimCard />
          </MetadataPanel>
        </div>
      </div>
    </>
  );
}

export function SkillDetailView({ onNavigate }: SkillDetailViewProps): JSX.Element {
  const registry = useQuery(api.context.packages.listWithCurrentVersions, {}) as
    | Array<{ slug: string }>
    | undefined;
  const selectedSlug = getSelectedSkillSlug();
  const slug = selectedSlug ?? registry?.[0]?.slug ?? null;
  const pkg = useQuery(api.context.packages.getBySlug, slug !== null ? { slug } : "skip");
  const versions = useQuery(
    api.context.packages.listVersions,
    pkg ? { packageId: pkg._id } : "skip"
  );

  const version: VersionDoc | null = useMemo(() => {
    if (!versions || versions.length === 0) return null;
    if (pkg?.currentVersionId) {
      const current = versions.find((v) => v._id === pkg.currentVersionId);
      if (current) return current;
    }
    return versions[0];
  }, [versions, pkg]);

  const loading =
    (slug === null && registry === undefined) ||
    (slug !== null && pkg === undefined) ||
    (pkg != null && versions === undefined);

  let body: JSX.Element;
  if (loading) {
    body = <LoadingBars />;
  } else if (slug === null) {
    body = (
      <EmptyState
        icon={PackageSearch}
        title="No skills in the registry"
        description="Import repo skills to populate the marketplace, then open any package to see its detail page."
        action={<BackToMarketplace onNavigate={onNavigate} />}
      />
    );
  } else if (pkg === null) {
    body = (
      <EmptyState
        icon={PackageSearch}
        title="Skill not found"
        description={`No package with slug "${slug}" exists in the registry. It may have been renamed or removed.`}
        action={<BackToMarketplace onNavigate={onNavigate} />}
      />
    );
  } else {
    body = <SkillDetailContent pkg={pkg} version={version} onNavigate={onNavigate} />;
  }

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">{body}</div>
    </div>
  );
}

function BackToMarketplace({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onNavigate("skills")}
      className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
    >
      Back to Skills Marketplace
    </button>
  );
}
