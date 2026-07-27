import { useQuery } from "convex/react";
import { CalendarClock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessFactoryBlueprint } from "../components/HarnessFactoryBlueprint";
import { HarnessAutomatePanel } from "../components/HarnessAutomatePanel";
import { Button } from "@/components/ui/button";

export function HarnessMaintenanceView(): JSX.Element {
  const catalog = useQuery(api.factory.workflows.maintenanceCatalog, {});

  return (
    <HarnessPage
      title="Maintenance Catalog"
      description="Workshop mindset — sweeps that keep the factory clean (architecture, tests, docs, rule decay)."
      icon={<CalendarClock className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[900px] space-y-4">
        {!catalog ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          catalog.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-line bg-surface-1 px-4 py-3">
              <div>
                <div className="font-medium text-ink">{item.label}</div>
                <div className="text-xs text-ink-secondary">{item.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase text-ink-muted">{item.cadence}</span>
                <Button size="sm" variant="outline">
                  Install
                </Button>
              </div>
            </div>
          ))
        )}
        <HarnessFactoryBlueprint />
        <HarnessAutomatePanel />
      </div>
    </HarnessPage>
  );
}
