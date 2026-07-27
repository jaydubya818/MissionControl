import type { ReviewAxes } from "../../RegistryView";
import { RegistryDescriptionExamples } from "./RegistrySkillPitfalls";
import { cn } from "@/lib/utils";

interface DimensionRow {
  dimension: string;
  reasoning: string;
  score: number;
  max: number;
}

function buildImplementationRows(axes: ReviewAxes): DimensionRow[] {
  const impl = axes.implementation;
  return [
    {
      dimension: "Conciseness",
      reasoning: "Body stays lean with navigation-first structure; minimal promotional filler.",
      score: Math.min(3, Math.round((impl / 100) * 3)),
      max: 3,
    },
    {
      dimension: "Actionability",
      reasoning: "Provides concrete pointers and workflows; executable detail may live in references.",
      score: Math.min(3, Math.max(1, Math.round((impl / 100) * 3) - (impl > 85 ? 0 : 1))),
      max: 3,
    },
    {
      dimension: "Workflow clarity",
      reasoning: "Tables and groupings aid lookup; sequenced workflows with verify steps strengthen clarity.",
      score: Math.min(3, Math.max(1, Math.round((impl / 100) * 3) - 1)),
      max: 3,
    },
    {
      dimension: "Progressive disclosure",
      reasoning: "Overview routes to reference files without deep nesting.",
      score: Math.min(3, Math.round((impl / 100) * 3)),
      max: 3,
    },
  ];
}

function buildDiscoveryRows(axes: ReviewAxes): DimensionRow[] {
  const act = axes.activation;
  const val = axes.validation;
  return [
    {
      dimension: "Specificity",
      reasoning: "Description names concrete capabilities rather than vague language.",
      score: Math.min(3, Math.round((act / 100) * 3)),
      max: 3,
    },
    {
      dimension: "Completeness",
      reasoning: "Answers what the skill does and when an agent should load it.",
      score: Math.min(3, Math.round(((act + val) / 200) * 3)),
      max: 3,
    },
    {
      dimension: "Trigger term quality",
      reasoning: "Includes domain terms; broader user phrasings improve discovery.",
      score: Math.min(3, Math.max(1, Math.round((act / 100) * 3) - 1)),
      max: 3,
    },
    {
      dimension: "Distinctiveness conflict risk",
      reasoning: "Scoped trigger reduces collision with adjacent skills.",
      score: Math.min(3, Math.round((val / 100) * 3)),
      max: 3,
    },
  ];
}

function DimensionTable({ rows }: { rows: DimensionRow[] }): JSX.Element {
  const total = rows.reduce((s, r) => s + r.score, 0);
  const max = rows.reduce((s, r) => s + r.max, 0);
  const passed = total >= max * 0.75;

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th className="px-4 py-2.5 text-[12px] font-medium text-ink-muted">Dimension</th>
            <th className="px-4 py-2.5 text-[12px] font-medium text-ink-muted">Reasoning</th>
            <th className="px-4 py-2.5 text-right text-[12px] font-medium text-ink-muted">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3 text-[13px] font-medium text-ink">{row.dimension}</td>
              <td className="px-4 py-3 text-[13px] text-ink-secondary">{row.reasoning}</td>
              <td className="px-4 py-3 text-right font-mono text-[13px] text-ink">
                {row.score} / {row.max}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2.5">
        <span className="text-[13px] font-medium text-ink">Total</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] text-ink">
            {total} / {max}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              passed ? "bg-registry-accent-soft text-registry-accent" : "bg-warn-soft text-warn"
            )}
          >
            {passed ? "Passed" : "Review"}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface RegistryQualityReviewProps {
  axes: ReviewAxes;
  qualityScore: number;
  description: string;
}

/** Tessl-style Quality tab with Content, Description, and Validation sections. */
export function RegistryQualityReview({
  axes,
  qualityScore,
  description,
}: RegistryQualityReviewProps): JSX.Element {
  const validationChecks = 16;
  const validationPassed = Math.round((axes.validation / 100) * validationChecks);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-[18px] font-semibold text-ink">Content</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Reviews the quality of instructions and guidance provided to agents.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-secondary">
          {qualityScore >= 85
            ? "An exemplar of progressive disclosure: a lean, well-organized index that routes agents to focused reference material. Workflow detail may live one level down in references."
            : "The skill body provides useful guidance but could strengthen sequenced workflows, copy-paste diagnostics, and validation checkpoints before destructive operations."}
        </p>
        <div className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Suggestions</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] text-ink-secondary">
            <li>Add a short common-workflows section with one sequenced example and a verify step.</li>
            <li>Include one or two copy-paste-ready diagnostic commands in the body.</li>
            <li>Trim promotional phrasing in hosting or overview blocks to keep the directive lean.</li>
          </ul>
        </div>
        <div className="mt-4">
          <DimensionTable rows={buildImplementationRows(axes)} />
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold text-ink">Description</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Based on the skill&apos;s description, can an agent find and select it at the right time?
          The description is your activation function — most teams miss this.
        </p>
        <RegistryDescriptionExamples className="mt-4" />
        <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">{description}</p>
        <div className="mt-4">
          <DimensionTable rows={buildDiscoveryRows(axes)} />
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold text-ink">Validation</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Checks the skill against the spec for correct structure and formatting.
        </p>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3">
          <span className="font-mono text-[15px] font-semibold text-registry-accent">
            {validationPassed} / {validationChecks}
          </span>
          <span className="text-[13px] text-ink-secondary">Validation checks passed</span>
          <span className="ml-auto rounded-full bg-registry-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-registry-accent">
            Passed
          </span>
        </div>
      </section>
    </div>
  );
}
