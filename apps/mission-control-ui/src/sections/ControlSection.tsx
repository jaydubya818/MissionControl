import { Orbit, ShieldCheck, Waypoints } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MainView } from "../TopNav";

interface ControlSectionProps {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
}

const VIEW_COPY: Record<Extract<MainView, "control-portfolio" | "control-fleet" | "control-approvals">, {
  title: string;
  description: string;
}> = {
  "control-portfolio": {
    title: "Portfolio",
    description: "Track operator-facing software factory work at the request and outcome layer.",
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

const CONTROL_VIEWS: Array<{
  id: Extract<MainView, "control-portfolio" | "control-fleet" | "control-approvals">;
  icon: typeof Orbit;
}> = [
  { id: "control-portfolio", icon: Orbit },
  { id: "control-fleet", icon: Waypoints },
  { id: "control-approvals", icon: ShieldCheck },
];

export function ControlSection({ currentView, onNavigate }: ControlSectionProps) {
  const activeView = CONTROL_VIEWS.some((view) => view.id === currentView)
    ? currentView as keyof typeof VIEW_COPY
    : "control-portfolio";
  const activeCopy = VIEW_COPY[activeView];

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Control plane"
        title="Control"
        description="Minimal application-shell foundation for portfolio, fleet, approvals, and upcoming WorkOrder control surfaces."
        icon={<Orbit className="h-5 w-5" />}
      />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Surface navigation</CardTitle>
              <CardDescription>
                Stable shell entrypoints for the Control section. Each view is intentionally lightweight until live control-plane features are wired.
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
                This landing state intentionally avoids demo-backed execution logic. It exists to provide a durable section,
                navigation model, and rendering boundary for follow-on control-plane work.
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                <ControlNote
                  title="Section boundary"
                  body="The Control section now routes independently from Home, Ops, and Platform while preserving all existing shell views."
                />
                <ControlNote
                  title="Integration point"
                  body="Future WorkOrder, approval, and fleet features can mount inside this section without rewiring the global app shell."
                />
                <ControlNote
                  title="Safe placeholder"
                  body="No seeded control-plane records or orchestration side effects are required for this shell to compile, render, and navigate."
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
