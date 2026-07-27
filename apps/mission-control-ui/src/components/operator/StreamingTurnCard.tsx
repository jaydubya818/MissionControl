import { cn } from "@/lib/utils";
import { ToolCallRow, type ToolCallData } from "./ToolCallRow";
import type { GateDecision } from "./TurnCard";

export interface StreamingTurnProps {
  gate?: GateDecision;
  tools?: ToolCallData[];
  stream?: string;
  pending?: boolean;
  startedAt?: number;
}

export interface StreamingTurnCardProps {
  turn: StreamingTurnProps;
  className?: string;
}

function StagesRow({
  gate,
  tools,
  streaming,
}: {
  gate?: GateDecision;
  tools?: ToolCallData[];
  streaming?: boolean;
}): JSX.Element {
  const gateDone = Boolean(gate);
  return (
    <div className="schematic-stages mb-1.5">
      <span className={cn("schematic-stage", gateDone ? "schematic-stage-done" : "schematic-stage-on")}>
        gate{gate ? ` · ${gate.decision}` : ""}
      </span>
      {(tools ?? []).map((t, i) => (
        <span key={`${t.tool}-${i}`} className="schematic-stage schematic-stage-done">
          {t.tool}
        </span>
      ))}
      <span
        className={cn(
          "schematic-stage",
          streaming ? "schematic-stage-on" : gateDone ? "schematic-stage-done" : ""
        )}
      >
        reply
      </span>
    </div>
  );
}

/** Live streaming turn card with stages strip and caret (waku streamingCard). */
export function StreamingTurnCard({ turn, className }: StreamingTurnCardProps): JSX.Element {
  const elapsed =
    turn.startedAt && turn.pending && !turn.stream
      ? Math.round((Date.now() - turn.startedAt) / 1000)
      : null;

  return (
    <div className={cn("schematic-card", className)}>
      <StagesRow gate={turn.gate} tools={turn.tools} streaming={Boolean(turn.stream)} />
      {turn.gate?.reason ? (
        <div className="schematic-meta mb-1.5">{turn.gate.reason}</div>
      ) : null}
      {(turn.tools ?? []).map((t, i) => (
        <ToolCallRow key={`${t.tool}-${i}`} call={t} />
      ))}
      {turn.stream ? (
        <div className="schematic-reply mt-2 whitespace-pre-wrap">
          {turn.stream}
          <span className="schematic-caret" aria-hidden />
        </div>
      ) : (
        <div className="schematic-meta">
          thinking…{elapsed != null ? ` ${elapsed}s` : ""}
        </div>
      )}
    </div>
  );
}
