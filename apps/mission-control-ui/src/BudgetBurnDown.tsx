/**
 * Budget Burn-Down Dashboard
 *
 * Shows per-agent and aggregate budget consumption:
 *   - Daily budget cap vs. actual spend per agent
 *   - Aggregate project-wide burn rate
 *   - Alerts when agents approach or exceed budget
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface BudgetBurnDownProps {
  projectId: Id<"projects"> | null;
}

function getSpendClasses(ratio: number): { text: string; bg: string } {
  if (ratio >= 1) return { text: "text-red-500", bg: "bg-red-500" };
  if (ratio >= 0.8) return { text: "text-amber-500", bg: "bg-amber-500" };
  if (ratio >= 0.5) return { text: "text-blue-500", bg: "bg-blue-500" };
  return { text: "text-emerald-500", bg: "bg-emerald-500" };
}

function getStatusLabel(ratio: number): string {
  if (ratio >= 1) return "EXCEEDED";
  if (ratio >= 0.8) return "WARNING";
  if (ratio >= 0.5) return "ON TRACK";
  return "HEALTHY";
}

export function BudgetBurnDown({ projectId }: BudgetBurnDownProps) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  const budgetData = useMemo(() => {
    if (!agents) return null;

    const agentBudgets = agents.map((agent: Doc<"agents">) => {
      const daily = (agent as any).budgetDaily ?? 5;
      const spent = (agent as any).spendToday ?? 0;
      const ratio = daily > 0 ? spent / daily : 0;

      return {
        id: agent._id,
        name: agent.name,
        role: (agent as any).role ?? "UNKNOWN",
        status: agent.status,
        budgetDaily: daily,
        spendToday: spent,
        ratio,
        remaining: Math.max(0, daily - spent),
        classes: getSpendClasses(ratio),
        statusLabel: getStatusLabel(ratio),
      };
    });

    const totalBudget = agentBudgets.reduce((sum, a) => sum + a.budgetDaily, 0);
    const totalSpent = agentBudgets.reduce((sum, a) => sum + a.spendToday, 0);
    const activeCount = agentBudgets.filter((a) => a.status === "ACTIVE").length;
    const overBudgetCount = agentBudgets.filter((a) => a.ratio >= 1).length;
    const warningCount = agentBudgets.filter((a) => a.ratio >= 0.8 && a.ratio < 1).length;

    return {
      agents: agentBudgets.sort((a, b) => b.ratio - a.ratio),
      totalBudget,
      totalSpent,
      totalRatio: totalBudget > 0 ? totalSpent / totalBudget : 0,
      activeCount,
      overBudgetCount,
      warningCount,
    };
  }, [agents]);

  if (!budgetData) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="text-muted-foreground p-6">Loading budget data...</div>
      </div>
    );
  }

  const totalClasses = getSpendClasses(budgetData.totalRatio);

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-foreground text-2xl font-bold">Budget Burn-Down</h2>
        <p className="text-muted-foreground text-sm mt-1">Daily budget consumption across all agents</p>
      </div>

      {/* Aggregate Summary */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 mb-5">
        <SummaryCard label="Total Budget" value={`$${budgetData.totalBudget.toFixed(2)}`} colorClass="text-foreground" />
        <SummaryCard label="Total Spent" value={`$${budgetData.totalSpent.toFixed(2)}`} colorClass={totalClasses.text} />
        <SummaryCard label="Remaining" value={`$${Math.max(0, budgetData.totalBudget - budgetData.totalSpent).toFixed(2)}`} colorClass="text-emerald-500" />
        <SummaryCard label="Active Agents" value={String(budgetData.activeCount)} colorClass="text-blue-500" />
        {budgetData.overBudgetCount > 0 && (
          <SummaryCard label="Over Budget" value={String(budgetData.overBudgetCount)} colorClass="text-red-500" />
        )}
        {budgetData.warningCount > 0 && (
          <SummaryCard label="Warning" value={String(budgetData.warningCount)} colorClass="text-amber-500" />
        )}
      </div>

      {/* Aggregate Progress Bar */}
      <div className="bg-card border border-border rounded-xl p-4 mb-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-foreground font-semibold">
            Overall: {(budgetData.totalRatio * 100).toFixed(0)}% consumed
          </span>
          <span className="text-muted-foreground text-sm">
            ${budgetData.totalSpent.toFixed(2)} / ${budgetData.totalBudget.toFixed(2)}
          </span>
        </div>
        <div className="relative h-3 bg-background rounded-md overflow-hidden">
          <div
            className={cn("absolute top-0 left-0 h-full rounded-md transition-all duration-300", totalClasses.bg)}
            style={{ width: `${Math.min(budgetData.totalRatio * 100, 100)}%` }}
          />
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500/50" style={{ left: "80%" }} />
        </div>
      </div>

      {/* Per-Agent Breakdown */}
      <div className="flex flex-col gap-2.5">
        {budgetData.agents.map((agent) => (
          <div key={agent.id} className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{agent.name}</span>
                <span className="px-1.5 py-0.5 bg-background border border-border rounded text-[0.7rem] text-muted-foreground">
                  {agent.role}
                </span>
                <span className={cn(
                  "w-2 h-2 rounded-full inline-block",
                  agent.status === "ACTIVE" ? "bg-emerald-500"
                    : agent.status === "PAUSED" ? "bg-amber-500"
                    : "bg-slate-500"
                )} />
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-semibold", agent.classes.text)}>
                  {agent.statusLabel}
                </span>
                <span className="text-muted-foreground text-sm">
                  ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="relative h-1.5 bg-background rounded-sm overflow-hidden">
              <div
                className={cn("absolute top-0 left-0 h-full rounded-sm transition-all duration-300", agent.classes.bg)}
                style={{ width: `${Math.min(agent.ratio * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-muted-foreground text-xs">
                Remaining: ${agent.remaining.toFixed(2)}
              </span>
              <span className="text-muted-foreground text-xs">
                {(agent.ratio * 100).toFixed(0)}% used
              </span>
            </div>
          </div>
        ))}
      </div>

      {budgetData.agents.length === 0 && (
        <div className="text-center py-10 px-5 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">No agents found. Budget tracking will appear once agents are registered.</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="px-3.5 py-3 bg-card border border-border rounded-lg">
      <span className="text-[0.7rem] text-muted-foreground block">{label}</span>
      <span className={cn("text-xl font-bold", colorClass)}>{value}</span>
    </div>
  );
}
