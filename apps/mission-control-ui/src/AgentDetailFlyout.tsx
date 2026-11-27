import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./components/factory/badges";

const FLYOUT_WIDTH = 360;

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <h3 className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">
        {title}
      </h3>
      <div className="flex flex-col gap-2.5">{children}</div>
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
    <div className="flex flex-col gap-0.5">
      <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">{label}</span>
      <span
        className={cn(
          "break-all min-w-0 text-[13px] text-ink",
          mono && "font-mono text-[12px]",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}

const FLYOUT_PANEL_CLASS =
  "fixed top-0 right-0 bottom-0 z-[60] flex flex-col bg-surface-1 border-l border-line max-w-[100vw] animate-in slide-in-from-right duration-200";

export function AgentDetailFlyout({
  agentId,
  onClose,
  onEdit,
}: {
  agentId: Id<"agents">;
  onClose: () => void;
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
      <>
        <div
          className="fixed inset-0 z-[55] bg-black/40"
          aria-hidden
          onClick={onClose}
        />
        <aside
          ref={panelRef}
          className={FLYOUT_PANEL_CLASS}
          style={{ width: FLYOUT_WIDTH, minWidth: 320 }}
          role="dialog"
          aria-modal="true"
          aria-label="Agent detail"
          tabIndex={-1}
        >
          <div className="p-4 flex items-center justify-between border-b border-line">
            <span className="text-ink-muted text-[13.5px]">Loading…</span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </aside>
      </>
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
  const ratio = daily > 0 ? spent / daily : 0;
  const ratioClass =
    ratio > 0.9 ? "text-err" : ratio > 0.7 ? "text-warn" : "text-ok";

  const hasContact =
    (meta.email as string) || (meta.telegram as string) || (meta.whatsapp as string) || (meta.discord as string);

  return (
    <>
      <div
        className="fixed inset-0 z-[55] bg-black/40"
        aria-hidden
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className={FLYOUT_PANEL_CLASS}
        style={{ width: FLYOUT_WIDTH, minWidth: 320 }}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} details`}
        tabIndex={-1}
      >
      <div className="shrink-0 p-4 border-b border-line flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-lg text-ink">
            {agent.emoji || agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink truncate">{agent.name}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <StatusBadge tone="neutral">{roleLabel}</StatusBadge>
              <StatusBadge tone={isActive ? "success" : "warning"}>
                {agent.status}
              </StatusBadge>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
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
          {hasContact ? (
            <>
              {(meta.email as string) && <DetailRow label="Email" value={meta.email as string} mono />}
              {(meta.telegram as string) && <DetailRow label="Telegram" value={meta.telegram as string} />}
              {(meta.whatsapp as string) && <DetailRow label="WhatsApp" value={meta.whatsapp as string} />}
              {(meta.discord as string) && <DetailRow label="Discord" value={meta.discord as string} />}
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">No contact channels configured</p>
          )}
        </DetailSection>

        <DetailSection title="Configuration">
          {agent.allowedTaskTypes && agent.allowedTaskTypes.length > 0 && (
            <div className="mb-2">
              <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-1">Allowed Task Types</div>
              <div className="flex flex-wrap gap-1.5">
                {agent.allowedTaskTypes.map((t: string) => (
                  <StatusBadge key={t} tone="neutral">
                    {t}
                  </StatusBadge>
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
          <DetailRow label="Daily Budget" value={`$${daily.toFixed(2)}`} mono />
          <DetailRow label="Per-Run Budget" value={`$${perRun.toFixed(2)}`} mono />
          <DetailRow label="Authorized run cost" value={`$${spent.toFixed(2)}`} mono />
          <DetailRow
            label="Budget enforcement"
            value="Checked at admission"
            mono
            valueClassName={ratioClass}
          />
        </DetailSection>
      </div>

      {/* Footer with Edit action */}
      {onEdit && (
        <div className="shrink-0 p-4 border-t border-line flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(agentId)}
            className="h-9 px-3 rounded-lg text-[13px] font-medium bg-act text-act-ink hover:opacity-90 transition-opacity duration-150"
          >
            Edit
          </button>
        </div>
      )}
    </aside>
    </>
  );
}
