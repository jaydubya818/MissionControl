export interface GraphLayoutNode {
  externalId: string;
  label: string;
  community?: number;
  fileType?: string;
  sourceFile?: string;
}

export interface GraphLayoutEdge {
  fromExternalId: string;
  toExternalId: string;
}

export interface PositionedNode extends GraphLayoutNode {
  x: number;
  y: number;
}

const COMMUNITY_RADIUS = 220;
const NODE_RADIUS = 42;

export function classifyNodeKind(node: GraphLayoutNode): string {
  const id = node.externalId.toLowerCase();
  const path = (node.sourceFile ?? "").toLowerCase();
  if (id.startsWith("concept_") || path.includes("/concepts/")) return "concept";
  if (id.startsWith("pattern_") || path.includes("/patterns/")) return "pattern";
  if (id.startsWith("framework_") || path.includes("/frameworks/")) return "framework";
  if (id.startsWith("entity_") || path.includes("/entities/")) return "entity";
  if (id.startsWith("person_") || path.includes("/people/")) return "person";
  if (id.startsWith("recipe_") || path.includes("/recipes/")) return "recipe";
  return "wiki";
}

export const NODE_KIND_COLORS: Record<string, string> = {
  concept: "var(--success)",
  pattern: "var(--warning)",
  framework: "var(--primary)",
  entity: "var(--destructive)",
  person: "var(--accent)",
  recipe: "var(--muted-foreground)",
  wiki: "var(--border-emphasized)",
};

export function layoutKnowledgeGraph(
  nodes: GraphLayoutNode[],
  centerX = 500,
  centerY = 400
): { positioned: PositionedNode[]; width: number; height: number } {
  if (nodes.length === 0) {
    return { positioned: [], width: 800, height: 500 };
  }

  const byCommunity = new Map<number, GraphLayoutNode[]>();
  for (const node of nodes) {
    const community = node.community ?? 0;
    const list = byCommunity.get(community) ?? [];
    list.push(node);
    byCommunity.set(community, list);
  }

  const communities = [...byCommunity.keys()].sort((a, b) => a - b);
  const positioned: PositionedNode[] = [];

  communities.forEach((community, communityIndex) => {
    const group = byCommunity.get(community) ?? [];
    const angle =
      communities.length === 1
        ? 0
        : (communityIndex / communities.length) * Math.PI * 2;
    const clusterX = centerX + Math.cos(angle) * COMMUNITY_RADIUS;
    const clusterY = centerY + Math.sin(angle) * COMMUNITY_RADIUS;

    group.forEach((node, nodeIndex) => {
      const nodeAngle =
        group.length === 1
          ? 0
          : (nodeIndex / group.length) * Math.PI * 2;
      positioned.push({
        ...node,
        x: clusterX + Math.cos(nodeAngle) * NODE_RADIUS,
        y: clusterY + Math.sin(nodeAngle) * NODE_RADIUS,
      });
    });
  });

  const xs = positioned.map((n) => n.x);
  const ys = positioned.map((n) => n.y);
  const minX = Math.min(...xs) - 80;
  const maxX = Math.max(...xs) + 80;
  const minY = Math.min(...ys) - 80;
  const maxY = Math.max(...ys) + 80;

  return {
    positioned,
    width: Math.max(800, maxX - minX),
    height: Math.max(500, maxY - minY),
  };
}

export function filterGraphNodes(
  nodes: GraphLayoutNode[],
  search: string,
  communityFilter: number | "all",
  kindFilter: string
): GraphLayoutNode[] {
  const q = search.trim().toLowerCase();
  return nodes.filter((node) => {
    if (communityFilter !== "all" && node.community !== communityFilter) {
      return false;
    }
    if (kindFilter !== "all" && classifyNodeKind(node) !== kindFilter) {
      return false;
    }
    if (!q) return true;
    return (
      node.label.toLowerCase().includes(q) ||
      node.externalId.toLowerCase().includes(q) ||
      (node.sourceFile ?? "").toLowerCase().includes(q)
    );
  });
}

export function edgesForVisibleNodes(
  edges: GraphLayoutEdge[],
  visibleIds: Set<string>
) {
  return edges.filter(
    (e) =>
      visibleIds.has(e.fromExternalId) && visibleIds.has(e.toExternalId)
  );
}
