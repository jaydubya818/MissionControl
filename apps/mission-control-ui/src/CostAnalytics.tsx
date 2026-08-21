import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ExternalLink, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricBlock, MetricRow } from "./components/factory/MetricBlock";
import { CHART_SERIES } from "./components/factory/chartTheme";
import { safeExternalUrl } from "./lib/safeExternalUrl";

interface CostAnalyticsProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

const CARD_CLASS = "rounded-xl border border-line bg-surface-1 p-4";

export function CostAnalytics({ projectId, onClose }: CostAnalyticsProps) {
  const runs = useQuery(
    api.runs.listRecent,
    projectId ? { projectId, limit: 1000 } : "skip"
  );

  const agents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : "skip"
  );

  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : "skip"
  );

  if (!runs || !agents || !tasks) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="rounded-xl border border-line bg-surface-1 p-6">
          <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  // Calculate metrics
  const totalCost = runs.reduce((sum, r) => sum + r.costUsd, 0);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCost = runs
    .filter((r) => r.startedAt >= todayStart)
    .reduce((sum, r) => sum + r.costUsd, 0);

  const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7DaysCost = runs
    .filter((r) => r.startedAt >= last7Days)
    .reduce((sum, r) => sum + r.costUsd, 0);

  const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30DaysCost = runs
    .filter((r) => r.startedAt >= last30Days)
    .reduce((sum, r) => sum + r.costUsd, 0);

  // Cost by agent
  const costByAgent = agents.map((agent) => {
    const agentRuns = runs.filter((r) => r.agentId === agent._id);
    const cost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const runCount = agentRuns.length;
    return { agent, cost, runCount };
  }).sort((a, b) => b.cost - a.cost);

  // Cost by task
  const costByTask = tasks.map((task) => {
    return {
      task,
      cost: task.actualCost,
      budget: task.budgetAllocated || 0,
      remaining: task.budgetRemaining || 0,
    };
  }).sort((a, b) => b.cost - a.cost);

  // Cost by model
  const costByModel: Record<string, { cost: number; runs: number }> = {};
  for (const run of runs) {
    if (!costByModel[run.model]) {
      costByModel[run.model] = { cost: 0, runs: 0 };
    }
    costByModel[run.model].cost += run.costUsd;
    costByModel[run.model].runs++;
  }
  const modelStats = Object.entries(costByModel)
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.cost - a.cost);

  // Daily cost trend (last 7 days)
  const dailyCosts: Record<string, number> = {};
  for (const run of runs) {
    if (run.startedAt >= last7Days) {
      const date = new Date(run.startedAt).toISOString().split("T")[0];
      dailyCosts[date] = (dailyCosts[date] || 0) + run.costUsd;
    }
  }
  const costTrend = Object.entries(dailyCosts)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const maxDailyCost = Math.max(...Object.values(dailyCosts), 1);

  // Provider billing dashboards (manual auth only — see docs/COSTS.md). Grouped for clarity.
  const providerBillingGroups: { label: string; links: { name: string; url: string }[] }[] = [
    {
      label: "AI & models",
      links: [
        { name: "Anthropic", url: "https://console.anthropic.com/settings/billing" },
        { name: "OpenAI", url: "https://platform.openai.com/usage" },
        { name: "Google / Gemini", url: "https://console.cloud.google.com/billing" },
        { name: "OpenRouter", url: "https://openrouter.ai/credits" },
        { name: "Perplexity", url: "https://www.perplexity.ai/settings" },
      ],
    },
    {
      label: "Infrastructure",
      links: [
        { name: "Convex", url: "https://dashboard.convex.dev" },
        { name: "Vercel", url: "https://vercel.com/dashboard/billing" },
        { name: "GitHub", url: "https://github.com/settings/billing" },
      ],
    },
    {
      label: "Tools & services",
      links: [
        { name: "Cursor", url: "https://cursor.com" },
        { name: "ElevenLabs", url: "https://elevenlabs.io/subscription" },
        { name: "Twilio", url: "https://console.twilio.com/billing" },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-line bg-surface-1">
        {/* Header */}
        <div className="shrink-0 border-b border-line p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[19px] font-semibold text-ink">Cost analytics</h2>
              <p
                className="mt-1 text-[13px] text-ink-secondary"
                title="Cost from agent runs. Savings vs. paying list price without run-level optimizations."
              >
                {runs.length} runs · ${totalCost.toFixed(2)} total
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              aria-label="Close"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary */}
          <MetricRow className="mb-6">
            <MetricBlock label="Today" value={`$${todayCost.toFixed(2)}`} />
            <MetricBlock label="Last 7 days" value={`$${last7DaysCost.toFixed(2)}`} />
            <MetricBlock label="Last 30 days" value={`$${last30DaysCost.toFixed(2)}`} />
            <MetricBlock label="All time" value={`$${totalCost.toFixed(2)}`} />
          </MetricRow>

          {/* Provider billing — grouped vendor dashboards */}
          <div className={cn(CARD_CLASS, "mb-6 p-5")}>
            <h3 className="text-[15px] font-semibold text-ink">Provider billing</h3>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              Vendor dashboards require manual sign-in. Review regularly and update{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">docs/COSTS.md</code>{" "}
              with current spending.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
              {providerBillingGroups.map(({ label, links }) => (
                <div key={label}>
                  <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                    {label}
                  </div>
                  <ul>
                    {links.map(({ name, url }) => (
                      <li key={name}>
                        <a
                          href={safeExternalUrl(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] text-ink-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                        >
                          <span>{name}</span>
                          <ExternalLink
                            size={14}
                            strokeWidth={1.75}
                            className="shrink-0 text-ink-muted transition-colors duration-150 group-hover:text-ink-secondary"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-4 text-[12px] text-ink-muted">
              <FileText size={14} strokeWidth={1.75} className="shrink-0" />
              Full checklist and spending table:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">docs/COSTS.md</code>
            </p>
          </div>

          {/* Daily Trend Chart */}
          <div className={cn(CARD_CLASS, "mb-6")}>
            <h3 className="mb-4 text-[15px] font-semibold text-ink">
              Daily cost trend (last 7 days)
            </h3>
            <div className="space-y-2">
              {costTrend.map(({ date, cost }) => (
                <div key={date} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-[12px] text-ink-muted">
                    {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
                    <div
                      className="h-6 min-w-[2px] rounded-md"
                      style={{
                        width: `${(cost / maxDailyCost) * 100}%`,
                        backgroundColor: CHART_SERIES[0],
                      }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 font-mono text-[12px] font-medium text-ink">
                      ${cost.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Cost by Agent */}
            <div className={CARD_CLASS}>
              <h3 className="mb-4 text-[15px] font-semibold text-ink">Cost by agent</h3>
              <div className="space-y-2">
                {costByAgent.slice(0, 10).map(({ agent, cost, runCount }) => (
                  <div key={agent._id} className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] text-ink">{agent.name}</span>
                      <span className="shrink-0 text-[12px] text-ink-muted">({runCount} runs)</span>
                    </div>
                    <span className="ml-2 shrink-0 font-mono text-[13px] font-medium tabular-nums text-ink">
                      ${cost.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cost by Model */}
            <div className={CARD_CLASS}>
              <h3 className="mb-4 text-[15px] font-semibold text-ink">Cost by model</h3>
              <div className="space-y-2">
                {modelStats.map(({ model, cost, runs }) => (
                  <div key={model} className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-[12.5px] text-ink">{model}</span>
                      <span className="shrink-0 text-[12px] text-ink-muted">({runs} runs)</span>
                    </div>
                    <span className="ml-2 shrink-0 font-mono text-[13px] font-medium tabular-nums text-ink">
                      ${cost.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Most Expensive Tasks */}
            <div className={cn(CARD_CLASS, "lg:col-span-2")}>
              <h3 className="mb-4 text-[15px] font-semibold text-ink">Most expensive tasks</h3>
              <div className="space-y-3">
                {costByTask.slice(0, 10).map(({ task, cost, budget, remaining }) => (
                  <div key={task._id} className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{task.title}</div>
                      <div className="mt-0.5 text-[12px] text-ink-muted">
                        {task.type} · Priority {task.priority}
                      </div>
                      {budget > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={cn(
                                "h-1.5 rounded-full",
                                remaining < 0
                                  ? "bg-err"
                                  : remaining < budget * 0.2
                                    ? "bg-warn"
                                    : "bg-ok"
                              )}
                              style={{ width: `${Math.min((cost / budget) * 100, 100)}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[12px] text-ink-muted">
                            <span>${cost.toFixed(2)}</span>
                            <span>${budget.toFixed(2)} budget</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">
                        ${cost.toFixed(2)}
                      </div>
                      {budget > 0 && (
                        <div
                          className={cn(
                            "mt-0.5 text-[12px]",
                            remaining < 0 ? "text-err" : "text-ink-muted"
                          )}
                        >
                          {remaining < 0 ? "Over" : `${remaining.toFixed(2)} left`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
