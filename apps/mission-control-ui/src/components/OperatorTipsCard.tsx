import { useCallback, useMemo, useState } from "react";
import type { MainView } from "../TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crosshair, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mc.operator_next_actions_dismissed.v1";

type ActionCategory = "Recommended" | "Setup" | "Governance" | "Automation";

const CATEGORY_STYLES: Record<ActionCategory, string> = {
  Recommended: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  Setup: "border-amber-300/25 bg-amber-400/10 text-amber-200",
  Governance: "border-violet-300/25 bg-violet-400/10 text-violet-200",
  Automation: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
};

type OperatorAction = {
  id: string;
  title: string;
  reason: string;
  category: ActionCategory;
  /** Hide the action automatically once the underlying condition is met. */
  resolved?: boolean;
  cta?: { label: string; view?: MainView; onClick?: () => void };
};

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
  /** Context used to prioritize and resolve actions automatically. */
  hasMission?: boolean;
  hasAgents?: boolean;
  gatewayConfigured?: boolean | null;
  onOpenMission?: () => void;
  onOpenGateway?: () => void;
  className?: string;
}

export function OperatorTipsCard({
  onNavigate,
  hasMission = false,
  hasAgents = false,
  gatewayConfigured = null,
  onOpenMission,
  onOpenGateway,
  className,
}: OperatorTipsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : loadDismissed()
  );

  const actions = useMemo<OperatorAction[]>(
    () => [
      {
        id: "set-mission",
        title: "Set your first mission",
        reason: "Agents need a north star to score and prioritize work against.",
        category: "Recommended",
        resolved: hasMission,
        cta: { label: "Define mission", onClick: onOpenMission },
      },
      {
        id: "register-agents",
        title: "Register Cursor or Claude Code agents",
        reason: "No execution happens until at least one runtime is connected to the fleet.",
        category: "Setup",
        resolved: hasAgents,
        cta: { label: "Open registry", view: "agents" },
      },
      {
        id: "connect-gateway",
        title: "Connect the agent gateway",
        reason: "The gateway routes commands, heartbeats, and run telemetry to this console.",
        category: "Setup",
        resolved: gatewayConfigured === true,
        cta: { label: "Configure gateway", onClick: onOpenGateway },
      },
      {
        id: "approval-gates",
        title: "Define approval gates",
        reason: "Approval gates protect risky actions before they reach production.",
        category: "Governance",
        cta: { label: "Review policies", view: "control-approvals" },
      },
      {
        id: "autonomy-thresholds",
        title: "Configure autonomy thresholds",
        reason: "Decide which actions agents take alone and which pause for the operator.",
        category: "Governance",
      },
      {
        id: "import-epics",
        title: "Connect Jira to import epics",
        reason: "Initialize the execution graph from existing planning instead of re-entry.",
        category: "Automation",
        cta: { label: "Open integrations", onClick: onOpenGateway },
      },
    ],
    [hasMission, hasAgents, gatewayConfigured, onOpenMission, onOpenGateway]
  );

  const visible = useMemo(
    () => actions.filter((a) => !a.resolved && !dismissed.has(a.id)).slice(0, 4),
    [actions, dismissed]
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
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const a of actions) next.add(a.id);
      saveDismissed(next);
      return next;
    });
  }, [actions]);

  if (visible.length === 0) return null;

  return (
    <Card className={cn("mb-6 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--panel-line)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
            <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Operator next actions
            </h2>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
              Prioritized by setup state — dismissals stored in this browser
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-[0.65rem] text-muted-foreground"
          onClick={dismissAll}
        >
          Dismiss all
        </Button>
      </div>
      <ul className="grid divide-y divide-[var(--panel-line)] lg:grid-cols-2 lg:divide-y-0">
        {visible.map((action, index) => (
          <li
            key={action.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3.5",
              "lg:border-b lg:border-[var(--panel-line)]",
              index % 2 === 0 && "lg:border-r",
              index >= visible.length - (visible.length % 2 === 0 ? 2 : 1) && "lg:border-b-0"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-foreground">{action.title}</p>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                    CATEGORY_STYLES[action.category]
                  )}
                >
                  {action.category}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                {action.reason}
              </p>
              {action.cta && (action.cta.onClick || (action.cta.view && onNavigate)) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 gap-1 px-2.5 text-[11px]"
                  onClick={() => {
                    if (action.cta?.onClick) action.cta.onClick();
                    else if (action.cta?.view) onNavigate?.(action.cta.view);
                  }}
                >
                  {action.cta.label}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-foreground"
              aria-label={`Dismiss: ${action.title}`}
              onClick={() => dismiss(action.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
