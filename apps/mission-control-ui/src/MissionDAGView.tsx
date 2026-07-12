/**
 * Mission DAG View
 *
 * Visualizes task dependencies as a directed acyclic graph (DAG).
 * Tasks are nodes, dependencies are edges.
 * Color-coded by status, with critical path highlighting.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/factory/badges";
import { MetricBlock } from "@/components/factory/MetricBlock";
import { GitBranch } from "lucide-react";

interface MissionDAGViewProps {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

const STATUS_COLORS: Record<string, string> = {
  INBOX: "#64748b",
  ASSIGNED: "#2563eb",
  IN_PROGRESS: "#3b82f6",
  REVIEW: "#f59e0b",
  NEEDS_APPROVAL: "#f97316",
  BLOCKED: "#ef4444",
  FAILED: "#dc2626",
  DONE: "#10b981",
  CANCELED: "#475569",
};

/** Simple layout: assigns x/y positions to nodes in layers */
function layoutNodes(
  nodes: Array<{ id: string; parentTaskId?: string; status: string }>,
  edges: Array<{ from: string; to: string }>
) {
  const subtasksOf = new Map<string, typeof nodes>();

  for (const node of nodes) {
    if (node.parentTaskId) {
      const list = subtasksOf.get(node.parentTaskId) ?? [];
      list.push(node);
      subtasksOf.set(node.parentTaskId, list);
    }
  }

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    const existing = adjList.get(edge.to) ?? [];
    existing.push(edge.from);
    adjList.set(edge.to, existing);
    inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
  }

  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current) ?? 0;
    for (const neighbor of adjList.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      layers.set(neighbor, Math.max(layers.get(neighbor) ?? 0, currentLayer + 1));
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    const list = layerGroups.get(layer) ?? [];
    list.push(id);
    layerGroups.set(layer, list);
  }

  for (const node of nodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
      const list = layerGroups.get(0) ?? [];
      list.push(node.id);
      layerGroups.set(0, list);
    }
  }

  const NODE_W = 240;
  const NODE_H = 60;
  const H_GAP = 80;
  const V_GAP = 30;

  const positions = new Map<string, { x: number; y: number }>();
  const maxLayer = Math.max(...Array.from(layerGroups.keys()), 0);

  for (let layer = 0; layer <= maxLayer; layer++) {
    const group = layerGroups.get(layer) ?? [];
    const x = layer * (NODE_W + H_GAP) + 40;
    for (let i = 0; i < group.length; i++) {
      const y = i * (NODE_H + V_GAP) + 40;
      positions.set(group[i], { x, y });
    }
  }

  return { positions, nodeWidth: NODE_W, nodeHeight: NODE_H };
}

