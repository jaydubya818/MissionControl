import { useCallback, useMemo, useState } from "react";
import type { MainView } from "../TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mc.operator_tip_dismissed_ids";

type Tip = {
  id: string;
  title: string;
  body: string;
  /** Extra text matched when user might search — not shown */
  searchText?: string;
  cta?: { label: string; view: MainView };
};

const TIPS: Tip[] = [
  {
    id: "cmd-k",
    title: "Command palette",
    body: "Press ⌘K (Ctrl+K on Windows) to search tasks, run commands, and jump to major views without leaving the keyboard.",
    searchText: "palette shortcut navigate",
  },
  {
    id: "platform-hub",
    title: "Platform hub",
    body: "System, Radar, Factory, Pipeline, and Feedback group observability, jobs, and review in one mental model.",
    searchText: "observability schedules",
    cta: { label: "Open Pipeline", view: "pipeline" },
  },
  {
    id: "schedule-ops",
    title: "Operations schedule",
    body: "Use Schedule under Platform to align calendar events with ops timelines and upcoming work.",
    searchText: "calendar ops-schedule",
    cta: { label: "Schedule", view: "ops-schedule" },
  },
  {
    id: "task-drawer",
    title: "Rich task editing",
    body: "Open any task from the board and use Edit for due dates, assignees, and status — invalid transitions surface clear errors.",
    searchText: "edit assignee deadline",
    cta: { label: "Tasks", view: "tasks" },
  },
  {
    id: "layout-customize",
    title: "Customize your dashboard",
    body: "Use “Customize layout” in Quick navigation to reorder home sections; order is saved in this browser.",
    searchText: "reorder drag",
  },
];

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

interface OperatorTipsCardProps {
  onNavigate?: (view: MainView) => void;
  className?: string;
}

export function OperatorTipsCard({ onNavigate, className }: OperatorTipsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : loadDismissed()
  );

  const visible = useMemo(
    () => TIPS.filter((t) => !dismissed.has(t.id)),
    [dismissed]
  );

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    const next = new Set(TIPS.map((t) => t.id));
    setDismissed(next);
    saveDismissed(next);
  }, []);

  if (visible.length === 0) return null;

  return (
    <Card
      className={cn(
        "mb-6 overflow-hidden border-border/80 bg-gradient-to-br from-primary/5 via-background to-muted/20",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Lightbulb className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-foreground leading-none">Suggestions</h2>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5 truncate">
              Tips you can dismiss — stored locally in this browser
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[0.65rem] text-muted-foreground shrink-0"
          onClick={dismissAll}
        >
          Dismiss all
        </Button>
      </div>
      <ul className="divide-y divide-border/50">
        {visible.map((tip) => (
          <li key={tip.id} className="px-4 py-3 flex gap-3 items-start">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{tip.title}</p>
              <p className="text-[0.7rem] text-muted-foreground mt-1 leading-relaxed">{tip.body}</p>
              {tip.cta && onNavigate && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mt-2 text-xs text-primary"
                  onClick={() => onNavigate(tip.cta!.view)}
                >
                  {tip.cta.label}
                  <ArrowRight className="h-3 w-3 ml-0.5" />
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`Dismiss: ${tip.title}`}
              onClick={() => dismiss(tip.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
