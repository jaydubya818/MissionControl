import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FLYOUT_WIDTH = 360;

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          "text-right break-all min-w-0 text-foreground",
          mono && "font-mono text-xs",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function AgentDetailFlyout({
  agentId,
  onClose,
  leftOffset = 320,
  onEdit,
}: {
  agentId: Id<"agents">;
  onClose: () => void;
  /** Distance from the left edge of the viewport in px (default 320 for AgentsFlyout width) */
  leftOffset?: number;
  /** Called when the user clicks Edit -- host can navigate to Org view */
  onEdit?: (agentId: Id<"agents">) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => returnFocusRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const agent = useQuery(api.agents.get, { agentId });
  if (!agent) {
    return (
      <aside
        ref={panelRef}
        className="fixed top-0 bottom-0 z-[60] flex flex-col bg-sidebar border-r border-border shadow-xl animate-in slide-in-from-left duration-200"
        style={{ left: leftOffset, width: FLYOUT_WIDTH }}
        role="dialog"
        aria-modal="true"
        aria-label="Agent detail"
        tabIndex={-1}
      >
        <div className="p-4 flex items-center justify-between border-b border-border">
          <span className="text-muted-foreground text-sm">Loading…</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </aside>
    );
  }

  const meta = (agent.metadata as Record<string, string | undefined>) || {};
  const roleLabel =
    agent.role === "LEAD"
      ? "LEAD"
      : agent.role === "SPECIALIST"
        ? "Spc"
        : agent.role === "INTERN"
          ? "Int"
          : agent.role;
  const isActive = agent.status === "ACTIVE";
  const daily = agent.budgetDaily ?? 0;
  const perRun = agent.budgetPerRun ?? 0;
  const spent = agent.spendToday ?? 0;
  const remaining = Math.max(0, daily - spent);
  const ratio = daily > 0 ? spent / daily : 0;
  const ratioClass =
    ratio > 0.9 ? "text-red-500" : ratio > 0.7 ? "text-amber-500" : "text-emerald-500";

  return (
    <aside
      ref={panelRef}
      className="fixed top-0 bottom-0 z-[60] flex flex-col bg-sidebar border-r border-border shadow-xl animate-in slide-in-from-left duration-200"
      style={{ left: leftOffset, width: FLYOUT_WIDTH }}
      role="dialog"
      aria-modal="true"
      aria-label={`${agent.name} details`}
      tabIndex={-1}
    >
      <div className="shrink-0 p-4 border-b border-border flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0",
              isActive ? "bg-emerald-500/20 text-emerald-500" : "bg-slate-400/20 text-muted-foreground"
            )}
          >
            {agent.emoji || agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{agent.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-500">
                {roleLabel}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-semibold",
                  isActive ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500"
                )}
              >
                {agent.status}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 shrink-0"
          aria-label="Close agent detail"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-0">
        <DetailSection title="Identity">
          <DetailRow label="Agent ID" value={agent._id} mono />
          <DetailRow label="Model" value={(meta.model as string) || "Claude Opus 4"} />
          <DetailRow label="Workspace" value={agent.workspacePath || "—"} mono />
          {agent.soulVersionHash && (
            <DetailRow label="Soul Version" value={agent.soulVersionHash} mono />
          )}
        </DetailSection>

        <DetailSection title="Contact Channels">
          <DetailRow label="Email" value={(meta.email as string) || "—"} mono />
          <DetailRow label="Telegram" value={(meta.telegram as string) || "—"} />
          <DetailRow label="WhatsApp" value={(meta.whatsapp as string) || "—"} />
          <DetailRow label="Discord" value={(meta.discord as string) || "—"} />
        </DetailSection>

        <DetailSection title="Configuration">
          {agent.allowedTaskTypes && agent.allowedTaskTypes.length > 0 && (
            <div className="mb-2">
              <div className="text-muted-foreground text-xs mb-1">Allowed Task Types</div>
              <div className="flex flex-wrap gap-1.5">
                {agent.allowedTaskTypes.map((t: string) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded border border-primary text-xs text-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          <DetailRow
            label="Can Spawn Sub-Agents"
            value={agent.canSpawn ? "Yes" : "No"}
          />
          {agent.canSpawn && (
            <DetailRow label="Max Sub-Agents" value={String(agent.maxSubAgents)} />
          )}
        </DetailSection>

        <DetailSection title="Budget">
          <DetailRow label="Daily Budget" value={`$${daily.toFixed(2)}`} />
          <DetailRow label="Per-Run Budget" value={`$${perRun.toFixed(2)}`} />
          <DetailRow label="Spent Today" value={`$${spent.toFixed(2)}`} />
          <DetailRow
            label="Remaining"
            value={`$${remaining.toFixed(2)}`}
            valueClassName={ratioClass}
          />
        </DetailSection>
      </div>

      {/* Footer with Edit action */}
      {onEdit && (
        <div className="shrink-0 p-4 border-t border-border flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(agentId)}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Edit
          </button>
        </div>
      )}
    </aside>
  );
}
