import { cn } from "@/lib/utils";
import { classifyNodeKind } from "@/lib/knowledgeGraphLayout";

export interface GraphNeighborhoodEdge {
  externalId: string;
  fromExternalId: string;
  toExternalId: string;
  relation: string;
  confidence?: string;
  confidenceScore?: number;
}

export interface GraphNeighborhoodNode {
  externalId: string;
  label: string;
  sourceFile?: string;
  community?: number;
}

export interface GraphNeighborhoodHyperedge {
  externalId: string;
  label: string;
  relation: string;
}

export interface KnowledgeGraphDetailProps {
  node: GraphNeighborhoodNode | null;
  incidentEdges: GraphNeighborhoodEdge[];
  neighbors: GraphNeighborhoodNode[];
  relatedHyperedges: GraphNeighborhoodHyperedge[];
  onSelectNeighbor: (externalId: string) => void;
}

export function KnowledgeGraphDetail({
  node,
  incidentEdges,
  neighbors,
  relatedHyperedges,
  onSelectNeighbor,
}: KnowledgeGraphDetailProps) {
  if (!node) {
    return (
      <aside className="rounded-xl border border-line bg-surface-1 p-4">
        <p className="text-[13px] text-ink-muted m-0">
          Select a node to inspect relationships, source file, and neighbors.
        </p>
      </aside>
    );
  }

  const kind = classifyNodeKind(node);

  return (
    <aside className="rounded-xl border border-line bg-surface-1 p-4 flex flex-col gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-muted m-0 mb-1">
          {kind}
        </p>
        <h3 className="text-[16px] font-semibold text-ink m-0">{node.label}</h3>
        <p className="text-[12px] text-ink-secondary mt-1 mb-0 font-mono break-all">
          {node.externalId}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] m-0">
        {node.community !== undefined && (
          <>
            <dt className="text-ink-muted">Community</dt>
            <dd className="text-ink m-0">{node.community}</dd>
          </>
        )}
        {node.sourceFile && (
          <>
            <dt className="text-ink-muted">Source</dt>
            <dd className="text-ink m-0 break-all">{node.sourceFile}</dd>
          </>
        )}
        <dt className="text-ink-muted">Edges</dt>
        <dd className="text-ink m-0">{incidentEdges.length}</dd>
      </dl>

      {relatedHyperedges.length > 0 && (
        <section>
          <h4 className="text-[12px] font-medium text-ink-secondary m-0 mb-2">
            Hyperedge clusters
          </h4>
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {relatedHyperedges.map((h) => (
              <li
                key={h.externalId}
                className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink-secondary"
              >
                {h.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {incidentEdges.length > 0 && (
        <section>
          <h4 className="text-[12px] font-medium text-ink-secondary m-0 mb-2">
            Incident edges
          </h4>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5 max-h-36 overflow-y-auto">
            {incidentEdges.slice(0, 12).map((edge) => (
              <li
                key={edge.externalId}
                className="text-[11.5px] text-ink-muted border-b border-line pb-1"
              >
                <span className="text-ink">{edge.relation}</span>
                {edge.confidenceScore !== undefined && (
                  <span className="ml-1">({edge.confidenceScore.toFixed(2)})</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {neighbors.length > 0 && (
        <section>
          <h4 className="text-[12px] font-medium text-ink-secondary m-0 mb-2">
            Neighbors ({neighbors.length})
          </h4>
          <ul className="list-none p-0 m-0 flex flex-col gap-1 max-h-40 overflow-y-auto">
            {neighbors.map((neighbor) => (
              <li key={neighbor.externalId}>
                <button
                  type="button"
                  onClick={() => onSelectNeighbor(neighbor.externalId)}
                  className={cn(
                    "w-full text-left rounded-md px-2 py-1 text-[12px]",
                    "text-ink-secondary hover:bg-surface-2 hover:text-ink transition-colors"
                  )}
                >
                  {neighbor.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
