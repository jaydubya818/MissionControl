export type KnowledgeGraphSource = "agentic-kb" | "obsidian" | "mission-control";

export interface GraphifyNode {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  community?: number;
  [key: string]: unknown;
}

export interface GraphifyLink {
  source: string;
  target: string;
  relation?: string;
  confidence?: string;
  confidence_score?: number;
  weight?: number;
  source_file?: string;
  _src?: string;
  _tgt?: string;
}

export interface GraphifyHyperedge {
  id: string;
  label: string;
  nodes: string[];
  relation: string;
  confidence?: string;
  confidence_score?: number;
  source_file?: string;
}

export interface GraphifyPayload {
  nodes?: GraphifyNode[];
  links?: GraphifyLink[];
  hyperedges?: GraphifyHyperedge[];
  graph?: {
    hyperedges?: GraphifyHyperedge[];
  };
}

export interface NormalizedGraphNode {
  externalId: string;
  label: string;
  fileType?: string;
  sourceFile?: string;
  community?: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizedGraphEdge {
  externalId: string;
  fromExternalId: string;
  toExternalId: string;
  relation: string;
  confidence?: string;
  confidenceScore?: number;
  weight?: number;
  sourceFile?: string;
}

export interface NormalizedGraphHyperedge {
  externalId: string;
  label: string;
  nodeExternalIds: string[];
  relation: string;
  confidence?: string;
  confidenceScore?: number;
  sourceFile?: string;
}

export interface NormalizedGraphSnapshot {
  nodes: NormalizedGraphNode[];
  edges: NormalizedGraphEdge[];
  hyperedges: NormalizedGraphHyperedge[];
}

function resolveLinkEndpoint(
  link: GraphifyLink,
  field: "source" | "target"
): string | undefined {
  const primary = link[field];
  if (typeof primary === "string" && primary.length > 0) return primary;
  const fallback = field === "source" ? link._src : link._tgt;
  return typeof fallback === "string" && fallback.length > 0 ? fallback : undefined;
}

export function buildEdgeExternalId(
  fromExternalId: string,
  toExternalId: string,
  relation: string
): string {
  return `${fromExternalId}->${toExternalId}:${relation}`;
}

export function normalizeGraphifyPayload(
  payload: GraphifyPayload
): NormalizedGraphSnapshot {
  const nodes: NormalizedGraphNode[] = [];
  const edges: NormalizedGraphEdge[] = [];
  const hyperedges: NormalizedGraphHyperedge[] = [];

  for (const raw of payload.nodes ?? []) {
    if (!raw.id || !raw.label) continue;
    const { id, label, file_type, source_file, community, ...rest } = raw;
    nodes.push({
      externalId: id,
      label,
      fileType: typeof file_type === "string" ? file_type : undefined,
      sourceFile: typeof source_file === "string" ? source_file : undefined,
      community: typeof community === "number" ? community : undefined,
      metadata: Object.keys(rest).length > 0 ? rest : undefined,
    });
  }

  for (const raw of payload.links ?? []) {
    const fromExternalId = resolveLinkEndpoint(raw, "source");
    const toExternalId = resolveLinkEndpoint(raw, "target");
    if (!fromExternalId || !toExternalId) continue;
    const relation = raw.relation ?? "related";
    edges.push({
      externalId: buildEdgeExternalId(fromExternalId, toExternalId, relation),
      fromExternalId,
      toExternalId,
      relation,
      confidence: raw.confidence,
      confidenceScore:
        typeof raw.confidence_score === "number" ? raw.confidence_score : undefined,
      weight: typeof raw.weight === "number" ? raw.weight : undefined,
      sourceFile:
        typeof raw.source_file === "string" ? raw.source_file : undefined,
    });
  }

  const rawHyperedges = [
    ...(payload.hyperedges ?? []),
    ...(payload.graph?.hyperedges ?? []),
  ];

  const seenHyperedgeIds = new Set<string>();
  for (const raw of rawHyperedges) {
    if (!raw.id || !raw.label || !Array.isArray(raw.nodes) || raw.nodes.length < 2) {
      continue;
    }
    if (seenHyperedgeIds.has(raw.id)) continue;
    seenHyperedgeIds.add(raw.id);
    hyperedges.push({
      externalId: raw.id,
      label: raw.label,
      nodeExternalIds: raw.nodes,
      relation: raw.relation,
      confidence: raw.confidence,
      confidenceScore:
        typeof raw.confidence_score === "number" ? raw.confidence_score : undefined,
      sourceFile:
        typeof raw.source_file === "string" ? raw.source_file : undefined,
    });
  }

  return { nodes, edges, hyperedges };
}

export function summarizeSnapshot(snapshot: NormalizedGraphSnapshot) {
  return {
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    hyperedgeCount: snapshot.hyperedges.length,
    communities: [
      ...new Set(
        snapshot.nodes
          .map((n) => n.community)
          .filter((c): c is number => typeof c === "number")
      ),
    ].sort((a, b) => a - b),
  };
}

export function getNeighborhoodForNode(
  externalId: string,
  snapshot: NormalizedGraphSnapshot
) {
  const node = snapshot.nodes.find((n) => n.externalId === externalId);
  if (!node) return null;

  const incidentEdges = snapshot.edges.filter(
    (e) => e.fromExternalId === externalId || e.toExternalId === externalId
  );

  const neighborIds = new Set<string>();
  for (const edge of incidentEdges) {
    if (edge.fromExternalId !== externalId) neighborIds.add(edge.fromExternalId);
    if (edge.toExternalId !== externalId) neighborIds.add(edge.toExternalId);
  }

  const neighbors = snapshot.nodes.filter((n) => neighborIds.has(n.externalId));
  const relatedHyperedges = snapshot.hyperedges.filter((h) =>
    h.nodeExternalIds.includes(externalId)
  );

  return {
    node,
    incidentEdges,
    neighbors,
    relatedHyperedges,
  };
}
