import { useMutation } from "convex/react";
import { useState } from "react";
import { Calendar, Github, MessageSquare, Sparkles, Zap } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { WORKSHOP_AUTOMATIONS, type AutomationId } from "@/lib/harnessWorkshop";
import { cn } from "@/lib/utils";

const SOURCE_ICONS: Record<string, typeof Github> = {
  GitHub: Github,
  Slack: MessageSquare,
  Linear: Calendar,
};

export function HarnessAutomationsCatalog({
  projectId,
  onScheduled,
}: {
  projectId?: Id<"projects"> | null;
  onScheduled?: (id: AutomationId) => void;
}): JSX.Element {
  const schedule = useMutation(api.factory.workflows.schedule);
  const [installing, setInstalling] = useState<AutomationId | null>(null);
  const [installed, setInstalled] = useState<Set<AutomationId>>(() => new Set());

  const handleInstall = async (id: AutomationId) => {
    const auto = WORKSHOP_AUTOMATIONS.find((a) => a.id === id);
    if (!auto) return;
    setInstalling(id);
    try {
      await schedule({
        projectId: projectId ?? undefined,
        skillName: auto.skillName,
        schedule: auto.schedule === "manual" ? "manual" : auto.schedule,
        idempotencyKey: `workshop-auto-${id}`,
        actorId: "harness-workshop-ui",
      });
      setInstalled((prev) => new Set(prev).add(id));
      onScheduled?.(id);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {WORKSHOP_AUTOMATIONS.map((auto) => {
        const isInstalled = installed.has(auto.id);
        const busy = installing === auto.id;
        return (
          <article
            key={auto.id}
            className={cn(
              "registry-top-card flex flex-col p-4",
              isInstalled && "border-registry-accent/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-registry-accent" aria-hidden />
                <h4 className="font-semibold text-ink">{auto.label}</h4>
              </div>
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-muted">
                {auto.cadence}
              </span>
            </div>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-secondary">{auto.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {auto.sources.map((src) => {
                const Icon = SOURCE_ICONS[src] ?? Zap;
                return (
                  <span key={src} className="registry-contains-pill text-[11px]">
                    <Icon className="h-3 w-3" aria-hidden />
                    {src}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              disabled={busy || isInstalled}
              onClick={() => void handleInstall(auto.id)}
              className={cn(
                "harness-btn mt-4 w-full",
                isInstalled ? "harness-btn-ghost opacity-70" : "harness-btn-primary"
              )}
            >
              {isInstalled ? "Scheduled" : busy ? "Installing…" : "Install automation"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
