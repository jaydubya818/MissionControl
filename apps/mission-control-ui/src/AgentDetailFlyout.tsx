import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FLYOUT_WIDTH = 360;

const colors = {
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
  accentPurple: "#8b5cf6",
};

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#334155] py-3 last:border-b-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] mb-2">
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
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-[#94a3b8] shrink-0">{label}</span>
      <span
        className={cn(
          "text-right break-all min-w-0",
          mono && "font-mono text-xs"
        )}
        style={valueColor ? { color: valueColor } : { color: colors.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}

export function AgentDetailFlyout({
  agentId,
  onClose,
}: {
  agentId: Id<"agents">;
  onClose: () => void;
}) {
  const agent = useQuery(api.agents.get, { agentId });
  if (!agent) {
    return (
      <aside
        className="fixed top-0 bottom-0 z-[60] flex flex-col w-[360px] bg-[#1e293b] border-l border-[#334155] shadow-xl"
        style={{ right: 320 }}
        role="dialog"
        aria-label="Agent detail"
      >
        <div className="p-4 flex items-center justify-between border-b border-[#334155]">
          <span className="text-[#94a3b8] text-sm">Loading…</span>
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
  const ratioColor =
    ratio > 0.9 ? colors.accentRed : ratio > 0.7 ? colors.accentOrange : colors.accentGreen;

  return (
    <aside
      className="fixed top-0 bottom-0 z-[60] flex flex-col bg-[#1e293b] border-l border-[#334155] shadow-xl animate-in slide-in-from-right duration-200"
      style={{ right: 320, width: FLYOUT_WIDTH }}
      role="dialog"
      aria-label={`${agent.name} details`}
    >
      <div className="shrink-0 p-4 border-b border-[#334155] flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
            style={{
              background: isActive ? "rgba(16, 185, 129, 0.2)" : "rgba(148, 163, 184, 0.2)",
              color: isActive ? colors.accentGreen : colors.textSecondary,
            }}
          >
            {agent.emoji || agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#e2e8f0] truncate">{agent.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span
                className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background: "rgba(59, 130, 246, 0.2)", color: colors.accentBlue }}
              >
                {roleLabel}
              </span>
              <span
                className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{
                  background: isActive ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: isActive ? colors.accentGreen : colors.accentOrange,
                }}
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
              <div className="text-[#94a3b8] text-xs mb-1">Allowed Task Types</div>
              <div className="flex flex-wrap gap-1.5">
                {agent.allowedTaskTypes.map((t: string) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded border border-[#3b82f6] text-xs text-[#e2e8f0]"
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
            valueColor={ratioColor}
          />
        </DetailSection>
      </div>
    </aside>
  );
}
