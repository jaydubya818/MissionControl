import { cn } from "@/lib/utils";
import { ToolCallRow, type ToolCallData } from "./ToolCallRow";
import { formatMoney, formatSeconds } from "@/lib/schematicFormatters";

export interface GateDecision {
  decision: string;
  reason?: string;
}

export interface TurnCardData {
  userMessage?: string;
  reply: string;
  gate?: GateDecision;
  tools?: ToolCallData[];
  timestamp?: string;
  latencyMs?: number | null;
  iterations?: number;
  cost?: number;
  model?: string;
  historical?: boolean;
}

export interface TurnCardProps {
  turn: TurnCardData;
  className?: string;
}

function GateBadge({ gate }: { gate: GateDecision }): JSX.Element {
  const retrieve = gate.decision.toLowerCase().includes("retrieve");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "schematic-badge",
          retrieve && "schematic-badge-retrieve"
        )}
      >
        gate · {gate.decision}
      </span>
      {gate.reason ? (
        <span className="font-mono text-[11.5px] text-ink-muted">{gate.reason}</span>
      ) : null}
    </div>
  );
}

/** Completed turn card for Loop / Overview (waku turnCard). */
export function TurnCard({ turn, className }: TurnCardProps): JSX.Element {
  if (turn.historical) {
    return (
      <div className={cn("schematic-card", className)}>
        <div className="schematic-reply whitespace-pre-wrap">{turn.reply}</div>
      </div>
    );
  }

  return (
    <div className={cn("schematic-card", className)}>
      {turn.userMessage ? (
        <div className="font-semibold text-ink">{turn.userMessage}</div>
      ) : null}
      {turn.gate ? <GateBadge gate={turn.gate} /> : null}
      {(turn.tools ?? []).map((t, i) => (
        <ToolCallRow key={`${t.tool}-${i}`} call={t} />
      ))}
      <div className="schematic-reply mt-1.5 whitespace-pre-wrap">{turn.reply}</div>
      <div className="schematic-meta mt-2">
        {turn.timestamp ? `${turn.timestamp} · ` : ""}
        {formatSeconds(turn.latencyMs)} · {turn.iterations ?? "?"} iter
        {turn.cost != null ? ` · ${formatMoney(turn.cost)}` : ""}
        {turn.model ? ` · ${turn.model}` : ""}
      </div>
    </div>
  );
}
