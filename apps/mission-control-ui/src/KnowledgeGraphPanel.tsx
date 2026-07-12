import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Network } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";
import { KnowledgeGraphDetail } from "./KnowledgeGraphDetail";
import {
  classifyNodeKind,
  filterGraphNodes,
  NODE_KIND_COLORS,
} from "@/lib/knowledgeGraphLayout";

export interface KnowledgeGraphSnapshot {
  source: string;
  nodes: Array<{
    externalId: string;
    label: string;
    fileType?: string;
    sourceFile?: string;
    community?: number;
  }>;
  edges: Array<{
    externalId: string;
    fromExternalId: string;
    toExternalId: string;
    relation: string;
    confidence?: string;
    confidenceScore?: number;
  }>;
  hyperedges: Array<{
    externalId: string;
    label: string;
    nodeExternalIds: string[];
    relation: string;
  }>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    hyperedgeCount: number;
    communities: number[];
  };
}

export interface KnowledgeGraphPanelContentProps {
  snapshot: KnowledgeGraphSnapshot | undefined;
  neighborhood: {
    node: KnowledgeGraphSnapshot["nodes"][number];
    incidentEdges: KnowledgeGraphSnapshot["edges"];
    neighbors: KnowledgeGraphSnapshot["nodes"];
    relatedHyperedges: Array<{
      externalId: string;
      label: string;
      relation: string;
    }>;
  } | null | undefined;
  selectedId: string | null;
  onSelect: (externalId: string | null) => void;
}

const KIND_OPTIONS = [
  { key: "all", label: "All types" },
  { key: "concept", label: "Concepts" },
  { key: "pattern", label: "Patterns" },
  { key: "framework", label: "Frameworks" },
  { key: "entity", label: "Entities" },
  { key: "wiki", label: "Wiki" },
];

export function KnowledgeGraphPanelContent({
  snapshot,
  neighborhood,
  selectedId,
  onSelect,
}: KnowledgeGraphPanelContentProps) {
  const [search, setSearch] = useState("");
  const [communityFilter, setCommunityFilter] = useState<number | "all">("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [viewResetKey, setViewResetKey] = useState(0);

  const filteredNodes = useMemo(() => {
    if (!snapshot) return [];
    return filterGraphNodes(
      snapshot.nodes,
      search,
      communityFilter,
      kindFilter
    );
  }, [snapshot, search, communityFilter, kindFilter]);

  if (snapshot === undefined) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-8 animate-pulse h-[min(70vh,640px)]" />
    );
  }

  if (snapshot.stats.nodeCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface-1 py-16 px-6 text-center">
        <Network className="h-10 w-10 text-ink-muted mb-3" aria-hidden />
        <h2 className="text-[18px] font-semibold text-ink m-0 mb-2">
          No knowledge graph imported yet
        </h2>
        <p className="text-[13px] text-ink-secondary max-w-md m-0">
          Import Agentic-KB Graphify output to visualize concepts, patterns,
          and relationships.
        </p>
        <code className="mt-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-secondary">
          pnpm run import:knowledge-graph:demo
        </code>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search graph nodes"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-ink"
        />
        <select
          aria-label="Filter by community"
          value={communityFilter === "all" ? "all" : String(communityFilter)}
          onChange={(e) => {
            const value = e.target.value;
            setCommunityFilter(value === "all" ? "all" : Number(value));
          }}
          className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-[13px] text-ink"
        >
          <option value="all">All communities</option>
          {snapshot.stats.communities.map((c) => (
            <option key={c} value={c}>
              Community {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by node type"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-[13px] text-ink"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setViewResetKey((k) => k + 1)}
          className="h-9 px-3 rounded-lg border border-line bg-surface-2 text-[13px] text-ink-secondary hover:text-ink"
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="h-9 px-3 rounded-lg border border-line bg-surface-2 text-[13px] text-ink-secondary hover:text-ink"
        >
          Clear selection
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
        <span>{filteredNodes.length} / {snapshot.stats.nodeCount} nodes</span>
        <span>{snapshot.stats.edgeCount} edges</span>
        <span>{snapshot.stats.hyperedgeCount} hyperedges</span>
        {KIND_OPTIONS.slice(1).map((opt) => (
          <span key={opt.key} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: NODE_KIND_COLORS[opt.key] }}
            />
            {opt.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
        <KnowledgeGraphCanvas
          nodes={filteredNodes}
          edges={snapshot.edges}
          hyperedges={snapshot.hyperedges}
          selectedId={selectedId}
          onSelect={onSelect}
          viewResetKey={viewResetKey}
        />
        <KnowledgeGraphDetail
          node={neighborhood?.node ?? null}
          incidentEdges={neighborhood?.incidentEdges ?? []}
          neighbors={neighborhood?.neighbors ?? []}
          relatedHyperedges={neighborhood?.relatedHyperedges ?? []}
          onSelectNeighbor={onSelect}
        />
      </div>
    </div>
  );
}

interface KnowledgeGraphPanelProps {
  projectId: Id<"projects"> | null;
}

export function KnowledgeGraphPanel({ projectId }: KnowledgeGraphPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projectSnapshot = useQuery(api.knowledgeGraph.getSnapshot, {
    projectId: projectId ?? undefined,
    source: "agentic-kb",
  });

  const globalSnapshot = useQuery(
    api.knowledgeGraph.getSnapshot,
    projectId && projectSnapshot?.stats.nodeCount === 0
      ? { source: "agentic-kb" }
      : "skip"
  );

  const snapshot =
    projectSnapshot && projectSnapshot.stats.nodeCount > 0
      ? projectSnapshot
      : globalSnapshot ?? projectSnapshot;

  const activeProjectId =
    projectSnapshot && projectSnapshot.stats.nodeCount > 0
      ? projectId ?? undefined
      : undefined;

  const neighborhood = useQuery(
    api.knowledgeGraph.getNeighborhood,
    selectedId
      ? {
          externalId: selectedId,
          projectId: activeProjectId,
          source: "agentic-kb",
        }
      : "skip"
  );

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[19px] font-semibold tracking-tight text-ink m-0">
          Knowledge Graph
        </h2>
        {snapshot && snapshot.stats.nodeCount > 0 && (
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-secondary">
            Agentic-KB
          </span>
        )}
      </div>
      <KnowledgeGraphPanelContent
        snapshot={snapshot}
        neighborhood={neighborhood}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </div>
  );
}
