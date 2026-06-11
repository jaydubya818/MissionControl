import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import {
  PERMISSION_CATEGORIES,
  formatDuration,
  type ApprovalRequest,
  type ApprovalStatus,
  type RiskLevel,
} from "./types";
import { DemoDataBadge, RiskBadge, StatCard } from "./shared";

interface ApprovalQueueProps {
  approvals: ApprovalRequest[];
  modeToggle?: ReactNode;
  onSelectEpic: (epicKey: string) => void;
}

const BLAST_LABEL: Record<ApprovalRequest["blastRadius"], string> = {
  FILE: "File",
  MODULE: "Module",
  SERVICE: "Service",
  SYSTEM: "System",
  PRODUCTION: "Production",
};

const RECOMMENDATION_STYLE: Record<ApprovalRequest["recommendation"], string> = {
  APPROVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REVIEW_CAREFULLY: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  REJECT: "bg-red-500/15 text-red-300 border-red-500/30",
};

const RISK_ORDER: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function ApprovalQueue({ approvals, modeToggle, onSelectEpic }: ApprovalQueueProps) {
  const [resolutions, setResolutions] = useState<Record<string, ApprovalStatus>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);

  const items = useMemo(() => {
    return approvals
      .map((a) => ({ ...a, status: resolutions[a.id] ?? a.status }))
      .filter((a) => !riskFilter || a.riskLevel === riskFilter)
      .sort((a, b) => {
        const pending = Number(b.status === "PENDING") - Number(a.status === "PENDING");
        if (pending !== 0) return pending;
        return RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel);
      });
  }, [approvals, resolutions, riskFilter]);

  const pending = items.filter((a) => a.status === "PENDING");
  const critical = pending.filter((a) => a.riskLevel === "CRITICAL").length;

  function resolve(id: string, status: ApprovalStatus) {
    setResolutions((r) => ({ ...r, [id]: status }));
  }

  function categoryLabel(id: ApprovalRequest["category"]): string {
    return PERMISSION_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Control plane"
        title="Approval Queue"
        description="Human-in-the-loop gate for risky agent actions: what, why, blast radius, rollback plan, and a recommended call."
        icon={<ShieldAlert className="h-5 w-5" />}
        status={<DemoDataBadge />}
        actions={modeToggle}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Pending" value={pending.length} tone={pending.length > 0 ? "warn" : "good"} />
          <StatCard label="Critical risk" value={critical} tone={critical > 0 ? "bad" : "good"} />
          <StatCard
            label="Oldest waiting"
            value={pending.length ? formatDuration(Math.min(...pending.map((a) => a.requestedAt))) : "—"}
          />
          <StatCard
            label="Resolved (session)"
            value={Object.values(resolutions).filter((s) => s !== "PENDING").length}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {RISK_ORDER.map((r) => (
            <Button
              key={r}
              variant={riskFilter === r ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setRiskFilter(riskFilter === r ? null : r)}
            >
              {r}
            </Button>
          ))}
        </div>

        <div className="mt-3 space-y-3 pb-2">
          {items.map((item) => {
            const isOpen = expanded === item.id;
            const resolved = item.status !== "PENDING";
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card/50 transition-colors",
                  item.riskLevel === "CRITICAL" && !resolved
                    ? "border-red-500/30"
                    : "border-[var(--panel-line)]",
                  resolved && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 shrink-0">
                    {item.riskLevel === "CRITICAL" || item.riskLevel === "HIGH" ? (
                      <TriangleAlert className={cn("h-4 w-4", item.riskLevel === "CRITICAL" ? "text-red-400" : "text-orange-300")} />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{item.action}</span>
                      <RiskBadge risk={item.riskLevel} />
                      <Badge variant="outline" className="border-border/50 text-[10px] text-muted-foreground">
                        {categoryLabel(item.category)}
                      </Badge>
                      <Badge variant="outline" className="border-border/50 text-[10px] text-muted-foreground">
                        Blast: {BLAST_LABEL[item.blastRadius]}
                      </Badge>
                      {resolved && (
                        <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.reason}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/75">
                      <span>
                        agent <span className="text-foreground/80">{item.agentName}</span>
                      </span>
                      {item.epicKey && (
                        <button className="font-mono text-cyan-300/90 hover:text-cyan-200" onClick={() => onSelectEpic(item.epicKey!)}>
                          {item.epicKey}
                        </button>
                      )}
                      <span>waiting {formatDuration(item.requestedAt)}</span>
                      <Badge variant="outline" className={cn("text-[9px]", RECOMMENDATION_STYLE[item.recommendation])}>
                        {item.recommendation === "REVIEW_CAREFULLY" ? "REVIEW CAREFULLY" : `RECOMMEND ${item.recommendation}`}
                      </Badge>
                    </div>

                    {isOpen && (
                      <div className="mt-3 grid gap-3 rounded-lg border border-border/40 bg-background/40 p-3 md:grid-cols-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Affected files / systems
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {item.affected.map((f) => (
                              <li key={f} className="truncate font-mono text-[11px] text-foreground/80">{f}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Rollback plan
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-foreground/80">{item.rollbackPlan}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {!resolved && (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" className="h-7 bg-emerald-600 px-2.5 text-[11px] hover:bg-emerald-500" onClick={() => resolve(item.id, "APPROVED")}>
                          <Check className="mr-1 h-3 w-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] text-red-300 hover:text-red-200" onClick={() => resolve(item.id, "REJECTED")}>
                          <X className="mr-1 h-3 w-3" /> Reject
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => resolve(item.id, "MODIFIED")}>
                          <Pencil className="mr-1 h-3 w-3" /> Modify
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px]" onClick={() => resolve(item.id, "ESCALATED")}>
                          Escalate
                        </Button>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      onClick={() => setExpanded(isOpen ? null : item.id)}
                    >
                      {isOpen ? (
                        <>Details <ChevronUp className="ml-1 h-3 w-3" /></>
                      ) : (
                        <>Details <ChevronDown className="ml-1 h-3 w-3" /></>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
              No approvals match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
