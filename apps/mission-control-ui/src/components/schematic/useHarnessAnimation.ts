import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/** Maps activity types to waku STAGE animation keys. */
const STAGE_MAP: Record<string, string> = {
  "run.started": "turn_start",
  "task.claimed": "turn_start",
  "approval.requested": "gate",
  "tool.executed": "tool",
  "run.completed": "turn_end",
  "memory.consolidated": "consolidation",
};

const STAGE_LABELS: Record<string, string> = {
  turn_start: "message in",
  gate: "retrieval gate",
  llm: "agent reasons",
  tool: "tool runs",
  turn_end: "reply",
  consolidation: "consolidating memory",
};

const STAGE_NODES: Record<string, string[]> = {
  turn_start: ["gateway", "wm"],
  gate: ["gate"],
  llm: ["llm"],
  tool: ["tools"],
  turn_end: ["reply", "trace"],
  consolidation: ["consolidation", "semantic"],
};

const STAGE_EDGES: Record<string, string[]> = {
  turn_start: ["e-gw-wm"],
  gate: ["e-gate-wm"],
  llm: ["e-wm-loop"],
  tool: [],
  turn_end: ["e-reply-trace", "e-reply-save"],
  consolidation: ["e-consol-sem"],
};

export interface HarnessAnimationState {
  statusLabel: string | null;
  animating: boolean;
}

export function useHarnessAnimation(
  projectId?: Id<"projects"> | null
): HarnessAnimationState {
  const events = useQuery(
    api.analytics.recentHarnessEvents,
    projectId ? { projectId, limit: 10 } : { limit: 10 }
  );
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!events?.length) return;
    const latest = events.find((e) => !seenRef.current.has(e.id));
    if (!latest) return;
    seenRef.current.add(latest.id);
    if (seenRef.current.size > 50) {
      const arr = [...seenRef.current];
      seenRef.current = new Set(arr.slice(-30));
    }

    const stageKey = STAGE_MAP[latest.type] ?? "llm";
    const label = STAGE_LABELS[stageKey] ?? latest.type;
    setStatusLabel(label);
    setAnimating(true);

    const nodes = STAGE_NODES[stageKey] ?? [];
    const edges = STAGE_EDGES[stageKey] ?? [];
    nodes.forEach((id) => {
      document.querySelectorAll(`[data-node="${id}"]`).forEach((el) => {
        el.classList.add("schematic-hot");
        window.setTimeout(() => el.classList.remove("schematic-hot"), 900);
      });
    });
    edges.forEach((id) => {
      document.querySelectorAll(`[data-edge="${id}"]`).forEach((el) => {
        el.classList.add("schematic-flow-live");
        window.setTimeout(() => el.classList.remove("schematic-flow-live"), 900);
      });
    });

    const t = window.setTimeout(() => {
      setAnimating(false);
      setStatusLabel(null);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [events]);

  return { statusLabel, animating };
}
