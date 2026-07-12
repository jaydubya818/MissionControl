import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { cn } from "@/lib/utils";
import {
  classifyNodeKind,
  edgesForVisibleNodes,
  layoutKnowledgeGraph,
  NODE_KIND_COLORS,
  type GraphLayoutEdge,
  type GraphLayoutNode,
} from "@/lib/knowledgeGraphLayout";

export interface KnowledgeGraphHyperedge {
  externalId: string;
  label: string;
  nodeExternalIds: string[];
}

export interface KnowledgeGraphCanvasProps {
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  hyperedges: KnowledgeGraphHyperedge[];
  selectedId: string | null;
  onSelect: (externalId: string) => void;
  viewResetKey?: number;
}

const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1 };

export function KnowledgeGraphCanvas({
  nodes,
  edges,
  hyperedges,
  selectedId,
  onSelect,
  viewResetKey = 0,
}: KnowledgeGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(DEFAULT_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, [viewResetKey]);

  const visibleIds = useMemo(() => new Set(nodes.map((n) => n.externalId)), [nodes]);
  const visibleEdges = useMemo(
    () => edgesForVisibleNodes(edges, visibleIds),
    [edges, visibleIds]
  );

  const { positioned, width, height } = useMemo(
    () => layoutKnowledgeGraph(nodes),
    [nodes]
  );

  const positionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of positioned) {
      map.set(node.externalId, { x: node.x, y: node.y });
    }
    return map;
  }, [positioned]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(2.5, Math.max(0.4, prev.scale * delta)),
    }));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTransform((prev) => ({
      ...prev,
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    }));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-[min(70vh,640px)] w-full overflow-hidden rounded-xl border border-line bg-surface-1",
        isDragging ? "cursor-grabbing" : "cursor-grab"
      )}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="block pointer-events-none"
        role="img"
        aria-label="Knowledge graph visualization"
      >
        <g
          transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
        >
          {visibleEdges.map((edge) => {
            const from = positionById.get(edge.fromExternalId);
            const to = positionById.get(edge.toExternalId);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.fromExternalId}-${edge.toExternalId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--border)"
                strokeOpacity={0.45}
                strokeWidth={1}
              />
            );
          })}

          {hyperedges.map((hyperedge) => {
            const points = hyperedge.nodeExternalIds
              .map((id) => positionById.get(id))
              .filter((p): p is { x: number; y: number } => Boolean(p));
            if (points.length < 2) return null;
            const cx =
              points.reduce((sum, p) => sum + p.x, 0) / points.length;
            const cy =
              points.reduce((sum, p) => sum + p.y, 0) / points.length;
            const radius =
              Math.max(
                ...points.map((p) => Math.hypot(p.x - cx, p.y - cy))
              ) + 18;
            return (
              <circle
                key={hyperedge.externalId}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke="var(--border-emphasized)"
                strokeDasharray="4 4"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            );
          })}

          {positioned.map((node) => {
            const kind = classifyNodeKind(node);
            const color = NODE_KIND_COLORS[kind] ?? NODE_KIND_COLORS.wiki;
            const selected = selectedId === node.externalId;
            return (
              <g
                key={node.externalId}
                transform={`translate(${node.x} ${node.y})`}
                className="cursor-pointer pointer-events-auto"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(node.externalId)}
              >
                <circle
                  r={selected ? 10 : 7}
                  fill={color}
                  stroke={selected ? "var(--foreground)" : "transparent"}
                  strokeWidth={selected ? 2 : 0}
                />
                <text
                  x={12}
                  y={4}
                  className={cn(
                    "fill-current text-[10px]",
                    selected ? "text-ink" : "text-ink-muted"
                  )}
                >
                  {node.label.length > 28
                    ? `${node.label.slice(0, 26)}…`
                    : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
