import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../../convex/_generated/api";
import { DetailLayout, MetadataPanel, type DetailTab } from "../../components/factory/DetailLayout";
import { DataTable, type Column } from "../../components/factory/DataTable";
import { MetricBlock, MetricRow } from "../../components/factory/MetricBlock";
import { RiskBadge, StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { cn } from "../../lib/utils";
import { EosSection, EvidenceLink, InsightCard, ProvenanceBadge } from "../components";
import { ATLAS, demoInsights, demoLineage, demoMission } from "../demoData";
import type { EvidenceReference } from "../types";

export interface MissionDetailViewProps {
  onNavigate: (view: string) => void;
}

type WorkOrderRow = FunctionReturnType<typeof api.workOrders.list>[number];
type ActivityRow = FunctionReturnType<typeof api.activities.list>[number];

type TabId = "overview" | "work-orders" | "evidence" | "activity";

const TABS: DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "work-orders", label: "Work Orders" },
  { id: "evidence", label: "Evidence" },
  { id: "activity", label: "Activity" },
];

function workOrderStateTone(state: string): StatusBadgeProps["tone"] {
  if (state === "DONE") return "success";
  if (state === "BLOCKED" || state.startsWith("AWAITING_")) return "warning";
  if (state === "IN_PROGRESS" || state === "DISPATCHED") return "info";
  return "neutral";
}

const VERIFICATION_TEXT: Record<string, string> = {
  PASS: "text-ok",
  FAIL: "text-err",
  WAIVED: "text-warn",
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Date.now() - timestamp) / 1000;
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface TimelineBeat {
  id: string;
  label: string;
  detail?: string;
  when: string;
  tone: "ok" | "warn" | "neutral";
  link?: EvidenceReference;
}

/** Phase-12 story beats condensed to the delivery milestones that matter. */
const TIMELINE: TimelineBeat[] = [
  { id: "created", label: "Mission created with PCI compliance constraints", when: "5d ago", tone: "neutral" },
  { id: "planned", label: "Planning decomposed the mission into 3 work orders", detail: `${ATLAS.agents.supervisor} → Apple Pay · PCI evidence pack · fraud screening`, when: "5d ago", tone: "ok" },
  { id: "implemented", label: "Apple Pay live-config change implemented", when: "3d ago", tone: "ok", link: { label: "view trace", view: "trace-inspector" } },
  { id: "approval", label: "Security policy approval — RED, dual control 2/2", when: "2d ago", tone: "ok", link: { label: "audit record", view: "audit" } },
  { id: "env-failure", label: "Environment setup failed; human-assisted retry recovered the run", detail: "undocumented pnpm config — recurring friction in this repo", when: "2d ago", tone: "warn", link: { label: "readiness assessment", view: "readiness" } },
  { id: "pr", label: `PR #${ATLAS.pr.number} opened — checks passing`, when: "1d ago", tone: "ok", link: { label: "view trace", view: "trace-inspector" } },
  { id: "verification", label: "Verification: 3 of 4 criteria PASSED, 1 awaiting waiver", detail: "sandbox-only PCI scan pending human waiver decision", when: "8h ago", tone: "warn", link: { label: "criteria", count: 4, view: "trace-inspector" } },
  { id: "bootstrap", label: "Bootstrap skill improvement proposed from recurring setup friction", when: "2h ago", tone: "neutral", link: { label: "recommendation", view: "readiness" } },
];

const TIMELINE_DOT: Record<TimelineBeat["tone"], string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  neutral: "bg-ink-muted",
};

