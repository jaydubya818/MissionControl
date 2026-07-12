/**
 * Agent catalog (Phase 10) — capability-evidenced digital workforce.
 *
 * Two layers, honestly separated: the real fleet (Convex, authoritative,
 * no provenance badge) and demo capability profiles (labeled "Demo data"
 * at section and card level). Capability claims are contextual — never
 * cross-agent rankings.
 */

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "../../components/factory/DetailLayout";
import { DataTable, type Column } from "../../components/factory/DataTable";
import { ScoreBadge, StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { EosSection, ProvenanceBadge } from "../components";
import { demoCapabilities } from "../demoData";
import type { AgentCapabilityProfile } from "../types";
import { cn } from "../../lib/utils";

export interface AgentCatalogViewProps {
  onNavigate: (view: string) => void;
}

interface FleetAgentRow {
  _id: string;
  name: string;
  role: string;
  status: string;
  spendToday: number;
  budgetDaily: number;
  currentTaskId?: string;
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-ok",
  PAUSED: "bg-warn",
  DRAINED: "bg-ink-muted",
  QUARANTINED: "bg-err",
  OFFLINE: "bg-ink-muted",
};

const STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DRAINED: "neutral",
  QUARANTINED: "error",
  OFFLINE: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  DRAINED: "Drained",
  QUARANTINED: "Quarantined",
  OFFLINE: "Offline",
};

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function CapabilityCard({ profile }: { profile: AgentCapabilityProfile }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-ink">{profile.agentName}</span>
            <StatusBadge tone="neutral">
              <span className="font-mono">v{profile.version}</span>
            </StatusBadge>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-secondary">{profile.role}</div>
        </div>
        <ProvenanceBadge provenance={profile.provenance} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {profile.skills.map((skill) => (
          <StatusBadge key={skill} tone="neutral">
            {skill}
          </StatusBadge>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Task type</span>
        <span className="text-right text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Verified</span>
        <span className="text-right text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Cost p50</span>
        <span className="text-right text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">n</span>
        {profile.taskSpecializations.map((spec) => (
          <div key={spec.taskType} className="contents">
            <span className="text-[13px] text-ink">{spec.taskType}</span>
            <span className="justify-self-end">
              {spec.verifiedCompletionPct !== null ? (
                <ScoreBadge score={spec.verifiedCompletionPct} />
              ) : (
                <ProvenanceBadge provenance="insufficient" />
              )}
            </span>
            <span className="text-right font-mono text-[12.5px] text-ink-secondary">
              {spec.costP50Usd !== null ? usd(spec.costP50Usd) : "—"}
            </span>
            <span className="text-right font-mono text-[12.5px] text-ink-muted">n={spec.sampleSize}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        {profile.trustComponents.map((component) => {
          const alarming = component.value.includes("QUARANTINED");
          return (
            <div key={component.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-ink-muted">{component.label}</span>
              <span className={cn("text-right", alarming ? "text-err" : "text-ink-secondary")}>
                {component.value}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-[12.5px] text-ink-secondary">
        <span className="text-ink-muted">Current assignment: </span>
        {profile.currentAssignment ?? "Unassigned"}
      </div>

      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-[11.5px] text-ink-muted">
        {profile.policyLimits.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </div>
  );
}

export function AgentCatalogView({ onNavigate }: AgentCatalogViewProps): JSX.Element {
  void onNavigate;
  const agents = useQuery(api.agents.listAll, {});
  const tasks = useQuery(api.tasks.listAll, {});

  const taskTitleById = new Map<string, string>();
  for (const task of tasks ?? []) {
    taskTitleById.set(task._id, task.title);
  }

  const fleetColumns: Column<FleetAgentRow>[] = [
    {
      id: "name",
      header: "Agent",
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status] ?? "bg-ink-muted")}
            aria-hidden
          />
          <span className="font-medium text-ink">{row.name}</span>
        </span>
      ),
    },
    { id: "role", header: "Role", cell: (row) => row.role },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status] ?? "neutral"}>
          {STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
    {
      id: "spend",
      header: "Spend today",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-[12.5px]">
          {usd(row.spendToday)} / {usd(row.budgetDaily)}
        </span>
      ),
    },
    {
      id: "task",
      header: "Current task",
      cell: (row) =>
        row.currentTaskId ? (
          <span className="text-ink">{taskTitleById.get(row.currentTaskId) ?? "—"}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
  ];

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <PageHeader title="Agents" description="Capability-evidenced digital workforce." />

        <EosSection eyebrow="FLEET" title="Fleet">
          <DataTable<FleetAgentRow>
            columns={fleetColumns}
            rows={agents ?? []}
            rowKey={(row) => row._id}
            loading={agents === undefined}
            emptyState="No agents registered"
          />
        </EosSection>

        <EosSection
          eyebrow="CAPABILITY"
          title="Capability profiles"
          action={<ProvenanceBadge provenance="demo" />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {demoCapabilities.map((profile) => (
              <CapabilityCard key={profile.agentName} profile={profile} />
            ))}
          </div>
        </EosSection>

        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-secondary">
          Performance is contextual — by task type, repository, version, and sample size. No
          cross-agent rankings.
        </div>
      </div>
    </div>
  );
}
