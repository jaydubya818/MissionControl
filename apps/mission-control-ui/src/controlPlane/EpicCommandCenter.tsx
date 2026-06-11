import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDashed,
  GitBranch,
  GitMerge,
  GitPullRequest,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import {
  type BranchNode,
  type ControlPlaneMode,
  type DecisionEntry,
  type DecisionType,
  type Epic,
  type FleetAgent,
  type GateStatus,
  type Story,
} from "./types";
import { AutonomyBadge, DemoDataBadge, HealthBadge, RiskBadge, StatCard, StateBadge } from "./shared";

interface EpicCommandCenterProps {
  epic: Epic;
  fleet: FleetAgent[];
  mode: ControlPlaneMode;
  modeToggle?: ReactNode;
  onBack: () => void;
}

const STORY_STATUS_LABEL: Record<Story["status"], string> = {
  BACKLOG: "Backlog",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  NEEDS_APPROVAL: "Needs approval",
  BLOCKED: "Blocked",
  DONE: "Done",
};

const STORY_STATUS_CLASS: Record<Story["status"], string> = {
  BACKLOG: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  IN_PROGRESS: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  IN_REVIEW: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  NEEDS_APPROVAL: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
  DONE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const DECISION_FILTERS: { id: DecisionType | "ALL" | "HUMAN" | "AGENT"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ARCHITECTURE", label: "Architecture" },
  { id: "PRODUCT", label: "Product" },
  { id: "TEST", label: "Test" },
  { id: "SECURITY", label: "Security" },
  { id: "HUMAN", label: "Human-approved" },
  { id: "AGENT", label: "Agent-only" },
];

function GateIcon({ status }: { status: GateStatus }) {
  if (status === "PASS") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === "FAIL") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  if (status === "PENDING") return <CircleDashed className="h-3.5 w-3.5 text-amber-300" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

function BranchRow({ node, depth }: { node: BranchNode; depth: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2 last:border-b-0">
      <div style={{ width: depth * 18 }} className="shrink-0" />
      {node.kind === "MERGE_TARGET" ? (
        <GitMerge className="h-3.5 w-3.5 shrink-0 text-violet-300" />
      ) : node.kind === "PR" ? (
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
      ) : (
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/85" title={node.name}>
        {node.name}
      </span>
      <span className="hidden w-24 shrink-0 font-mono text-[11px] text-muted-foreground sm:block">
        {node.kind === "MERGE_TARGET" ? "" : `${node.commitCount} commits`}
      </span>
      <span className="hidden w-24 shrink-0 font-mono text-[11px] text-muted-foreground md:block">
        {node.kind === "MERGE_TARGET" ? "" : `${node.driftFromMain} behind`}
      </span>
      <Badge
        variant="outline"
        className={cn(
          "w-16 justify-center text-[9px]",
          node.testStatus === "PASS" && "border-emerald-500/30 text-emerald-300",
          node.testStatus === "FAIL" && "border-red-500/30 text-red-300",
          node.testStatus === "RUNNING" && "border-cyan-500/30 text-cyan-300",
          node.testStatus === "NONE" && "border-border/40 text-muted-foreground/60"
        )}
      >
        {node.testStatus === "NONE" ? "no tests" : node.testStatus.toLowerCase()}
      </Badge>
      <Badge
        variant="outline"
        className={cn(
          "hidden w-20 justify-center text-[9px] sm:flex",
          node.reviewStatus === "APPROVED" && "border-emerald-500/30 text-emerald-300",
          node.reviewStatus === "CHANGES_REQUESTED" && "border-red-500/30 text-red-300",
          node.reviewStatus === "PENDING" && "border-amber-500/30 text-amber-300",
          node.reviewStatus === "NONE" && "border-border/40 text-muted-foreground/60"
        )}
      >
        {node.reviewStatus === "NONE" ? "no review" : node.reviewStatus.replace("_", " ").toLowerCase()}
      </Badge>
      {node.conflict && (
        <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
          conflict
        </Badge>
      )}
    </div>
  );
}

export function EpicCommandCenter({ epic, fleet, mode, modeToggle, onBack }: EpicCommandCenterProps) {
  const [decisionFilter, setDecisionFilter] = useState<(typeof DECISION_FILTERS)[number]["id"]>("ALL");

  const epicAgents = useMemo(
    () => fleet.filter((a) => epic.agentIds.includes(a.id)),
    [fleet, epic.agentIds]
  );

  const decisions = useMemo(() => {
    const sorted = [...epic.decisions].sort((a, b) => b.timestamp - a.timestamp);
    if (decisionFilter === "ALL") return sorted;
    if (decisionFilter === "HUMAN") return sorted.filter((d) => d.decidedBy === "HUMAN");
    if (decisionFilter === "AGENT") return sorted.filter((d) => d.decidedBy === "AGENT");
    return sorted.filter((d) => d.type === decisionFilter);
  }, [epic.decisions, decisionFilter]);

  const branchTree = useMemo(() => {
    const roots = epic.branches.filter((b) => b.parent === null);
    const result: { node: BranchNode; depth: number }[] = [];
    function walk(node: BranchNode, depth: number) {
      result.push({ node, depth });
      for (const child of epic.branches.filter((b) => b.parent === node.name)) {
        walk(child, depth + 1);
      }
    }
    for (const root of roots) walk(root, 0);
    return result;
  }, [epic.branches]);

  const gateRollup = useMemo(() => {
    const all = epic.stories.flatMap((s) => s.gates);
    return {
      pass: all.filter((g) => g.status === "PASS").length,
      fail: all.filter((g) => g.status === "FAIL").length,
      pending: all.filter((g) => g.status === "PENDING").length,
      total: all.length,
    };
  }, [epic.stories]);

  const readinessBlockers = useMemo(() => {
    const blockers: string[] = [...epic.blockers];
    for (const s of epic.stories) {
      for (const g of s.gates) {
        if (g.status === "FAIL") blockers.push(`${s.key}: ${g.label} failing${g.detail ? ` — ${g.detail}` : ""}`);
      }
      if (s.status === "NEEDS_APPROVAL") blockers.push(`${s.key}: waiting on human approval`);
    }
    return blockers.slice(0, 8);
  }, [epic]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow={`Epic command center · ${epic.key}`}
        title={epic.title}
        description={epic.summary}
        status={
          <div className="flex items-center gap-2">
            <HealthBadge health={epic.health} />
            <DemoDataBadge />
          </div>
        }
        actions={
          <>
            {modeToggle}
            <AutonomyBadge level={epic.autonomy} className="text-[11px]" />
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Portfolio
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Progress" value={`${epic.progress}%`} hint={`ETA ${epic.etaDays}d`} />
          <StatCard
            label="Risk score"
            value={epic.riskScore}
            tone={epic.riskScore >= 70 ? "bad" : epic.riskScore >= 45 ? "warn" : "good"}
          />
          <StatCard
            label="Confidence"
            value={`${epic.confidence}%`}
            tone={epic.confidence >= 70 ? "good" : epic.confidence >= 50 ? "warn" : "bad"}
          />
          <StatCard label="PRs" value={`${epic.prsOpen} open`} hint={`${epic.prsMerged} merged`} />
          <StatCard
            label="Gates"
            value={`${gateRollup.pass}/${gateRollup.total}`}
            hint={gateRollup.fail > 0 ? `${gateRollup.fail} failing` : "all green or pending"}
            tone={gateRollup.fail > 0 ? "bad" : "good"}
          />
          <StatCard
            label="Approvals pending"
            value={epic.approvalsPending}
            tone={epic.approvalsPending > 0 ? "warn" : "good"}
          />
        </div>

        {readinessBlockers.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Blocking readiness
            </div>
            <ul className="grid gap-1 md:grid-cols-2">
              {readinessBlockers.map((b, i) => (
                <li key={i} className="truncate text-xs text-foreground/85" title={b}>• {b}</li>
              ))}
            </ul>
          </div>
        )}

        <Tabs defaultValue="stories" className="mt-5">
          <TabsList>
            <TabsTrigger value="stories">Stories & gates</TabsTrigger>
            <TabsTrigger value="agents">Agents ({epicAgents.length})</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="decisions">Decisions ({epic.decisions.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="stories" className="mt-3">
            <div className="space-y-2 pb-2">
              {epic.stories.map((story) => {
                const agent = story.agentId ? fleet.find((a) => a.id === story.agentId) : null;
                return (
                  <div key={story.id} className="rounded-xl border border-[var(--panel-line)] bg-card/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-cyan-200">{story.key}</span>
                      <span className="text-sm font-medium text-foreground">{story.title}</span>
                      <Badge variant="outline" className={cn("text-[10px]", STORY_STATUS_CLASS[story.status])}>
                        {STORY_STATUS_LABEL[story.status]}
                      </Badge>
                      <RiskBadge risk={story.riskLevel} />
                      {story.prNumber && (
                        <Badge variant="outline" className="border-border/50 font-mono text-[10px] text-muted-foreground">
                          <GitPullRequest className="mr-1 h-3 w-3" /> #{story.prNumber}
                          {story.prStatus ? ` · ${story.prStatus.toLowerCase()}` : ""}
                        </Badge>
                      )}
                      {agent && (
                        <span className="text-[11px] text-muted-foreground">
                          agent <span className="text-foreground/80">{agent.name}</span>
                        </span>
                      )}
                      {mode === "DEV" && story.branch && (
                        <span className="font-mono text-[10px] text-muted-foreground/70">{story.branch}</span>
                      )}
                    </div>
                    {story.blockedReason && (
                      <div className="mt-1.5 text-[11px] text-red-300/90">⛔ {story.blockedReason}</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {story.gates.map((gate) => (
                        <span
                          key={gate.id}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                          title={gate.detail ?? gate.label}
                        >
                          <GateIcon status={gate.status} /> {gate.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="agents" className="mt-3">
            <div className="grid gap-3 pb-2 md:grid-cols-2 xl:grid-cols-3">
              {epicAgents.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  No agents currently assigned to this epic.
                </div>
              )}
              {epicAgents.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-[var(--panel-line)] bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{agent.name}</span>
                      <Badge variant="outline" className="border-border/50 font-mono text-[9px] text-muted-foreground">
                        {agent.runtime}
                      </Badge>
                    </div>
                    <StateBadge state={agent.state} />
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    <div className="truncate" title={agent.lastAction}>last: {agent.lastAction}</div>
                    {agent.nextAction && <div className="truncate" title={agent.nextAction}>next: {agent.nextAction}</div>}
                    {agent.branch && <div className="truncate font-mono text-[10px]">{agent.branch}</div>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <AutonomyBadge level={agent.autonomy} />
                    <RiskBadge risk={agent.riskLevel} />
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                      conf {agent.confidence}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="branches" className="mt-3">
            <div className="overflow-hidden rounded-xl border border-[var(--panel-line)] bg-card/40">
              {branchTree.map(({ node, depth }) => (
                <BranchRow key={node.name} node={node} depth={depth} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              Branch controls (rebase, compare, run tests, promote to PR, abandon) activate once the runtime adapter is wired.
            </p>
          </TabsContent>

          <TabsContent value="decisions" className="mt-3">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {DECISION_FILTERS.map((f) => (
                <Button
                  key={f.id}
                  variant={decisionFilter === f.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-[11px]"
                  onClick={() => setDecisionFilter(f.id)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2 pb-2">
              {decisions.map((d: DecisionEntry) => (
                <div key={d.id} className="rounded-xl border border-[var(--panel-line)] bg-card/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{d.title}</span>
                    <Badge variant="outline" className="border-border/50 text-[10px] text-muted-foreground">{d.type}</Badge>
                    <RiskBadge risk={d.riskLevel} />
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        d.decidedBy === "HUMAN"
                          ? "border-cyan-500/30 text-cyan-300"
                          : "border-border/50 text-muted-foreground"
                      )}
                    >
                      {d.decidedBy === "HUMAN" ? `human · @${d.approver}` : "agent"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">{d.outcome}</Badge>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                      {new Date(d.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{d.reasoning}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {d.filesImpacted.map((f) => (
                      <span key={f} className="font-mono text-[10px] text-muted-foreground/70">{f}</span>
                    ))}
                  </div>
                </div>
              ))}
              {decisions.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
                  No decisions match this filter.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-3">
            <div className="relative space-y-0 pb-2 pl-5">
              <div className="absolute bottom-2 left-[7px] top-1 w-px bg-border/50" />
              {[...epic.timeline].reverse().map((event, i) => (
                <div key={i} className="relative py-2">
                  <div
                    className={cn(
                      "absolute -left-[18px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background",
                      event.kind === "BLOCKER"
                        ? "bg-red-400"
                        : event.kind === "DECISION"
                          ? "bg-violet-400"
                          : event.kind === "PR"
                            ? "bg-cyan-400"
                            : "bg-emerald-400"
                    )}
                  />
                  <div className="text-xs text-foreground/90">{event.label}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                    {new Date(event.ts).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
