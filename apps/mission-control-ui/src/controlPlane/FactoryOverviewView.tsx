import { useState } from "react";
import { ClipboardList, Loader2, ShieldAlert, Sparkles, Waypoints } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildFactoryOverviewCards, summarizeAttentionLoad } from "./factoryOverviewModel";
import type { MainView } from "../TopNav";

export function FactoryOverviewView({ projectId, onNavigate }: { projectId: Id<"projects"> | null; onNavigate: (view: MainView) => void }) {
  const overview = useQuery(api.workOrders.factoryOverview, { projectId: projectId ?? undefined, limit: 5 });
  const createSoftwareFactoryProject = useMutation(api.projects.createSoftwareFactoryProject);
  const [createState, setCreateState] = useState<"idle" | "submitting" | "created" | "replayed" | "error">("idle");
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const handleCreateSoftwareFactoryProject = async () => {
    setCreateState("submitting");
    setCreateMessage(null);
    try {
      const result = await createSoftwareFactoryProject({
        name: "Apple Notes Software Factory",
        slug: "apple-notes-software-factory",
        repository: "jaydubya818/MissionControl",
        githubBranch: "main",
        requestedBy: "Hermes",
      });
      setCreateState(result.created ? "created" : "replayed");
      setCreateMessage(
        result.created
          ? `Created ${result.createdWorkOrders} factory WorkOrders for ${result.project?.name ?? "the project"}.`
          : `${result.project?.name ?? "Software factory project"} already exists; refreshed the read model.`
      );
    } catch (error) {
      setCreateState("error");
      setCreateMessage(error instanceof Error ? error.message : "Failed to create software factory project.");
    }
  };

  if (!overview) {
    return (
      <main className="flex flex-1 flex-col overflow-hidden">
        <PageHeader eyebrow="Control plane" title="Portfolio" description="Live factory overview backed by WorkOrders, approvals, and execution runs." icon={<Waypoints className="h-5 w-5" />} />
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading factory overview…
        </div>
      </main>
    );
  }

  const cards = buildFactoryOverviewCards(overview.summary);
  const attentionLoad = summarizeAttentionLoad(overview.summary);

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Control plane"
        title="Portfolio"
        description="Exception-first overview of software-factory throughput, approvals, stale evidence, and runs needing attention."
        icon={<Waypoints className="h-5 w-5" />}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {cards.map((card) => (
            <Card key={card.key}>
              <CardHeader className="pb-2">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className={toneClass(card.tone)}>{card.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Project creation</CardTitle>
              <CardDescription>Create the Apple Notes software-factory project and hydrate the project-scoped read model with WorkOrders, runs, approvals, artifacts, and receipts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="neon-cyan" onClick={handleCreateSoftwareFactoryProject} disabled={createState === "submitting"}>
                {createState === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Create factory project
              </Button>
              {createMessage && (
                <div className={`rounded-2xl border p-3 text-sm ${createState === "error" ? "border-red-500/30 text-red-200" : "border-emerald-500/30 text-emerald-200"}`}>
                  {createMessage}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operator attention</CardTitle>
              <CardDescription>{attentionLoad} live exceptions currently need a decision, rerun, or evidence refresh.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onNavigate("control-work-orders")}><ClipboardList className="h-4 w-4" /> Open Work Orders</Button>
              <Button variant="outline" onClick={() => onNavigate("control-approvals")}><ShieldAlert className="h-4 w-4" /> Open Approval Center</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent acceptance</CardTitle>
              <CardDescription>Recently accepted outcomes remain visible here as proof of throughput.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.recentAccepted.length === 0 ? <EmptyLine label="No recently accepted work yet." /> : overview.recentAccepted.map(({ workOrder, latestRun }: any) => (
                <OverviewRow
                  key={workOrder._id}
                  title={workOrder.title}
                  subtitle={workOrder.repository ?? workOrder.workflowId ?? "—"}
                  badge={latestRun?.status ?? workOrder.state}
                  tone="success"
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <OverviewListCard
            title="Blocked WorkOrders"
            description="Requests that cannot progress until a human or system intervention happens."
            empty="No blocked WorkOrders."
            items={overview.blockedWorkOrders.map(({ workOrder, latestRun }: any) => ({
              key: workOrder._id,
              title: workOrder.title,
              subtitle: workOrder.requiredHumanAction ?? workOrder.blockingIssue ?? latestRun?.failureReason ?? "Awaiting attention",
              badge: latestRun?.status ?? workOrder.state,
              tone: "danger" as const,
            }))}
          />

          <OverviewListCard
            title="Approval queue"
            description="Human decisions currently blocking dispatch, acceptance, or revision flow."
            empty="No pending approvals."
            items={overview.approvalQueue.map(({ _id, workOrder, approvalType, requestedAction }: any) => ({
              key: _id,
              title: workOrder?.title ?? approvalType,
              subtitle: requestedAction,
              badge: approvalType,
              tone: "warning" as const,
            }))}
          />

          <OverviewListCard
            title="Stale evidence"
            description="Verification receipts that must be refreshed before acceptance can proceed."
            empty="No stale evidence."
            items={overview.staleEvidence.map(({ receipt, workOrder }: any) => ({
              key: receipt._id,
              title: workOrder?.title ?? receipt.acceptanceCriterionId,
              subtitle: `Criterion ${receipt.acceptanceCriterionId}`,
              badge: receipt.status,
              tone: "warning" as const,
            }))}
          />

          <OverviewListCard
            title="Runs needing attention"
            description="Latest execution runs with failures, pauses, retries, or human interventions."
            empty="No attention-seeking runs."
            items={overview.runsNeedingAttention.map(({ workOrder, latestRun }: any) => ({
              key: latestRun._id,
              title: workOrder.title,
              subtitle: latestRun.failureReason ?? latestRun.currentStepLabel ?? latestRun.workflowId,
              badge: latestRun.status,
              tone: "danger" as const,
            }))}
          />
        </div>
      </div>
    </main>
  );
}

function OverviewListCard({ title, description, empty, items }: { title: string; description: string; empty: string; items: Array<{ key: string; title: string; subtitle: string; badge: string; tone: "danger" | "warning" | "success" }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? <EmptyLine label={empty} /> : items.map((item) => <OverviewRow key={item.key} {...item} />)}
      </CardContent>
    </Card>
  );
}

function OverviewRow({ title, subtitle, badge, tone }: { title: string; subtitle: string; badge: string; tone: "danger" | "warning" | "success" }) {
  return (
    <div className="rounded-2xl border border-[var(--panel-line)] bg-background/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
        </div>
        <Badge variant="outline" className={toneClass(tone)}>{badge}</Badge>
      </div>
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-[var(--panel-line)] p-4 text-sm text-muted-foreground">{label}</div>;
}

function toneClass(tone: "neutral" | "warning" | "danger" | "success") {
  switch (tone) {
    case "warning":
      return "text-amber-200 border-amber-500/30";
    case "danger":
      return "text-red-200 border-red-500/30";
    case "success":
      return "text-emerald-200 border-emerald-500/30";
    default:
      return "text-registry-accent border-registry-accent/30";
  }
}