function DeliveryTimeline({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface-1">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="text-[15px] font-semibold text-ink">Delivery timeline</div>
        <ProvenanceBadge provenance="demo" />
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {TIMELINE.map((beat) => (
          <li key={beat.id} className="flex items-start gap-3 px-4 py-3">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TIMELINE_DOT[beat.tone])} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink">{beat.label}</div>
              {beat.detail && <div className="mt-0.5 text-[12px] text-ink-muted">{beat.detail}</div>}
              {beat.link && (
                <div className="mt-1">
                  <EvidenceLink evidence={beat.link} onNavigate={onNavigate} />
                </div>
              )}
            </div>
            <span className="shrink-0 font-mono text-[11px] text-ink-muted">{beat.when}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function WorkOrdersTab({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  const workOrders = useQuery(api.workOrders.list, { limit: 50 });
  const missionTitles = new Set<string>(demoMission.workOrderTitles);
  const matched = (workOrders ?? []).filter((row) => missionTitles.has(row.title));
  const rows = matched.length > 0 ? matched : workOrders ?? [];

  const columns: Column<WorkOrderRow>[] = [
    {
      id: "title",
      header: "Work order",
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{row.title}</div>
          <div className="truncate text-[12px] text-ink-muted">{row.desiredOutcome}</div>
        </div>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: (row) => (
        <StatusBadge tone={workOrderStateTone(row.state)}>{row.state.replace(/_/g, " ")}</StatusBadge>
      ),
    },
    {
      id: "risk",
      header: "Risk",
      cell: (row) => <RiskBadge level={row.riskLevel} />,
    },
    {
      id: "verification",
      header: "Verification",
      cell: (row) => (
        <span className={cn("font-mono text-[12px]", VERIFICATION_TEXT[row.verificationStatus] ?? "text-ink-muted")}>
          {row.verificationStatus}
        </span>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      align: "right",
      cell: (row) => <span className="font-mono text-[12px] text-ink-secondary">P{row.priority}</span>,
    },
  ];

  return (
    <DataTable<WorkOrderRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row._id}
      loading={workOrders === undefined}
      onRowClick={() => onNavigate("trace-inspector")}
      emptyState="No work orders yet — dispatch one from the Work Orders board."
    />
  );
}

const EVIDENCE_KINDS = new Set(["VERIFICATION", "APPROVAL", "COST"]);

function EvidenceTab({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  const nodes = demoLineage.filter((node) => EVIDENCE_KINDS.has(node.kind));
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface-1 p-4 text-[12.5px] leading-relaxed text-ink-secondary">
        Verification receipts attach to missions automatically once Lineage v1 ships. Until then,
        the rows below are seeded projections of the receipt chain — each is labeled with its
        provenance and drills into the real record where one exists.
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <ul className="flex flex-col divide-y divide-line">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 w-[92px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
                {node.kind}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink">{node.label}</div>
                {(node.status || node.detail) && (
                  <div className="mt-0.5 text-[12px] text-ink-muted">
                    {[node.status, node.detail].filter(Boolean).join(" · ")}
                  </div>
                )}
                {node.drillView && (
                  <div className="mt-1">
                    <EvidenceLink
                      evidence={{ label: "open evidence", view: node.drillView }}
                      onNavigate={onNavigate}
                    />
                  </div>
                )}
              </div>
              <ProvenanceBadge provenance={node.provenance} className="shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActivityTab(): JSX.Element {
  const activities: ActivityRow[] | undefined = useQuery(api.activities.list, { limit: 10 });

  if (activities === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 px-4 py-10 text-center text-[13px] text-ink-muted">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <ul className="flex flex-col divide-y divide-line">
        {activities.map((activity) => (
          <li key={activity._id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink">{activity.description}</div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-muted">
                {activity.action} · {activity.actorType.toLowerCase()}
                {activity.actorId ? ` · ${activity.actorId}` : ""}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-ink-muted">
              {timeAgo(activity._creationTime)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MissionDetailView({ onNavigate }: MissionDetailViewProps): JSX.Element {
  const [tab, setTab] = useState<TabId>("overview");

  const aside =
    tab === "overview" ? (
      <MetadataPanel
        entries={[
          { label: "Owner", value: demoMission.owner },
          { label: "Priority", value: <span className="font-mono">{demoMission.priority}</span> },
          {
            label: "State",
            value: <StatusBadge tone="info">{demoMission.state}</StatusBadge>,
          },
          { label: "Next milestone", value: demoMission.nextMilestone },
          {
            label: "Delivery risk",
            value: <span className="text-[12.5px] text-warn">{demoMission.deliveryRisk}</span>,
          },
          { label: "Repository", value: <span className="font-mono text-[12.5px]">{ATLAS.repo}</span> },
          { label: "Data", value: <ProvenanceBadge provenance={demoMission.provenance} /> },
        ]}
      />
    ) : undefined;

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <DetailLayout
        breadcrumbs={[
          { label: "Strategy" },
          { label: "Missions", onClick: () => onNavigate("missions") },
          { label: demoMission.name, current: true },
        ]}
        title={demoMission.name}
        description={demoMission.objective}
        actions={
          <button
            type="button"
            onClick={() => onNavigate("dossier")}
            className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            Open dossier
          </button>
        }
        metrics={
          <MetricRow className="xl:grid-cols-5">
            <MetricBlock
              label="Health"
              value={
                <span className="flex items-center gap-2 text-warn">
                  <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />
                  Watch
                </span>
              }
            />
            <MetricBlock label="Progress" value={`${demoMission.progressPct}%`} />
            <MetricBlock
              label="Cost"
              value={<span className="font-mono">{formatUsd(demoMission.actualCostUsd)}</span>}
              detail={`of ${formatUsd(demoMission.plannedBudgetUsd)} planned`}
            />
            <MetricBlock
              label="Confidence"
              value={demoMission.confidence.charAt(0).toUpperCase() + demoMission.confidence.slice(1)}
            />
            <MetricBlock label="Active work orders" value={demoMission.workOrderTitles.length} />
          </MetricRow>
        }
        tabs={TABS}
        activeTabId={tab}
        onTabChange={(id) => setTab(id as TabId)}
        aside={aside}
      >
        <div className="flex flex-col gap-6">
          {tab === "overview" && <DeliveryTimeline onNavigate={onNavigate} />}
          {tab === "work-orders" && <WorkOrdersTab onNavigate={onNavigate} />}
          {tab === "evidence" && <EvidenceTab onNavigate={onNavigate} />}
          {tab === "activity" && <ActivityTab />}

          <EosSection eyebrow="Intelligence" title="Recommendations">
            <InsightCard insight={demoInsights[0]} onNavigate={onNavigate} />
          </EosSection>
        </div>
      </DetailLayout>
    </div>
  );
}
