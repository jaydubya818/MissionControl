import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SchematicPageHead } from "@/components/schematic/SchematicPageHead";
import { TurnCard } from "@/components/operator/TurnCard";

export interface LoopInspectorViewProps {
  projectId?: Id<"projects"> | null;
  onNavigate: (view: string) => void;
}

/** Chronological turn feed (waku Loop tab). */
export function LoopInspectorView({
  projectId,
  onNavigate,
}: LoopInspectorViewProps): JSX.Element {
  const turns = useQuery(
    api.analytics.recentRunTurns,
    projectId ? { projectId, limit: 30 } : { limit: 30 }
  );
  const scannedAt = Date.now();

  return (
    <div className="pb-6">
      <SchematicPageHead
        title="Loop"
        subtitle="execution turns · newest first"
        updatedAt={scannedAt}
      />
      <p className="mb-4 text-[13px] text-ink-secondary">
        Every agent turn as a card: user intent, dispatch gate, tool rows, reply, and telemetry.
        Click a turn in{" "}
        <button
          type="button"
          className="text-schematic-accent underline"
          onClick={() => onNavigate("trace-inspector")}
        >
          Execution trace
        </button>{" "}
        for span-level detail.
      </p>
      {turns === undefined ? (
        <div className="schematic-card animate-pulse text-ink-muted">Loading turns…</div>
      ) : turns.length === 0 ? (
        <div className="schematic-card text-ink-muted">No execution turns yet — start a run from Tasks or Factory Board.</div>
      ) : (
        turns.map((t) => (
          <TurnCard
            key={t.id}
            turn={{
              userMessage: t.userMessage,
              reply: t.reply,
              gate: t.gate,
              tools: t.tools,
              timestamp: t.timestamp,
              latencyMs: t.latencyMs,
              cost: t.cost,
              model: t.model,
            }}
          />
        ))
      )}
    </div>
  );
}
