import { Loader2, Factory, AlertTriangle, Sparkles, Users } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { MainView } from "../../TopNav";
import { HarnessPage, MaturityStepper, PillarCard } from "../components/HarnessUi";
import { Button } from "@/components/ui/button";

export function HarnessFactoryHealthView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  const health = useQuery(api.factory.health.getFactoryHealth, {
    projectId: projectId ?? undefined,
    periodDays: 7,
  });

  if (!health) {
    return (
      <HarnessPage title="Factory Health" description="Loading factory maturity and three pillars…" icon={<Factory className="h-5 w-5" />}>
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
        </div>
      </HarnessPage>
    );
  }

  const { metrics, maturityStage, trends, traps, targetHumanReviewBypassPct } = health;

  return (
    <HarnessPage
      title="Factory Health"
      description="Autonomy, automation, and quality — where to invest next in your software factory."
      icon={<Factory className="h-5 w-5 text-registry-accent" />}
      actions={
        <Button variant="outline" size="sm" onClick={() => onNavigate("harness-builder")}>
          Factory Builder
        </Button>
      }
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Maturity stage</div>
          <MaturityStepper current={maturityStage} />
        </div>

        {(traps.autonomyStalled ||
          traps.loopInvestmentNeeded ||
          traps.reviewBottleneck ||
          traps.velocityCliff) && (
          <div className="grid gap-3 md:grid-cols-2">
            {traps.autonomyStalled && (
              <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warn" />
                <div>
                  <div className="text-sm font-semibold text-ink">Autonomy stalled</div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Ship focus trap — invest in loops before local maximum. Try{" "}
                    <button type="button" className="text-registry-accent underline" onClick={() => onNavigate("harness-meta-loop")}>
                      Meta Loop
                    </button>
                    .
                  </p>
                </div>
              </div>
            )}
            {traps.loopInvestmentNeeded && (
              <div className="flex gap-3 rounded-xl border border-registry-accent/25 bg-registry-accent-soft p-4">
                <Sparkles className="h-5 w-5 shrink-0 text-registry-accent" />
                <div>
                  <div className="text-sm font-semibold text-ink">Loop investment</div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Manual takeovers rising — accept a meta suggestion to improve the harness incrementally.
                  </p>
                </div>
              </div>
            )}
            {traps.reviewBottleneck && (
              <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warn" />
                <div>
                  <div className="text-sm font-semibold text-ink">Review bottleneck</div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Agents are autonomous but not automated — you still review everything. Add{" "}
                    <button type="button" className="text-registry-accent underline" onClick={() => onNavigate("harness-verifiers")}>
                      verifiers
                    </button>{" "}
                    and outer-loop checks to trust automation.
                  </p>
                </div>
              </div>
            )}
            {traps.velocityCliff && (
              <div className="flex gap-3 rounded-xl border border-registry-accent/25 bg-registry-accent-soft p-4">
                <Users className="h-5 w-5 shrink-0 text-registry-accent" />
                <div>
                  <div className="text-sm font-semibold text-ink">Velocity cliff</div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Work generated outpaces consumption and hygiene is low. Check{" "}
                    <button type="button" className="text-registry-accent underline" onClick={() => onNavigate("harness-team-pulse")}>
                      Team Pulse
                    </button>{" "}
                    and invest in inner loop before shipping more.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <PillarCard label="Autonomy" value={metrics.autonomyOneShotRate} trend={trends.autonomy} hint="One-shot / few nudges per task" tone="ok" />
          <PillarCard
            label="Automation"
            value={metrics.automationHumanReviewBypassRate}
            trend={trends.automation}
            hint={`Target ${targetHumanReviewBypassPct}% PRs without human review`}
          />
          <PillarCard label="Quality" value={metrics.qualityEvalPassRate} trend={trends.quality} hint="Evals + verifiers passing" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile label="Manual takeovers" value={metrics.manualTakeovers} />
          <MetricTile label="Human PR comments" value={metrics.humanPrComments} tone={metrics.humanPrComments > 10 ? "warn" : "default"} />
          <MetricTile label="Agent-initiated PRs" value={metrics.agentInitiatedPrs} />
          <MetricTile label="Work generated" value={metrics.workGenerated} />
          <MetricTile label="Work consumed" value={metrics.workConsumed} />
          <MetricTile label="Meta inbox open" value={metrics.metaSuggestionsOpen} />
          <MetricTile label="Hygiene score" value={metrics.hygieneScore} unit="/100" />
          <MetricTile label="Token spend (7d)" value={Math.round(metrics.tokenSpendUsd * 100) / 100} unit=" USD" />
          <MetricTile label="Workflow spend (7d)" value={Math.round(metrics.workflowTokenSpendUsd * 100) / 100} unit=" USD" />
          <MetricTile label="Human touches / agent" value={metrics.humanTouchesPerAgentTask} />
          <MetricTile label="Shared contributions" value={metrics.sharedComponentContributions} tone="default" />
          <MetricTile label="Lost work" value={metrics.lostWorkCount} tone={metrics.lostWorkCount > 0 ? "warn" : "default"} />
        </div>
      </div>
    </HarnessPage>
  );
}

function MetricTile({
  label,
  value,
  unit = "",
  tone = "default",
}: {
  label: string;
  value: number;
  unit?: string;
  tone?: "default" | "warn";
}): JSX.Element {
  return (
    <div className={`rounded-lg border p-3 ${tone === "warn" ? "border-warn/30" : "border-line bg-surface-1"}`}>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">
        {value}
        {unit}
      </div>
    </div>
  );
}
