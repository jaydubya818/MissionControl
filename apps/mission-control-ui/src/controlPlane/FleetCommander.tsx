import { useMemo, useState, type ReactNode } from "react";
import { Bot, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AUTONOMY_LABELS,
  AUTONOMY_LEVELS,
  formatDuration,
  formatTokens,
  formatUsd,
  type AgentRunState,
  type AutonomyLevel,
  type FleetAgent,
  type FleetCommand,
} from "./types";
import { AutonomyBadge, DemoDataBadge, RiskBadge, StatCard, StateBadge } from "./shared";

interface FleetCommanderProps {
  fleet: FleetAgent[];
  modeToggle?: ReactNode;
  onSelectEpic: (epicKey: string) => void;
}

const COMMANDS: { id: FleetCommand; label: string; destructive?: boolean }[] = [
  { id: "PAUSE", label: "Pause" },
  { id: "RESUME", label: "Resume" },
  { id: "RETRY", label: "Retry last action" },
  { id: "REASSIGN", label: "Reassign task" },
  { id: "EXPLAIN", label: "Request explanation" },
  { id: "FORCE_REVIEW", label: "Force review" },
  { id: "PROMOTE_TO_PR", label: "Promote to PR" },
  { id: "KILL", label: "Kill agent", destructive: true },
];

const STATE_FILTERS: (AgentRunState | "ALL")[] = [
  "ALL", "CODING", "TESTING", "PLANNING", "REVIEWING", "BLOCKED", "WAITING", "FAILED", "PAUSED", "IDLE", "COMPLETED",
];

export function FleetCommander({ fleet, modeToggle, onSelectEpic }: FleetCommanderProps) {
  const [stateFilter, setStateFilter] = useState<AgentRunState | "ALL">("ALL");
  // Local-only command log until runtime adapters are wired.
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<FleetAgent>>>({});

  const agents = useMemo(
    () =>
      fleet
        .map((a) => ({ ...a, ...overrides[a.id] }))
        .filter((a) => stateFilter === "ALL" || a.state === stateFilter),
    [fleet, stateFilter, overrides]
  );

  const totals = useMemo(() => {
    const active = fleet.filter((a) => !["IDLE", "COMPLETED", "PAUSED"].includes(a.state));
    return {
      active: active.length,
      blocked: fleet.filter((a) => a.state === "BLOCKED" || a.state === "FAILED").length,
      waiting: fleet.filter((a) => a.state === "WAITING").length,
      cost: fleet.reduce((acc, a) => acc + a.costUsd, 0),
      tokens: fleet.reduce((acc, a) => acc + a.tokensUsed, 0),
    };
  }, [fleet]);

  function runCommand(agent: FleetAgent, command: FleetCommand, autonomy?: AutonomyLevel) {
    const stamp = new Date().toLocaleTimeString();
    if (command === "PAUSE") setOverrides((o) => ({ ...o, [agent.id]: { ...o[agent.id], state: "PAUSED" } }));
    if (command === "RESUME") setOverrides((o) => ({ ...o, [agent.id]: { ...o[agent.id], state: "CODING" } }));
    if (command === "KILL") setOverrides((o) => ({ ...o, [agent.id]: { ...o[agent.id], state: "IDLE", currentTask: null } }));
    if (command === "CHANGE_AUTONOMY" && autonomy)
      setOverrides((o) => ({ ...o, [agent.id]: { ...o[agent.id], autonomy } }));
    setCommandLog((log) =>
      [
        `${stamp} · ${command}${autonomy ? ` → ${AUTONOMY_LABELS[autonomy]}` : ""} · ${agent.name} (${agent.runtime}) — queued, runtime adapter not yet wired`,
        ...log,
      ].slice(0, 8)
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Control plane"
        title="Agent Fleet Commander"
        description="Every running agent across runtimes — state, branch, model, spend, autonomy — with operator controls."
        icon={<Bot className="h-5 w-5" />}
        status={<DemoDataBadge />}
        actions={modeToggle}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Active" value={totals.active} hint={`${fleet.length} registered`} />
          <StatCard label="Blocked / failed" value={totals.blocked} tone={totals.blocked > 0 ? "bad" : "good"} />
          <StatCard label="Waiting on human" value={totals.waiting} tone={totals.waiting > 0 ? "warn" : "good"} />
          <StatCard label="Tokens (24h)" value={formatTokens(totals.tokens)} />
          <StatCard label="Cost (24h)" value={formatUsd(totals.cost)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {STATE_FILTERS.map((s) => (
            <Button
              key={s}
              variant={stateFilter === s ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setStateFilter(s)}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--panel-line)] bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Agent</TableHead>
                <TableHead className="w-28">State</TableHead>
                <TableHead>Current task</TableHead>
                <TableHead className="w-20">Uptime</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="w-36">Model</TableHead>
                <TableHead className="w-24">Spend</TableHead>
                <TableHead className="w-16">Risk</TableHead>
                <TableHead className="w-28">Autonomy</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{agent.name}</span>
                      <Badge variant="outline" className="border-border/50 font-mono text-[9px] text-muted-foreground">
                        {agent.runtime}
                      </Badge>
                    </div>
                    <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-muted-foreground/80" title={agent.lastAction}>
                      ↳ {agent.lastAction}
                    </div>
                  </TableCell>
                  <TableCell><StateBadge state={agent.state} /></TableCell>
                  <TableCell>
                    {agent.currentTask ? (
                      <button
                        className="max-w-[280px] truncate text-left text-xs text-foreground/85 hover:text-cyan-200"
                        onClick={() => agent.epicKey && onSelectEpic(agent.epicKey)}
                        title={agent.currentTask}
                      >
                        {agent.currentTask}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                    {agent.nextAction && (
                      <div className="max-w-[280px] truncate text-[11px] text-muted-foreground/60" title={agent.nextAction}>
                        next: {agent.nextAction}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDuration(agent.startedAt)}
                  </TableCell>
                  <TableCell>
                    {agent.branch ? (
                      <span className="block max-w-[200px] truncate font-mono text-[11px] text-muted-foreground" title={agent.branch}>
                        {agent.branch}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-foreground/85">{agent.model}</div>
                    <div className="text-[10px] text-muted-foreground/70">{agent.provider}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-foreground/85">{formatUsd(agent.costUsd)}</div>
                    <div className="font-mono text-[10px] text-muted-foreground/70">{formatTokens(agent.tokensUsed)} tok</div>
                  </TableCell>
                  <TableCell><RiskBadge risk={agent.riskLevel} /></TableCell>
                  <TableCell><AutonomyBadge level={agent.autonomy} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-[11px]">
                          {agent.name} · {Math.round(agent.confidence)}% confidence
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {COMMANDS.map((c) => (
                          <DropdownMenuItem
                            key={c.id}
                            className={cn("text-xs", c.destructive && "text-red-400 focus:text-red-300")}
                            onClick={() => runCommand(agent, c.id)}
                          >
                            {c.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-xs">Change autonomy</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {AUTONOMY_LEVELS.map((level) => (
                              <DropdownMenuItem
                                key={level}
                                className={cn("text-xs", level === agent.autonomy && "text-cyan-300")}
                                onClick={() => runCommand(agent, "CHANGE_AUTONOMY", level)}
                              >
                                {AUTONOMY_LABELS[level]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {commandLog.length > 0 && (
          <div className="mt-4 mb-2 rounded-xl border border-[var(--panel-line)] bg-card/40 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Command log (local — adapters pending)
            </div>
            <div className="space-y-1">
              {commandLog.map((line, i) => (
                <div key={i} className="truncate font-mono text-[11px] text-muted-foreground/85">{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