export function MissionDAGView({ projectId, onTaskSelect }: MissionDAGViewProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const graphData = useQuery(api.coordinator.getDependencyGraph, {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});

  const { nodes, edges } = useMemo(() => {
    if (graphData) {
      return graphData;
    }
    if (tasks) {
      const nodes = tasks.map((t) => ({
        id: t._id as string,
        title: t.title,
        status: t.status,
        type: t.type,
        priority: t.priority,
        assigneeIds: t.assigneeIds,
        parentTaskId: t.parentTaskId as string | undefined,
      }));
      return { nodes, edges: [] };
    }
    return { nodes: [], edges: [] };
  }, [graphData, tasks]);

  const filteredNodes = useMemo(() => {
    if (filter === "all") return nodes;
    return nodes.filter((n) => n.status === filter);
  }, [nodes, filter]);

  const layout = useMemo(
    () =>
      layoutNodes(
        filteredNodes.map((n) => ({
          id: n.id as string,
          parentTaskId: n.parentTaskId as string | undefined,
          status: n.status,
        })),
        edges.map((e) => ({ from: e.from as string, to: e.to as string }))
      ),
    [filteredNodes, edges]
  );

  const positionedNodes = Array.from(layout.positions.values()) as Array<{ x: number; y: number }>;

  const canvasWidth = Math.max(
    800,
    ...positionedNodes.map((p) => p.x + layout.nodeWidth + 40)
  );
  const canvasHeight = Math.max(
    400,
    ...positionedNodes.map((p) => p.y + layout.nodeHeight + 40)
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      counts[n.status] = (counts[n.status] ?? 0) + 1;
    }
    return counts;
  }, [nodes]);
  const blockedCount = statusCounts.BLOCKED ?? 0;
  const doneCount = statusCounts.DONE ?? 0;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Mission DAG"
        description="Visualize dependency structure, sequencing, and blockers across the mission graph."
        icon={<GitBranch className="h-4.5 w-4.5" strokeWidth={1.7} />}
        eyebrow="Operations"
        status={
          <StatusBadge tone="neutral">
            {nodes.length} tasks · {edges.length} dependencies
          </StatusBadge>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-4 gap-4">
        <div className="grid shrink-0 gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Graph size"
              value={nodes.length}
              detail="Tasks currently represented in the dependency graph"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Edges"
              value={edges.length}
              detail="Explicit dependencies shaping execution order"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Blocked"
              value={blockedCount}
              detail="Nodes currently breaking flow through the graph"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Done"
              value={doneCount}
              detail="Completed tasks already cleared from critical flow"
            />
          </Card>
        </div>

        <Card className="shrink-0 p-4">
          <div className="flex items-center justify-between gap-3 overflow-x-auto flex-nowrap">
            <div className="shrink-0">
              <div className="text-[15px] font-semibold text-ink">Graph filters</div>
              <div className="mt-1 text-[12.5px] text-ink-muted">Focus the dependency map by task state</div>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg border border-line p-0.5">
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                  filter === "all"
                    ? "bg-surface-2 text-ink"
                    : "text-ink-secondary hover:text-ink"
                )}
                onClick={() => setFilter("all")}
              >
                All ({nodes.length})
              </button>
              {(Object.entries(statusCounts) as Array<[string, number]>).map(([status, count]) => (
                <button
                  key={status}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                    filter === status
                      ? "bg-surface-2 text-ink"
                      : "text-ink-secondary hover:text-ink"
                  )}
                  onClick={() => setFilter(filter === status ? "all" : status)}
                >
                  {status} ({count})
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-line px-5 py-4">
            <div className="text-[15px] font-semibold text-ink">Dependency canvas</div>
            <div className="mt-1 text-[12.5px] text-ink-muted">Read downstream relationships before changing task sequencing</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-app">
        <svg
          width={canvasWidth}
          height={canvasHeight}
          className="bg-transparent"
        >
          {/* Edges */}
          {edges.map((edge, i) => {
            const fromPos = layout.positions.get(edge.from as string);
            const toPos = layout.positions.get(edge.to as string);
            if (!fromPos || !toPos) return null;

            const x1 = toPos.x + layout.nodeWidth;
            const y1 = toPos.y + layout.nodeHeight / 2;
            const x2 = fromPos.x;
            const y2 = fromPos.y + layout.nodeHeight / 2;

            return (
              <line
                key={`edge-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="stroke-line"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                className="fill-line"
              />
            </marker>
          </defs>

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const pos = layout.positions.get(node.id as string);
            if (!pos) return null;
            const isHovered = hoveredNode === (node.id as string);
            const statusColor = STATUS_COLORS[node.status] ?? "#64748b";

            return (
              <g
                key={node.id}
                onClick={() => onTaskSelect?.(node.id as Id<"tasks">)}
                onMouseEnter={() => setHoveredNode(node.id as string)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={layout.nodeWidth}
                  height={layout.nodeHeight}
                  rx={8}
                  ry={8}
                  style={{
                    fill: isHovered ? "var(--color-surface-2)" : "var(--color-surface-1)",
                    stroke: statusColor,
                    strokeWidth: isHovered ? 2 : 1.5,
                  }}
                />
                {/* Status indicator bar */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={6}
                  height={layout.nodeHeight}
                  rx={8}
                  style={{ fill: statusColor }}
                />
                {/* Title */}
                <text
                  x={pos.x + 14}
                  y={pos.y + 22}
                  className="fill-ink"
                  fontSize={12}
                  fontWeight={600}
                >
                  {(node.title as string).length > 28
                    ? (node.title as string).slice(0, 25) + "..."
                    : (node.title as string)}
                </text>
                {/* Status + type */}
                <text
                  x={pos.x + 14}
                  y={pos.y + 42}
                  className="fill-ink-muted"
                  fontSize={10}
                >
                  {node.status} · {node.type} · P{node.priority}
                </text>
              </g>
            );
          })}
        </svg>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[15px] font-semibold text-ink">Operator guidance</div>
          <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
            <p>Use the graph to inspect sequencing before you change task ownership. A node with many incoming lines usually represents a coordination choke point.</p>
            <p>Blocked nodes matter most when they sit early in the graph. Clear them before optimizing lower-value branches.</p>
          </div>
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
            <div className="text-[11.5px] font-medium text-ink-muted">Legend</div>
            <div className="mt-3 flex gap-3 flex-wrap">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-ink-muted text-xs">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        </div>
      </div>
    </main>
  );
}
