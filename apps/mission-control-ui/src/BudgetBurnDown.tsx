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
import { PageHeader } from "./components/factory/DetailLayout";
import { MetricBlock, MetricRow } from "./components/factory/MetricBlock";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";

interface BudgetBurnDownProps {
  projectId: Id<"projects"> | null;
}

function getSpendClasses(ratio: number): { text: string; bg: string } {
  if (ratio >= 1) return { text: "text-err", bg: "bg-err" };
  if (ratio >= 0.8) return { text: "text-warn", bg: "bg-warn" };
  return { text: "text-ok", bg: "bg-ok" };
}

function getStatusLabel(ratio: number): string {
  if (ratio >= 1) return "Exceeded";
  if (ratio >= 0.8) return "Warning";
  if (ratio >= 0.5) return "On track";
  return "Healthy";
}

function getStatusTone(ratio: number): StatusBadgeProps["tone"] {
  if (ratio >= 1) return "error";
  if (ratio >= 0.8) return "warning";
  return "success";
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
        statusTone: getStatusTone(ratio),
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader title="Budget burn-down" description="Daily budget consumption across all agents" />
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-6 py-6">
          <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        </div>
      </div>
    );
  }

  const totalClasses = getSpendClasses(budgetData.totalRatio);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader title="Budget burn-down" description="Daily budget consumption across all agents" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        {/* Aggregate Summary */}
        <MetricRow className="xl:grid-cols-6">
          <MetricBlock label="Total budget" value={`$${budgetData.totalBudget.toFixed(2)}`} />
          <MetricBlock
            label="Total spent"
            value={
              <span className={totalClasses.text}>${budgetData.totalSpent.toFixed(2)}</span>
            }
          />
          <MetricBlock
            label="Remaining"
            value={`$${Math.max(0, budgetData.totalBudget - budgetData.totalSpent).toFixed(2)}`}
          />
          <MetricBlock label="Active agents" value={budgetData.activeCount} />
          {budgetData.overBudgetCount > 0 && (
            <MetricBlock
              label="Over budget"
              value={budgetData.overBudgetCount}
              adornment={<StatusBadge tone="error">Exceeded</StatusBadge>}
            />
          )}
          {budgetData.warningCount > 0 && (
            <MetricBlock
              label="Warning"
              value={budgetData.warningCount}
              adornment={<StatusBadge tone="warning">80%+</StatusBadge>}
            />
          )}
        </MetricRow>

        {/* Aggregate Progress Bar */}
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">
              Overall: {(budgetData.totalRatio * 100).toFixed(0)}% consumed
            </span>
            <span className="font-mono text-[12.5px] text-ink-muted">
              ${budgetData.totalSpent.toFixed(2)} / ${budgetData.totalBudget.toFixed(2)}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("absolute left-0 top-0 h-full rounded-full transition-[width] duration-200", totalClasses.bg)}
              style={{ width: `${Math.min(budgetData.totalRatio * 100, 100)}%` }}
            />
            <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: "80%" }} />
          </div>
        </div>

        {/* Per-Agent Breakdown */}
        <div className="flex flex-col gap-2.5">
          {budgetData.agents.map((agent) => (
            <div key={agent.id} className="rounded-xl border border-line bg-surface-1 px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{agent.name}</span>
                  <span className="text-[11.5px] text-ink-muted">{agent.role}</span>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      agent.status === "ACTIVE"
                        ? "bg-ok"
                        : agent.status === "PAUSED"
                          ? "bg-warn"
                          : "bg-ink-muted"
                    )}
                    aria-hidden
                  />
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={agent.statusTone}>{agent.statusLabel}</StatusBadge>
                  <span className="font-mono text-[12.5px] text-ink-muted">
                    ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn("absolute left-0 top-0 h-full rounded-full transition-[width] duration-200", agent.classes.bg)}
                  style={{ width: `${Math.min(agent.ratio * 100, 100)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between">
                <span className="text-[12px] text-ink-muted">
                  Remaining: ${agent.remaining.toFixed(2)}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {(agent.ratio * 100).toFixed(0)}% used
                </span>
              </div>
            </div>
          ))}
        </div>

        {budgetData.agents.length === 0 && (
          <div className="rounded-xl border border-line bg-surface-1 px-5 py-10 text-center">
            <p className="text-[13px] text-ink-muted">
              No agents found. Budget tracking will appear once agents are registered.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
