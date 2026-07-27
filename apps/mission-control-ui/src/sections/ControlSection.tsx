import { ClipboardList, Orbit, ShieldCheck, Waypoints } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MainView } from "../TopNav";
import { FactoryOverviewView } from "../controlPlane/FactoryOverviewView";
import { WorkOrdersView } from "../controlPlane/WorkOrdersView";
import { WorkOrderApprovalsView } from "../controlPlane/WorkOrderApprovalsView";

interface ControlSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}

type ControlView = Extract<
  MainView,
  "control-portfolio" | "control-work-orders" | "control-fleet" | "control-approvals"
>;

const VIEW_COPY: Record<ControlView, { title: string; description: string }> = {
  "control-portfolio": {
    title: "Portfolio",
    description: "Track operator-facing software factory work at the request and outcome layer.",
  },
  "control-work-orders": {
    title: "Work Orders",
    description: "Create and inspect first-class software-factory requests, acceptance criteria, and linked execution runs.",
  },
  "control-fleet": {
    title: "Fleet",
    description: "Inspect execution capacity and future fleet-level controls from one shell entrypoint.",
  },
  "control-approvals": {
    title: "Approvals",
    description: "Route human decisions through a dedicated control-plane surface as approval workflows come online.",
  },
};

const CONTROL_VIEWS: Array<{ id: ControlView; icon: typeof Orbit }> = [
  { id: "control-portfolio", icon: Orbit },
  { id: "control-work-orders", icon: ClipboardList },
  { id: "control-fleet", icon: Waypoints },
  { id: "control-approvals", icon: ShieldCheck },
];

export function ControlSection({ currentView, projectId, onNavigate }: ControlSectionProps) {
  const activeView = CONTROL_VIEWS.some((view) => view.id === currentView)
    ? (currentView as ControlView)
    : "control-portfolio";

  if (activeView === "control-work-orders") {
    return <WorkOrdersView projectId={projectId} />;
  }

  if (activeView === "control-approvals") {
    return <WorkOrderApprovalsView projectId={projectId} />;
  }

  if (activeView === "control-portfolio") {
    return <FactoryOverviewView projectId={projectId} onNavigate={onNavigate} />;
  }

  const activeCopy = VIEW_COPY[activeView];

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Control plane"
        title="Control"
        description="Minimal control-plane shell plus the Work Orders slice for governed software-factory execution."
        icon={<Orbit className="h-5 w-5" />}
      />

      <div className="factory-content">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Surface navigation</CardTitle>
              <CardDescription>
                Stable shell entrypoints for the Control section. Work Orders is live; the other views remain intentionally lightweight until follow-on control-plane slices are wired.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {CONTROL_VIEWS.map(({ id, icon: Icon }) => {
                const isActive = id === activeView;
                return (
                  <Button
                    key={id}
                    type="button"
                    variant={isActive ? "neon-cyan" : "outline"}
                    className="w-full justify-start"
                    onClick={() => onNavigate(id)}
                  >
                    <Icon className="h-4 w-4" />
                    {VIEW_COPY[id].title}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{activeCopy.title}</CardTitle>
              <CardDescription>{activeCopy.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                This landing state keeps the application shell stable while follow-on control-plane work arrives incrementally.
                It preserves the section boundary introduced by the shell PR without pulling demo-heavy execution logic back into the WorkOrder slice.
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                <ControlNote
                  title="Section boundary"
                  body="Control routes independently from Home, Ops, and Platform while preserving all existing shell views."
                />
                <ControlNote
                  title="Live slice"
                  body="Work Orders now uses real Convex-backed data and governed dispatch behavior within this section."
                />
                <ControlNote
                  title="Follow-on space"
                  body="Portfolio, Fleet, and Approvals remain stable placeholders until those slices are implemented on their own merits."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function ControlNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[var(--panel-line)] bg-background/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/80">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
