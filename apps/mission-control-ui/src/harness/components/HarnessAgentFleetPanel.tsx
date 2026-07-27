import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cloud,
  GitBranch,
  Laptop,
  Play,
  Video,
} from "lucide-react";
import { useState } from "react";

type FleetStatus = "RUNNING" | "NEEDS_REVIEW" | "COMPLETED" | "STUCK" | "FAILED" | "QUEUED";

export interface FleetAgent {
  id: string;
  label: string;
  repo: string;
  environment: "cloud-vm" | "local-worker" | "worktree";
  status: FleetStatus;
  progressPct: number;
  elapsedMin: number;
  filesTouched: number;
  model: string;
  hasRecording: boolean;
  nestedCount: number;
  blocker?: string;
}

const ENV_ICON = {
  "cloud-vm": Cloud,
  "local-worker": Laptop,
  worktree: GitBranch,
} as const;

const STATUS_STYLE: Record<FleetStatus, string> = {
  RUNNING: "border-registry-accent/30 bg-registry-accent-soft text-registry-accent",
  NEEDS_REVIEW: "border-warn/30 bg-warn/10 text-warn",
  COMPLETED: "border-ok/30 bg-ok/10 text-registry-accent",
  STUCK: "border-err/40 bg-err/10 text-err",
  FAILED: "border-err/40 bg-err/10 text-err",
  QUEUED: "border-line bg-surface-2 text-ink-muted",
};

function AgentRow({ agent }: { agent: FleetAgent }): JSX.Element {
  const [open, setOpen] = useState(false);
  const EnvIcon = ENV_ICON[agent.environment];
  const hasNested = agent.nestedCount > 0;

  return (
    <div className="rounded-xl border border-line bg-surface-1">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => hasNested && setOpen((v) => !v)}
      >
        {hasNested ? (
          open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
          )
        ) : (
          <span className="w-4" />
        )}
        <EnvIcon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium capitalize text-ink">{agent.label}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase", STATUS_STYLE[agent.status])}>
              {agent.status.replace("_", " ")}
            </span>
            {agent.hasRecording ? (
              <span className="registry-contains-pill text-[10px]">
                <Video className="h-3 w-3" aria-hidden />
                Recording
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-muted">
            <span>{agent.repo}</span>
            <span>{agent.model}</span>
            <span>{agent.elapsedMin}m elapsed</span>
            <span>{agent.filesTouched} files</span>
            {hasNested ? <span>{agent.nestedCount} nested agents</span> : null}
          </div>
        </div>
        <div className="hidden w-24 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn(
                "h-full rounded-full",
                agent.status === "STUCK" ? "bg-err" : "bg-registry-accent"
              )}
              style={{ width: `${agent.progressPct}%` }}
            />
          </div>
        </div>
      </button>
      {agent.blocker ? (
        <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[12px] text-err">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {agent.blocker}
        </div>
      ) : null}
      {open && hasNested ? (
        <div className="border-t border-line bg-surface-2/50 px-4 py-2 pl-12">
          {Array.from({ length: Math.min(agent.nestedCount, 4) }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 text-[12px] text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-registry-accent" />
              Sub-agent {i + 1} — {i % 2 === 0 ? "Running tests" : "Reading package.json"}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HarnessAgentFleetPanel({
  agents,
  summary,
}: {
  agents: FleetAgent[];
  summary: {
    running: number;
    needsReview: number;
    stuck: number;
    queued: number;
    parallelCapacity: number;
    isolatedVms: number;
  };
}): JSX.Element {
  const reviewQueue = agents.filter((a) => a.status === "NEEDS_REVIEW");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Running async", value: summary.running, hint: `Capacity ~${summary.parallelCapacity}` },
          { label: "Needs your review", value: summary.needsReview, hint: "Review artifacts not code" },
          { label: "Stuck / looping", value: summary.stuck, hint: "Loop detection" },
          { label: "Isolated VMs", value: summary.isolatedVms, hint: "One agent per environment" },
        ].map((m) => (
          <div key={m.label} className="registry-top-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">{m.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-ink">{m.value}</div>
            <div className="mt-0.5 text-[11px] text-ink-secondary">{m.hint}</div>
          </div>
        ))}
      </div>

      {reviewQueue.length > 0 ? (
        <section className="registry-top-card border-warn/25 p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Play className="h-4 w-4 text-warn" aria-hidden />
            Human review queue
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-secondary">
            Manager mode — trust recordings & verifiers before opening diffs (Eric: 5–10 cloud agents in parallel).
          </p>
          <ul className="mt-3 space-y-2">
            {reviewQueue.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">
                <span className="capitalize text-ink">{a.label}</span>
                <button type="button" className="harness-btn harness-btn-primary text-[11px]">
                  Review artifact
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-ink">Active fleet</h3>
        {agents.length === 0 ? (
          <p className="text-sm text-ink-muted">No agents running — spawn from Launch or Linear.</p>
        ) : (
          agents.map((a) => <AgentRow key={a.id} agent={a} />)
        )}
      </section>
    </div>
  );
}
