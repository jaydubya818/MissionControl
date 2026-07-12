/**
 * EOS Trace Inspector (Phase 5 flagship demo screen).
 *
 * Answers "what happened between intent and delivery?" on one page:
 * lineage rail (mission → outcome), execution span tree, evidence
 * metadata rail, and the interventions/policy strip. Narrative data is
 * typed demo fixtures from demoData.ts (ProvenanceBadge on every
 * non-authoritative datum); the Model entry is the one live Convex read.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cog,
  DollarSign,
  ExternalLink,
  FileText,
  Flag,
  FlaskConical,
  GitCommitHorizontal,
  GitPullRequest,
  Hand,
  ListChecks,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { cn } from "../../lib/utils";
import { PageHeader, MetadataPanel, type MetadataEntry } from "../../components/factory/DetailLayout";
import { StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { EvidenceLink, PageProvenanceNote, ProvenanceBadge } from "../components";
import { ATLAS, demoCapabilities, demoFriction, demoLineage, demoTraceSpans } from "../demoData";
import type { LineageNode, TraceSpanView } from "../types";

export interface TraceInspectorViewProps {
  onNavigate: (view: string) => void;
}

const LINEAGE_ICON: Record<LineageNode["kind"], LucideIcon> = {
  MISSION: Target,
  WORK_ORDER: ListChecks,
  RUN: Play,
  AGENT_SESSION: Cog,
  TOOL_CALL: Wrench,
  ARTIFACT: FileText,
  PULL_REQUEST: GitPullRequest,
  VERIFICATION: CheckCircle2,
  APPROVAL: Shield,
  COST: DollarSign,
  OUTCOME: Flag,
  LEARNING: Sparkles,
};

const SPAN_ICON: Record<TraceSpanView["kind"], LucideIcon> = {
  PLAN: ListChecks,
  TOOL: Wrench,
  TEST: FlaskConical,
  COMMIT: GitCommitHorizontal,
  APPROVAL: Shield,
  VERIFY: CheckCircle2,
  RETRY: RotateCcw,
  INTERVENTION: Hand,
};

const SPAN_STATUS_TONE: Record<TraceSpanView["status"], StatusBadgeProps["tone"]> = {
  OK: "success",
  FAILED: "error",
  DENIED: "error",
  RETRIED: "warning",
  WAIVED: "warning",
};

/** 8_000 → "8s" · 210_000 → "3.5m" · 5_400_000 → "90m" */
function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  const minutes = Math.round((ms / 60_000) * 10) / 10;
  return `${Number.isInteger(minutes) ? minutes.toFixed(0) : minutes.toFixed(1)}m`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function LineageRail({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">Lineage</h2>
        <ProvenanceBadge provenance="demo" />
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">
        Mission to learning — one connected chain of records for this work order.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-3">
        {demoLineage.map((node, i) => {
          const Icon = LINEAGE_ICON[node.kind];
          const isFocus = node.kind === "RUN";
          const chipClass = cn(
            "flex items-center gap-2.5 rounded-lg border bg-surface-2 px-2.5 py-1.5 text-left",
            isFocus ? "border-line-strong" : "border-line",
            node.drillView && "transition-colors duration-150 hover:border-line-strong"
          );
          const body = (
            <>
              <Icon size={15} strokeWidth={1.7} className="shrink-0 text-ink-muted" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="max-w-[26ch] truncate text-[12.5px] font-medium text-ink">{node.label}</span>
                {node.status && (
                  <span className="font-mono text-[10.5px] text-ink-muted">
                    {node.status}
                    {node.detail ? ` · ${node.detail}` : ""}
                  </span>
                )}
              </span>
              <ProvenanceBadge provenance={node.provenance} variant="dot" />
            </>
          );
          return (
            <span key={node.id} className="flex min-w-0 items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-[13px] text-ink-muted">
                  →
                </span>
              )}
              {node.drillView ? (
                <button type="button" onClick={() => onNavigate(node.drillView as string)} className={chipClass}>
                  {body}
                </button>
              ) : (
                <span className={chipClass}>{body}</span>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function SpanRow({
  span,
  depth,
  onNavigate,
}: {
  span: TraceSpanView;
  depth: number;
  onNavigate: (view: string) => void;
}): JSX.Element {
  const Icon = SPAN_ICON[span.kind];
  // A real failure signal: the failed step and its retry share a warn rule.
  const warnRule = span.status === "FAILED" || span.kind === "RETRY";
  // FAILED and RETRY details are the story — visible by default; the rest collapse.
  const [detailsOpen, setDetailsOpen] = useState(warnRule);
  const DisclosureIcon = detailsOpen ? ChevronDown : ChevronRight;
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0",
        warnRule && "border-l border-warn"
      )}
      style={depth > 0 ? { paddingLeft: `${16 + depth * 24}px` } : undefined}
    >
      <Icon size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{span.label}</span>
          <StatusBadge tone={SPAN_STATUS_TONE[span.status]}>{span.status}</StatusBadge>
          {span.detail && (
            <button
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
              className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-muted transition-colors duration-150 hover:text-ink-secondary"
            >
              <DisclosureIcon size={12} strokeWidth={1.7} aria-hidden />
              Details
            </button>
          )}
        </div>
        {span.detail && detailsOpen && (
          <div className="mt-0.5 text-[12px] text-ink-muted">{span.detail}</div>
        )}
        {span.kind === "APPROVAL" && (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-ink-secondary">human gate · dual control 2/2</span>
            <EvidenceLink evidence={{ label: "decision chain", view: "audit" }} onNavigate={onNavigate} />
          </div>
        )}
        {span.kind === "VERIFY" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-ink-secondary">3 of 4 · 1 awaiting waiver</span>
            <button
              type="button"
              onClick={() => onNavigate("dossier")}
              className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              Review waiver
            </button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-0.5 font-mono text-[12px] text-ink-muted">
        {span.costUsd !== undefined && <span>{formatUsd(span.costUsd)}</span>}
        <span className="w-12 text-right">{formatDuration(span.durationMs)}</span>
      </div>
    </div>
  );
}

function ExecutionTree({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  const roots = demoTraceSpans.filter((s) => !s.parentSpanId);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">Execution tree</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Every span of run-12, recorded at write time.{" "}
          <ProvenanceBadge provenance="demo" className="align-middle" />
        </p>
        <p className="mt-1.5 text-[12.5px] text-ink-secondary">
          Planned → failed setup → human-assisted recovery → gated by dual-control approval → PR #
          {ATLAS.pr.number} → 3/4 verified · 1 waiver pending
        </p>
      </div>
      <div className="rounded-xl border border-line bg-surface-1">
        {roots.map((root) => (
          <div key={root.spanId}>
            <SpanRow span={root} depth={0} onNavigate={onNavigate} />
            {demoTraceSpans
              .filter((s) => s.parentSpanId === root.spanId)
              .map((child) => (
                <SpanRow key={child.spanId} span={child} depth={1} onNavigate={onNavigate} />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function InterventionsStrip({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  const retrySpan = demoTraceSpans.find((s) => s.kind === "RETRY");
  const approvalSpan = demoTraceSpans.find((s) => s.kind === "APPROVAL");
  const denial = demoFriction.find((f) => f.category === "permission-denial");
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">Interventions &amp; policy decisions</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Every human touch and policy gate on this trace.{" "}
          <ProvenanceBadge provenance="demo" className="align-middle" />
        </p>
      </div>
      <div className="rounded-xl border border-line bg-surface-1">
        {retrySpan && (
          <div className="flex items-start gap-3 border-b border-line px-4 py-3">
            <StatusBadge tone="warning" className="mt-0.5 shrink-0">
              Intervention
            </StatusBadge>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">Human hint on retry — {retrySpan.label}</div>
              <div className="mt-0.5 text-[12px] text-ink-muted">{retrySpan.detail}</div>
            </div>
          </div>
        )}
        {approvalSpan && (
          <div className="flex items-start gap-3 border-b border-line px-4 py-3">
            <StatusBadge tone="neutral" className="mt-0.5 shrink-0">
              Policy
            </StatusBadge>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">RED approval — {approvalSpan.label}</div>
              <div className="mt-0.5 text-[12px] text-ink-muted">{approvalSpan.detail}</div>
            </div>
          </div>
        )}
        {denial && (
          <div className="flex items-start gap-3 px-4 py-3">
            <StatusBadge tone="neutral" className="mt-0.5 shrink-0">
              Policy
            </StatusBadge>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{denial.representativeTrace.label}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-ink-muted">{denial.recommendation}</span>
                <EvidenceLink
                  evidence={{ label: "audit record", view: denial.representativeTrace.view }}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function TraceInspectorView({ onNavigate }: TraceInspectorViewProps): JSX.Element {
  const [cbomOpen, setCbomOpen] = useState(false);
  const recentRuns = useQuery(api.runs.listRecent, { limit: 5 });
  const completedRun = recentRuns?.find((run) => run.status === "COMPLETED");
  const contextSnapshot = (completedRun?.metadata as { contextSnapshot?: Record<string, unknown> } | undefined)
    ?.contextSnapshot;

  const executor = demoCapabilities.find((c) => c.agentName === ATLAS.agents.executor);

  const metadataEntries: MetadataEntry[] = [
    {
      label: "Work order",
      value: (
        <span className="flex items-start gap-2">
          <span className="min-w-0">{ATLAS.workOrders.applePay}</span>
          <ProvenanceBadge provenance="demo" variant="dot" className="mt-0.5 shrink-0" />
        </span>
      ),
    },
    {
      label: "Repository",
      value: (
        <span className="flex items-center gap-2">
          <span className="font-mono text-[12.5px]">{ATLAS.repo}</span>
          <ProvenanceBadge provenance="demo" variant="dot" />
        </span>
      ),
    },
    {
      label: "Agent",
      value: (
        <span className="flex items-center gap-2">
          <span className="font-mono text-[12.5px]">
            {ATLAS.agents.executor}
            {executor ? ` · v${executor.version}` : ""}
          </span>
          <ProvenanceBadge provenance="demo" variant="dot" />
        </span>
      ),
    },
    {
      // Live Convex read — the one authoritative datum on this rail, so no badge.
      label: "Model",
      value: completedRun ? (
        <span className="font-mono text-[12.5px]">
          {completedRun.model} · {formatUsd(completedRun.costUsd)}
        </span>
      ) : (
        <ProvenanceBadge provenance="insufficient" />
      ),
    },
    {
      label: "Context snapshot",
      value: (
        <span className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCbomOpen((open) => !open)}
            className="self-start rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            {cbomOpen ? "Hide CBOM" : "View CBOM"}
          </button>
          {cbomOpen &&
            (contextSnapshot ? (
              <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
                {JSON.stringify(contextSnapshot, null, 2)}
              </pre>
            ) : (
              <ProvenanceBadge provenance="preview" className="self-start" />
            ))}
        </span>
      ),
    },
    {
      label: "Cost rollup",
      value: (
        <span className="flex items-center gap-2">
          <span className="font-mono text-[12.5px]">$3.41</span>
          <ProvenanceBadge provenance="projected" />
        </span>
      ),
    },
    {
      label: "Pull request",
      value: (
        <a
          href={ATLAS.pr.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] text-ok hover:opacity-80"
        >
          #{ATLAS.pr.number}
          <ExternalLink size={13} strokeWidth={1.7} aria-hidden />
        </a>
      ),
    },
    {
      label: "Status",
      value: (
        <span className="flex flex-col gap-1.5">
          <StatusBadge tone="warning" className="self-start">
            AWAITING_VERIFICATION
          </StatusBadge>
          <span className="text-[12.5px] leading-relaxed text-ink-secondary">
            One acceptance criterion (sandbox-only PCI scan) is pending a human waiver decision. Verification
            precedes completion structurally — the work order cannot reach DONE until every criterion passes or
            is explicitly waived.
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageHeader
          title="Trace Inspector"
          description="Intent to outcome — every step recorded at write time."
        />
        <PageProvenanceNote />
        <LineageRail onNavigate={onNavigate} />
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
            <ExecutionTree onNavigate={onNavigate} />
            <InterventionsStrip onNavigate={onNavigate} />
          </div>
          <MetadataPanel entries={metadataEntries} className="w-full xl:col-span-4" />
        </div>
      </div>
    </div>
  );
}
