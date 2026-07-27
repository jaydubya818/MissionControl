import { useQuery } from "convex/react";
import { Waypoints } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { MainView } from "../../TopNav";
import { HarnessPage, PipelineStrip } from "../components/HarnessUi";
import { HarnessLegibilityCallout } from "../components/HarnessPrinciples";
import { MutationTestingPanel } from "../components/MutationTestingPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HarnessControlPlaneView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  const overview = useQuery(api.workOrders.factoryOverview, {
    projectId: projectId ?? undefined,
    limit: 8,
  });
  const ledger = useQuery(api.factory.health.workLedger, {
    projectId: projectId ?? undefined,
    limit: 5,
  });
  const latestPr = useQuery(api.factory.prChecks.getLatest, {
    projectId: projectId ?? undefined,
  });

  const stages = [
    { id: "issue", label: "Issue", status: "done" as const },
    { id: "dispatch", label: "Dispatch", status: "done" as const },
    { id: "run", label: "Agent run", status: "active" as const },
    { id: "pr", label: "PR", status: "pending" as const },
    { id: "review", label: "Review", status: "pending" as const },
    { id: "merge", label: "Merge", status: "pending" as const },
  ];

  return (
    <HarnessPage
      title="Control Plane"
      description="Legible issue → agent → PR pipeline. All feedback visible — nothing trapped in chat."
      icon={<Waypoints className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <HarnessLegibilityCallout />
        <PipelineStrip stages={stages} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crew lane</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Deep design reviews with long context — few agents, high intelligence tier.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fleet lane</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Throwaway parallel sweeps — generate → fix → review rhythm at scale.
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent work orders</CardTitle>
          </CardHeader>
          <CardContent>
            {!overview ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : overview.recentAccepted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No work orders yet.{" "}
                <button type="button" className="text-registry-accent underline" onClick={() => onNavigate("control-work-orders")}>
                  Create one
                </button>
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.recentAccepted.map(({ workOrder }) => (
                  <li key={workOrder._id} className="flex justify-between rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="truncate text-ink">{workOrder.title}</span>
                    <span className="shrink-0 text-ink-muted">{workOrder.state}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {ledger && (
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <LedgerColumn title="Todo" count={ledger.todo.length} items={ledger.todo} />
            <LedgerColumn title="In progress" count={ledger.inProgress.length} items={ledger.inProgress} />
            <LedgerColumn title="Finished" count={ledger.finished.length} items={ledger.finished} />
          </div>
        )}

        {latestPr?.prUrl ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">PR mutation gate</h3>
            <MutationTestingPanel projectId={projectId} prUrl={latestPr.prUrl} />
          </div>
        ) : null}
      </div>
    </HarnessPage>
  );
}

function LedgerColumn({
  title,
  count,
  items,
}: {
  title: string;
  count: number;
  items: Array<{ id: string; title: string; status: string }>;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title} ({count})
      </div>
      <ul className="mt-2 space-y-1">
        {items.slice(0, 4).map((t) => (
          <li key={t.id} className="truncate text-xs text-ink-secondary">
            {t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
