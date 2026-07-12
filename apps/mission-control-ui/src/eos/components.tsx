import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Database, Minus } from "lucide-react";
import { DEMO_TOUR } from "./demoData";
import { cn } from "../lib/utils";
import type {
  Confidence,
  EvidenceReference,
  HealthSignal,
  HealthStatus,
  Insight,
  Provenance,
  Trend,
} from "./types";

const PROVENANCE_LABEL: Record<Exclude<Provenance, "convex">, string> = {
  demo: "Demo data",
  preview: "Preview",
  projected: "Projected",
  insufficient: "Insufficient evidence",
  disconnected: "Not yet connected",
};

const PROVENANCE_EXPLANATION: Record<Exclude<Provenance, "convex">, string> = {
  demo: "Seeded demo narrative (Atlas Checkout) — not measured production data",
  preview: "Real interface over a pipeline that ships with the Lineage v1 roadmap",
  projected: "Derived client-side from seeded lineage events",
  insufficient: "Below minimum sample size — value withheld rather than invented",
  disconnected: "Integration not configured in this environment",
};

/**
 * Honest-labeling indicator. Rendered on EVERY non-authoritative datum.
 * variant "badge": explicit chip (default for standalone/heading placement).
 * variant "dot": compact icon with tooltip, for dense grids where repeated
 * chips become noise — provenance stays explicit and discoverable.
 */
export function ProvenanceBadge({
  provenance,
  className,
  variant = "badge",
}: {
  provenance: Provenance;
  className?: string;
  variant?: "badge" | "dot";
}): JSX.Element | null {
  if (provenance === "convex") return null;
  const label = PROVENANCE_LABEL[provenance];
  const explanation = PROVENANCE_EXPLANATION[provenance];
  if (variant === "dot") {
    return (
      <span
        role="img"
        tabIndex={0}
        aria-label={`${label} — ${explanation}`}
        title={`${label} — ${explanation}`}
        className={cn("inline-flex items-center rounded text-ink-muted focus-visible:outline-none", className)}
      >
        <Database size={11} strokeWidth={1.7} aria-hidden />
      </span>
    );
  }
  return (
    <span
      title={explanation}
      className={cn(
        "inline-flex items-center rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted",
        provenance === "insufficient" && "text-warn border-warn/40",
        className
      )}
    >
      {label}
    </span>
  );
}

/** Page-level disclosure when most of a page is seeded (assignment §11). */
export function PageProvenanceNote({ text }: { text?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
      <Database size={12} strokeWidth={1.7} aria-hidden />
      {text ??
        "This page presents the seeded Atlas Checkout demo narrative. Cards marked with the data icon are demo projections; unmarked values are live records."}
    </div>
  );
}

/** Inline guided demo bar (assignment §14) — no modals. */
export function DemoTourBar({
  currentView,
  onNavigate,
}: {
  currentView: string;
  onNavigate: (view: string) => void;
}): JSX.Element | null {
  const idx = DEMO_TOUR.findIndex((s) => s.view === currentView);
  if (idx === -1) return null;
  const next = DEMO_TOUR[idx + 1];
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-xl border border-line bg-surface-3 px-3 py-2 shadow-[var(--shadow-elevation-2)]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
        EOS preview · demo {idx + 1}/{DEMO_TOUR.length}
      </span>
      {next ? (
        <button
          type="button"
          onClick={() => onNavigate(next.view)}
          className="inline-flex items-center gap-1 rounded-lg bg-act px-2.5 py-1 text-[12.5px] font-medium text-act-ink hover:opacity-90"
        >
          Next: {next.label}
          <ArrowRight size={12} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onNavigate(DEMO_TOUR[0].view)}
          className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-ink-secondary hover:text-ink"
        >
          Restart demo
        </button>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  HEALTHY: { dot: "bg-ok", text: "text-ok", label: "Healthy" },
  WATCH: { dot: "bg-warn", text: "text-warn", label: "Watch" },
  AT_RISK: { dot: "bg-warn", text: "text-warn", label: "At risk" },
  CRITICAL: { dot: "bg-err", text: "text-err", label: "Critical" },
  INSUFFICIENT_EVIDENCE: { dot: "bg-ink-muted", text: "text-ink-muted", label: "Insufficient evidence" },
};

export function TrendIcon({ trend, invert }: { trend: Trend; invert?: boolean }): JSX.Element {
  if (trend === "flat") return <Minus size={11} className="text-ink-muted" aria-label="flat" />;
  const good = invert ? trend === "down" : trend === "up";
  const Icon = trend === "up" ? ArrowUpRight : ArrowDownRight;
  return <Icon size={11} className={good ? "text-ok" : "text-err"} aria-label={trend} />;
}

export function ConfidenceLabel({ confidence }: { confidence: Confidence }): JSX.Element {
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
      {confidence} confidence
    </span>
  );
}

export function EvidenceLink({
  evidence,
  onNavigate,
}: {
  evidence: EvidenceReference;
  onNavigate: (view: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onNavigate(evidence.view)}
      className="inline-flex items-center gap-1 text-[12px] text-ok hover:opacity-80"
    >
      {evidence.count !== undefined && (
        <span className="font-mono">{evidence.count}</span>
      )}
      {evidence.label}
      <ArrowRight size={11} aria-hidden />
    </button>
  );
}

/** Command-center health band cell: state · trend · confidence · drill. */
export function HealthSignalCard({
  signal,
  onNavigate,
}: {
  signal: HealthSignal;
  onNavigate: (view: string) => void;
}): JSX.Element {
  const style = STATUS_STYLE[signal.status];
  return (
    <button
      type="button"
      onClick={() => onNavigate(signal.drillView)}
      className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface-1 p-3 text-left transition-colors duration-150 hover:border-line-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
          {signal.label}
        </span>
        <ProvenanceBadge provenance={signal.provenance} variant="dot" />
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden />
        <span className={cn("text-[15px] font-semibold", style.text)}>{style.label}</span>
        <TrendIcon trend={signal.trend} />
      </div>
      <div className="truncate text-[12px] text-ink-secondary">{signal.summary}</div>
      <ConfidenceLabel confidence={signal.confidence} />
    </button>
  );
}

/** Recommendation card: observed / evidence / impact / confidence / action / drill. */
export function InsightCard({
  insight,
  onNavigate,
}: {
  insight: Insight;
  onNavigate: (view: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13.5px] font-medium text-ink">{insight.observed}</div>
        <ProvenanceBadge provenance={insight.provenance} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {insight.evidence.map((ev) => (
          <EvidenceLink key={ev.label} evidence={ev} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="text-[12.5px] text-ink-secondary">
        <span className="text-ink-muted">Impact: </span>
        {insight.impact}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
        <div className="flex items-center gap-3">
          <ConfidenceLabel confidence={insight.confidence} />
        </div>
        <button
          type="button"
          onClick={() => onNavigate(insight.drillView)}
          className="rounded-lg bg-act px-2.5 py-1.5 text-[12.5px] font-medium text-act-ink hover:opacity-90"
        >
          {insight.action}
        </button>
      </div>
    </div>
  );
}

export function EosSection({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ok">{eyebrow}</div>
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
