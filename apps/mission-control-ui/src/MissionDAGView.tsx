/**
 * Mission DAG View
 *
 * Visualizes task dependencies as a directed acyclic graph (DAG).
 * Tasks are nodes, dependencies are edges.
 * Color-coded by status, with critical path highlighting.
 */

import { CSSProperties, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface MissionDAGViewProps {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

const STATUS_COLORS: Record<string, string> = {
  INBOX: "#64748b",
  ASSIGNED: "#8b5cf6",
  IN_PROGRESS: "#3b82f6",
  REVIEW: "#f59e0b",
  NEEDS_APPROVAL: "#f97316",
  BLOCKED: "#ef4444",
  FAILED: "#dc2626",
  DONE: "#10b981",
  CANCELED: "#475569",
};

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentPurple: "#8b5cf6",
};

/** Simple layout: assigns x/y positions to nodes in layers */
function layoutNodes(
  nodes: Array<{ id: string; parentTaskId?: string; status: string }>,
  edges: Array<{ from: string; to: string }>
) {
  // Group nodes by parent (top-level vs subtasks)
  const subtasksOf = new Map<string, typeof nodes>();

  for (const node of nodes) {
    if (node.parentTaskId) {
      const list = subtasksOf.get(node.parentTaskId) ?? [];
      list.push(node);
      subtasksOf.set(node.parentTaskId, list);
    }
  }

  // Build adjacency for topological sort
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    // edge.from depends on edge.to, so edge.to -> edge.from
    const existing = adjList.get(edge.to) ?? [];
    existing.push(edge.from);
    adjList.set(edge.to, existing);
    inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
  }

  // Kahn's algorithm for topological sort -> layer assignment
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

  // Assign positions: group by layer, distribute vertically
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    const list = layerGroups.get(layer) ?? [];
    list.push(id);
    layerGroups.set(layer, list);
  }

  // Nodes without layer assignment (orphans)
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

  // Query the dependency graph
  const graphData = useQuery(api.coordinator.getDependencyGraph, {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});

  const { nodes, edges } = useMemo(() => {
    if (graphData) {
      return graphData;
    }
    // Fallback: build from tasks with parentTaskId
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

  // Filter nodes
  const filteredNodes = useMemo(() => {
    if (filter === "all") return nodes;
    return nodes.filter((n) => n.status === filter);
  }, [nodes, filter]);

  // Layout
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

  // Calculate SVG canvas size
  const canvasWidth = Math.max(
    800,
    ...Array.from(layout.positions.values()).map((p) => p.x + layout.nodeWidth + 40)
  );
  const canvasHeight = Math.max(
    400,
    ...Array.from(layout.positions.values()).map((p) => p.y + layout.nodeHeight + 40)
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      counts[n.status] = (counts[n.status] ?? 0) + 1;
    }
    return counts;
  }, [nodes]);

  return (
    <main style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Mission DAG</h2>
          <p style={styles.subtitle}>
            {nodes.length} tasks, {edges.length} dependencies
          </p>
        </div>
        <div style={styles.filterRow}>
          <button
            style={{
              ...styles.filterBtn,
              ...(filter === "all" ? styles.filterBtnActive : {}),
            }}
            onClick={() => setFilter("all")}
          >
            All ({nodes.length})
          </button>
          {Object.entries(statusCounts).map(([status, count]) => (
            <button
              key={status}
              style={{
                ...styles.filterBtn,
                ...(filter === status ? styles.filterBtnActive : {}),
                borderLeft: `3px solid ${STATUS_COLORS[status] ?? colors.textMuted}`,
              }}
              onClick={() => setFilter(filter === status ? "all" : status)}
            >
              {status} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* DAG Canvas */}
      <div style={styles.canvasWrapper}>
        <svg
          width={canvasWidth}
          height={canvasHeight}
          style={{ background: colors.bgPage }}
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
                stroke={colors.border}
                strokeWidth={2}
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
                fill={colors.border}
              />
            </marker>
          </defs>

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const pos = layout.positions.get(node.id as string);
            if (!pos) return null;
            const isHovered = hoveredNode === (node.id as string);
            const statusColor = STATUS_COLORS[node.status] ?? colors.textMuted;

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
                  fill={isHovered ? "#25334d" : colors.bgCard}
                  stroke={statusColor}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                />
                {/* Status indicator bar */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={6}
                  height={layout.nodeHeight}
                  rx={8}
                  fill={statusColor}
                />
                {/* Title */}
                <text
                  x={pos.x + 14}
                  y={pos.y + 22}
                  fill={colors.textPrimary}
                  fontSize={12}
                  fontWeight={600}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {(node.title as string).length > 28
                    ? (node.title as string).slice(0, 25) + "..."
                    : (node.title as string)}
                </text>
                {/* Status + type */}
                <text
                  x={pos.x + 14}
                  y={pos.y + 42}
                  fill={colors.textMuted}
                  fontSize={10}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {node.status} · {node.type} · P{node.priority}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} style={styles.legendItem}>
            <div
              style={{ ...styles.legendDot, background: color }}
            />
            <span style={styles.legendLabel}>{status}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: {
    color: colors.textPrimary,
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: "0.875rem",
    margin: "4px 0 0 0",
  },
  filterRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  filterBtn: {
    padding: "4px 10px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    color: colors.textSecondary,
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "#25334d",
    color: colors.textPrimary,
    borderColor: colors.accentBlue,
  },
  canvasWrapper: {
    background: colors.bgPage,
    border: `1px solid ${colors.border}`,
    borderRadius: "10px",
    overflow: "auto",
    maxHeight: "calc(100vh - 280px)",
  },
  legend: {
    display: "flex",
    gap: "16px",
    marginTop: "16px",
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  legendDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: "0.75rem",
  },
};
