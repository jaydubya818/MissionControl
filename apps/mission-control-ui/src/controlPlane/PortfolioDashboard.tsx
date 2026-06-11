import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, GitPullRequest, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import {
  EPIC_HEALTH_LABELS,
  HEALTH_BADGE_CLASS,
  type Epic,
  type EpicHealth,
  type FleetAgent,
  type ApprovalRequest,
  type ControlPlaneMode,
} from "./types";
import { healthCounts, portfolioCounts } from "./demoData";
import { AutonomyBadge, DemoDataBadge, HealthBadge, ProgressBar, StatCard } from "./shared";

interface PortfolioDashboardProps {
  epics: Epic[];
  fleet: FleetAgent[];
  approvals: ApprovalRequest[];
  mode: ControlPlaneMode;
  modeToggle?: ReactNode;
  onSelectEpic: (epicKey: string) => void;
  onOpenFleet: () => void;
  onOpenApprovals: () => void;
}

const HEALTH_ORDER: EpicHealth[] = [
  "BLOCKED",
  "FAILED",
  "WAITING_ON_HUMAN",
  "AT_RISK",
  "READY_TO_MERGE",
  "ON_TRACK",
];

export function PortfolioDashboard({
  epics,
  fleet,
  approvals,
  mode,
  modeToggle,
  onSelectEpic,
  onOpenFleet,
  onOpenApprovals,
}: PortfolioDashboardProps) {
  const [healthFilter, setHealthFilter] = useState<EpicHealth | null>(null);

  const counts = useMemo(() => portfolioCounts(epics), [epics]);
  const health = useMemo(() => healthCounts(epics), [epics]);
  const activeAgents = fleet.filter(
    (a) => a.state !== "IDLE" && a.state !== "COMPLETED" && a.state !== "PAUSED"
  ).length;
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING").length;

  const sorted = useMemo(() => {
    const filtered = healthFilter ? epics.filter((e) => e.health === healthFilter) : epics;
    return [...filtered].sort(
      (a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || b.riskScore - a.riskScore
    );
  }, [epics, healthFilter]);

  const topBlockers = useMemo(
    () =>
      epics
        .filter((e) => e.blockers.length > 0)
        .flatMap((e) => e.blockers.map((b) => ({ epicKey: e.key, blocker: b, health: e.health })))
        .slice(0, 6),
    [epics]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Control plane"
        title="Mission Control"
        description={
          mode === "PM"
            ? "Portfolio health, delivery risk, and where humans are needed — across every epic and agent squad."
            : "Live execution state: branches, PRs, reviews, gates, and agent activity across the portfolio."
        }
        status={<DemoDataBadge />}
        actions={
          <>
            {modeToggle}
            <Button variant="outline" size="sm" onClick={onOpenFleet}>
              <Users className="mr-1.5 h-3.5 w-3.5" /> Fleet ({activeAgents})
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenApprovals}>
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Approvals ({pendingApprovals})
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* Global counts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          <StatCard label="Epics" value={counts.epicsActive} hint={`${epics.length} total`} />
          <StatCard label="Stories" value={counts.stories} hint={`${counts.storiesDone} done`} />
          <StatCard label="Agents" value={activeAgents} hint={`${fleet.length} registered`} onClick={onOpenFleet} />
          <StatCard label="Branches" value={counts.branches} />
          <StatCard label="PRs open" value={counts.prsOpen} hint={`${counts.prsMerged} merged`} />
          <StatCard label="Reviews" value={counts.reviewsPending} tone={counts.reviewsPending > 8 ? "warn" : "default"} />
          <StatCard
            label="Approvals"
            value={pendingApprovals}
            tone={pendingApprovals > 0 ? "warn" : "good"}
            onClick={onOpenApprovals}
          />
          <StatCard label="Blockers" value={counts.blockers} tone={counts.blockers > 0 ? "bad" : "good"} />
          <StatCard
            label="At risk"
            value={health.AT_RISK + health.BLOCKED + health.FAILED}
            tone={health.BLOCKED + health.FAILED > 0 ? "bad" : health.AT_RISK > 0 ? "warn" : "good"}
          />
        </div>

        {/* Health filter chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {HEALTH_ORDER.map((h) => (
            <button
              key={h}
              onClick={() => setHealthFilter(healthFilter === h ? null : h)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                HEALTH_BADGE_CLASS[h],
                healthFilter === h ? "ring-1 ring-cyan-300/60" : "opacity-80 hover:opacity-100"
              )}
            >
              {EPIC_HEALTH_LABELS[h]} · {health[h]}
            </button>
          ))}
          {healthFilter && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setHealthFilter(null)}>
              Clear
            </Button>
          )}
        </div>

        {/* Blocker strip */}
        {topBlockers.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Active blockers
            </div>
            <div className="grid gap-1.5 md:grid-cols-2">
              {topBlockers.map((b, i) => (
                <button
                  key={`${b.epicKey}-${i}`}
                  onClick={() => onSelectEpic(b.epicKey)}
                  className="flex items-center gap-2 truncate rounded-md px-2 py-1 text-left text-xs text-foreground/85 transition-colors hover:bg-red-500/10"
                >
                  <span className="shrink-0 font-mono text-[10px] text-red-300">{b.epicKey}</span>
                  <span className="truncate">{b.blocker}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Epic table */}
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--panel-line)] bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-20">Epic</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">Health</TableHead>
                <TableHead className="w-24">Owner</TableHead>
                <TableHead className="w-44">Progress</TableHead>
                {mode === "PM" ? (
                  <>
                    <TableHead className="w-20">Risk</TableHead>
                    <TableHead className="w-20">Conf.</TableHead>
                    <TableHead className="w-20">ETA</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="w-24">PRs</TableHead>
                    <TableHead className="w-24">Reviews</TableHead>
                    <TableHead className="w-28">Autonomy</TableHead>
                  </>
                )}
                <TableHead className="w-20">Agents</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((epic) => (
                <TableRow
                  key={epic.id}
                  className="cursor-pointer"
                  onClick={() => onSelectEpic(epic.key)}
                >
                  <TableCell className="font-mono text-xs text-cyan-200">{epic.key}</TableCell>
                  <TableCell>
                    <div className="max-w-[340px]">
                      <div className="truncate text-sm font-medium text-foreground">{epic.title}</div>
                      {epic.blockers.length > 0 && (
                        <div className="truncate text-[11px] text-red-300/80">{epic.blockers[0]}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><HealthBadge health={epic.health} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">@{epic.owner}</TableCell>
                  <TableCell><ProgressBar value={epic.progress} /></TableCell>
                  {mode === "PM" ? (
                    <>
                      <TableCell>
                        <span
                          className={cn(
                            "font-mono text-xs",
                            epic.riskScore >= 70 ? "text-red-300" : epic.riskScore >= 45 ? "text-amber-300" : "text-emerald-300"
                          )}
                        >
                          {epic.riskScore}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{epic.confidence}%</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{epic.etaDays}d</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GitPullRequest className="h-3 w-3" /> {epic.prsOpen}/{epic.prsOpen + epic.prsMerged}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{epic.reviewsPending}</TableCell>
                      <TableCell><AutonomyBadge level={epic.autonomy} /></TableCell>
                    </>
                  )}
                  <TableCell>
                    {epic.agentIds.length > 0 ? (
                      <Badge variant="secondary" className="font-mono text-[10px]">{epic.agentIds.length}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Committed vs stretch + risk summary */}
        <div className="mt-4 mb-2 grid gap-3 md:grid-cols-3">
          <StatCard
            label="Committed"
            value={epics.filter((e) => e.committed).length}
            hint="epics committed this PI"
          />
          <StatCard
            label="Stretch"
            value={epics.filter((e) => !e.committed).length}
            hint="stretch goals"
          />
          <StatCard
            label="High risk"
            value={epics.filter((e) => e.riskScore >= 60).length}
            hint="risk score ≥ 60"
            tone={epics.some((e) => e.riskScore >= 60) ? "warn" : "good"}
          />
        </div>
      </div>
    </div>
  );
}